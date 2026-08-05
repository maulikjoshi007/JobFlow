/**
 * Utils.gs
 * Utility Layer
 *
 * Small, pure, reusable helper functions shared across services.
 */

var Utils = (function () {
  /**
   * Returns today's weekday as a 3-letter uppercase code, e.g. "MON".
   * @return {string}
   */
  function getTodayCode() {
    var codes = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    return codes[new Date().getDay()];
  }

  /**
   * Formats a Date as "yyyy-MM-dd".
   * @param {Date} date
   * @return {string}
   */
  function formatDate(date) {
    if (!date) return '';
    return Utilities.formatDate(new Date(date), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  /**
   * Adds N days to a date and returns a new Date.
   * @param {Date} date
   * @param {number} days
   * @return {Date}
   */
  function addDays(date, days) {
    var result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /**
   * Returns the number of whole days between two dates.
   * @param {Date} from
   * @param {Date} to
   * @return {number}
   */
  function daysBetween(from, to) {
    var MS_PER_DAY = 1000 * 60 * 60 * 24;
    var a = new Date(Utils.formatDate(from));
    var b = new Date(Utils.formatDate(to));
    return Math.round((b - a) / MS_PER_DAY);
  }

  /**
   * Shuffles an array in place using Fisher-Yates and returns it.
   * @param {Array} arr
   * @return {Array}
   */
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /**
   * Picks a random element from an array.
   * @param {Array} arr
   * @return {*}
   */
  function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Sleeps for the given number of milliseconds (blocking).
   * @param {number} ms
   */
  function sleep(ms) {
    Utilities.sleep(ms);
  }

  /**
   * Retries a function with exponential-ish backoff.
   * @param {Function} fn Function to execute; should throw on failure.
   * @param {number} attempts Max attempts.
   * @param {number} delayMs Base delay between attempts.
   * @return {*} The return value of fn on success.
   */
  function retry(fn, attempts, delayMs) {
    var lastError = null;
    for (var i = 0; i < attempts; i++) {
      try {
        return fn();
      } catch (e) {
        lastError = e;
        if (i < attempts - 1) {
          sleep(delayMs * (i + 1));
        }
      }
    }
    throw lastError;
  }

  /**
   * Converts a column index (1-based) to an A1-style letter.
   * @param {number} col
   * @return {string}
   */
  function columnToLetter(col) {
    var letter = '';
    while (col > 0) {
      var mod = (col - 1) % 26;
      letter = String.fromCharCode(65 + mod) + letter;
      col = Math.floor((col - mod) / 26);
    }
    return letter;
  }

  /**
   * Runs a function while holding the script-wide lock, so it can never
   * overlap with another locked run (e.g. a scheduled trigger tick firing
   * while a manual menu action is in progress). Returns null (and logs a
   * warning) instead of running if the lock can't be acquired in time.
   * @param {Function} fn
   * @param {number=} timeoutMs
   * @return {*}
   */
  function withLock(fn, timeoutMs) {
    var lock = LockService.getScriptLock();
    var gotLock = lock.tryLock(timeoutMs || 5000);

    if (!gotLock) {
      Logger.log('[WARN] [Utils] Could not acquire lock - another JobFlow run is already in progress.');
      return null;
    }

    try {
      return fn();
    } finally {
      lock.releaseLock();
    }
  }

  return {
    getTodayCode: getTodayCode,
    formatDate: formatDate,
    addDays: addDays,
    daysBetween: daysBetween,
    shuffle: shuffle,
    randomChoice: randomChoice,
    sleep: sleep,
    retry: retry,
    columnToLetter: columnToLetter,
    withLock: withLock
  };
})();
