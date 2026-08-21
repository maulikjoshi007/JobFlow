/**
 * Main.gs
 * Application entry points.
 *
 * These are the functions a user runs manually (or via the Sheet's custom
 * menu) to install automation, run a batch on demand, or perform a
 * dry-run test. Nothing here contains personal data - everything is
 * pulled from Config.
 *
 * All mutating actions run through Utils.withLock so a manual click can
 * never overlap with a scheduled trigger tick (or another manual click).
 *
 * getUi() is only valid when called from an actual Sheet UI context
 * (a menu click, or onOpen). Every getUi() call here is wrapped in
 * try/catch so running these functions directly from the Apps Script
 * editor (no UI context) logs instead of throwing.
 */

/**
 * Adds a custom menu to the bound Google Sheet for one-click actions.
 * Runs automatically when the spreadsheet is opened, if this project is
 * bound to the sheet (recommended setup - see docs/SETUP.md).
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('JobFlow')
      .addItem('Run Batch Now', 'jobflow_runBatchNow')
      .addItem('Run Dry Run Test', 'jobflow_runDryRun')
      .addItem('Validate All Rows (safe, no sending)', 'jobflow_validateAllRows')
      .addItem('Check Replies Now', 'jobflow_checkReplies')
      .addSeparator()
      .addItem('Install Daily Automation', 'jobflow_installTriggers')
      .addItem('Pause Automation', 'jobflow_uninstallTriggers')
      .addSeparator()
      .addItem('Refresh Dashboard', 'jobflow_refreshDashboard')
      .addItem('Backfill Thread Ids (one-time)', 'jobflow_backfillThreadIds')
      .addItem('Check/Clear Stuck Dry-Run Flag', 'jobflow_clearStuckDryRunFlag')
      .addItem('Export Logs (CSV to Drive)', 'jobflow_exportLogs')
      .addToUi();
  } catch (e) {
    // No UI context (e.g. run manually from the editor, or from a
    // non-interactive trigger). Safe to ignore - the menu simply won't
    // be (re)built this time.
    Logger.log('[INFO] [Main] onOpen skipped - no UI context: ' + e.message);
  }
}

/**
 * Shows a UI alert if (and only if) called from a real Sheet UI context;
 * otherwise logs the same message instead of throwing.
 * @param {string} message
 */
function showAlertOrLog_(message) {
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (e) {
    Logger.log('[INFO] [Main] ' + message);
  }
}

/**
 * Manually triggers one send batch immediately, ignoring the configured
 * send-window check but still respecting the daily limit and row
 * eligibility. Lock-protected so it can't overlap a scheduled tick.
 */
function jobflow_runBatchNow() {
  return Utils.withLock(function () {
    var sentToday = Scheduler.getSentToday();
    var result = EmailService.runBatch(sentToday);

    if (!result.dryRun) {
      Scheduler.addSentToday(result.sent);
    }

    Dashboard.refresh();
    JFLogger.info('Main', 'Manual batch run complete', result);
    showAlertOrLog_(
      (result.dryRun ? 'DRY RUN - nothing was actually sent. ' : '') +
      'Batch complete. Sent: ' + result.sent + ', Failed: ' + result.failed + ', Skipped: ' + result.skipped
    );
    return result;
  });
}

/**
 * Runs the whole pipeline in dry-run mode regardless of settings.json,
 * without sending real emails or writing sheet status changes for the
 * send itself (rows are NOT marked sent during a dry run).
 */
function jobflow_runDryRun() {
  return Utils.withLock(function () {
    var props = PropertiesService.getScriptProperties();
    props.setProperty('JOBFLOW_FORCE_DRY_RUN_AT', String(Date.now()));
    Config.clearCache();

    try {
      var result = EmailService.runBatch(0);
      JFLogger.info('Main', 'Dry run complete', result);
      showAlertOrLog_('Dry run complete. Would send: ' + result.sent + ', Skipped: ' + result.skipped);
      return result;
    } finally {
      props.deleteProperty('JOBFLOW_FORCE_DRY_RUN_AT');
      Config.clearCache();
    }
  });
}

