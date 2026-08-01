/**
 * TriggerService.gs
 * Scheduler Layer (trigger management)
 *
 * Creates and removes the time-driven triggers that call Scheduler.tick().
 * JobFlow runs Scheduler.tick() every 15 minutes; the Scheduler itself
 * decides whether the current moment matches a configured send window,
 * so the actual sending still respects settings.json exactly.
 */

var TriggerService = (function () {
  var HANDLER_FUNCTION = 'jobflow_scheduledTick';

  /**
   * Removes any existing JobFlow triggers for the handler function.
   */
  function removeExisting_() {
    ScriptApp.getProjectTriggers().forEach(function (trigger) {
      if (trigger.getHandlerFunction() === HANDLER_FUNCTION) {
        ScriptApp.deleteTrigger(trigger);
      }
    });
  }

  /**
   * Installs a 15-minute recurring trigger that drives the scheduler.
   * Safe to call multiple times; it clears old triggers first.
   */
  function install() {
    removeExisting_();
    ScriptApp.newTrigger(HANDLER_FUNCTION)
      .timeBased()
      .everyMinutes(15)
      .create();
    JFLogger.info('TriggerService', 'Installed 15-minute recurring trigger.');
  }

  /**
   * Removes all JobFlow triggers, effectively pausing automation.
   */
  function uninstall() {
    removeExisting_();
    JFLogger.info('TriggerService', 'Removed all JobFlow triggers.');
  }

  /**
   * Lists currently installed JobFlow triggers (for diagnostics).
   * @return {Array<string>}
   */
  function list() {
    return ScriptApp.getProjectTriggers()
      .filter(function (t) {
        return t.getHandlerFunction() === HANDLER_FUNCTION;
      })
      .map(function (t) {
        return t.getUniqueId();
      });
  }

  return {
    HANDLER_FUNCTION: HANDLER_FUNCTION,
    install: install,
    uninstall: uninstall,
    list: list
  };
})();

/**
 * Global handler invoked by the installed time-driven trigger.
 * Must be a top-level function (Apps Script triggers cannot target
 * functions nested inside an IIFE/module).
 */
function jobflow_scheduledTick() {
  Scheduler.tick();
}
