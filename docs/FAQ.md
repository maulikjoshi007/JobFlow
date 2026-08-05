# FAQ / Troubleshooting

**"CONFIG_FOLDER_ID is not set" error**
You haven't added the Script Property yet. Apps Script editor → Project Settings → Script Properties → add `CONFIG_FOLDER_ID` with your Drive config folder's ID.

**"Config file ... was not found in the config folder"**
Check the exact filename (`profile.json`, `settings.json`, `subjects.json`) is uploaded to the folder referenced by `CONFIG_FOLDER_ID`, and that the file's Drive MIME type didn't get converted to a Google Doc — it should stay a plain `.json` file.

**"Could not load resume from Drive using resumeFileId"**
Double-check the ID in `profile.json`'s `resumeFileId` matches the resume file's actual Drive ID, and that the script (running as you) has access to it.

**Emails aren't sending on schedule**
1. Confirm you clicked **Install Daily Automation** (or ran `jobflow_installTriggers`).
2. Check today's weekday is listed in `activeDays`.
3. Check the current time is within 15 minutes of one of your `sendWindows`.
4. Check the `Logs` sheet — a `Scheduler` entry explains exactly why a tick did or didn't send.

**Nothing happens even during a send window**
Check `dailySendLimit` hasn't already been reached today (see the `Logs` sheet), and check `dryRun` in `settings.json` — if `true`, JobFlow logs "would send" entries but never sends real mail or marks rows as sent.

**I want to test without risking real sends**
Use **JobFlow → Run Dry Run Test** from the Sheet menu, or run `jobflow_runDryRun` directly in the Apps Script editor. This overrides `dryRun` to `true` for a single run regardless of your saved setting.

**How do I stop a row from ever being sent to?**
Set its `Status` to anything other than blank/`Pending` (e.g. `Skipped`), or simply delete the row.

**How do I re-send to a row that failed?**
Set its `Status` back to `Pending` (and clear `Remarks` if you like) and it will be picked up on the next batch.

**Can I add more templates?**
Yes — drop a new `.html` file into your Drive templates folder and add its subject-line array to `subjects.json` under a matching key. Reference it by name in a row's `Template` column.

**Gmail daily sending limits**
Gmail imposes its own daily sending caps depending on account type (see Google's official documentation, since limits can change). Set `dailySendLimit` comfortably below your account's actual cap to leave room for your normal personal email use.

**Where do "Replies" get tracked on the Dashboard?**
JobFlow scans the Gmail thread of every `Sent` row (via the `Thread Id` captured at send time) on every scheduler tick, before considering follow-ups. If the most recent message in the thread wasn't sent by you, the row is marked `Replied` and is permanently excluded from follow-up - the follow-up engine only ever considers rows still marked `Sent`. You can also trigger this manually anytime via **JobFlow → Check Replies Now**. Note: this treats any inbound message (including auto-replies/out-of-office) as a reply, since Apps Script can't reliably distinguish a human reply from an autoresponder - if that matters to you, review the `Replied` rows periodically and manually revert any false positives back to `Sent`.

**I changed profile.json but the old data is still being used**
Config is cached for 5 minutes per file to reduce Drive calls. Wait a few minutes, or run `Config.clearCache()` from the Apps Script editor for an immediate refresh.

**Why does the first email link to my resume instead of attaching it?**
An attachment on a cold first email is a well-known spam signal to mail filters. JobFlow sends a view-only Drive link (`{{resumeLink}}`) on the initial application, and switches to a real file attachment on the automatic follow-up, once a real conversation thread already exists. This is a template choice, not hardcoded - edit `templates/*.html` if you'd rather always attach.

**"The resume file is not link-shared and JobFlow could not enable it automatically"**
JobFlow tries to automatically set your resume file's sharing to "Anyone with the link - Viewer" the first time it's needed. If your Google account is on a Workspace domain with a policy blocking external link sharing, this fails and throws instead of silently sending a broken link. Fix: open the resume file in Drive → Share → change access to "Anyone with the link" → Viewer, manually. If your Workspace admin blocks this entirely, you'll need to switch the templates back to attachment-based sending instead.

**Still stuck?**
Open an issue using `.github/ISSUE_TEMPLATE.md` with your Execution log output (remove any personal data first).
