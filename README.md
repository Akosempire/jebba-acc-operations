# Jebba ACC Operations - Windows 11 MVP

The Windows installer is built automatically whenever changes are pushed to `main`. The Jebba ACC computer does **not** need Node.js, npm, a terminal, or development tools.

## Download and install

1. Open the repository's **Releases** page and download `Jebba-ACC-Operations-Setup-0.1.0.exe`.
2. Double-click the installer and follow the one-click installation.

If a release is not available yet, open the repository's **Actions** tab, select the latest successful **Build Jebba ACC Windows Installer** run, and download and extract the **Jebba-ACC-Windows-Installer** artifact.

The installer is configured for a per-user installation without a destination-folder prompt. It creates Desktop and Start Menu shortcuts and launches the app after installation. GitHub Actions rebuilds the installer after every push to `main`; workflow-dispatch builds are also available from the Actions page.

GitHub performs the packaging on a Windows runner after every push to `main`; workflow-dispatch builds are also available from the Actions page. The app needs no cloud database or Supabase; normal application data is stored locally on the Windows computer.

**Windows security note:** this installer is not code-signed. Windows SmartScreen or an organisation's endpoint-security policy may warn about or block an unknown publisher. If TCN policy blocks unsigned software, an authorised IT administrator must approve it or arrange code signing before deployment. Do not bypass organisational security controls.

## Current MVP scope

- Windows desktop shell using Electron.
- Local SQLite database; no Supabase or cloud database.
- Automatic shift assignment from the recorded timestamp:
  - Day Shift: 08:00 inclusive to 18:00 exclusive.
  - Night Shift: 18:00 inclusive to 08:00 exclusive.
- No operator-name field.
- Event creation for Forced, Planned, Urgent, and Emergency Outages.
- Editable text fields with suggestions; operators can type values not already suggested.
- Duplicate check against open events with matching classification and feeder or equipment.
- One event record with an append-only update history.
- Mark an event as restored without deleting its history.
- Search and filter the outage register.
- Shift handover view showing open events.
- Local JSON backup and merge-restore.
- Live report preview, responsive layout, keyboard focus, reduced-motion support, and loading skeletons.

## Operational limitations - not yet production-approved

- The report screen is currently a placeholder. Exact weekly Word export still requires the approved TCN Word template and field mapping.
- Operational fields and required-field rules still need confirmation against Jebba ACC's actual reporting practice.
- The duplicate check is a first-pass suggestion only and requires operator review; it does not silently merge records.
- The app assumes one Windows computer and one Windows user profile share the database. Different Windows profiles would have separate databases.
- Back up records regularly to an approved separate drive/location before updates or maintenance.
- This MVP does not authenticate individual operators or prove who entered a record, as requested.

## Data location

The SQLite database is stored under Electron's `app.getPath('userData')` for the Windows user who runs the application, not in the installation directory. Use the in-app backup feature rather than manually editing the database.
