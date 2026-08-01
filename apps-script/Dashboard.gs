/**
 * Dashboard.gs
 * Reporting Layer
 *
 * Maintains a "Dashboard" sheet summarizing Applications Sent, Pending,
 * Failed, Replies (manual column, see docs) and Follow-ups.
 */

var Dashboard = (function () {
  function getDashboardSheet_(ss, settings) {
    var sheet = ss.getSheetByName(settings.dashboardSheetName);
    if (!sheet) {
      sheet = ss.insertSheet(settings.dashboardSheetName);
    }
    return sheet;
  }

  /**
   * Recomputes summary counters from the Applications sheet and writes
   * them to the Dashboard sheet.
   */
  function refresh() {
    var settings = Config.getSettings();
    var ss = SpreadsheetApp.openById(settings.sheetId);
    var dashboard = getDashboardSheet_(ss, settings);
    var rows = SheetService.getAllRows();

    var counts = {
      Sent: 0,
      Pending: 0,
      Failed: 0,
      Skipped: 0,
      'Followed Up': 0
    };

    rows.forEach(function (row) {
      var status = row.status && counts.hasOwnProperty(row.status) ? row.status : 'Pending';
      counts[status] = (counts[status] || 0) + 1;
    });

    var repliesNote = 'Update the "Remarks" column with "Replied" to track replies manually.';

    dashboard.clear();
    dashboard.getRange('A1').setValue('JobFlow Dashboard').setFontWeight('bold').setFontSize(14);
    dashboard.getRange('A2').setValue('Last updated: ' + new Date());

    var summary = [
      ['Metric', 'Count'],
      ['Applications Sent', counts.Sent],
      ['Pending', counts.Pending],
      ['Failed', counts.Failed],
      ['Skipped', counts.Skipped],
      ['Follow-ups Sent', counts['Followed Up']],
      ['Total Rows', rows.length]
    ];
    dashboard.getRange(4, 1, summary.length, 2).setValues(summary);
    dashboard.getRange(4, 1, 1, 2).setFontWeight('bold');
    dashboard.getRange(4 + summary.length + 1, 1).setValue('Note: ' + repliesNote);
    dashboard.autoResizeColumns(1, 2);

    JFLogger.info('Dashboard', 'Dashboard refreshed', counts);
  }

  return {
    refresh: refresh
  };
})();
