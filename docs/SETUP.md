# Setup & Scheduling Guide

## How the Scheduler Works

JobFlow installs a single **time-driven trigger** that calls `Scheduler.tick()` every 15 minutes. On every tick, the Scheduler decides whether to actually send anything:

1. **Active day check** — is today's weekday in `settings.json`'s `activeDays` list (e.g. `["MON","TUE","WED","THU","FRI"]`)? If not, the tick is a no-op.
2. **Send window check** — is the current time within `WINDOW_TOLERANCE_MINUTES` (15 min) of one of the `sendWindows` (e.g. `"10:00"`, `"13:00"`, `"16:00"`)? If not, the tick is a no-op.
3. **Daily limit check** — have we already sent `dailySendLimit` emails today (tracked in Script Properties, reset automatically at midnight since the counter key is date-stamped)? If so, the tick is a no-op.
4. Otherwise, `EmailService.runBatch()` sends up to `batchSize` emails (bounded by whatever's left of the daily limit) and updates the Dashboard.

This 15-minute-poll design means you don't need three separate triggers — one flexible trigger handles any number of `sendWindows` you configure.

## Example Schedules

**10 emails at 10 AM, 10 at 1 PM, 10 at 4 PM (weekdays only):**
```json
{
  "batchSize": 10,
  "dailySendLimit": 30,
  "sendWindows": ["10:00", "13:00", "16:00"],
  "activeDays": ["MON", "TUE", "WED", "THU", "FRI"]
}
```

**A single daily batch of 20, including weekends:**
```json
{
  "batchSize": 20,
  "dailySendLimit": 20,
  "sendWindows": ["09:30"],
  "activeDays": ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
}
```

## Installing / Pausing Automation

From the Sheet's **JobFlow** menu:
- **Install Daily Automation** → `TriggerService.install()` — creates the 15-minute trigger.
- **Pause Automation** → `TriggerService.uninstall()` — removes it. Your data and config are untouched; nothing sends until you install again.

You can also run these manually from the Apps Script editor (`jobflow_installTriggers`, `jobflow_uninstallTriggers`).

## Manual Runs

- **Run Batch Now** — sends one batch immediately, ignoring the send-window check (still respects the daily limit and row eligibility).
- **Run Dry Run Test** — forces `dryRun: true` for a single invocation regardless of `settings.json`, logging what *would* be sent without sending anything or marking rows as sent.

## Follow-ups

If `followUpEnabled` is `true`, any row with `Status = Sent` whose `Follow Up Date` has passed and that has no `Last Follow Up` value yet is eligible for exactly one follow-up email (using the `followup` template), counted against the same daily limit and batch size as regular sends.
