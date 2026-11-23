const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  const handlers = {};
  const storage = new Map();
  const events = [];
  const inputHandlers = {};
  class FakeTextarea {
    constructor(id) {
      this.id = id;
      this._value = '';
    }
  }
  Object.defineProperty(FakeTextarea.prototype, 'value', {
    configurable: true,
    enumerable: true,
    get() { return this._value; },
    set(value) { this._value = String(value); },
  });

  const output = new FakeTextarea('outputText');
  const input = { value: '2026-11-24', addEventListener(name, fn) { inputHandlers[name] = fn; } };
  const promptStatus = { textContent: '' };
  const elements = {
    outputText: output,
    dateInput: input,
    expiryStockPromptStatus: promptStatus,
    expiryStockCount: { textContent: '' },
    expiryStockSaved: { textContent: '' },
    planGroups: { closest() { return { after() {} }; } },
  };
  const document = {
    readyState: 'loading',
    getElementById(id) { return elements[id] || null; },
    addEventListener(event, callback) { (handlers[event] ||= []).push(callback); },
    createElement() { return { setAttribute() {} }; },
  };
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, value); },
  };
  const context = vm.createContext({
    document, localStorage, HTMLTextAreaElement: FakeTextarea,
    setTimeout(fn) { events.push(fn); }, console, confirm() { return true; },
  });
  const run = (path) => vm.runInContext(fs.readFileSync(require.resolve('./' + path), 'utf8'), context, { filename: path });
  run('expiry-core.js');
  const records = context.ExpiryStockCore.parsePastedList([
    '2026-11-30 | 主食 | サンプル麺 | 1個',
    '2026-12 | 間食 | サンプル菓子 | 2個',
    '2027-04 | 料理素材 | サンプル調味料 | 1個',
  ].join('\n')).records;
  storage.set('menuPromptGenerator.v5.expiryStock', JSON.stringify(records));

  run('expiry-stock.js');
  (handlers.DOMContentLoaded || []).forEach((fn) => fn());
  return {
    FakeTextarea, output, input, promptStatus, elements, context,
    dateChanged() {
      inputHandlers.change();
      events.splice(0).forEach((fn) => fn());
    },
  };
}

test('expiry output remains visible after legacy modules patch the textarea prototype later', () => {
  const { FakeTextarea, output, promptStatus, dateChanged } = setup();
  const native = Object.getOwnPropertyDescriptor(FakeTextarea.prototype, 'value');

  // Mirrors legacy modules that capture and replace the prototype accessor
  // asynchronously after the expiry module initializes.
  Object.defineProperty(FakeTextarea.prototype, 'value', {
    configurable: true,
    get: native.get,
    set(value) { native.set.call(this, String(value).replace('【期限注意】\nなし', '【期限注意】\nなし')); },
  });
  const oldPatch = Object.getOwnPropertyDescriptor(FakeTextarea.prototype, 'value');
  Object.defineProperty(FakeTextarea.prototype, 'value', {
    configurable: true,
    get: oldPatch.get,
    set(value) {
      oldPatch.set.call(this, value);
      native.set.call(this, native.get.call(this).replace('【今週の候補】\nなし', '【今週の候補】\nなし'));
    },
  });

  const input = '11月24日(火)\n\n【今日食べるもの】\n朝:未定\n\n【期限注意】\nなし\n\n【今週の候補】\nなし\n\n【昨日食べたもの】\n保存なし';
  output.value = input;
  dateChanged(); // Recompute the visible-count indicator after output generation.
  const once = output.value;
  assert.match(once, /【期限ストック（自動連携）】/);
  assert.match(once, /2026-11-30 \| 主食 \| サンプル麺 \| 1個/);
  assert.match(once, /2026-12（年月表示・月末基準） \| 間食 \| サンプル菓子 \| 2個/);
  assert.doesNotMatch(once, /サンプル調味料/);
  assert.ok(once.indexOf('【期限ストック') < once.indexOf('【今週の候補】'));
  assert.match(promptStatus.textContent, /本文に実際に表示 2件/);

  output.value = output.value;
  assert.equal(output.value, once);
  output.value = input;
  assert.equal(output.value, once);
});

test('changing selected date changes active expiry entries and verifies actual count', () => {
  const { input, output, promptStatus, dateChanged } = setup();
  const source = '【今日食べるもの】\n朝:未定\n\n【期限注意】\nなし\n\n【今週の候補】\nなし';
  output.value = source;
  assert.match(output.value, /サンプル菓子/);
  input.value = '2026-11-10';
  dateChanged();
  assert.doesNotMatch(output.value, /サンプル菓子/);
  assert.match(output.value, /サンプル麺/);
  assert.match(promptStatus.textContent, /本文に実際に表示 1件/);
  input.value = '2027-03-25';
  dateChanged();
  assert.match(output.value, /サンプル調味料/);
  assert.match(promptStatus.textContent, /本文に実際に表示 3件/);
});
