const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let pendingPayload = null;
let currentEvents = [];
let toastTimer;

function lagosParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone:'Africa/Lagos', year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
}
function nowLocalParts() {
  const p=lagosParts();
  return { date:`${p.year}-${p.month}-${p.day}`, time:`${p.hour}:${p.minute}` };
}
function shiftFor(date = new Date()) {
  const p=lagosParts(date), m=Number(p.hour)*60+Number(p.minute);
  return m >= 480 && m < 1080 ? 'Day Shift' : 'Night Shift';
}
function updateCaptureClock() {
  const p=lagosParts();
  const clock=$('#capture-clock');
  if(clock) clock.textContent=`${p.hour}:${p.minute}:${p.second}  ·  ${p.day}/${p.month}/${p.year}`;
}
function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
}
function escapeHtml(s='') {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function showToast(msg) {
  const el=$('#toast'); el.textContent=msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),2600);
}
function setPage(page) {
  $$('.page').forEach(p=>p.classList.toggle('active-page',p.id===`page-${page}`));
  $$('.nav-item').forEach(b=>{const active=b.dataset.page===page;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  const titles={dashboard:['Dashboard','Operational overview for Jebba Area Control Centre.','CONTROL ROOM'],new:['New Operational Entry','Record an outage and preview its report narrative.','EVENT CAPTURE'],miscellaneous:['Miscellaneous Entries','Capture narrative items for the weekly report.','MISCELLANEOUS'],outages:['Outage Register','Find existing incidents and append operational updates.','EVENT MANAGEMENT'],handover:['Shift Handover','Review unresolved events carried between shifts.','SHIFT CONTINUITY'],reports:['Reports & Backups','Prepare reporting periods and protect local records.','REPORTING']};
  const [title,sub,kicker]=titles[page];$('#page-title').textContent=title;$('#page-subtitle').textContent=sub;$('#page-kicker').textContent=kicker;
  if(page==='dashboard') refreshDashboard();
  if(page==='miscellaneous') renderMiscellaneous();
  if(page==='outages') renderEvents();
  if(page==='handover') renderHandover();
}
function getFormPayload() {
  const val=id=>$('#'+id).value.trim();
  const date=val('event-date'), time=val('event-time');
  return {
    classification:val('classification'), voltage:val('voltage'), feeder:val('feeder'),
    equipment:val('equipment'), event_datetime:`${date}T${time}:00`,
    description:val('description'), protection:val('protection'),
    last_load_mw:val('last-load'), interrupted_load_mw:val('interrupted-load'),
    remarks:val('remarks')
  };
}
function updatePreview() {
  const p=getFormPayload();
  const put=(id,v)=>$('#'+id).textContent=v||'—';
  put('pv-date',p.event_datetime.split('T')[0]);put('pv-time',p.event_datetime.split('T')[1]?.slice(0,5));
  put('pv-class',p.classification);put('pv-voltage',p.voltage);put('pv-feeder',p.feeder);
  put('pv-equipment',p.equipment);put('pv-protection',p.protection);
  put('pv-description',p.description||'Your event narrative will appear here as you type.');
  put('pv-remarks',p.remarks);
}
function resetForm() {
  $('#event-form').reset();
  const p=nowLocalParts();$('#event-date').value=p.date;$('#event-time').value=p.time;
  updatePreview();$('#form-message').textContent='';
}
async function refreshDashboard() {
  const data=await window.jebba.dashboard();
  $('#stats').innerHTML=`
    <div class="stat-card"><div class="stat-label">Total recorded events</div><div class="stat-number">${data.total}</div><div class="stat-foot">All saved operational events</div></div>
    <div class="stat-card"><div class="stat-label">Ongoing events</div><div class="stat-number">${data.open}</div><div class="stat-foot">Require follow-up or restoration</div></div>
    <div class="stat-card"><div class="stat-label">Restored events</div><div class="stat-number">${data.restored}</div><div class="stat-foot">Closed with history retained</div></div>
    <div class="stat-card"><div class="stat-label">Current shift</div><div class="stat-number">${shiftFor()}</div><div class="stat-foot">Automatically assigned from entry time</div></div>`;
  const open=data.recent.filter(e=>e.status==='Open');
  $('#open-events').innerHTML=open.length?open.slice(0,5).map(eventRow).join(''):'<div class="empty">No ongoing events. New incidents will appear here.</div>';
  $('#recent-activity').innerHTML=data.recent.length?data.recent.map(e=>`<div class="activity-item"><strong>${escapeHtml(e.reference)} · ${escapeHtml(e.classification)}</strong><small>${escapeHtml(e.feeder||e.equipment||'Equipment not specified')} · Updated ${fmtDate(e.updated_at)}</small></div>`).join(''):'<div class="empty">No activity recorded yet.</div>';
  $$('.event-row').forEach(el=>el.addEventListener('click',()=>openEvent(el.dataset.id)));
}
function eventRow(e) {
  return `<div class="event-row" data-id="${e.id}" tabindex="0" role="button"><div><div class="event-title">${escapeHtml(e.feeder||e.equipment||'Unspecified equipment')} · ${escapeHtml(e.classification)}</div><div class="event-meta">${escapeHtml(e.reference)} · Event ${fmtDate(e.event_datetime)} · ${escapeHtml(e.shift)}</div></div><span class="status">${escapeHtml(e.status)}</span></div>`;
}
function formatMiscellaneousDate(value) {
  const [date, time] = value.split('T');
  return `${date.split('-').reverse().join('/')}${time ? ` ${time}` : ''}`;
}
async function renderMiscellaneous() {
  const entries = await window.jebba.listMiscellaneous();
  $('#miscellaneous-list').innerHTML=entries.length?entries.map(entry=>`<article class="miscellaneous-item"><strong>${formatMiscellaneousDate(entry.occurred_at)}</strong><p>${escapeHtml(entry.description)}</p></article>`).join(''):'<div class="empty">No miscellaneous entries recorded yet.</div>';
}
async function submitMiscellaneous(e) {
  e.preventDefault();
  const date=$('#miscellaneous-date').value;
  const time=$('#miscellaneous-time').value;
  const description=$('#miscellaneous-description').value.trim();
  if(!date||!description){$('#miscellaneous-message').textContent='Enter the entry date and report narrative.';return}
  await window.jebba.createMiscellaneous({occurred_at:`${date}${time?`T${time}`:''}`,description});
  $('#miscellaneous-form').reset();
  $('#miscellaneous-date').value=nowLocalParts().date;
  $('#miscellaneous-message').textContent='';
  await renderMiscellaneous();
  showToast('Miscellaneous report entry saved.');
}
async function renderEvents() {
  currentEvents=await window.jebba.listEvents();
  const q=($('#event-search')?.value||'').toLowerCase();
  const status=$('#status-filter')?.value||'All';
  const rows=currentEvents.filter(e=>(status==='All'||e.status===status)&&[e.reference,e.classification,e.feeder,e.equipment,e.description].join(' ').toLowerCase().includes(q));
  $('#event-table').innerHTML=rows.length?rows.map(e=>`<tr><td><strong>${escapeHtml(e.reference)}</strong></td><td>${escapeHtml(e.classification)}</td><td>${escapeHtml(e.feeder||e.equipment||'—')}</td><td>${fmtDate(e.event_datetime)}</td><td>${escapeHtml(e.shift)}</td><td><span class="status">${escapeHtml(e.status)}</span></td><td><button class="table-action" data-open="${e.id}">Open</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty">No matching records.</td></tr>';
  $$('[data-open]').forEach(b=>b.addEventListener('click',()=>openEvent(b.dataset.open)));
}
async function renderHandover() {
  const events=(await window.jebba.listEvents()).filter(e=>e.status==='Open');
  $('#handover-shift').textContent=shiftFor();
  $('#handover-list').innerHTML=events.length?events.map(eventRow).join(''):'<div class="empty">No outstanding events to hand over.</div>';
  $$('.event-row').forEach(el=>el.addEventListener('click',()=>openEvent(el.dataset.id)));
}
async function submitEvent(e, forceSeparate=false) {
  e?.preventDefault();
  const p=getFormPayload();
  if(!p.classification||!p.event_datetime||!p.description){$('#form-message').textContent='Complete the required fields before saving.';return}
  if(!forceSeparate) {
    const matches=await window.jebba.findDuplicates(p);
    if(matches.length){pendingPayload=p;showDuplicateModal(matches);return}
  }
  await window.jebba.createEvent(p);
  resetForm();showToast('Event saved to this computer.');setPage('dashboard');
}
function showDuplicateModal(matches) {
  $('#duplicate-results').innerHTML=matches.map(e=>`<div class="duplicate-card"><strong>${escapeHtml(e.reference)} · ${escapeHtml(e.feeder||e.equipment)}</strong><p>${escapeHtml(e.classification)} · ${escapeHtml(e.voltage)} · Recorded ${fmtDate(e.recorded_at)} · ${escapeHtml(e.shift)} Shift · ${escapeHtml(e.status)}</p><button class="button secondary" data-update-existing="${e.id}">Open existing event and add update</button></div>`).join('');
  $$('[data-update-existing]').forEach(b=>b.addEventListener('click',()=>{$('#duplicate-modal').hidden=true;openEvent(b.dataset.updateExisting)}));
  $('#duplicate-modal').hidden=false;$('#close-modal').focus();
}
async function openEvent(id) {
  const events=await window.jebba.listEvents();const e=events.find(x=>x.id===id);if(!e)return;
  $('#event-modal-title').textContent=e.reference;
  $('#event-detail').innerHTML=`
    <div class="event-detail-meta">
      <div class="detail-cell"><small>CLASSIFICATION</small><strong>${escapeHtml(e.classification)}</strong></div>
      <div class="detail-cell"><small>STATUS</small><strong>${escapeHtml(e.status)}</strong></div>
      <div class="detail-cell"><small>SHIFT</small><strong>${escapeHtml(e.shift)}</strong></div>
      <div class="detail-cell"><small>FEEDER / LINE</small><strong>${escapeHtml(e.feeder||'—')}</strong></div>
      <div class="detail-cell"><small>VOLTAGE</small><strong>${escapeHtml(e.voltage||'—')}</strong></div>
      <div class="detail-cell"><small>EVENT TIME</small><strong>${fmtDate(e.event_datetime)}</strong></div>
    </div>
    <p class="modal-copy">${escapeHtml(e.description)}</p>
    <h3 style="font-size:13px;font-weight:500;color:var(--text-strong);margin:18px 0 12px">Event history</h3>
    ${(e.updates||[]).map(u=>`<div class="update-item"><strong>${escapeHtml(u.update_type)} · ${escapeHtml(u.shift)} Shift</strong><p>${escapeHtml(u.body)}</p><small>${fmtDate(u.created_at)}</small></div>`).join('')}
    ${e.status==='Open'?`<form class="update-form" id="update-form"><div class="field"><label for="update-body">Add operational update *</label><textarea id="update-body" required placeholder="Enter new observations, instructions or restoration information…"></textarea></div><label style="display:flex;gap:8px;align-items:center;font-size:12px;margin:8px 0 14px"><input type="checkbox" id="mark-restored"> Mark event as restored</label><div class="form-footer"><span class="form-note">Update time and shift are captured automatically.</span><button class="button primary" type="submit">Save Update</button></div></form>`:`<p class="notice">This event is marked as restored. Its history remains available.</p>`}`;
  $('#event-modal').hidden=false;
  $('#update-form')?.addEventListener('submit',async ev=>{
    ev.preventDefault();const body=$('#update-body').value.trim();if(!body)return;
    await window.jebba.addUpdate({eventId:id,body,updateType:$('#mark-restored').checked?'Restoration / operational update':'Operational update',restored:$('#mark-restored').checked});
    $('#event-modal').hidden=true;showToast('Event history updated.');renderEvents();refreshDashboard();renderHandover();
  });
  $('#close-event-modal').focus();
}
function wire() {
  $$('.nav-item').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.page)));
  $$('[data-go]').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.go)));
  $('#new-entry-button').addEventListener('click',()=>{resetForm();setPage('new')});
  $('#event-form').addEventListener('submit',submitEvent);
  $('#miscellaneous-form').addEventListener('submit',submitMiscellaneous);
  $$('#event-form input,#event-form select,#event-form textarea').forEach(el=>el.addEventListener('input',updatePreview));
  $('#event-search').addEventListener('input',renderEvents);$('#status-filter').addEventListener('change',renderEvents);
  $('#create-separate').addEventListener('click',()=>{const p=pendingPayload;$('#duplicate-modal').hidden=true;submitEventFromPayload(p,true)});
  $('#close-modal').addEventListener('click',()=>$('#duplicate-modal').hidden=true);
  $('#close-event-modal').addEventListener('click',()=>$('#event-modal').hidden=true);
  $('#duplicate-modal').addEventListener('click',e=>{if(e.target.id==='duplicate-modal')e.currentTarget.hidden=true});
  $('#event-modal').addEventListener('click',e=>{if(e.target.id==='event-modal')e.currentTarget.hidden=true});
  $('#backup-button').addEventListener('click',doBackup);$('#backup-button-2').addEventListener('click',doBackup);
  $('#restore-button').addEventListener('click',async()=>{try{const r=await window.jebba.restore();if(!r.cancelled){showToast(`Backup merged: ${r.events} event records and ${r.miscellaneous} miscellaneous entries checked.`);refreshDashboard();renderEvents();renderMiscellaneous()}}catch(e){showToast(e.message)}});
  $('#report-preview-button').addEventListener('click',()=>showToast('Report compilation is the next implementation stage.'));
}
async function submitEventFromPayload(p, force) {
  if(!p)return;
  await window.jebba.createEvent(p);resetForm();showToast('Separate event saved.');setPage('dashboard');
}
async function doBackup(){try{const r=await window.jebba.backup();if(!r.cancelled)showToast('Backup exported successfully.')}catch(e){showToast(e.message)}}
async function init() {
  wire();
  const info=await window.jebba.info();
  $('#shift-label').textContent=shiftFor();
  updateCaptureClock();
  $('#footer-status').textContent='LOCAL DATABASE · OFFLINE READY';
  $('#handover-shift').textContent=shiftFor();
  resetForm();
  $('#miscellaneous-date').value=nowLocalParts().date;
  await refreshDashboard();
  // Re-evaluate the shift at minute boundaries while the app remains open.
  setInterval(()=>{$('#shift-label').textContent=shiftFor();$('#handover-shift').textContent=shiftFor();updateCaptureClock()},1000);
}
init();
