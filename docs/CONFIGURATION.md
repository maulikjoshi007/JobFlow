# Configuration Reference

All configuration lives in three JSON files uploaded to your Drive "config" folder. **No personal data ever lives in source code.**

## profile.json

| Field | Type | Description |
|---|---|---|
| `name` | string | Your full name — used in the email signature and Gmail "from" display name. |
| `email` | string | Your email address — used as `replyTo`. |
| `phone` | string | Your phone number, shown in the signature. |
| `linkedin` | string | Your LinkedIn URL, shown in the signature. |
| `location` | string | City/region, used in `{{location}}`. |
| `experience` | string | Free text, e.g. `"5+ years"`, used in `{{experience}}`. |
| `skills` | string | Comma-separated skills, used in `{{skills}}`. |
| `resumeFileId` | string | The Google Drive **file ID** of your resume (PDF/DOCX). Found in the file's share URL: `.../d/`**`THIS_PART`**`/view`. |

## settings.json

| Field | Type | Default | Description |
|---|---|---|---|
| `sheetId` | string | — (required) | The Applications spreadsheet's Drive file ID. |
| `sheetName` | string | `"Applications"` | Tab name holding your contact rows. |
| `dashboardSheetName` | string | `"Dashboard"` | Tab name JobFlow creates/updates for summary metrics. |
| `logSheetName` | string | `"Logs"` | Tab name JobFlow creates/updates for the structured log. |
| `dailySendLimit` | number | `30` | Hard cap on emails sent per calendar day (Apps Script timezone). |
| `batchSize` | number | `10` | Max emails sent per trigger tick. |
| `sendWindows` | string[] | `["10:00","13:00","16:00"]` | 24-hour `HH:mm` times; each tick within ±15 min of one of these can send. |
| `activeDays` | string[] | `["MON"..."FRI"]` | 3-letter day codes JobFlow is allowed to send on. |
| `followUpEnabled` | boolean | `true` | Whether the follow-up engine runs. |
| `followUpAfterDays` | number | `5` | Days after a send before a row becomes follow-up eligible. |
| `maxFollowUps` | number | `1` | Reserved for future multi-touch sequences; current engine sends at most one follow-up. |
| `retryAttempts` | number | `3` | Send retry attempts on transient Gmail errors. |
| `retryDelayMs` | number | `2000` | Base delay between retries (grows per attempt). |
| `dryRun` | boolean | `true` | When `true`, no real emails are sent or rows marked sent; everything is logged as "would send". |
| `defaultTemplate` | string | `"generic"` | Template used when a row's `Template` column is blank. |

## subjects.json

A map of template name → array of subject-line strings (which may themselves use `{{placeholders}}`). JobFlow rotates through the array per-recipient so the same contact never sees an identical subject line twice in a row.

```json
{
  "angular": [
    "Application for {{jobTitle}} at {{company}}",
    "Angular Developer interested in {{jobTitle}} - {{company}}"
  ]
}
```

Add as many templates/subjects as you like — the engine has no hardcoded limit.

## Template Placeholders

Available in every HTML template (`templates/*.html`):

| Placeholder | Source |
|---|---|
| `{{name}}` | Recipient's name (row) |
| `{{company}}` | Recipient's company (row) |
| `{{jobTitle}}` | Job title (row) |
| `{{experience}}` | Your experience (profile) |
| `{{skills}}` | Your skills (profile) |
| `{{resume}}` | Auto-generated resume label |
| `{{linkedin}}` | Your LinkedIn (profile) |
| `{{phone}}` | Your phone (profile) |
| `{{email}}` | Your email (profile) |
| `{{location}}` | Your location (profile) |
| `{{candidateName}}` | Your name (profile) — used in signatures, kept distinct from `{{name}}` (the recipient) |

Unresolved placeholders render as empty strings rather than leaking `{{raw}}` text.

## Google Sheet Columns

| Column | Meaning |
|---|---|
| Name | Recruiter/contact's name |
| Company | Company name |
| Email | Recipient email (validated before send) |
| Job Title | Role being applied for |
| Location | Job location |
| Source | Where you found the lead (LinkedIn, Naukri, referral, etc.) — informational |
| Template | Template name to use; blank = `defaultTemplate` |
| Status | `Pending` / `Sent` / `Failed` / `Skipped` / `Followed Up` — managed automatically |
| Sent Date | Set automatically on successful send |
| Follow Up Date | Set automatically to Sent Date + `followUpAfterDays` |
| Last Follow Up | Set automatically once a follow-up has gone out |
| Remarks | Failure/skip reason, set automatically; safe to add your own notes too |
