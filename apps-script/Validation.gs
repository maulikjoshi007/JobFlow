/**
 * Validation.gs
 * Validation Layer
 *
 * Centralized validation rules for email addresses and row data coming
 * from the Google Sheet, so invalid rows are skipped safely and logged
 * rather than causing send failures.
 */

var Validation = (function () {
  // RFC 5322 "good enough" practical email regex.
  var EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

  /**
   * @param {string} email
   * @return {boolean}
   */
  function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    return EMAIL_REGEX.test(email.trim());
  }

  /**
   * Validates a row object built from the sheet before sending.
   * @param {Object} row
   * @return {{valid: boolean, reason: string}}
   */
  function validateRow(row) {
    if (!row.email || !isValidEmail(row.email)) {
      return { valid: false, reason: 'Invalid or missing email address' };
    }
    if (!row.company || String(row.company).trim() === '') {
      return { valid: false, reason: 'Missing company name' };
    }
    if (!row.name || String(row.name).trim() === '') {
      return { valid: false, reason: 'Missing recruiter/contact name' };
    }
    if (row.status && String(row.status).toLowerCase() === 'sent' && !row.followUpDue) {
      return { valid: false, reason: 'Already sent and not due for follow-up' };
    }
    return { valid: true, reason: '' };
  }

  /**
   * Validates the resolved profile object.
   * @param {Object} profile
   * @return {{valid: boolean, reason: string}}
   */
  function validateProfile(profile) {
    if (!profile.email || !isValidEmail(profile.email)) {
      return { valid: false, reason: 'profile.json has an invalid sender email' };
    }
    if (!profile.resumeFileId) {
      return { valid: false, reason: 'profile.json is missing resumeFileId' };
    }
    return { valid: true, reason: '' };
  }

  return {
    isValidEmail: isValidEmail,
    validateRow: validateRow,
    validateProfile: validateProfile
  };
})();
