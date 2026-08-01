/**
 * EmailService.gs
 * Service Layer
 *
 * Orchestrates validation, template rendering, resume attachment and
 * Gmail sending for a single row, plus batch processing with daily
 * limits, duplicate prevention and retry handling.
 */

var EmailService = (function () {
  /**
   * Sends (or dry-run simulates) a single application email for one row.
   * @param {Object} row
   * @param {Object} profile
   * @param {Object} settings
   * @return {{ok: boolean, reason: string}}
   */
  function sendForRow_(row, profile, settings) {
    var templateName = row.template || settings.defaultTemplate;

    var body;
    try {
      body = TemplateService.renderBody(templateName, profile, row);
    } catch (e) {
      return { ok: false, reason: 'Template error: ' + e.message };
    }

    var subject = TemplateService.pickSubject(templateName, profile, row);

    if (settings.dryRun) {
      JFLogger.info('EmailService', 'DRY RUN - would send email', {
        to: row.email,
        subject: subject,
        template: templateName
      });
      return { ok: true, reason: 'dry-run' };
    }

    var resumeBlob;
    try {
      resumeBlob = DriveService.getResumeBlob();
    } catch (e) {
      return { ok: false, reason: e.message };
    }

    try {
      Utils.retry(function () {
        GmailApp.sendEmail(row.email, subject, body.text, {
          htmlBody: body.html,
          attachments: [resumeBlob],
          name: profile.name,
          replyTo: profile.email
        });
      }, settings.retryAttempts, settings.retryDelayMs);

      return { ok: true, reason: '' };
    } catch (e) {
      return { ok: false, reason: 'Send failed: ' + e.message };
    }
  }

  /**
   * Sends a follow-up email for a row that is due.
   * @param {Object} row
   * @param {Object} profile
   * @param {Object} settings
   * @return {{ok: boolean, reason: string}}
   */
  function sendFollowUpForRow_(row, profile, settings) {
    var followUpRow = {};
    for (var k in row) followUpRow[k] = row[k];
    followUpRow.template = 'followup';

    return sendForRow_(followUpRow, profile, settings);
  }

  /**
   * Runs one batch: pulls rows, filters to pending/valid/due, sends up to
   * batchSize emails while respecting the daily send limit already used.
   * @param {number} alreadySentToday
   * @return {{sent: number, failed: number, skipped: number}}
   */
  function runBatch(alreadySentToday) {
    var settings = Config.getSettings();
    var profile = Config.getProfile();

    var profileCheck = Validation.validateProfile(profile);
    if (!profileCheck.valid) {
      JFLogger.error('EmailService', 'Profile validation failed', profileCheck.reason);
      return { sent: 0, failed: 0, skipped: 0 };
    }

    var remainingToday = Math.max(0, settings.dailySendLimit - alreadySentToday);
    var batchLimit = Math.min(settings.batchSize, remainingToday);

    if (batchLimit <= 0) {
      JFLogger.info('EmailService', 'Daily send limit reached, skipping batch');
      return { sent: 0, failed: 0, skipped: 0 };
    }

    var rows = SheetService.getAllRows();
    var counters = { sent: 0, failed: 0, skipped: 0 };

    for (var i = 0; i < rows.length && counters.sent < batchLimit; i++) {
      var row = rows[i];
      var isFollowUp = row.followUpDue && settings.followUpEnabled;
      var isPending = String(row.status || '').toLowerCase() === SheetService.STATUS.PENDING.toLowerCase() || !row.status;

      if (!isFollowUp && !isPending) {
        continue; // already sent/failed/skipped and not due for follow-up
      }

      var check = Validation.validateRow(row);
      if (!check.valid && !isFollowUp) {
        SheetService.markSkipped(row._rowIndex, check.reason);
        JFLogger.warn('EmailService', 'Row skipped', { row: row._rowIndex, reason: check.reason });
        counters.skipped++;
        continue;
      }

      var result = isFollowUp
        ? sendFollowUpForRow_(row, profile, settings)
        : sendForRow_(row, profile, settings);

      if (result.ok) {
        if (isFollowUp) {
          SheetService.markFollowedUp(row._rowIndex);
          JFLogger.success('EmailService', 'Follow-up sent', { to: row.email, company: row.company });
        } else {
          SheetService.markSent(row._rowIndex, settings.followUpAfterDays);
          JFLogger.success('EmailService', 'Application sent', { to: row.email, company: row.company });
        }
        counters.sent++;
      } else {
        SheetService.markFailed(row._rowIndex, result.reason);
        JFLogger.error('EmailService', 'Send failed', { to: row.email, reason: result.reason });
        counters.failed++;
      }
    }

    return counters;
  }

  return {
    runBatch: runBatch
  };
})();
