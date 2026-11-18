/* Optional deadline-stock integration. Ordinary shopping and pantry entries stay tag-free. */
(() => {
  'use strict';
  const Core = globalThis.ExpiryStockCore;
  if (!Core) return;

  const STORAGE_KEY = 'menuPromptGenerator.v5.expiryStock';
  const SECTION_MARKER = '【期限ストック（自動連携）】';
  const EARLY_DAYS = 45;
  const URGENT_DAYS = 14;
  const $ = (id) => document.getElementById(id);

  function readStored() {
    try {
      return Core.normalizeRecords(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
    } catch (error) {
      console.warn('expiry stock read failed', error);
      return [];
    }
  }

  function writeStored(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Core.normalizeRecords(records)));
  }

  function dateKey() {
    const selected = $('dateInput')?.value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(selected || '')) return selected;
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  }

  function itemLabel(item) {
    const monthNote = item.expiry.length === 7 ? '（年月表示・月末基準）' : '';
    return '・' + item.expiry + monthNote + ' | ' + (item.tag || 'タグなし') + ' | ' + item.name + ' | ' + item.quantity;
  }

  function injectIntoOutput(raw) {
    const source = String(raw || '');
    if (!source.includes('【今日食べるもの】')) return source;
    const marker = '\n\n' + SECTION_MARKER + '\n';
    const start = source.indexOf(marker);
    const base = start >= 0 ? source.slice(0, start) : source;
    const { urgent, upcoming } = Core.classify(readStored(), dateKey(), EARLY_DAYS, URGENT_DAYS);
    if (!urgent.length && !upcoming.length) return base;
    const lines = [
      SECTION_MARKER,
      '期限注意（14日以内・期限経過）：',
      ...(urgent.length ? urgent.map(itemLabel) : ['なし']),
      '期限つきストック（15〜45日以内・参考）：',
      ...(upcoming.length ? upcoming.map(itemLabel) : ['なし']),
      '※期限注意は手動の「期限注意」と同程度に優先して検討する。期限切れ品は保存条件等を確認し、食べられると決めつけない。',
      '※参考品は献立に自然に合う場合のみ採用し、消費を急がない。数量は在庫数であり、各品を一食の主菜や主食と決めつけない。タグなしは品名から用途を判断する。',
      '※同じ商品が手動リストにもあれば、二重の在庫として数えない。',
    ];
    return base + '\n\n' + lines.join('\n');
  }

  function patchOutput() {
    const previous = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (!previous?.get || !previous?.set) return;
    Object.defineProperty(HTMLTextAreaElement.prototype, 'value', {
      configurable: previous.configurable,
      enumerable: previous.enumerable,
      get: previous.get,
      set(value) {
        const result = previous.set.call(this, value);
        if (this.id === 'outputText') {
          const current = previous.get.call(this);
          const decorated = injectIntoOutput(current);
          if (current !== decorated) previous.set.call(this, decorated);
        }
        return result;
      },
    });
  }

  function patchBackup() {
    const previousStringify = JSON.stringify.bind(JSON);
    JSON.stringify = function withExpiryBackup(value, replacer, space) {
      if (value && typeof value === 'object' && value.version && value.drafts && value.history && value.type !== 'month') {
        return previousStringify({ ...value, expiryStock: readStored() }, replacer, space);
      }
      return previousStringify(value, replacer, space);
    };
  }

  function refreshOutput() {
    const output = $('outputText');
    if (output) output.value = output.value;
  }

  function insertUI() {
    const anchor = $('planGroups')?.closest('section');
    if (!anchor || $('expiryStockSection')) return;
    const section = document.createElement('details');
    section.className = 'card';
    section.id = 'expiryStockSection';
    section.innerHTML = [
      '<summary>賞味期限ストック（一括同期）</summary>',
      '<p class="help">期限管理の最新版を丸ごと貼り付けて同期。普段の買い物や今週の候補へのタグ入力は不要です。データはこの端末内に保存されます。</p>',
      '<p class="mini">形式：期限 | タグ（省略可） | 品名 | 数量。期限は YYYY-MM または YYYY-MM-DD。年月のみの期限は表示を保持し、日数判定だけ月末扱い。</p>',
      '<label for="expiryStockPaste">期限チェックリストを貼り付け</label>',
      '<textarea id="expiryStockPaste" rows="6" placeholder="2027-03 | 間食 | サンプル菓子 | 1個&#10;2027-04-05 | サンプル食品 | 2個"></textarea>',
      '<div id="expiryStockPreview" class="empty" aria-live="polite">一覧を貼り付けると差分を表示します。</div>',
      '<div class="buttons"><button type="button" id="expiryStockSync" class="primary" disabled>この一覧に同期</button></div>',
      '<p class="mini">未記載の商品は同期時に削除されます。一部だけを貼る場合は同期しないでください。期限が45日以内になったものだけ相談文へ表示します。</p>',
      '<p class="mini" id="expiryStockSaved" aria-live="polite"></p>',
    ].join('');
    anchor.after(section);
  }

  function statusText(message) {
    const target = $('expiryStockSaved');
    if (target) target.textContent = message;
  }

  function showStored() {
    const records = readStored();
    const active = Core.classify(records, dateKey(), EARLY_DAYS, URGENT_DAYS);
    statusText('保存済み ' + records.length + '件 / 相談文の期限注意 ' + active.urgent.length + '件 / 参考 ' + active.upcoming.length + '件');
  }

  function preview() {
    const textarea = $('expiryStockPaste');
    const output = $('expiryStockPreview');
    const button = $('expiryStockSync');
    if (!textarea || !output || !button) return;
    output.replaceChildren();
    const source = textarea.value.trim();
    button.disabled = true;
    if (!source) {
      output.textContent = '一覧を貼り付けると差分を表示します。';
      return;
    }
    const parsed = Core.parsePastedList(source);
    const diff = Core.diffRecords(readStored(), parsed.records);
    const summary = document.createElement('div');
    summary.textContent = '認識 ' + parsed.records.length + '件 / 新規 ' + diff.added + '件 / 変更 ' + diff.changed + '件 / 削除予定 ' + diff.removed + '件';
    output.append(summary);
    if (parsed.errors.length) {
      const errors = document.createElement('div');
      errors.style.color = 'var(--danger)';
      errors.textContent = '登録を停止：' + parsed.errors.join('、');
      output.append(errors);
    }
    if (parsed.warnings.length) {
      const warnings = document.createElement('div');
      warnings.textContent = parsed.warnings.join('、');
      output.append(warnings);
    }
    const examples = parsed.records.slice(0, 5);
    if (examples.length) {
      const list = document.createElement('ul');
      examples.forEach((item) => {
        const row = document.createElement('li');
        row.textContent = itemLabel(item).slice(1);
        list.append(row);
      });
      output.append(list);
      if (parsed.records.length > examples.length) {
        const rest = document.createElement('div');
        rest.textContent = 'ほか ' + (parsed.records.length - examples.length) + '件';
        output.append(rest);
      }
    }
    button.disabled = parsed.records.length === 0 || parsed.errors.length > 0;
  }

  function syncAll() {
    const parsed = Core.parsePastedList($('expiryStockPaste')?.value || '');
    if (parsed.errors.length || !parsed.records.length) return preview();
    const diff = Core.diffRecords(readStored(), parsed.records);
    const question = parsed.records.length + '件を新しい一覧として同期する？\n新規 ' + diff.added + '件、変更 ' + diff.changed + '件、未記載の削除 ' + diff.removed + '件。';
    if (!confirm(question)) return;
    try {
      writeStored(parsed.records);
      $('expiryStockPaste').value = '';
      preview();
      showStored();
      refreshOutput();
    } catch (error) {
      console.error('expiry stock sync failed', error);
      statusText('同期できませんでした。端末の保存領域を確認してください。');
    }
  }

  function installBackupImport() {
    document.addEventListener('change', (event) => {
      if (event.target?.id !== 'importFile' || !event.target.files?.length) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!Array.isArray(data?.expiryStock)) return; // Old backups do not erase expiry data.
          writeStored(data.expiryStock);
          showStored();
          refreshOutput();
        } catch (error) {
          console.warn('expiry stock backup import failed', error);
        }
      };
      reader.readAsText(event.target.files[0]);
    }, true);
  }

  function init() {
    patchOutput();
    patchBackup();
    insertUI();
    $('expiryStockPaste')?.addEventListener('input', preview);
    $('expiryStockSync')?.addEventListener('click', syncAll);
    ['prevDay', 'nextDay', 'todayBtn', 'dateInput'].forEach((id) => {
      $(id)?.addEventListener(id === 'dateInput' ? 'change' : 'click', () => setTimeout(() => {
        showStored();
        refreshOutput();
      }, 0));
    });
    installBackupImport();
    showStored();
    refreshOutput();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
