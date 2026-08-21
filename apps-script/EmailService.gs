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
   * Defaults to a view-only Drive link (safer for corporate mail
   * gateways that scan/quarantine unsolicited attachments); set
   * settings.attachResumeOnInitialSend = true to attach the real file
   * instead - if you do, update your templates' wording to match (see
   * docs/CONFIGURATION.md).
   * @param {Object} row
   * @param {Object} profile
   * @param {Object} settings
   * @return {{ok: boolean, reason: string, threadId: (string|undefined)}}
   */
  function sendForRow_(row, profile, settings) {
    var templateName = row.template || settings.defaultTemplate;
    var resumeMention = '';
    var resumeBlob = null;

    if (settings.attachResumeOnInitialSend) {
      try {
        resumeBlob = DriveService.getResumeBlob();
      } catch (e) {
        return { ok: false, reason: e.message };
      }
      resumeMention = "I've attached my resume, which goes into more detail on my project experience.";
    } else {
      var resumeLink;
      try {
        resumeLink = DriveService.getResumeLink();
      } catch (e) {
        return { ok: false, reason: e.message };
      }
      resumeMention = 'You can view my resume here: <a href="' + resumeLink + '">' +
        (profile.name ? profile.name + ' Resume' : 'Resume') +
        '</a>, which goes into more detail on my project experience.';
    }

    var body;
    try {
      body = TemplateService.renderBody(templateName, profile, row, { resumeMention: resumeMention });
    } catch (e) {
      return { ok: false, reason: 'Template error: ' + e.message };
    }

    var subject = TemplateService.pickSubject(templateName, profile, row);

    if (settings.dryRun) {
      JFLogger.info('EmailService', 'DRY RUN - would send email', {
        to: row.email,
        subject: subject,
        template: templateName,
        mode: settings.attachResumeOnInitialSend ? 'attachment' : 'link'
      });
      return { ok: true, reason: 'dry-run' };
    }

    try {
      var sentMessage = Utils.retry(function () {
        var options = {
          htmlBody: body.html,
          name: profile.name,
          replyTo: profile.email
        };
        if (resumeBlob) {
          options.attachments = [resumeBlob];
        }
        var draft = GmailApp.createDraft(row.email, subject, body.text, options);
        return draft.send();
      }, settings.retryAttempts, settings.retryDelayMs);

      return { ok: true, reason: '', threadId: sentMessage.getThread().getId() };
    } catch (e) {
      return { ok: false, reason: 'Send failed: ' + e.message };
    }
  }

  /**
   * Sends a follow-up email for a row that is due. Sends directly to
   * row.email (the recipient) with the subject explicitly set to
   * "Re: [original subject]", which triggers Gmail's own subject +
   * participant conversation grouping for Gmail-to-Gmail threads.
   *
   * IMPORTANT: this deliberately does NOT call GmailMessage.reply() on
   * the original outgoing message. That was tried in an earlier version
   * and is a real bug to avoid: .reply() replies to that message's
   * reply-to address - and since the original send sets
   * replyTo: profile.email (so replies land with you), calling .reply()
   * on your OWN sent message replies to yourself, not the recipient.
   * .reply() is only correct for messages you received, not ones you
   * sent - there is no received message yet at follow-up time.
   *
   * Preferred path: a TRUE RFC-threaded reply via the Gmail advanced
   * service - constructs a raw MIME message with In-Reply-To/References
   * headers pointing at the original message, and sends it with an
   * explicit threadId, so Gmail guarantees it lands in the same
   * conversation regardless of the recipient's email provider (not a
   * subject-matching heuristic). Requires the "Gmail API" advanced
   * service to be enabled in this Apps Script project (Services -> +
   * -> Gmail API). Falls back automatically to a subject-based new
   * email (Re: [subject], works reliably for Gmail-to-Gmail threads via
   * Gmail's own matching, not guaranteed for other providers) if the
   * service isn't enabled, or if the threaded send fails for any
   * reason.
   * @param {Object} row
   * @param {Object} profile
   * @param {Object} settings
   * @return {{ok: boolean, reason: string, threadId: (string|undefined)}}
   */
  function sendFollowUpForRow_(row, profile, settings) {
    var templateName = 'followup';

    var body;
    try {
      body = TemplateService.renderBody(templateName, profile, row);
    } catch (e) {
      return { ok: false, reason: 'Template error: ' + e.message };
    }

    var subject = TemplateService.pickSubject(templateName, profile, row);
    var originalMessageId = null;

    if (row.threadId) {
      try {
        var originalMessage = GmailApp.getThreadById(row.threadId).getMessages()[0];
        var originalSubject = originalMessage.getSubject();
        subject = /^re:/i.test(originalSubject) ? originalSubject : 'Re: ' + originalSubject;
        originalMessageId = originalMessage.getHeader('Message-ID');
      } catch (e) {
        JFLogger.warn('EmailService', 'Could not read original message for follow-up threading', {
          row: row._rowIndex,
          error: e.message
        });
      }
    }

    var willUseThreadedReply = originalMessageId && row.threadId && typeof Gmail !== 'undefined';

    if (settings.dryRun) {
      JFLogger.info('EmailService', 'DRY RUN - would send follow-up', {
        to: row.email,
        subject: subject,
        mode: willUseThreadedReply ? 'true threaded reply (Gmail API)' : 'new email (subject-based)'
      });
      return { ok: true, reason: 'dry-run', threadId: row.threadId };
    }

    var resumeBlob;
    try {
      resumeBlob = DriveService.getResumeBlob();
    } catch (e) {
      return { ok: false, reason: e.message };
    }

    if (willUseThreadedReply) {
      try {
        var raw = buildRawMimeReply_(row.email, subject, body, profile, originalMessageId, resumeBlob);
        Utils.retry(function () {
          Gmail.Users.Messages.send({ raw: raw, threadId: row.threadId }, 'me');
        }, settings.retryAttempts, settings.retryDelayMs);

        return { ok: true, reason: '', threadId: row.threadId };
      } catch (e) {
        JFLogger.warn('EmailService', 'Threaded follow-up via Gmail API failed, falling back to a new email', {
          row: row._rowIndex,
          error: e.message
        });
      }
    }

    // Fallback: subject-based new email.
    try {
      var sentMessage = Utils.retry(function () {
        var draft = GmailApp.createDraft(row.email, subject, body.text, {
          htmlBody: body.html,
          attachments: [resumeBlob],
          name: profile.name,
          replyTo: profile.email
        });
        return draft.send();
      }, settings.retryAttempts, settings.retryDelayMs);

      return { ok: true, reason: '', threadId: sentMessage.getThread().getId() };
    } catch (e) {
      return { ok: false, reason: 'Follow-up send failed: ' + e.message };
    }
  }

  /**
   * Builds a base64url-encoded raw MIME message for a true threaded
   * reply: multipart/mixed containing a multipart/alternative body
   * (plain text + HTML) and the resume as an attachment, with
   * In-Reply-To/References headers set to the original message's ID.
   * @param {string} to
   * @param {string} subject
   * @param {{html: string, text: string}} body
   * @param {Object} profile
   * @param {string} inReplyToMessageId Raw Message-ID header value (with angle brackets).
   * @param {GoogleAppsScript.Base.Blob} resumeBlob
   * @return {string} base64url-encoded raw MIME message
   */
  function buildRawMimeReply_(to, subject, body, profile, inReplyToMessageId, resumeBlob) {
    var boundaryMixed = 'mixed_' + Utilities.getUuid().replace(/-/g, '');
    var boundaryAlt = 'alt_' + Utilities.getUuid().replace(/-/g, '');

    var headerLines = [
      'To: ' + to,
      'From: ' + profile.name + ' <' + profile.email + '>',
      'Reply-To: ' + profile.email,
      'Subject: ' + subject,
      'In-Reply-To: ' + inReplyToMessageId,
      'References: ' + inReplyToMessageId,
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="' + boundaryMixed + '"'
    ].join('\r\n');

    var altPart =
      '--' + boundaryMixed + '\r\n' +
      'Content-Type: multipart/alternative; boundary="' + boundaryAlt + '"\r\n\r\n' +
      '--' + boundaryAlt + '\r\n' +
      'Content-Type: text/plain; charset="UTF-8"\r\n\r\n' +
      body.text + '\r\n\r\n' +
      '--' + boundaryAlt + '\r\n' +
      'Content-Type: text/html; charset="UTF-8"\r\n\r\n' +
      body.html + '\r\n\r\n' +
      '--' + boundaryAlt + '--\r\n';

    var attachmentPart = '';
    if (resumeBlob) {
      var base64Data = Utilities.base64Encode(resumeBlob.getBytes());
      var chunked = base64Data.match(/.{1,76}/g).join('\r\n');
      attachmentPart =
        '--' + boundaryMixed + '\r\n' +
        'Content-Type: ' + resumeBlob.getContentType() + '; name="' + resumeBlob.getName() + '"\r\n' +
        'Content-Disposition: attachment; filename="' + resumeBlob.getName() + '"\r\n' +
        'Content-Transfer-Encoding: base64\r\n\r\n' +
        chunked + '\r\n';
    }

    var mime = headerLines + '\r\n\r\n' + altPart + attachmentPart + '--' + boundaryMixed + '--';

    return Utilities.base64EncodeWebSafe(mime).replace(/=+$/, '');
  }

  /**
   * Runs one batch: pulls rows, filters to pending/valid/due, sends up to
   * batchSize emails while respecting the daily send limit already used.
   * Also enforces a cross-row duplicate-recruiter guard: if the same
   * email address appears on more than one row (accidental duplicate),
   * only the first is ever sent to - checked both against prior runs and
   * live against sends happening within this same batch.
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

    var contactedEmails = {};
    rows.forEach(function (r) {
      var s = String(r.status || '').toLowerCase();
      var alreadyContacted =
        s === SheetService.STATUS.SENT.toLowerCase() ||
        s === SheetService.STATUS.FOLLOWED_UP.toLowerCase() ||
        s === SheetService.STATUS.REPLIED.toLowerCase();
      if (alreadyContacted && r.email) {
        contactedEmails[String(r.email).toLowerCase()] = true;
      }
    });

    var counters = { sent: 0, failed: 0, skipped: 0 };

    for (var i = 0; i < rows.length && counters.sent < batchLimit; i++) {
      var row = rows[i];
      var emailKey = String(row.email || '').toLowerCase();
      var isFollowUp = row.followUpDue && settings.followUpEnabled;
      var isPending = String(row.status || '').toLowerCase() === SheetService.STATUS.PENDING.toLowerCase() || !row.status;

      if (!isFollowUp && !isPending) {
        continue; // already sent/failed/skipped and not due for follow-up
      }

      if (!isFollowUp && contactedEmails[emailKey]) {
        SheetService.markSkipped(row._rowIndex, 'Duplicate email - already contacted via another row');
        JFLogger.warn('EmailService', 'Row skipped - duplicate recruiter email', {
          row: row._rowIndex,
          email: row.email
        });
        counters.skipped++;
        continue;
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

      if (result.ok && !settings.dryRun && i < rows.length - 1) {
        // Small randomized pause between real sends (3-8s) so a batch
        // doesn't look like a robotic, perfectly-uniform mail blast.
        Utils.sleep(3000 + Math.floor(Math.random() * 5000));
      }

      if (result.ok) {
        if (settings.dryRun) {
          // Dry run: sendForRow_/sendFollowUpForRow_ already logged the
          // "DRY RUN - would send..." detail. Count it for the returned
          // summary only - do NOT touch the sheet, the duplicate-email
          // guard, or anything else that should only happen on a real
          // send. This was previously missing and caused dry runs to
          // silently mark rows as Sent in the real sheet.
        } else if (isFollowUp) {
          SheetService.markFollowedUp(row._rowIndex, result.threadId);
          JFLogger.success('EmailService', 'Follow-up sent', { to: row.email, company: row.company });
        } else {
          SheetService.markSent(row._rowIndex, settings.followUpAfterDays, result.threadId);
          JFLogger.success('EmailService', 'Application sent', { to: row.email, company: row.company });
          contactedEmails[emailKey] = true; // guard against a same-batch duplicate row too
        }
        counters.sent++;
      } else {
        SheetService.markFailed(row._rowIndex, result.reason);
        JFLogger.error('EmailService', 'Send failed', { to: row.email, reason: result.reason });
        counters.failed++;
      }
    }

    return { sent: counters.sent, failed: counters.failed, skipped: counters.skipped, dryRun: settings.dryRun };
  }

  return {
    runBatch: runBatch
  };
})();
