/**
 * DriveService.gs
 * Repository Layer (Drive)
 *
 * Handles fetching the resume and any other Drive-backed assets. The
 * resume file ID always comes from profile.json - never hardcoded.
 */

var DriveService = (function () {
  var resumeBlobCache_ = null;

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
   * Clears the in-memory resume cache (useful for tests / dry runs).
   */
  function clearCache() {
    resumeBlobCache_ = null;
  }

  return {
    getResumeBlob: getResumeBlob,
    clearCache: clearCache
  };
})();
