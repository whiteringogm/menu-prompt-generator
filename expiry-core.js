/* Expiry stock parser and date logic. No personal inventory data is bundled. */
(function (root, factory) {
  'use strict';
  const api = factory();
  root.ExpiryStockCore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis, function () {
  'use strict';

  const TAGS = Object.freeze(['間食', '飲料', '主食', 'おかず', '食事の素', '料理素材', '製菓材料']);
  const TAG_SET = new Set(TAGS);
  const DAY_MS = 86400000;

  function expiryTime(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = match[3] ? Number(match[3]) : new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const stamp = Date.UTC(year, month - 1, day);
    const checked = new Date(stamp);
    if (checked.getUTCFullYear() !== year || checked.getUTCMonth() + 1 !== month || checked.getUTCDate() !== day) return null;
    return stamp;
  }

  function recordKey(item) {
    return item.expiry + '|' + String(item.name).trim().normalize('NFKC').toLocaleLowerCase('ja-JP');
  }

  function quantityValid(value) {
    // Quantity is descriptive inventory text, not an arithmetic field.
    return String(value).trim().length > 0 && !/[|\x00-\x1f\x7f]/.test(String(value));
  }

  function normalizeRecord(value) {
    if (!value || typeof value !== 'object') return null;
    const expiry = String(value.expiry || '').trim();
    const name = String(value.name || '').trim();
    const quantity = String(value.quantity || '1個').trim();
    if (expiryTime(expiry) === null || !name || !quantityValid(quantity)) return null;
    return {
      expiry,
      tag: TAG_SET.has(value.tag) ? value.tag : null,
      name,
      quantity,
    };
  }

  function normalizeRecords(input) {
    if (!Array.isArray(input)) return [];
    const byKey = new Map();
    input.forEach((value) => {
      const item = normalizeRecord(value);
      if (item) byKey.set(recordKey(item), item);
    });
    return [...byKey.values()].sort((a, b) => expiryTime(a.expiry) - expiryTime(b.expiry) || a.name.localeCompare(b.name, 'ja'));
  }

  function parsePastedList(source) {
    const records = [];
    const errors = [];
    const warnings = [];
    const seen = new Set();

    String(source || '').split(/\r?\n/).forEach((rawLine, index) => {
      const line = rawLine.trim().replace(/^[•・*-]\s*/, '').trim();
      if (!/^\d{4}-\d{2}/.test(line)) return; // Ignore headings, commentary, and code fences.
      const cells = line.split('|').map((cell) => cell.trim());
      const row = index + 1;
      if (cells.length < 2 || cells.length > 4) {
        errors.push(row + '行目：区切りは「期限 | タグ | 品名 | 数量」の形式にしてね');
        return;
      }
      const expiry = cells[0];
      if (expiryTime(expiry) === null) {
        errors.push(row + '行目：期限が正しくない');
        return;
      }
      let tag = null;
      let name = '';
      let quantity = '1個';
      if (cells.length === 4) {
        tag = TAG_SET.has(cells[1]) ? cells[1] : null;
        if (cells[1] && !tag) warnings.push(row + '行目：未知のタグはタグなしとして登録');
        name = cells[2];
        quantity = cells[3] || '1個';
      } else if (cells.length === 3 && TAG_SET.has(cells[1])) {
        tag = cells[1];
        name = cells[2];
      } else {
        name = cells[1];
        if (cells.length === 3) quantity = cells[2] || '1個';
      }
      const item = normalizeRecord({ expiry, tag, name, quantity });
      if (!item) {
        errors.push(row + '行目：品名または数量が正しくない');
        return;
      }
      const key = recordKey(item);
      if (seen.has(key)) {
        errors.push(row + '行目：同じ品名・期限が重複している（数量は1行にまとめてね）');
        return;
      }
      seen.add(key);
      records.push(item);
    });
    return { records: normalizeRecords(records), errors, warnings };
  }

  function classify(records, selectedDate, earlyDays = 45, urgentDays = 14) {
    const base = expiryTime(selectedDate);
    if (base === null || String(selectedDate).length !== 10) return { urgent: [], upcoming: [] };
    const urgent = [];
    const upcoming = [];
    normalizeRecords(records).forEach((item) => {
      const daysLeft = Math.round((expiryTime(item.expiry) - base) / DAY_MS);
      const decorated = { ...item, daysLeft };
      if (daysLeft <= urgentDays) urgent.push(decorated);
      else if (daysLeft <= earlyDays) upcoming.push(decorated);
    });
    return { urgent, upcoming };
  }

  function diffRecords(previous, incoming) {
    const before = new Map(normalizeRecords(previous).map((item) => [recordKey(item), item]));
    const after = new Map(normalizeRecords(incoming).map((item) => [recordKey(item), item]));
    let added = 0;
    let changed = 0;
    let removed = 0;
    after.forEach((item, key) => {
      const old = before.get(key);
      if (!old) added++;
      else if (item.tag !== old.tag || item.quantity !== old.quantity || item.name !== old.name) changed++;
    });
    before.forEach((_, key) => {
      if (!after.has(key)) removed++;
    });
    return { added, changed, removed, unchanged: after.size - added - changed };
  }

  return { TAGS, expiryTime, normalizeRecords, parsePastedList, classify, diffRecords };
});
