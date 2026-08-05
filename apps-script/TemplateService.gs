/**
 * TemplateService.gs
 * Template Engine Layer
 *
 * Loads HTML templates from Drive (mirrors the /templates folder of this
 * project) and renders them by replacing {{placeholder}} tokens. Also
 * handles subject-line rotation so recipients rarely see the same subject
 * twice in a row.
 */

var TemplateService = (function () {
  var templateCache_ = {};
  var usedSubjectsBySource_ = {}; // in-memory per-execution de-dup

  /**
   * Loads a template's raw HTML from the config folder's /templates
   * sub-folder, or from a "templates" folder alongside the config files.
   * @param {string} templateName e.g. "angular" -> angular.html
   * @return {string} raw HTML
   */
  function loadRawTemplate_(templateName) {
    if (templateCache_[templateName]) return templateCache_[templateName];

    var props = PropertiesService.getScriptProperties();
    var templatesFolderId = props.getProperty('TEMPLATES_FOLDER_ID');
    if (!templatesFolderId) {
      throw new Error('TEMPLATES_FOLDER_ID is not set in Script Properties. See docs/SETUP.md.');
    }

    var folder = DriveApp.getFolderById(templatesFolderId);
    var fileName = templateName + '.html';
    var files = folder.getFilesByName(fileName);

    if (!files.hasNext()) {
      throw new Error('Template file "' + fileName + '" was not found in the templates folder.');
    }

    var html = files.next().getBlob().getDataAsString('UTF-8');
    templateCache_[templateName] = html;
    return html;
  }

  /**
   * Replaces {{placeholders}} in a string with values from a data map.
   * Unresolved placeholders are left blank (never leak raw {{tokens}}).
   * @param {string} raw
   * @param {Object} data
   * @return {string}
   */
  function render_(raw, data) {
    return raw.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, function (match, key) {
      return Object.prototype.hasOwnProperty.call(data, key) && data[key] !== undefined && data[key] !== null
        ? String(data[key])
        : '';
    });
  }

  /**
   * Strips HTML tags to build a reasonable plain-text fallback body.
   * Anchor tags are converted to "text (url)" first, so link URLs (like
   * a resume link) survive into the plain-text version instead of being
   * silently discarded by the generic tag strip.
   * @param {string} html
   * @return {string}
   */
  function htmlToPlainText_(html) {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, function (match, href, text) {
        var cleanText = text.replace(/<[^>]+>/g, '').trim();
        return cleanText ? cleanText + ' (' + href + ')' : href;
      })
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Builds the placeholder data map from profile + row.
   * @param {Object} profile
   * @param {Object} row
   * @return {Object}
   */
  function buildData_(profile, row) {
    return {
      // Recipient's name, used for the greeting.
      name: row.name || 'Hiring Team',
      company: row.company || '',
      jobTitle: row.jobTitle || 'the open role',
      experience: profile.experience || '',
      skills: profile.skills || '',
      resume: profile.name ? profile.name + ' Resume' : 'Resume',
      linkedin: profile.linkedin || '',
      phone: profile.phone || '',
      email: profile.email || '',
      location: profile.location || '',
      // Sender's own name, used in the signature (kept distinct from
      // {{name}} so templates never confuse recipient and sender).
      candidateName: profile.name || ''
    };
  }

  /**
   * Renders both HTML and plain-text bodies for a given template + row.
   * @param {string} templateName
   * @param {Object} profile
   * @param {Object} row
   * @param {Object=} extra Additional computed placeholder values to
   *   merge in (e.g. { resumeLink: 'https://...' }), for values that
   *   aren't sourced from profile/row directly.
   * @return {{html: string, text: string}}
   */
  function renderBody(templateName, profile, row, extra) {
    var raw = loadRawTemplate_(templateName);
    var data = buildData_(profile, row);
    if (extra) {
      for (var key in extra) {
        data[key] = extra[key];
      }
    }
    var html = render_(raw, data);
    var text = htmlToPlainText_(html);
    return { html: html, text: text };
  }

  /**
   * Picks a subject line for a template, avoiding immediate repeats for
   * the same recipient/company within this execution.
   * @param {string} templateName
   * @param {Object} profile
   * @param {Object} row
   * @return {string}
   */
  function pickSubject(templateName, profile, row) {
    var subjectsConfig = Config.getSubjects();
    var pool = subjectsConfig[templateName] || subjectsConfig['generic'] || ['Application for {{jobTitle}} at {{company}}'];

    var sourceKey = row.email || row.company || 'default';
    var used = usedSubjectsBySource_[sourceKey] || [];
    var available = pool.filter(function (s) {
      return used.indexOf(s) === -1;
    });

    if (available.length === 0) {
      available = pool.slice(); // all used, reset rotation
      used = [];
    }

    var chosen = Utils.randomChoice(available);
    used.push(chosen);
    usedSubjectsBySource_[sourceKey] = used;

    var data = buildData_(profile, row);
    return render_(chosen, data);
  }

  /**
   * Clears caches between runs/tests.
   */
  function clearCache() {
    templateCache_ = {};
    usedSubjectsBySource_ = {};
  }

  return {
    renderBody: renderBody,
    pickSubject: pickSubject,
    clearCache: clearCache
  };
})();
