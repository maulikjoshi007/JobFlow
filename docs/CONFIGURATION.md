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
| `attachResumeOnInitialSend` | boolean | `false` | `false` (default): first email links to a view-only Drive copy of your resume - safer for corporate mail gateways that scan/quarantine unsolicited attachments from unfamiliar senders. `true`: attaches the real file on the first email instead. Either way, follow-ups always attach the real file (see `templates/followup.html`). |

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
| `{{resumeMention}}` | A ready-made sentence referencing your resume - automatically reads as a link ("You can view my resume here: ...") or as an attachment reference ("I've attached my resume...") depending on `attachResumeOnInitialSend` in `settings.json`. Use this instead of manually writing "attached"/"linked" wording, so your templates stay correct if you ever flip that setting. Not used in `followup.html`, which always attaches the real file directly. |
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

## Writing Effective Skill Sections

Your two mail-tester runs (9.5/10 and 8.9/10) validated a specific content pattern — here's the reusable formula, extracted so you can apply it consistently across templates and to future template variants:

1. **Open by naming the actual role and company in the first sentence** — not a generic "I'm writing to express interest..." Lead with `{{jobTitle}} at {{company}}` immediately.
2. **State your experience level and specialization in one sentence** — "Senior Angular Developer with 5+ years of experience building enterprise web applications," not just "experienced developer."
3. **List skills as a short bullet list (4-6 items), grouped logically, with exact versions/tools named**:
   - Core language/framework line first, with version numbers where relevant (`Angular v12+`, not just `Angular`)
   - Integration/architecture line (REST APIs, microservices, etc.)
   - State management / patterns line (RxJS, NgRx, Redux, etc.)
   - Tooling/libraries line (UI kits, testing frameworks)
   - Process/delivery line (CI/CD tools by name, Agile/Scrum)

   Specific tool names outperform generic category words — "Jenkins, Bitbucket Pipelines" reads as real experience; "CI/CD tools" reads as filler.
4. **Add one line of non-technical value** — mentoring, code review, cross-team collaboration, ownership. This is what separates "can do the job" from "will be good to work with," and recruiters weight it more than a fourth bullet point would.
5. **Reference the resume, don't restate it** — one sentence pointing to the resume for detail, not a second summary of your whole career.
6. **Close briefly** — one line inviting a conversation, no urgency language ("please respond ASAP") and no more than one call-to-action.

This is exactly the structure now in `templates/angular.html`. When you (or someone else) writes `frontend.html`/`meanstack.html`/a new stack's template, follow the same six-part shape with that stack's actual tools named specifically — that consistency is what tested well, not any single word choice.

