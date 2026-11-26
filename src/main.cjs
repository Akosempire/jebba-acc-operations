const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

let db;
function initDb() {
  const dbPath = path.join(app.getPath('userData'), 'jebba-acc.sqlite');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      classification TEXT NOT NULL,
      voltage TEXT DEFAULT '',
      feeder TEXT DEFAULT '',
      equipment TEXT DEFAULT '',
      event_datetime TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      shift TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open',
      description TEXT DEFAULT '',
      protection TEXT DEFAULT '',
      last_load_mw TEXT DEFAULT '',
      interrupted_load_mw TEXT DEFAULT '',
      restoration_datetime TEXT DEFAULT '',
      remarks TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS event_updates (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      update_type TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      shift TEXT NOT NULL,
      FOREIGN KEY(event_id) REFERENCES events(id)
    );
    CREATE TABLE IF NOT EXISTS miscellaneous_entries (
      id TEXT PRIMARY KEY,
      occurred_at TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
    CREATE INDEX IF NOT EXISTS idx_events_feeder ON events(feeder);
    CREATE INDEX IF NOT EXISTS idx_updates_event ON event_updates(event_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_miscellaneous_occurred_at ON miscellaneous_entries(occurred_at);
  `);
}
function allEvents() {
  const rows = db.prepare(`SELECT * FROM events ORDER BY updated_at DESC`).all();
  return rows.map(e => ({
    ...e,
    updates: db.prepare(`SELECT * FROM event_updates WHERE event_id=? ORDER BY created_at ASC`).all(e.id)
  }));
}
function allMiscellaneous() {
  return db.prepare(`SELECT * FROM miscellaneous_entries ORDER BY occurred_at DESC, created_at DESC`).all();
}
function createMiscellaneous(p) {
  const occurredAt = String(p.occurred_at || '').trim();
  const description = String(p.description || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(occurredAt) || !description) {
    throw new Error('Enter a valid entry date and report narrative.');
  }
  const entry = {
    id: crypto.randomUUID(),
    occurred_at: occurredAt,
    description,
    created_at: new Date().toISOString()
  };
  db.prepare(`INSERT INTO miscellaneous_entries (id, occurred_at, description, created_at) VALUES (@id, @occurred_at, @description, @created_at)`).run(entry);
  return entry;
}
function dashboard() {
  const total = db.prepare(`SELECT COUNT(*) n FROM events`).get().n;
  const open = db.prepare(`SELECT COUNT(*) n FROM events WHERE status='Open'`).get().n;
  const restored = db.prepare(`SELECT COUNT(*) n FROM events WHERE status='Restored'`).get().n;
  const recent = db.prepare(`SELECT * FROM events ORDER BY updated_at DESC LIMIT 6`).all();
  return { total, open, restored, recent };
}
function findDuplicates(p) {
  const feeder = (p.feeder || '').trim().toLowerCase();
  const equipment = (p.equipment || '').trim().toLowerCase();
  if (!feeder && !equipment) return [];
  const rows = db.prepare(`
    SELECT * FROM events
    WHERE status='Open'
      AND lower(trim(classification))=lower(trim(?))
      AND (
        (? <> '' AND lower(trim(feeder))=?)
        OR (? <> '' AND lower(trim(equipment))=?)
      )
    ORDER BY updated_at DESC LIMIT 8
  `).all(p.classification, feeder, feeder, equipment, equipment);
  return rows;
}
function createEvent(p) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const count = db.prepare(`SELECT COUNT(*) n FROM events WHERE date(recorded_at)=date('now','localtime')`).get().n + 1;
  const datePart = now.slice(0,10).replaceAll('-','');
  const reference = `JAC-${datePart}-${String(count).padStart(3,'0')}`;
  const shift = getShift(new Date(p.recorded_at || now));
  const stmt = db.prepare(`
    INSERT INTO events (
      id, reference, classification, voltage, feeder, equipment, event_datetime,
      recorded_at, shift, status, description, protection, last_load_mw,
      interrupted_load_mw, restoration_datetime, remarks, created_at, updated_at
    ) VALUES (
      @id,@reference,@classification,@voltage,@feeder,@equipment,@event_datetime,
      @recorded_at,@shift,'Open',@description,@protection,@last_load_mw,
      @interrupted_load_mw,'',@remarks,@created_at,@updated_at
    )
  `);
  stmt.run({
    id, reference, classification:p.classification, voltage:p.voltage || '',
    feeder:p.feeder || '', equipment:p.equipment || '',
    event_datetime:p.event_datetime, recorded_at:now, shift,
    description:p.description || '', protection:p.protection || '',
    last_load_mw:p.last_load_mw || '', interrupted_load_mw:p.interrupted_load_mw || '',
    remarks:p.remarks || '', created_at:now, updated_at:now
  });
  db.prepare(`INSERT INTO event_updates (id,event_id,update_type,body,created_at,shift) VALUES (?,?,?,?,?,?)`)
    .run(crypto.randomUUID(), id, 'Initial record', p.description || 'Event recorded', now, shift);
  return db.prepare(`SELECT * FROM events WHERE id=?`).get(id);
}
function getShift(date) {
  const mins = date.getHours() * 60 + date.getMinutes();
  return mins >= 8*60 && mins < 18*60 ? 'Day' : 'Night';
}
function addUpdate({eventId, body, updateType, restored, restorationDatetime}) {
  const now = new Date().toISOString();
  const shift = getShift(new Date());
  const event = db.prepare(`SELECT * FROM events WHERE id=?`).get(eventId);
  if (!event) throw new Error('Event not found.');
  db.prepare(`INSERT INTO event_updates (id,event_id,update_type,body,created_at,shift) VALUES (?,?,?,?,?,?)`)
    .run(crypto.randomUUID(), eventId, updateType || 'Operational update', body, now, shift);
  db.prepare(`
    UPDATE events SET status=?, restoration_datetime=?, updated_at=? WHERE id=?
  `).run(restored ? 'Restored' : event.status, restored ? (restorationDatetime || now) : event.restoration_datetime, now, eventId);
  return db.prepare(`SELECT * FROM events WHERE id=?`).get(eventId);
}
function backupDb() {
  const result = dialog.showSaveDialogSync({
    title: 'Back up Jebba ACC records',
    defaultPath: `Jebba-ACC-Backup-${new Date().toISOString().slice(0,10)}.json`,
    filters: [{ name: 'JSON backup', extensions: ['json'] }]
  });
  if (!result) return { cancelled: true };
  const payload = { format:'jebba-acc-backup-v1', exportedAt:new Date().toISOString(), events:allEvents(), miscellaneous:allMiscellaneous() };
  fs.writeFileSync(result, JSON.stringify(payload, null, 2), 'utf8');
  return { cancelled:false, path:result };
}
function restoreDb() {
  const chosen = dialog.showOpenDialogSync({ title:'Restore Jebba ACC backup', properties:['openFile'], filters:[{name:'JSON backup',extensions:['json']}] });
  if (!chosen || !chosen[0]) return { cancelled:true };
  const payload = JSON.parse(fs.readFileSync(chosen[0], 'utf8'));
  if (payload.format !== 'jebba-acc-backup-v1' || !Array.isArray(payload.events) || (payload.miscellaneous !== undefined && !Array.isArray(payload.miscellaneous))) throw new Error('This file is not a recognised Jebba ACC backup.');
  const insertEvent = db.prepare(`INSERT OR IGNORE INTO events VALUES (@id,@reference,@classification,@voltage,@feeder,@equipment,@event_datetime,@recorded_at,@shift,@status,@description,@protection,@last_load_mw,@interrupted_load_mw,@restoration_datetime,@remarks,@created_at,@updated_at)`);
  const insertUpdate = db.prepare(`INSERT OR IGNORE INTO event_updates VALUES (@id,@event_id,@update_type,@body,@created_at,@shift)`);
  const insertMiscellaneous = db.prepare(`INSERT OR IGNORE INTO miscellaneous_entries (id, occurred_at, description, created_at) VALUES (@id, @occurred_at, @description, @created_at)`);
  const miscellaneous = payload.miscellaneous || [];
  const tx = db.transaction(() => {
    const eventColumns = ['id','reference','classification','voltage','feeder','equipment','event_datetime','recorded_at','shift','status','description','protection','last_load_mw','interrupted_load_mw','restoration_datetime','remarks','created_at','updated_at'];
    for (const e of payload.events) {
      const eventRow = Object.fromEntries(eventColumns.map(k => [k, e[k] ?? '']));
      insertEvent.run(eventRow);
      for (const u of (e.updates || [])) {
        insertUpdate.run({ id:u.id, event_id:u.event_id, update_type:u.update_type, body:u.body, created_at:u.created_at, shift:u.shift });
      }
    }
    for (const entry of miscellaneous) {
      insertMiscellaneous.run({
        id:entry.id,
        occurred_at:entry.occurred_at,
        description:entry.description,
        created_at:entry.created_at
      });
    }
  });
  tx();
  return { cancelled:false, imported:payload.events.length + miscellaneous.length, events:payload.events.length, miscellaneous:miscellaneous.length };
}
function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 1000, minWidth: 960, minHeight: 680,
    backgroundColor: '#F4F5F7', autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}
app.whenReady().then(() => {
  initDb();
  ipcMain.handle('events:list', () => allEvents());
  ipcMain.handle('miscellaneous:list', () => allMiscellaneous());
  ipcMain.handle('events:dashboard', () => dashboard());
  ipcMain.handle('events:duplicates', (_, p) => findDuplicates(p));
  ipcMain.handle('events:create', (_, p) => createEvent(p));
  ipcMain.handle('miscellaneous:create', (_, p) => createMiscellaneous(p));
  ipcMain.handle('events:update', (_, p) => addUpdate(p));
  ipcMain.handle('data:backup', () => backupDb());
  ipcMain.handle('data:restore', () => restoreDb());
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    shift: getShift(new Date()),
    time: new Date().toISOString(),
    dbLocation: path.join(app.getPath('userData'), 'jebba-acc.sqlite')
  }));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
