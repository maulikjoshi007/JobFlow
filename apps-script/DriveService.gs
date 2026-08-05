/**
 * DriveService.gs
 * Repository Layer (Drive)
 *
 * Handles fetching the resume and any other Drive-backed assets. The
 * resume file ID always comes from profile.json - never hardcoded.
 *
 * Two access modes:
 * - getResumeBlob(): the actual file, for attaching to follow-up emails
 *   (used once a real conversation already exists).
 * - getResumeLink(): a view-only Drive URL, for the first-contact email
 *   (attachments on a cold first email are a well-known spam signal -
 *   see docs/FAQ.md).
 */

var DriveService = (function () {
  var resumeBlobCache_ = null;
  var resumeLinkCache_ = null;

  /**
   * Returns the resume as a Blob, ready to attach to an email.
   * Cached per-execution to avoid repeated Drive calls in a batch run.
   * @return {GoogleAppsScript.Base.Blob}
   */
  function getResumeBlob() {
    if (resumeBlobCache_) return resumeBlobCache_;

    var profile = Config.getProfile();
    try {
      var file = DriveApp.getFileById(profile.resumeFileId);
      resumeBlobCache_ = file.getBlob().setName(file.getName());
      return resumeBlobCache_;
    } catch (e) {
      throw new Error(
        'Could not load resume from Drive using resumeFileId "' + profile.resumeFileId +
        '". Confirm the file exists and this script has access. Original error: ' + e.message
      );
    }
  }

  /**
   * Returns a view-only Drive URL for the resume, enabling link sharing
   * automatically if it isn't already on (best-effort - some Workspace
   * domain policies block this, in which case a clear error is thrown
   * instead of silently sending a broken link).
   * Cached per-execution.
   * @return {string}
   */
  function getResumeLink() {
    if (resumeLinkCache_) return resumeLinkCache_;

    var profile = Config.getProfile();
    var file;
    try {
      file = DriveApp.getFileById(profile.resumeFileId);
    } catch (e) {
      throw new Error(
        'Could not load resume from Drive using resumeFileId "' + profile.resumeFileId +
        '". Confirm the file exists and this script has access. Original error: ' + e.message
      );
    }

    try {
      var access = file.getSharingAccess();
      var isAlreadyLinkShared =
        access === DriveApp.Access.ANYONE_WITH_LINK || access === DriveApp.Access.ANYONE;

      if (!isAlreadyLinkShared) {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      }
    } catch (e) {
      throw new Error(
        'The resume file is not link-shared and JobFlow could not enable it automatically ' +
        '(this is often blocked by a Workspace domain policy). Please manually set the ' +
        'resume file\'s sharing to "Anyone with the link - Viewer" in Google Drive, then try ' +
        'again. Original error: ' + e.message
      );
    }

    resumeLinkCache_ = file.getUrl();
    return resumeLinkCache_;
  }

  /**
   * Clears the in-memory resume caches (useful for tests / dry runs).
   */
  function clearCache() {
    resumeBlobCache_ = null;
    resumeLinkCache_ = null;
  }

  return {
    getResumeBlob: getResumeBlob,
    getResumeLink: getResumeLink,
    clearCache: clearCache
  };
})();
