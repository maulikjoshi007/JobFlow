# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [1.2.0]

### Added
- **True RFC-threaded follow-up replies** via the optional Gmail advanced API service - constructs a raw MIME message with `In-Reply-To`/`References` headers and an explicit `threadId`, guaranteeing the follow-up lands in the same conversation regardless of the recipient's email provider (not a subject-matching heuristic). Falls back automatically to the previous subject-based approach if the Gmail API service isn't enabled in the project. One-time optional setup: Apps Script editor → Services → add "Gmail API" (see `docs/INSTALL.md` Step 7).
- `jobflow_diagnostics()` — one-call report of the true effective `dryRun` state, any active force-dry-run override (and its age), and the real persisted daily-send counter, for troubleshooting without guessing.
- `jobflow_listConfigFiles()` — lists every file matching each config filename in the Drive config folder, surfacing duplicate-named files directly.
- `jobflow_adjustTodaysSentCount(correctCount)` — recovery tool to manually correct the persisted daily-send counter if it's ever inflated by a bug or bad test run.

### Fixed
- **Critical**: dry-run mode could write real Sheet status changes (`markSent`/`markFollowedUp`) and inflate the real persisted daily-send counter, even though no email was ever actually sent - meaning a dry-run test (or an accidentally-forced dry-run during real automation) could falsely mark real rows as contacted and block legitimate sending for the rest of the day. Dry-run is now fully non-mutating: no Sheet writes, no counter changes, regardless of how dry-run mode was triggered.
- **Duplicate config files silently serving stale settings**: Drive allows multiple files with the same name in one folder, and `getFilesByName()`'s match order isn't controllable - if an old `settings.json` was never deleted after uploading a replacement, edits to the new file could have no effect at all, since the code might keep reading the old one. `loadJsonFile_` now detects and logs a warning when duplicates exist.
- **Counter corruption from argument-taking functions run via the editor dropdown**: `jobflow_adjustTodaysSentCount(correctCount)` is designed to take an argument, but the Apps Script editor's Run button always calls the selected function with zero arguments - which previously wrote the literal string `"NaN"` into the persisted daily-send counter, silently breaking every batch-limit comparison downstream (NaN comparisons are always false, so batches would process 0 rows with no visible error). Fixed with defense in depth: `Scheduler.setSentToday()` now validates its input and rejects anything that isn't a real, non-negative number, leaving the counter untouched and logging an error; `Scheduler.getSentToday()` now detects an already-corrupted stored value on read and self-heals it back to `0`; `jobflow_adjustTodaysSentCount()` now surfaces a clear, actionable error (including a reminder to use a small wrapper function, since it cannot be run directly from the editor dropdown) instead of failing silently.

## [1.1.0]

