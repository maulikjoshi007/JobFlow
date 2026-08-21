# Installation Guide

This guide walks through installing JobFlow from zero to a working, automated pipeline. It assumes no prior Google Apps Script experience.

## Prerequisites

- A Google account with Gmail, Drive, and Sheets.
- Your resume as a PDF or DOCX file, already uploaded somewhere in your Google Drive.
- ~15 minutes.

## Step 1 — Create the Applications Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet. Name it, e.g., "JobFlow Applications".
2. Rename **Sheet1** to `Applications`.
3. In row 1, add these exact headers, one per column, starting at A1:

   ```
   Name | Company | Email | Job Title | Location | Source | Template | Status | Sent Date | Follow Up Date | Last Follow Up | Remarks
   ```

   Tip: you can instead import `sample/Sample_HR_Sheet.xlsx` (File → Import → Insert new sheet(s), or replace current sheet) to start with the headers and a few example rows already in place, then rename the imported tab to `Applications`.
4. Copy the Sheet's ID from its URL: `https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`. You'll need it in Step 5.

## Step 2 — Create the Config Folder in Drive

1. In Google Drive, create a folder named `JobFlow Config`.
2. Upload the three files from this project's `config/` folder: `profile.json`, `settings.json`, `subjects.json`.
3. Open `profile.json` in a text editor (download, edit, re-upload — or edit directly using a code editor extension) and fill in your real details. See [CONFIGURATION.md](CONFIGURATION.md) for field meanings.
4. Open `settings.json` and set `sheetId` to the ID you copied in Step 1.
5. Note the Config Folder's own ID from its Drive URL — you'll need it in Step 5.

## Step 3 — Create the Templates Folder in Drive

1. In Google Drive, create a folder named `JobFlow Templates`.
2. Upload every `.html` file from this project's `templates/` folder.
3. Note this folder's ID too.

## Step 4 — Add the Apps Script Project

1. Open your Applications Sheet.
2. Go to **Extensions → Apps Script**. This opens a bound Apps Script project (recommended, so the custom menu and triggers work naturally).
3. Delete the default empty `Code.gs`.
4. For each file in this project's `apps-script/` folder, create a matching file in the Apps Script editor (**File → New → Script file**, name it exactly the same, e.g. `Config`) and paste in the contents.

   Files to add:
   - `Config.gs`
   - `Logger.gs`
   - `Utils.gs`
   - `Validation.gs`
   - `DriveService.gs`
   - `SheetService.gs`
   - `TemplateService.gs`
   - `EmailService.gs`
   - `Scheduler.gs`
   - `TriggerService.gs`
   - `Dashboard.gs`
   - `Main.gs`

5. Click **Save** (the floppy disk icon), and give the project a name like "JobFlow".

## Step 5 — Set Script Properties

1. In the Apps Script editor, go to **Project Settings** (gear icon) → **Script Properties**.
2. Add:
   - `CONFIG_FOLDER_ID` → the Drive folder ID from Step 2.
   - `TEMPLATES_FOLDER_ID` → the Drive folder ID from Step 3.

## Step 6 — Authorize and Test

1. Back in the editor, open `Main.gs`, select the function dropdown at the top, choose `jobflow_runDryRun`, and click **Run**.
2. Google will prompt you to authorize the script (Gmail send, Sheets, Drive scopes). Review and accept — this is normal for any script that sends email or reads Drive on your behalf.
3. Check **Executions** (left sidebar) for the run log, and check the `Logs` tab that JobFlow created in your Sheet — you should see `DRY RUN` entries and no real emails sent.

## Step 7 (Optional but Recommended) — Enable True Threaded Follow-Ups

By default, follow-up emails send as a new message with `Re: [subject]`, which Gmail usually (not always) groups into the original conversation automatically. For a guaranteed, RFC-correct threaded reply regardless of the recipient's email provider:

1. In the Apps Script editor, click **Services** (the `+` icon in the left sidebar).
2. Find **Gmail API** in the list, click **Add**.
3. That's it — no code change needed. `EmailService.gs` automatically detects the service is available and uses true threaded replies; if you skip this step, it automatically falls back to the subject-based approach instead, with no error.

You can verify which mode is active by checking the `Logs` sheet after a follow-up send/dry-run — it logs `"true threaded reply (Gmail API)"` or `"new email (subject-based)"` explicitly.

## Step 8 — Go Live

1. Reload the Google Sheet tab in your browser so the **JobFlow** custom menu appears (created by `onOpen()`).
2. In `settings.json` (in Drive), set `"dryRun": false` once you're confident everything is configured correctly.
3. From the Sheet, use **JobFlow → Run Batch Now** to send one real batch manually, or **JobFlow → Install Daily Automation** to install the recurring trigger and let it run on your configured schedule.

You're done — JobFlow now runs entirely on Google's servers.
