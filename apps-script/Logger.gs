/**
 * Logger.gs
 * Logging Layer
 *
 * Reusable structured logger that writes to a dedicated "Logs" sheet and to
 * Apps Script's built-in Logger (visible in Executions). Supports INFO,
 * WARN, ERROR and SUCCESS levels, and can export all logs as CSV.
 */

var JFLogger = (function () {
  var LEVELS = { INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR', SUCCESS: 'SUCCESS' };
  var HEADERS = ['Timestamp', 'Level', 'Source', 'Message', 'Details'];

  /**
   * Gets (or creates) the Logs sheet.
   * @return {GoogleAppsScript.Spreadsheet.Sheet}
   */
  function getLogSheet_() {
    var settings = Config.getSettings();
    var ss = SpreadsheetApp.openById(settings.sheetId);
    var sheet = ss.getSheetByName(settings.logSheetName);
    if (!sheet) {
      sheet = ss.insertSheet(settings.logSheetName);
      sheet.appendRow(HEADERS);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    }
    return sheet;
  }

  /**
   * Writes a single log entry.
   * @param {string} level
   * @param {string} source Component name, e.g. "EmailService"
   * @param {string} message
   * @param {Object|string=} details
   */
  function write_(level, source, message, details) {
    var detailsStr = '';
    if (details !== undefined && details !== null) {
      detailsStr = typeof details === 'string' ? details : JSON.stringify(details);
    }

    // Always mirror to the built-in execution logger so failures are visible
    // even if the Sheet itself is unreachable.
    Logger.log('[' + level + '] [' + source + '] ' + message + (detailsStr ? ' | ' + detailsStr : ''));

    try {
      var sheet = getLogSheet_();
      sheet.appendRow([new Date(), level, source, message, detailsStr]);
    } catch (e) {
      // Do not let logging failures break the calling flow.
      Logger.log('[ERROR] [JFLogger] Failed to write log to sheet: ' + e.message);
    }
  }

  function info(source, message, details) {
    write_(LEVELS.INFO, source, message, details);
  }

  function warn(source, message, details) {
    write_(LEVELS.WARN, source, message, details);
  }

  function error(source, message, details) {
    write_(LEVELS.ERROR, source, message, details);
  }

  function success(source, message, details) {
    write_(LEVELS.SUCCESS, source, message, details);
  }

  /**
   * Exports all logs as a CSV string.
   * @return {string}
   */
  function exportCsv() {
    var sheet = getLogSheet_();
    var values = sheet.getDataRange().getValues();
    return values
      .map(function (row) {
        return row
          .map(function (cell) {
            var str = String(cell).replace(/"/g, '""');
            return '"' + str + '"';
          })
          .join(',');
      })
      .join('\n');
  }

  /**
   * Saves the exported CSV to Drive and returns the file URL.
   * @return {string}
   */
  function exportCsvToDrive() {
    var csv = exportCsv();
    var fileName = 'JobFlow_Logs_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss') + '.csv';
    var file = DriveApp.createFile(fileName, csv, MimeType.CSV);
    return file.getUrl();
  }

  return {
    LEVELS: LEVELS,
    info: info,
    warn: warn,
    error: error,
    success: success,
    exportCsv: exportCsv,
    exportCsvToDrive: exportCsvToDrive
  };
})();
