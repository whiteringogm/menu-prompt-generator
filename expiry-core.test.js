const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./expiry-core.js');

test('month-only deadlines retain YYYY-MM and use month end for countdown', () => {
  assert.equal(core.expiryTime('2026-12'), Date.UTC(2026, 11, 31));
  assert.equal(core.expiryTime('2027-02'), Date.UTC(2027, 1, 28));
  assert.equal(core.expiryTime('2026-02-29'), null);
  assert.equal(core.expiryTime('2026-13'), null);
});

test('pastes a list with commentary, optional tags and distinct deadlines', () => {
  const list = [
    '# deadline list',
    '期限 | タグ | 商品名 | 数量',
    '2026-12 | 間食 | サンプル菓子 | 2袋',
    '2026-12-03 | 主食 | サンプル麺 | 1個',
    '2027-02-01 | サンプル野菜 | 3個',
    '2027-03 | サンプル食品',
    '2027-04 | おかず | サンプル食品 | 1個',
  ].join('\n');
  const result = core.parsePastedList(list);
  assert.deepEqual(result.errors, []);
  assert.equal(result.records.length, 5);
  assert.equal(result.records[0].expiry, '2026-12-03');
  assert.equal(result.records[1].expiry, '2026-12');
  assert.equal(result.records[2].tag, null);
});

test('invalid rows prevent silent loss on full snapshot sync', () => {
  const result = core.parsePastedList('2026-02-30 | 間食 | サンプル | 1個\n2026-12 | 主食 | サンプル | 1個\n2026-12 | 主食 | サンプル | 1個');
  assert.equal(result.records.length, 1);
  assert.equal(result.errors.length, 2);
});

test('re-import is idempotent and changed quantities do not double', () => {
  const original = core.parsePastedList('2026-12 | 間食 | サンプル菓子 | 1個').records;
  const repeated = core.parsePastedList('2026-12 | 間食 | サンプル菓子 | 1個').records;
  assert.deepEqual(core.diffRecords(original, repeated), { added: 0, changed: 0, removed: 0, unchanged: 1 });
  const changed = core.parsePastedList('2026-12 | 間食 | サンプル菓子 | 2個').records;
  assert.equal(core.diffRecords(original, changed).changed, 1);
});

test('full-sync detects deletions and distinct expirations', () => {
  const original = core.parsePastedList('2027-04-27 | おかず | サンプル料理 | 1個\n2027-07-19 | おかず | サンプル料理 | 1個').records;
  const updated = core.parsePastedList('2027-07-19 | おかず | サンプル料理 | 1個').records;
  assert.equal(original.length, 2);
  assert.equal(core.diffRecords(original, updated).removed, 1);
});

test('time bands exclude far-ahead stock and include past-due', () => {
  const records = core.parsePastedList('2026-11-10 | 間食 | 過去の菓子 | 1個\n2026-12 | 間食 | 年末の菓子 | 1個\n2027-05 | 間食 | 半年先の菓子 | 1個').records;
  const result = core.classify(records, '2026-11-18');
  assert.equal(result.urgent.length, 1);
  assert.equal(result.upcoming.length, 1);
});
