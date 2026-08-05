/**
 * Dashboard.gs
 * Reporting Layer
 *
 * Maintains a "Dashboard" sheet with two sections: a "Today" section
 * (what actually happened today, at a glance - no need to read the Logs
 * sheet for this) and an "All-Time" section (lifetime totals), plus an
 * automation health block (installed/paused, last run).
 */

var Dashboard = (function () {
  function getDashboardSheet_(ss, settings) {
    var sheet = ss.getSheetByName(settings.dashboardSheetName);
    if (!sheet) {
      sheet = ss.insertSheet(settings.dashboardSheetName);
    }
    return sheet;
  }

  function formatAgo_(date) {
    if (!date) return 'Never';
    var diffMs = Date.now() - date.getTime();
    var mins = Math.round(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + ' minute(s) ago';
    var hours = Math.round(mins / 60);
    if (hours < 24) return hours + ' hour(s) ago';
    var days = Math.round(hours / 24);
    return days + ' day(s) ago';
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
    var todayStr = Utils.formatDate(new Date());

    // Lifetime status counts.
    var counts = {
      Sent: 0,
      Pending: 0,
      Failed: 0,
      Skipped: 0,
      Replied: 0,
      'Followed Up': 0
    };
    rows.forEach(function (row) {
      var status = row.status && counts.hasOwnProperty(row.status) ? row.status : 'Pending';
      counts[status] = (counts[status] || 0) + 1;
    });

    // Today's activity, derived from the date columns rather than
    // current status (a row Sent today could already show a later
    // status like Followed Up or Replied if things moved fast, but it
    // still counts as "sent today").
    var newApplicationsToday = 0;
    var followUpsToday = 0;
    var repliesToday = 0;

    rows.forEach(function (row) {
      if (row.sentDate && Utils.formatDate(row.sentDate) === todayStr) newApplicationsToday++;
      if (row.lastFollowUp && Utils.formatDate(row.lastFollowUp) === todayStr) followUpsToday++;
      if (row.repliedDate && Utils.formatDate(row.repliedDate) === todayStr) repliesToday++;
    });

    // Authoritative "toward the daily limit" count - this is exactly
    // what Scheduler enforces, covering both new sends and follow-ups.
    var sentTowardLimitToday = Scheduler.getSentToday();
    var remainingToday = Math.max(0, settings.dailySendLimit - sentTowardLimitToday);

    var automationInstalled = TriggerService.list().length > 0;
    var lastTickAt = Scheduler.getLastTickAt();

    dashboard.clear();
    dashboard.getRange('A1').setValue('JobFlow Dashboard').setFontWeight('bold').setFontSize(16);
    dashboard.getRange('A2').setValue('Last updated: ' + new Date());

    // --- Automation health ---
    dashboard.getRange('A4').setValue('Automation Status').setFontWeight('bold').setFontSize(12);
    var health = [
      ['Automation', automationInstalled ? 'Installed (running on schedule)' : 'Paused (not installed)'],
      ['Scheduler last ran', formatAgo_(lastTickAt)],
      ['Send windows', settings.sendWindows.join(', ')],
      ['Active days', settings.activeDays.join(', ')]
    ];
    dashboard.getRange(5, 1, health.length, 2).setValues(health);

    // --- Today ---
    var todayStartRow = 5 + health.length + 1;
    dashboard.getRange(todayStartRow, 1).setValue('Today').setFontWeight('bold').setFontSize(12);
    var today = [
      ['Metric', 'Count'],
      ['Sent today (toward daily limit)', sentTowardLimitToday + ' / ' + settings.dailySendLimit],
      ['Remaining today', remainingToday],
      ['New applications sent today', newApplicationsToday],
      ['Follow-ups sent today', followUpsToday],
      ['Replies received today', repliesToday]
    ];
    dashboard.getRange(todayStartRow + 1, 1, today.length, 2).setValues(today);
    dashboard.getRange(todayStartRow + 1, 1, 1, 2).setFontWeight('bold');

    // --- All-time ---
    var allTimeStartRow = todayStartRow + 1 + today.length + 1;
    dashboard.getRange(allTimeStartRow, 1).setValue('All-Time').setFontWeight('bold').setFontSize(12);
    var summary = [
      ['Metric', 'Count'],
      ['Applications Sent', counts.Sent],
      ['Pending', counts.Pending],
      ['Failed', counts.Failed],
      ['Skipped', counts.Skipped],
      ['Replies', counts.Replied],
      ['Follow-ups Sent', counts['Followed Up']],
      ['Total Rows', rows.length]
    ];
    dashboard.getRange(allTimeStartRow + 1, 1, summary.length, 2).setValues(summary);
    dashboard.getRange(allTimeStartRow + 1, 1, 1, 2).setFontWeight('bold');

    dashboard.autoResizeColumns(1, 2);

    JFLogger.info('Dashboard', 'Dashboard refreshed', {
      today: { sentTowardLimitToday: sentTowardLimitToday, newApplicationsToday: newApplicationsToday, followUpsToday: followUpsToday, repliesToday: repliesToday },
      allTime: counts
    });
  }

  return {
    refresh: refresh
  };
})();