### Added
- Automated reply detection (`ReplyDetectionService.gs`) — scans the Gmail thread of every `Sent` row before each batch and cancels follow-up as soon as a reply is found, instead of relying purely on a fixed day count.
- New `Thread Id` and `Replied Date` columns on the Applications sheet; new `Replied` status.
- Bounce detection heuristic — inbound messages from `mailer-daemon`/`postmaster`/delivery-notification senders are classified as bounces (`Failed`) rather than incorrectly counted as replies.
- `Check Replies Now` manual menu action.
- `Replies` metric on the Dashboard.
- Randomized 3–8s delay between real sends to avoid a uniform, bot-like sending cadence.
- Cross-row duplicate-recruiter guard — the same email address on two different rows is only ever contacted once, checked both against prior sends and live within the same batch.
- `jobflow_validateAllRows()` — safe, fast, full-dataset validation pass (no Gmail calls, no per-row Sheet writes, can't time out or send anything) for checking hundreds of rows before going live.
- `jobflow_backfillThreadIds()` — one-time helper to retroactively attach a Thread Id to `Sent` rows that predate thread tracking.
- `jobflow_clearStuckDryRunFlag()` — diagnostic/safety helper to detect and clear a stuck dry-run override.
- `jobflow_testLockHold()` — deterministic helper for manually testing concurrent-execution lock protection.
- Dashboard rework: new "Today" section (sent/remaining toward daily limit, new applications/follow-ups/replies today) and "Automation Status" section (installed/paused, last scheduler run, active send windows/days), alongside the existing all-time summary.
- `attachResumeOnInitialSend` setting and `{{resumeMention}}` placeholder — first-contact email defaults to a view-only Drive link instead of an attachment (safer for corporate mail gateways); togglable, with template wording that adapts automatically either way.

### Fixed
- **Race condition**: overlapping trigger executions could run two batches simultaneously and double-count the daily send limit. Now guarded with `LockService` (extended to all manual menu actions too, via `Utils.withLock`).
- **Reply detection false negative**: previously only inspected the most recent message in a thread, missing a genuine reply that arrived before a later message of your own in the same thread. Now inspects every message after the original send.
- **Follow-ups now reply in-thread** instead of sending a disconnected new email — reads as a real conversation, and lets reply detection keep working after a follow-up goes out (previously, a reply to a follow-up was invisible to the system since `Followed Up` rows were never re-scanned).
- **Bounce heuristic narrowed** — dropped the overly broad `no-reply`/`noreply` sender match, which was misclassifying legitimate ATS acknowledgment emails as bounces (`Failed`) when the email had actually delivered fine.
- **`SheetService.markReplied` was defined but never exposed** in the module's public API, causing `is not a function` at runtime. Fixed, and every other module audited for the same class of bug (none found).
- **`SpreadsheetApp.getUi()` crash** when running functions directly from the Apps Script editor instead of via the Sheet's menu (no UI context in that case). All `getUi()` calls now fail gracefully into a log line instead of throwing.
- Subject-line placeholder collisions (e.g. "Angular Developer" appearing twice) when a subject template hardcoded a role name that also appears via `{{jobTitle}}`.
- **Critical**: follow-up emails were being sent to the sender's own address instead of the recipient, caused by calling `.reply()` on our own outgoing message (which follows the `replyTo` we set on ourselves - `.reply()` is only correct for messages received, not sent). Follow-ups now send directly to the recipient with an explicit `Re:` subject.
- **Performance**: `SheetService.updateRow()` was re-reading the entire header row from Sheets on every single call instead of once per execution. At scale (hundreds of rows hitting skip/fail write paths in one run) this alone was enough to exceed Apps Script's execution time limit.
- **Stuck dry-run flag**: `jobflow_runDryRun`'s force-dry-run override was a sticky boolean cleared only in a `finally` block - if the execution was killed by the platform's time limit before reaching cleanup, the flag could remain stuck indefinitely, silently overriding `settings.json` on every subsequent run. Now stored as a timestamp that self-expires after 10 minutes regardless of whether cleanup ever runs.

### Changed
- **Initial-send resume delivery**: defaults to a view-only Drive link instead of a file attachment (attachments on a cold first email are a known spam/gateway-scrutiny signal). Added `attachResumeOnInitialSend` setting to opt back into real attachments if preferred — either way, the email wording adapts automatically via the new `{{resumeMention}}` placeholder. Follow-ups always attach the real file, unaffected by this setting.
- Rewrote `templates/angular.html` using a content structure validated via mail-tester.com (9.5/10, 8.9/10 on two independent runs): immediate role/company mention, specific-tool bullet list, one non-technical value line, brief resume reference and close. Documented as a reusable formula in `docs/CONFIGURATION.md`.

## [1.0.0] - Initial Release

### Added
- Config-driven architecture (`profile.json`, `settings.json`, `subjects.json`) with zero personal data in source code.
- Layered Apps Script codebase: Config, Logger, Utils, Validation, DriveService, SheetService, TemplateService, EmailService, Scheduler, TriggerService, Dashboard, Main.
- Template engine with `{{placeholder}}` substitution and HTML-to-plain-text fallback generation.
- Five starter templates: `angular`, `frontend`, `meanstack`, `generic`, `followup`.
- Subject-line rotation per recipient to avoid repeated subjects.
- Daily send limit, configurable batch size, multiple send windows per day, active-day control.
- Duplicate-send prevention and automatic once-per-contact follow-up engine.
- Resume attachment sourced dynamically from Drive via `resumeFileId` (never hardcoded).
- Structured logger (INFO/WARN/ERROR/SUCCESS) writing to a `Logs` sheet, with CSV export.
- Dashboard sheet summarizing Sent / Pending / Failed / Skipped / Follow-ups.
- Dry-run mode for safe end-to-end testing.
- Custom Sheet menu (`onOpen`) for one-click manual actions.
- Sample HR sheet and sample profile for quick onboarding.
- Full documentation set (README, INSTALL, SETUP, CONFIGURATION, FAQ, CONTRIBUTING).
- GitHub issue/PR templates, `.gitignore`, MIT License.
