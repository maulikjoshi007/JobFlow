/**
 * Config.gs
 * Configuration Layer
 *
 * Loads and validates profile.json, settings.json and subjects.json from
 * Google Drive (or from Script Properties fallback). No personal data,
 * file IDs, emails, phone numbers or API keys are ever hardcoded here.
 *
 * The user must set the Script Property CONFIG_FOLDER_ID to the ID of a
 * Drive folder containing profile.json, settings.json and subjects.json.
 * See docs/SETUP.md for step-by-step instructions.
 */

var Config = (function () {
  var CACHE_KEY_PREFIX = 'JOBFLOW_CONFIG_';
  var CACHE_TTL_SECONDS = 300; // 5 minutes

  /**
   * Reads the Drive folder ID that holds the JSON config files.
   * @return {string}
   */
  function getConfigFolderId_() {
    var props = PropertiesService.getScriptProperties();
    var folderId = props.getProperty('CONFIG_FOLDER_ID');
    if (!folderId) {
      throw new Error(
        'CONFIG_FOLDER_ID is not set. Open Project Settings > Script ' +
        'Properties and add CONFIG_FOLDER_ID pointing to your config folder. ' +
        'See docs/SETUP.md.'
      );
    }
    return folderId;
  }

  /**
   * Finds a file by name inside the config folder and parses it as JSON.
   * @param {string} fileName
   * @return {Object}
   */
  function loadJsonFile_(fileName) {
    var cache = CacheService.getScriptCache();
    var cacheKey = CACHE_KEY_PREFIX + fileName;
    var cached = cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    var folder = DriveApp.getFolderById(getConfigFolderId_());
    var files = folder.getFilesByName(fileName);

    if (!files.hasNext()) {
      throw new Error(
        'Config file "' + fileName + '" was not found in the config folder. ' +
        'Upload it from the /config directory of this project.'
      );
    }

    var file = files.next();

    // If a second file with the same name exists in this folder, Drive's
    // getFilesByName() order isn't something you control - edits could
    // be landing on a file that's never actually read. Surface this
    // loudly rather than silently reading the wrong one.
    if (files.hasNext()) {
      Logger.log(
        '[WARN] [Config] Multiple files named "' + fileName + '" found in the config folder. ' +
        'Currently reading fileId=' + file.getId() + ', last updated ' + file.getLastUpdated() +
        '. Delete the duplicate(s) to avoid editing a file that is never actually loaded.'
      );
    }

    var content = file.getBlob().getDataAsString('UTF-8');
    var parsed;

    try {
      parsed = JSON.parse(content);
    } catch (e) {
      throw new Error('Config file "' + fileName + '" contains invalid JSON: ' + e.message);
    }

    cache.put(cacheKey, JSON.stringify(parsed), CACHE_TTL_SECONDS);
    return parsed;
  }

  /**
   * @return {Object} profile.json contents
   */
  function getProfile() {
    var profile = loadJsonFile_('profile.json');
    var required = ['name', 'email', 'phone', 'linkedin', 'location', 'experience', 'resumeFileId'];
    required.forEach(function (key) {
      if (!profile[key]) {
        throw new Error('profile.json is missing required field: "' + key + '"');
      }
    });
    return profile;
  }

  /**
   * @return {Object} settings.json contents, merged with defaults
   */
  function getSettings() {
    var defaults = {
      sheetId: '',
      sheetName: 'Applications',
      dashboardSheetName: 'Dashboard',
      dailySendLimit: 30,
      batchSize: 10,
      sendWindows: ['10:00', '13:00', '16:00'],
      activeDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      followUpEnabled: true,
      followUpAfterDays: 5,
      maxFollowUps: 1,
      retryAttempts: 3,
      retryDelayMs: 2000,
      dryRun: false,
      logSheetName: 'Logs',
      defaultTemplate: 'generic',
      attachResumeOnInitialSend: false
    };
    var settings = loadJsonFile_('settings.json');
    for (var key in defaults) {
      if (!settings.hasOwnProperty(key)) {
        settings[key] = defaults[key];
      }
    }
    if (!settings.sheetId) {
      throw new Error('settings.json must define "sheetId" (the target Google Sheet ID).');
    }

    // Allow a temporary, script-property-based override to force dry-run
    // mode for a single manual test invocation (see Main.gs
    // jobflow_runDryRun). Stored as a timestamp rather than a plain
    // 'true' flag and self-expires after a few minutes - this matters
    // because if the execution that set it gets killed by Apps Script's
    // execution time limit before reaching its cleanup step, a plain
    // sticky boolean would silently force EVERY subsequent run
    // (including real production sends) into dry-run mode indefinitely,
    // with no visible error. A short expiry window makes that failure
    // mode self-heal instead.
    var FORCE_DRY_RUN_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
    var forceDryRunSetAt = PropertiesService.getScriptProperties().getProperty('JOBFLOW_FORCE_DRY_RUN_AT');
    if (forceDryRunSetAt) {
      var age = Date.now() - Number(forceDryRunSetAt);
      if (age >= 0 && age < FORCE_DRY_RUN_MAX_AGE_MS) {
        settings.dryRun = true;
      }
    }

    return settings;
  }

  /**
   * @return {Object} subjects.json contents, keyed by template name -> array of subject lines
   */
  function getSubjects() {
    return loadJsonFile_('subjects.json');
  }

  /**
   * Clears the config cache. Call after editing config files.
   */
  function clearCache() {
    var cache = CacheService.getScriptCache();
    ['profile.json', 'settings.json', 'subjects.json'].forEach(function (name) {
      cache.remove(CACHE_KEY_PREFIX + name);
    });
  }

  return {
    getProfile: getProfile,
    getSettings: getSettings,
    getSubjects: getSubjects,
    clearCache: clearCache
  };
})();