/**
 * Manually scans Gmail threads for replies/bounces and updates row
 * statuses. Lock-protected so it can't overlap a scheduled tick.
 */
function jobflow_checkReplies() {
  return Utils.withLock(function () {
    var result = ReplyDetectionService.checkReplies();
    Dashboard.refresh();
    showAlertOrLog_(
      'Checked ' + result.checked + ' threads. Replies found: ' + result.repliesFound +
      '. Bounces found: ' + (result.bouncesFound || 0) + '.'
    );
    return result;
  });
}

/**
 * One-time helper: for existing "Sent" rows that predate Thread Id
 * tracking (sent before this feature was added), attempts to find the
 * matching Gmail thread by recipient + sent date and back-fill the
 * Thread Id so reply detection can cover them going forward.
 *
 * Conservative by design: only fills in a Thread Id when exactly one
 * matching thread is found. Rows with 0 or multiple matches are left
 * alone for manual review rather than guessed at.
 */
function jobflow_backfillThreadIds() {
  return Utils.withLock(function () {
    var rows = SheetService.getAllRows();
    var updated = 0;
    var skipped = 0;

    rows.forEach(function (row) {
      if (String(row.status).toLowerCase() !== SheetService.STATUS.SENT.toLowerCase()) return;
      if (row.threadId) return; // already tracked

      var query = 'to:' + row.email + ' in:sent';
      if (row.sentDate) {
        var sentDate = new Date(row.sentDate);
        query += ' after:' + Utils.formatDate(Utils.addDays(sentDate, -1)) +
                 ' before:' + Utils.formatDate(Utils.addDays(sentDate, 1));
      }

      var threads;
      try {
        threads = GmailApp.search(query, 0, 5);
      } catch (e) {
        JFLogger.warn('Main', 'Backfill search failed', { row: row._rowIndex, error: e.message });
        skipped++;
        return;
      }

      if (threads.length === 1) {
        SheetService.updateRow(row._rowIndex, { threadId: threads[0].getId() });
        updated++;
      } else {
        skipped++; // 0 or ambiguous matches - leave for manual review
      }
    });

    JFLogger.info('Main', 'Thread Id backfill complete', { updated: updated, skipped: skipped });
    showAlertOrLog_('Backfill complete. Updated: ' + updated + ', Skipped (manual review needed): ' + skipped);
    return { updated: updated, skipped: skipped };
  });
}

/**
 * Safe, fast validation pass across every Pending row in the sheet -
 * checks email/company/name validity and template rendering for each,
 * WITHOUT sending anything, without any GmailApp calls, and without
 * writing anything back to the sheet per-row (only one summary log
 * entry at the end). This is what TC9-style "check my whole dataset
 * before going live" testing should use instead of jobflow_runDryRun -
 * runBatch() (which underlies jobflow_runDryRun) is capped by
 * batchSize/dailySendLimit and does real per-row Sheet writes even for
 * skipped/invalid rows, both of which make it the wrong tool for
 * validating hundreds of rows in one pass: it can hit Apps Script's
 * execution time limit long before finishing.
 */
