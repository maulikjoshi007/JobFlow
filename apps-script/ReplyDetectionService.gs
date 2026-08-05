/**
 * ReplyDetectionService.gs
 * Reply Detection Layer
 *
 * Scans the Gmail thread of every "Sent" row (using the Thread Id captured
 * at send time) to see whether the recipient has replied. If so, the row
 * is marked "Replied" and immediately becomes ineligible for follow-up,
 * because isFollowUpDue_() only ever considers Status === "Sent".
 *
 * This runs as a cheap pre-pass before every batch, so a reply received
 * minutes ago is excluded from the very next scheduler tick (every 15
 * min) - there is no fixed "wait a day" window; detection is as fast as
 * the polling interval.
 */

var ReplyDetectionService = (function () {
  var BOUNCE_SENDER_PATTERNS = [
    'mailer-daemon',
    'postmaster',
    'mail delivery subsystem'
  ];

  var BOUNCE_SUBJECT_PATTERNS = [
    'delivery status notification',
    'undelivered mail returned to sender',
    'delivery failure',
    'failure notice',
    'returned mail',
    'undeliverable'
  ];

  /**
   * Heuristic: does this message look like an automated bounce/DSN
   * rather than a genuine reply? Deliberately narrow - generic
   * "no-reply@" senders are common for legitimate ATS acknowledgments
   * (e.g. "we received your application") and should NOT be treated as
   * a bounce; those are instead treated as a reply (see analyzeThread_),
   * which is the safer default: it means "stop following up," which is
   * reasonable once you know the application was received by something.
   * @param {GoogleAppsScript.Gmail.GmailMessage} message
   * @return {boolean}
   */
  function looksLikeBounce_(message) {
    var from = (message.getFrom() || '').toLowerCase();
    var subject = (message.getSubject() || '').toLowerCase();

    var fromMatch = BOUNCE_SENDER_PATTERNS.some(function (pattern) {
      return from.indexOf(pattern) !== -1;
    });
    var subjectMatch = BOUNCE_SUBJECT_PATTERNS.some(function (pattern) {
      return subject.indexOf(pattern) !== -1;
    });

    return fromMatch || subjectMatch;
  }

  /**
   * Returns true if ANY message in the thread after the original send
   * came from someone other than the profile owner and doesn't look
   * like an automated bounce. Checking all messages (not just the last)
   * avoids missing a reply that arrived before a later message of our
   * own in the same thread.
   * @param {GoogleAppsScript.Gmail.GmailThread} thread
   * @param {string} ownEmail
   * @return {{replied: boolean, bounced: boolean}}
   */
  function analyzeThread_(thread, ownEmail) {
    var messages = thread.getMessages();
    if (messages.length <= 1) return { replied: false, bounced: false };

    var ownEmailLower = ownEmail.toLowerCase();
    var replied = false;
    var bounced = false;

    // Skip index 0 - that's our original outgoing message.
    for (var i = 1; i < messages.length; i++) {
      var message = messages[i];
      var fromHeader = (message.getFrom() || '').toLowerCase();
      var isFromUs = fromHeader.indexOf(ownEmailLower) !== -1;

      if (isFromUs) continue;

      if (looksLikeBounce_(message)) {
        bounced = true;
      } else {
        replied = true;
      }
    }

    return { replied: replied, bounced: bounced };
  }

  /**
   * Scans all "Sent" rows that have a Thread Id and marks any with a
   * detected reply as "Replied".
   * @return {{checked: number, repliesFound: number}}
   */
  function checkReplies() {
    var profile = Config.getProfile();
    var rows = SheetService.getAllRows();
    var counters = { checked: 0, repliesFound: 0, bouncesFound: 0 };

    rows.forEach(function (row) {
      var statusLower = String(row.status).toLowerCase();
      var scannable =
        statusLower === SheetService.STATUS.SENT.toLowerCase() ||
        statusLower === SheetService.STATUS.FOLLOWED_UP.toLowerCase();

      if (!scannable) return;
      if (!row.threadId) return; // sent before thread tracking existed, or send didn't capture a thread

      counters.checked++;

      try {
        var thread = GmailApp.getThreadById(row.threadId);
        if (!thread) return;

        var analysis = analyzeThread_(thread, profile.email);

        if (analysis.bounced) {
          SheetService.markFailed(row._rowIndex, 'Bounce detected in thread - verify email address');
          JFLogger.warn('ReplyDetectionService', 'Bounce detected, marked Failed', {
            company: row.company,
            email: row.email
          });
          counters.bouncesFound = (counters.bouncesFound || 0) + 1;
        } else if (analysis.replied) {
          SheetService.markReplied(row._rowIndex);
          JFLogger.success('ReplyDetectionService', 'Reply detected, follow-up cancelled', {
            company: row.company,
            email: row.email
          });
          counters.repliesFound++;
        }
      } catch (e) {
        JFLogger.warn('ReplyDetectionService', 'Could not check thread', {
          row: row._rowIndex,
          error: e.message
        });
      }
    });

    JFLogger.info('ReplyDetectionService', 'Reply scan complete', counters);
    return counters;
  }

  return {
    checkReplies: checkReplies
  };
})();
