(() => {
  'use strict';

  const APP_VERSION = 'v5.1.16';
  const HISTORY_KEY = 'menuPromptGenerator.v5.history';
  const TYPES = ['side', 'soup'];
  const ITEM_SERVINGS = ['', '1', '2', '3', '4'];
  const pad = (value) => String(value).padStart(2, '0');

  function blankItemRow(type) {
    const placeholder = type === 'soup'
      ? '例：豆腐とわかめの味噌汁'
      : '例：ブロッコリーのおかか和え';
    const row = document.createElement('div');
    row.dataset.stockItemRow = type;
    row.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) 92px auto;gap:7px;align-items:end;margin-top:7px';
    row.innerHTML = `
      <label>料理名<input type="text" data-stock-item-name maxlength="120" placeholder="${placeholder}"></label>
      <label>人前<select data-stock-item-servings>${ITEM_SERVINGS.map((value) => `<option value="${value}">${value || '未入力'}</option>`).join('')}</select></label>
      <button type="button" class="small danger" data-stock-remove="${type}" aria-label="この内訳を削除">削除</button>`;
    return row;
  }

  function addDays(key, amount) {
    const [year, month, day] = String(key || '').split('-').map(Number);
    if (![year, month, day].every(Number.isFinite)) return '';
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + amount);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function currentDateKey() {
    const input = document.getElementById('dateInput');
    if (input?.value) return input.value;
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  function readHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      console.warn('history read failed', error);
      return {};
    }
  }

  function yesterdayDinnerText() {
    const key = addDays(currentDateKey(), -1);
    const record = readHistory()[key];
    const dinner = record?.meals?.dinner;
    if (typeof dinner === 'string' && dinner.trim()) return dinner.trim();

    const raw = typeof record?.rawText === 'string' ? record.rawText : '';
    const match = raw.match(/^夕\s*[：:]\s*(.+)$/m);
    return match?.[1]?.trim() || '';
  }

  function isEmptyMealName(value) {
    return /^(?:なし|無し|未定|なし\s*[（(]未[）)]|未定\s*[（(]未[）)])$/.test(String(value || '').trim());
  }

  function parseYesterdayDinner(value) {
    const parts = String(value || '')
      .split('、')
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length < 3) {
      return {
        ok: false,
        message: '昨日の夕食を「主菜、副菜、汁物」の順で「、」区切りにすると読み取れるよ',
      };
    }

    return {
      ok: true,
      sideNames: parts.slice(1, -1).filter((name) => !isEmptyMealName(name)),
      soupNames: isEmptyMealName(parts.at(-1)) ? [] : [parts.at(-1)],
    };
  }

  function setImportStatus(message, state = '') {
    const node = document.querySelector('[data-yesterday-dinner-stock-status]');
    if (!node) return;
    node.textContent = message;
    node.dataset.state = state;
  }

  function setStockNames(type, names) {
    const rowsRoot = document.querySelector(`[data-stock-rows="${type}"]`);
    if (!rowsRoot) return;

    const desiredNames = names.length ? names : [''];
    while (rowsRoot.querySelectorAll('[data-stock-item-row]').length < desiredNames.length) {
      rowsRoot.append(blankItemRow(type));
    }
    while (rowsRoot.querySelectorAll('[data-stock-item-row]').length > desiredNames.length) {
      rowsRoot.lastElementChild?.remove();
    }

    const remainingId = type === 'side' ? 'sideRemaining' : 'soupRemaining';
    const remaining = document.getElementById(remainingId);
    if (remaining) remaining.value = '';

    [...rowsRoot.querySelectorAll('[data-stock-item-row]')].forEach((row, index) => {
      const name = row.querySelector('[data-stock-item-name]');
      const servings = row.querySelector('[data-stock-item-servings]');
      if (name) name.value = desiredNames[index] || '';
      if (servings) servings.value = '';
    });

    const firstName = rowsRoot.querySelector('[data-stock-item-name]');
    firstName?.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function importYesterdayDinner() {
    const dinner = yesterdayDinnerText();
    if (!dinner) {
      setImportStatus('昨日の夕食が保存されてないみたい', 'error');
      return;
    }

    const parsed = parseYesterdayDinner(dinner);
    if (!parsed.ok) {
      setImportStatus(parsed.message, 'error');
      return;
    }

    setStockNames('side', parsed.sideNames);
    setStockNames('soup', parsed.soupNames);
    updateUI();

    const sideCount = parsed.sideNames.length;
    const soupCount = parsed.soupNames.length;
    setImportStatus(`昨日の夕食から副菜${sideCount}品・汁物${soupCount}品をコピーしたよ。残り人前だけ入れてね`, 'saved');
  }

  function ensureYesterdayDinnerImport() {
    const section = document.getElementById('mealStockSection');
    if (!section || section.querySelector('[data-yesterday-dinner-stock-import]')) return;

    const help = section.querySelector(':scope > .help');
    const row = document.createElement('div');
    row.className = 'buttons';
    row.style.marginBottom = '10px';
    row.innerHTML = `
      <button type="button" class="small" data-yesterday-dinner-stock-import>昨日の夕食から料理名を入れる</button>
      <span class="mini" data-yesterday-dinner-stock-status>書式：主菜、副菜、汁物（料理名の中は「・」推奨）</span>`;
    if (help) help.after(row);
    else section.prepend(row);
  }

  function totalText(type) {
    const rows = [...document.querySelectorAll(`[data-stock-rows="${type}"] [data-stock-item-row]`)];
    const complete = rows.filter((row) => {
      const name = (row.querySelector('[data-stock-item-name]')?.value || '').trim();
      const servings = Number(row.querySelector('[data-stock-item-servings]')?.value || 0);
      return name && servings > 0;
    });
    const total = complete.reduce((sum, row) => (
      sum + Number(row.querySelector('[data-stock-item-servings]')?.value || 0)
    ), 0);
    if (total > 0) return `合計：約${total}人前（自動）`;

    const remainingId = type === 'side' ? 'sideRemaining' : 'soupRemaining';
    const remaining = document.getElementById(remainingId)?.value || '';
    return remaining ? `合計：約${remaining}人前（手動）` : '合計：未入力';
  }

  function updateType(type) {
    const editor = document.querySelector(`[data-stock-editor="${type}"]`);
    const toggle = document.querySelector(`[data-stock-toggle="${type}"]`);
    const rows = document.querySelector(`[data-stock-rows="${type}"]`);
    if (!editor || !rows) return;

    const column = editor.parentElement;
    const heading = column?.querySelector(':scope > h3');
    const controlsRow = column?.querySelector(':scope > .row');
    const summaryRow = toggle?.closest('.buttons');

    editor.hidden = false;
    if (toggle) toggle.hidden = true;

    const note = editor.querySelector('.mini');
    const noteText = 'まず料理名と人前を入力。2品以上あるときだけ下の追加ボタンを使う。合計は入力した内訳から自動計算する。';
    if (note && note.textContent !== noteText) note.textContent = noteText;

    if (!rows.querySelector('[data-stock-item-row]')) {
      rows.append(blankItemRow(type));
    }

    const itemRows = [...rows.querySelectorAll('[data-stock-item-row]')];
    itemRows.forEach((row) => {
      row.dataset.stockItemRow = type;
      const remove = row.querySelector('[data-stock-remove]');
      if (!remove) return;
      const shouldHide = itemRows.length === 1;
      if (remove.hidden !== shouldHide) remove.hidden = shouldHide;
    });

    const add = document.querySelector(`[data-stock-add="${type}"]`);
    if (add) {
      const label = itemRows.length <= 1 ? '2品目を追加' : '料理を追加';
      if (add.textContent !== label) add.textContent = label;
    }

    if (heading && heading.nextElementSibling !== editor) heading.after(editor);
    if (summaryRow && editor.nextElementSibling !== summaryRow) editor.after(summaryRow);
    if (summaryRow && controlsRow && summaryRow.nextElementSibling !== controlsRow) summaryRow.after(controlsRow);

    if (summaryRow) {
      summaryRow.style.marginTop = '8px';
      const totalNode = summaryRow.querySelector(`[data-stock-total="${type}"]`);
      const nextTotal = totalText(type);
      if (totalNode && totalNode.textContent !== nextTotal) totalNode.textContent = nextTotal;
    }

    const remainingId = type === 'side' ? 'sideRemaining' : 'soupRemaining';
    const group = document.querySelector(`[data-stock-group="${remainingId}"]`);
    const remainingBox = group?.parentElement;
    const remainingLabel = remainingBox?.firstElementChild;
    const manualLabel = '合計を手動入力（約・人前）';
    if (remainingLabel && remainingLabel.textContent !== manualLabel) remainingLabel.textContent = manualLabel;
  }

  function updateUI() {
    const section = document.getElementById('mealStockSection');
    if (!section) return;

    const help = section.querySelector(':scope > .help');
    const helpText = '料理名 → 人前 → 合計の順で入力。1品でも料理名を入れ、2品以上あるときだけ追加する。内訳を入れない日は合計だけ手動入力もできる。';
    if (help && help.textContent !== helpText) help.textContent = helpText;

    ensureYesterdayDinnerImport();
    TYPES.forEach(updateType);

    document.title = document.title.replace(/v5\.1\.\d+/, APP_VERSION);
    const heading = document.querySelector('h1');
    if (heading) heading.textContent = heading.textContent.replace(/v5\.1\.\d+/, APP_VERSION);
  }

  function bindPrimaryRowGuard() {
    const section = document.getElementById('mealStockSection');
    if (!section || section.dataset.primaryStockGuard === '1') return;
    section.dataset.primaryStockGuard = '1';

    section.addEventListener('click', (event) => {
      const importButton = event.target.closest('[data-yesterday-dinner-stock-import]');
      if (importButton) {
        event.preventDefault();
        importYesterdayDinner();
        return;
      }

      const add = event.target.closest('[data-stock-add]');
      if (add) {
        const type = add.dataset.stockAdd;
        const firstRow = document.querySelector(`[data-stock-rows="${type}"] [data-stock-item-row]`);
        if (!firstRow) return;

        const name = firstRow.querySelector('[data-stock-item-name]');
        const servings = firstRow.querySelector('[data-stock-item-servings]');
        if ((name?.value || '').trim() || servings?.value) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        name?.focus();
        return;
      }

      if (event.target.closest('[data-stock-value]')) {
        setTimeout(updateUI, 0);
      }
    }, true);

    section.addEventListener('input', (event) => {
      if (event.target.closest('[data-stock-item-row]')) setTimeout(updateUI, 0);
    }, true);

    section.addEventListener('change', (event) => {
      if (event.target.closest('[data-stock-item-row]')) setTimeout(updateUI, 0);
    }, true);
  }

  function init() {
    updateUI();
    bindPrimaryRowGuard();

    const section = document.getElementById('mealStockSection');
    if (section) {
      const observer = new MutationObserver(() => updateUI());
      observer.observe(section, { childList: true, subtree: true });
    }

    ['prevDay', 'nextDay', 'todayBtn'].forEach((id) => {
      document.getElementById(id)?.addEventListener('click', () => setTimeout(updateUI, 0));
    });
    document.getElementById('dateInput')?.addEventListener('change', () => setTimeout(updateUI, 0));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0), { once: true });
  } else {
    setTimeout(init, 0);
  }
})();
