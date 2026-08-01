/**
 * Main.gs
 * Application entry points.
 *
 * These are the functions a user runs manually (or via the Sheet's custom
 * menu) to install automation, run a batch on demand, or perform a
 * dry-run test. Nothing here contains personal data - everything is
 * pulled from Config.
 */

/**
 * Adds a custom menu to the bound Google Sheet for one-click actions.
 * Runs automatically when the spreadsheet is opened, if this project is
 * bound to the sheet (recommended setup - see docs/SETUP.md).
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('JobFlow')
    .addItem('Run Batch Now', 'jobflow_runBatchNow')
    .addItem('Run Dry Run Test', 'jobflow_runDryRun')
    .addSeparator()
    .addItem('Install Daily Automation', 'jobflow_installTriggers')
    .addItem('Pause Automation', 'jobflow_uninstallTriggers')
    .addSeparator()
    .addItem('Refresh Dashboard', 'jobflow_refreshDashboard')
    .addItem('Export Logs (CSV to Drive)', 'jobflow_exportLogs')
    .addToUi();
}

/**
 * Manually triggers one send batch immediately, ignoring the configured
 * send-window check but still respecting the daily limit and active-day
 * setting is bypassed intentionally for manual testing.
 */
function jobflow_runBatchNow() {
  var sentToday = Scheduler.getSentToday();
  var result = EmailService.runBatch(sentToday);
  Scheduler.addSentToday(result.sent);
  Dashboard.refresh();
  JFLogger.info('Main', 'Manual batch run complete', result);
  return result;
}

/**
 * Runs the whole pipeline in dry-run mode regardless of settings.json,
 * without sending real emails or writing sheet status changes for the
 * send itself (rows are NOT marked sent during a dry run).
 */
function jobflow_runDryRun() {
  var settings = Config.getSettings();
  var originalDryRun = settings.dryRun;

  // Force dry-run for this invocation only, via a temporary override.
  var props = PropertiesService.getScriptProperties();
  props.setProperty('JOBFLOW_FORCE_DRY_RUN', 'true');
  Config.clearCache();

  try {
    var result = EmailService.runBatch(0);
    JFLogger.info('Main', 'Dry run complete', result);
    return result;
  } finally {
    props.deleteProperty('JOBFLOW_FORCE_DRY_RUN');
    Config.clearCache();
  }
}

/**
 * Installs the recurring trigger that powers daily automation.
 */
function jobflow_installTriggers() {
  TriggerService.install();
}

/**
 * Removes all JobFlow triggers, pausing automation.
 */
function jobflow_uninstallTriggers() {
  TriggerService.uninstall();
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
  SpreadsheetApp.getUi().alert('Logs exported: ' + url);
  return url;
}