function jobflow_validateAllRows() {
  return Utils.withLock(function () {
    var profile = Config.getProfile();
    var settings = Config.getSettings();
    var rows = SheetService.getAllRows();

    var resumeCheckError = null;
    try {
      if (settings.attachResumeOnInitialSend) {
        DriveService.getResumeBlob();
      } else {
        DriveService.getResumeLink();
      }
    } catch (e) {
      resumeCheckError = e.message;
    }

    var issues = [];
    var okCount = 0;

    rows.forEach(function (row) {
      var statusLower = String(row.status || '').toLowerCase();
      var isPending = statusLower === SheetService.STATUS.PENDING.toLowerCase() || !row.status;
      if (!isPending) return; // only validate rows that would actually be sent to

      var check = Validation.validateRow(row);
      if (!check.valid) {
        issues.push({ row: row._rowIndex, email: row.email, issue: check.reason });
        return;
      }

      var templateName = row.template || settings.defaultTemplate;
      try {
        TemplateService.renderBody(templateName, profile, row, { resumeMention: '(placeholder for validation)' });
        TemplateService.pickSubject(templateName, profile, row);
        okCount++;
      } catch (e) {
        issues.push({ row: row._rowIndex, email: row.email, issue: 'Template error: ' + e.message });
      }
    });

    if (resumeCheckError) {
      JFLogger.error('Main', 'Resume check failed - this would affect EVERY row', resumeCheckError);
    }

    JFLogger.info('Main', 'Full-dataset validation complete', {
      totalPendingRowsChecked: okCount + issues.length,
      ok: okCount,
      issuesFound: issues.length
    });

    if (issues.length > 0) {
      JFLogger.warn('Main', 'Rows with issues (row index / email / reason)', issues);
    }

    showAlertOrLog_(
      'Validation complete. OK: ' + okCount + ', Issues: ' + issues.length +
      (resumeCheckError ? ' (resume check FAILED - see Logs, affects every row)' : '') +
      '. Nothing was sent and no row statuses were changed.'
    );

    return { ok: okCount, issues: issues, resumeCheckError: resumeCheckError };
  });
}

/**
 * Diagnostic/safety helper: reports whether a force-dry-run override is
 * currently active (and how it got there), and clears it if so. Useful
 * after any run that was interrupted (e.g. hit the execution time
 * limit) before its normal cleanup could run.
 */
function jobflow_clearStuckDryRunFlag() {
  var props = PropertiesService.getScriptProperties();
  var setAt = props.getProperty('JOBFLOW_FORCE_DRY_RUN_AT');

  if (!setAt) {
    showAlertOrLog_('No force-dry-run override is currently active. settings.json\'s dryRun value is in full effect.');
    return { wasActive: false };
  }

  var ageMinutes = Math.round((Date.now() - Number(setAt)) / 60000);
  props.deleteProperty('JOBFLOW_FORCE_DRY_RUN_AT');
  JFLogger.warn('Main', 'Cleared a force-dry-run override that was active', { ageMinutes: ageMinutes });
  showAlertOrLog_('Cleared a force-dry-run override that had been active for ~' + ageMinutes + ' minute(s). settings.json\'s dryRun value is now in full effect.');
  return { wasActive: true, ageMinutes: ageMinutes };
}

/**
 * Recovery tool: manually corrects today's persisted sent-count if it
 * was ever inflated by a bug or bad test run. Also refreshes the
 * Dashboard so the correction is immediately visible.
 *
 * IMPORTANT: this takes an argument, so it CANNOT be run directly from
 * the Apps Script editor's Run button/dropdown (that always calls
 * functions with zero arguments, which previously corrupted the
 * counter to NaN). Use a small wrapper instead:
 *
 *   function TEMP_fixCounter() { jobflow_adjustTodaysSentCount(10); }
 *
 * ...then run TEMP_fixCounter from the dropdown.
 *
 * @param {number} correctCount The actual real number of emails sent
 *   today.
 */
function jobflow_adjustTodaysSentCount(correctCount) {
  var applied = Scheduler.setSentToday(correctCount);

  if (!applied) {
    showAlertOrLog_(
      'REJECTED: "' + correctCount + '" is not a valid count - counter left unchanged. ' +
      'This function needs an argument and cannot be run directly from the editor dropdown; ' +
      'use a small wrapper function instead (see the JSDoc comment above this function).'
    );
    return false;
  }

  Dashboard.refresh();
  showAlertOrLog_("Today's sent count set to " + correctCount + '.');
  return true;
}

