/**
 * Scheduler.gs
 * Scheduler Layer
 *
 * Decides WHETHER a batch should run right now (active days, send
 * windows) and tracks how many emails have already gone out today so the
 * daily limit is respected across multiple trigger firings.
 */

var Scheduler = (function () {
  var DAILY_COUNT_PROP_PREFIX = 'JOBFLOW_SENT_COUNT_';
  var LAST_TICK_AT_PROP = 'JOBFLOW_LAST_TICK_AT';
  var WINDOW_TOLERANCE_MINUTES = 15;

  function todayKey_() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  }

  /**
   * @return {number} how many emails have been sent today (persisted).
   */
  function getSentToday() {
    var props = PropertiesService.getScriptProperties();
    var value = props.getProperty(DAILY_COUNT_PROP_PREFIX + todayKey_());
    return value ? parseInt(value, 10) : 0;
  }

  /**
   * Persists the updated count of emails sent today.
   * @param {number} additional
   */
  function addSentToday(additional) {
    var props = PropertiesService.getScriptProperties();
    var key = DAILY_COUNT_PROP_PREFIX + todayKey_();
    var current = getSentToday();
    props.setProperty(key, String(current + additional));
  }

  /**
   * @return {Date|null} when the scheduler last actually ran (via the
   *   trigger or a manual action that goes through tick()), or null if
   *   it has never run in this script project.
   */
  function getLastTickAt() {
    var value = PropertiesService.getScriptProperties().getProperty(LAST_TICK_AT_PROP);
    return value ? new Date(Number(value)) : null;
  }

  function recordTick_() {
    PropertiesService.getScriptProperties().setProperty(LAST_TICK_AT_PROP, String(Date.now()));
  }

  /**
   * Checks whether today is an active sending day per settings.
   * @param {Object} settings
   * @return {boolean}
   */
  function isActiveDay_(settings) {
    return settings.activeDays.indexOf(Utils.getTodayCode()) !== -1;
  }

  /**
   * Checks whether "now" is within tolerance of one of the configured
   * send windows (HH:mm strings).
   * @param {Object} settings
   * @return {boolean}
   */
  function isWithinSendWindow_(settings) {
    var now = new Date();
    var nowMinutes = now.getHours() * 60 + now.getMinutes();

    return settings.sendWindows.some(function (windowStr) {
      var parts = windowStr.split(':');
      var windowMinutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      return Math.abs(nowMinutes - windowMinutes) <= WINDOW_TOLERANCE_MINUTES;
    });
  }

  /**
   * Main entry point called by the time-driven trigger. Decides whether
   * to run a batch right now, then delegates to EmailService.
   */
  function tick() {
    Utils.withLock(function () {
      tickLocked_();
    });
  }

  function tickLocked_() {
    recordTick_();
    var settings;
    try {
      settings = Config.getSettings();
    } catch (e) {
      JFLogger.error('Scheduler', 'Failed to load settings', e.message);
      return;
    }

    if (!isActiveDay_(settings)) {
      JFLogger.info('Scheduler', 'Not an active sending day, skipping.', Utils.getTodayCode());
      return;
    }

    if (!isWithinSendWindow_(settings)) {
      JFLogger.info('Scheduler', 'Outside configured send windows, skipping.');
      return;
    }

    var sentToday = getSentToday();
    if (sentToday >= settings.dailySendLimit) {
      JFLogger.info('Scheduler', 'Daily send limit already reached.', sentToday);
      return;
    }

    ReplyDetectionService.checkReplies();

    JFLogger.info('Scheduler', 'Running batch', { sentToday: sentToday });
    var result = EmailService.runBatch(sentToday);
    addSentToday(result.sent);

    JFLogger.info('Scheduler', 'Batch complete', result);
    Dashboard.refresh();
  }

  return {
    tick: tick,
    getSentToday: getSentToday,
    addSentToday: addSentToday,
    getLastTickAt: getLastTickAt
  };
})();
