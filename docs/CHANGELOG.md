# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

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