/**
 * Diagnostic: reports the true current state of everything involved in
 * this session's dry-run/counter confusion, in one place, so guessing
 * isn't needed - the raw settings.json value, whether a force-dry-run
 * override is active (and its age), the resolved effective dryRun value
 * Config.getSettings() actually returns, and the real persisted daily
 * counter.
 */
function jobflow_diagnostics() {
  var props = PropertiesService.getScriptProperties();
  var forceDryRunAt = props.getProperty('JOBFLOW_FORCE_DRY_RUN_AT');
  var forceDryRunActive = false;
  var forceDryRunAgeSec = null;
  if (forceDryRunAt) {
    forceDryRunAgeSec = Math.round((Date.now() - Number(forceDryRunAt)) / 1000);
    forceDryRunActive = forceDryRunAgeSec >= 0 && forceDryRunAgeSec < 600; // 10 min
  }

  Config.clearCache();
  var effectiveSettings = Config.getSettings();

  var report = {
    forceDryRunFlagPresent: !!forceDryRunAt,
    forceDryRunFlagAgeSeconds: forceDryRunAgeSec,
    forceDryRunCurrentlyActive: forceDryRunActive,
    effectiveDryRun: effectiveSettings.dryRun,
    realPersistedSentCountToday: Scheduler.getSentToday(),
    dailySendLimit: effectiveSettings.dailySendLimit
  };

  JFLogger.info('Main', 'Diagnostics', report);
  showAlertOrLog_(
    'effectiveDryRun: ' + report.effectiveDryRun +
    ' | forceFlagActive: ' + report.forceDryRunCurrentlyActive +
    ' (age: ' + report.forceDryRunFlagAgeSeconds + 's)' +
    ' | realSentToday: ' + report.realPersistedSentCountToday + '/' + report.dailySendLimit
  );
  return report;
}

/**
 * Diagnostic: lists every file matching each config filename in the
 * config folder, with ID and last-updated time. If any name has more
 * than one match, that's very likely why an edit "isn't taking effect" -
 * the code may be reading a different (older) file than the one you're
 * editing. Run this alongside jobflow_diagnostics when settings.json
 * edits don't seem to apply.
 */
function jobflow_listConfigFiles() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty('CONFIG_FOLDER_ID');
  if (!folderId) {
    showAlertOrLog_('CONFIG_FOLDER_ID is not set in Script Properties.');
    return;
  }

  var folder = DriveApp.getFolderById(folderId);
  var names = ['profile.json', 'settings.json', 'subjects.json'];
  var report = [];

  names.forEach(function (name) {
    var files = folder.getFilesByName(name);
    var matches = [];
    while (files.hasNext()) {
      var f = files.next();
      matches.push({ id: f.getId(), lastUpdated: f.getLastUpdated().toString() });
    }
    report.push({ name: name, matchCount: matches.length, matches: matches });
  });

  JFLogger.info('Main', 'Config file listing', report);

  var summary = report.map(function (r) {
    return r.name + ': ' + r.matchCount + ' file(s) found' + (r.matchCount > 1 ? ' -- DUPLICATE, this is likely your problem' : '');
  }).join(' | ');

  showAlertOrLog_(summary);
  return report;
}

/**
 * Installs the recurring trigger that powers daily automation.
 */
function jobflow_installTriggers() {
  TriggerService.install();
  showAlertOrLog_('Daily automation installed - JobFlow will now run on schedule.');
}

/**
 * Removes all JobFlow triggers, pausing automation.
 */
function jobflow_uninstallTriggers() {
  TriggerService.uninstall();
  showAlertOrLog_('Automation paused - no further scheduled sends until reinstalled.');
}

/**
 * Recomputes and writes the Dashboard sheet.
 */
function jobflow_refreshDashboard() {
  Dashboard.refresh();
}

/**
 * Exports the Logs sheet as a CSV file in Drive and logs the URL.
 */
function jobflow_exportLogs() {
  var url = JFLogger.exportCsvToDrive();
  JFLogger.info('Main', 'Logs exported', url);
  showAlertOrLog_('Logs exported: ' + url);
  return url;
}
