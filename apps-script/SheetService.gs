/**
 * SheetService.gs
 * Repository Layer (Google Sheets)
 *
 * Reads and writes the Applications sheet. Column order is driven by the
 * COLUMNS map below so the sheet layout can change without touching the
 * rest of the codebase.
 */

var SheetService = (function () {
  var COLUMNS = {
    name: 'Name',
    company: 'Company',
    email: 'Email',
    jobTitle: 'Job Title',
    location: 'Location',
    source: 'Source',
    template: 'Template',
    status: 'Status',
    sentDate: 'Sent Date',
    followUpDate: 'Follow Up Date',
    lastFollowUp: 'Last Follow Up',
    remarks: 'Remarks',
    threadId: 'Thread Id',
    repliedDate: 'Replied Date'
  };

  var STATUS = {
    PENDING: 'Pending',
    SENT: 'Sent',
    FAILED: 'Failed',
    SKIPPED: 'Skipped',
    FOLLOWED_UP: 'Followed Up',
    REPLIED: 'Replied'
  };

  var headerMapCache_ = null;

  /**
   * @return {GoogleAppsScript.Spreadsheet.Sheet}
   */
  function getSheet_() {
    var settings = Config.getSettings();
    var ss = SpreadsheetApp.openById(settings.sheetId);
    var sheet = ss.getSheetByName(settings.sheetName);
    if (!sheet) {
      throw new Error('Sheet tab "' + settings.sheetName + '" was not found in the target spreadsheet.');
    }
    return sheet;
  }

  /**
   * Builds a header-name -> column-index (1-based) map from row 1.
   * Cached per-execution (module-level var resets fresh on every new
   * script execution) - the header row doesn't change mid-run, so
   * re-reading it from Sheets on every single row write (as this
   * previously did) is pure wasted API latency. At ~380 rows, most of
   * them hitting a skip/fail write path, that overhead alone was enough
   * to exceed Apps Script's execution time limit.
   * @return {Object<string, number>}
   */
  function getHeaderMap_(sheet) {
    if (headerMapCache_) return headerMapCache_;

    var headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var map = {};
    headerRow.forEach(function (header, idx) {
      map[String(header).trim()] = idx + 1;
    });

    headerMapCache_ = map;
    return headerMapCache_;
  }

  /**
   * Reads every data row and returns an array of row objects with a
   * `_rowIndex` (1-based sheet row number) for later writes.
   * @return {Array<Object>}
   */
  function getAllRows() {
    var sheet = getSheet_();
    var headerMap = getHeaderMap_(sheet);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    var lastCol = sheet.getLastColumn();
    var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    return values.map(function (rowValues, i) {
      var obj = { _rowIndex: i + 2 };
      Object.keys(COLUMNS).forEach(function (key) {
        var colName = COLUMNS[key];
        var colIdx = headerMap[colName];
        obj[key] = colIdx ? rowValues[colIdx - 1] : '';
      });

      // Derived flag: is this row due for a follow-up today?
      obj.followUpDue = isFollowUpDue_(obj);
      return obj;
    });
  }

  function isFollowUpDue_(row) {
    if (String(row.status).toLowerCase() !== STATUS.SENT.toLowerCase()) return false;
    if (!row.followUpDate) return false;
    if (row.lastFollowUp) return false; // already followed up once
    var today = Utils.formatDate(new Date());
    var due = Utils.formatDate(row.followUpDate);
    return due <= today;
  }

  /**
   * Updates specific fields on a given row by row index.
   * @param {number} rowIndex 1-based sheet row number.
   * @param {Object} fields Map of column-key -> new value.
   */
  function updateRow(rowIndex, fields) {
    var sheet = getSheet_();
    var headerMap = getHeaderMap_(sheet);
    Object.keys(fields).forEach(function (key) {
      var colName = COLUMNS[key];
      var colIdx = headerMap[colName];
      if (colIdx) {
        sheet.getRange(rowIndex, colIdx).setValue(fields[key]);
      }
    });
  }

  /**
   * Marks a row as successfully sent.
   * @param {number} rowIndex
   * @param {number} followUpAfterDays
   * @param {string=} threadId Gmail thread ID, used later for reply detection.
   */
  function markSent(rowIndex, followUpAfterDays, threadId) {
    var today = new Date();
    updateRow(rowIndex, {
      status: STATUS.SENT,
      sentDate: today,
      followUpDate: Utils.addDays(today, followUpAfterDays),
      remarks: '',
      threadId: threadId || ''
    });
  }

  /**
   * Marks a row as replied - this removes it from follow-up eligibility
   * for good, since isFollowUpDue_ only checks Status === Sent.
   * @param {number} rowIndex
   */
  function markReplied(rowIndex) {
    updateRow(rowIndex, {
      status: STATUS.REPLIED,
      repliedDate: new Date()
    });
  }

  /**
   * Marks a row as followed up.
   * @param {number} rowIndex
   * @param {string=} threadId Only needed if the follow-up created a new
   *   thread (fallback path); a real in-thread reply keeps the same
   *   Thread Id, so this is a no-op update in that case.
   */
  function markFollowedUp(rowIndex, threadId) {
    var fields = {
      status: STATUS.FOLLOWED_UP,
      lastFollowUp: new Date()
    };
    if (threadId) fields.threadId = threadId;
    updateRow(rowIndex, fields);
  }

  /**
   * Marks a row as failed with a remark explaining why.
   * @param {number} rowIndex
   * @param {string} reason
   */
  function markFailed(rowIndex, reason) {
    updateRow(rowIndex, {
      status: STATUS.FAILED,
      remarks: reason
    });
  }

  /**
   * Marks a row as skipped with a remark explaining why.
   * @param {number} rowIndex
   * @param {string} reason
   */
  function markSkipped(rowIndex, reason) {
    updateRow(rowIndex, {
      status: STATUS.SKIPPED,
      remarks: reason
    });
  }

  return {
    COLUMNS: COLUMNS,
    STATUS: STATUS,
    getAllRows: getAllRows,
    updateRow: updateRow,
    markSent: markSent,
    markFollowedUp: markFollowedUp,
    markFailed: markFailed,
    markSkipped: markSkipped,
    markReplied: markReplied
  };
})();
