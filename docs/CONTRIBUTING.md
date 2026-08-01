# Contributing to JobFlow

Thanks for considering a contribution! JobFlow aims to stay a clean, layered, config-driven Apps Script project — please keep changes consistent with that.

## Ground Rules

- **No personal data in code.** Never commit real emails, phone numbers, file IDs, or API keys. Use the blank templates in `config/` and the `sample/` folder for examples.
- **Respect the layering.** `EmailService` orchestrates; `SheetService`/`DriveService` are the only places touching Sheets/Drive directly; `TemplateService` owns rendering; `Validation` owns rules; `JFLogger` owns logging. Avoid reaching across layers.
- **JSDoc every exported function.** Match the existing comment style.
- **No God functions.** If a function is doing more than one thing, split it.
- **No magic values.** Pull constants to the top of the module or into `settings.json` if user-configurable.

## Development Workflow

1. Fork the repository and create a feature branch.
2. Make your changes in the corresponding `.gs` file(s) under `apps-script/`.
3. Test manually via a bound Apps Script project (copy files into the Script Editor, run `jobflow_runDryRun`).
4. Update `docs/CHANGELOG.md` under an "Unreleased" heading.
5. Open a pull request using `.github/PULL_REQUEST_TEMPLATE.md`.

## Adding a New Template

1. Add `templates/yourtemplate.html` using the existing placeholder set (see `docs/CONFIGURATION.md`).
2. Add a `"yourtemplate": [...]` array to `config/subjects.json`.
3. Mention it in `README.md`'s feature list if it's a general-purpose addition.

## Adding a New Job-Board Source (Roadmap Items)

Future source integrations (LinkedIn, Naukri, Indeed, Monster, Dice, Glassdoor) should be implemented as a new file, e.g. `apps-script/sources/LinkedInSource.gs`, exposing a function that returns rows matching the Applications sheet schema (`Name`, `Company`, `Email`, `Job Title`, `Location`, `Source`). It should **not** need to modify `EmailService.gs`, `TemplateService.gs`, or `Scheduler.gs`.

## Reporting Bugs

Use `.github/ISSUE_TEMPLATE.md`. Include the relevant `Logs` sheet output (with personal data redacted) and the exact `settings.json`/`profile.json` shape (values redacted) you're using.

## Code of Conduct

Be respectful and constructive. This is a small open-source utility maintained by volunteers.
