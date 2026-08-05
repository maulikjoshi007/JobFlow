/**
 * Test.gs
 * Lightweight smoke tests runnable directly in the Apps Script editor.
 *
 * These do not require network/Sheet/Drive access for the pure-logic
 * checks, and clearly label the ones that do. Run `jobflow_runAllTests`
 * from the function dropdown and check the Execution log / returned
 * summary for PASS/FAIL results.
 */

function jobflow_runAllTests() {
  var results = [];

  function check(name, fn) {
    try {
      fn();
      results.push({ name: name, pass: true });
    } catch (e) {
      results.push({ name: name, pass: false, error: e.message });
    }
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
  }

  // --- Validation.gs ---
  check('Validation: accepts a normal email', function () {
    assert(Validation.isValidEmail('recruiter@company.com') === true);
  });

  check('Validation: rejects a malformed email', function () {
    assert(Validation.isValidEmail('not-an-email') === false);
    assert(Validation.isValidEmail('missing@domain') === false);
    assert(Validation.isValidEmail('') === false);
  });

  check('Validation: row requires email, company, and name', function () {
    var r1 = Validation.validateRow({ email: '', company: 'Acme', name: 'Jo' });
    assert(r1.valid === false, 'should fail without email');

    var r2 = Validation.validateRow({ email: 'a@b.com', company: '', name: 'Jo' });
    assert(r2.valid === false, 'should fail without company');

    var r3 = Validation.validateRow({ email: 'a@b.com', company: 'Acme', name: '' });
    assert(r3.valid === false, 'should fail without name');

    var r4 = Validation.validateRow({ email: 'a@b.com', company: 'Acme', name: 'Jo' });
    assert(r4.valid === true, 'should pass with all required fields');
  });

  // --- Utils.gs ---
  check('Utils: addDays / formatDate round-trip', function () {
    var base = new Date('2026-01-01T00:00:00Z');
    var result = Utils.addDays(base, 5);
    assert(Utils.formatDate(result) === '2026-01-06', 'expected 2026-01-06, got ' + Utils.formatDate(result));
  });

  check('Utils: daysBetween computes whole-day difference', function () {
    var from = new Date('2026-01-01T00:00:00Z');
    var to = new Date('2026-01-06T00:00:00Z');
    assert(Utils.daysBetween(from, to) === 5);
  });

  check('Utils: shuffle preserves array contents', function () {
    var original = [1, 2, 3, 4, 5];
    var shuffled = Utils.shuffle(original.slice());
    assert(shuffled.length === original.length);
    original.forEach(function (n) {
      assert(shuffled.indexOf(n) !== -1, 'missing element ' + n + ' after shuffle');
    });
  });

  check('Utils: columnToLetter basic cases', function () {
    assert(Utils.columnToLetter(1) === 'A');
    assert(Utils.columnToLetter(26) === 'Z');
    assert(Utils.columnToLetter(27) === 'AA');
  });

  // --- These require live Config/Sheet/Drive access; they are skipped
  //     gracefully with a clear message if Script Properties aren't set,
  //     rather than failing the whole suite.
  check('Config: profile/settings load (requires CONFIG_FOLDER_ID)', function () {
    try {
      var profile = Config.getProfile();
      Validation.validateProfile(profile);
      Config.getSettings();
    } catch (e) {
      throw new Error('Skipped/failed - configure CONFIG_FOLDER_ID and upload config JSON first: ' + e.message);
    }
  });

  var summary = results.map(function (r) {
    return (r.pass ? 'PASS' : 'FAIL') + ' - ' + r.name + (r.error ? ' (' + r.error + ')' : '');
  }).join('\n');

  Logger.log(summary);

  var failCount = results.filter(function (r) { return !r.pass; }).length;
  Logger.log('\n' + (results.length - failCount) + '/' + results.length + ' tests passed.');

  return summary;
}

/**
 * TC12 helper: deliberately holds the script lock for a fixed window so
 * you can reliably test concurrent-execution protection, instead of
 * depending on real batch timing (which varies and is hard to time by
 * hand). Run this from the Apps Script editor's Run button, then -
 * WHILE it's still showing "Running..." in the editor - trigger any
 * other lock-guarded action (e.g. JobFlow -> Run Batch Now from the
 * Sheet menu). The second call should log "Could not acquire lock" in
 * the Logs sheet and exit without doing anything, confirming the lock
 * actually works under real concurrency.
 * @param {number=} holdSeconds How long to hold the lock (default 30s -
 *   long enough to comfortably switch tabs and click the menu).
 */
function jobflow_testLockHold(holdSeconds) {
  var seconds = holdSeconds || 90;
  return Utils.withLock(function () {
    JFLogger.info('Test', 'jobflow_testLockHold: lock acquired, holding for ' + seconds + 's - try triggering another action now');
    Utils.sleep(seconds * 1000);
    JFLogger.info('Test', 'jobflow_testLockHold: releasing lock now');
    return { held: true, seconds: seconds };
  });
}
