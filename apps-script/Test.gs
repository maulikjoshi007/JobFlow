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
