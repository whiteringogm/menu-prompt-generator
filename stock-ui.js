(() => {
  'use strict';

  const APP_VERSION = 'v5.1.12';
  const TYPES = ['side', 'soup'];
  const ITEM_SERVINGS = ['', '1', '2', '3', '4'];

  function blankItemRow(type) {
    const row = document.createElement('div');
    row.dataset.stockItemRow = type;
    row.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) 92px auto;gap:7px;align-items:end;margin-top:7px';
    row.innerHTML = `
      <label>料理名<input type="text" data-stock-item-name maxlength="120" placeholder="例：ブロッコリーのおかか和え"></label>
      <label>人前<select data-stock-item-servings>${ITEM_SERVINGS.map((value) => `<option value="${value}">${value || '未入力'}</option>`).join('')}</select></label>
      <button type="button" class="small danger" data-stock-remove="${type}" aria-label="この内訳を削除">削除</button>`;
    return row;
  }

  function updateType(type) {
    const editor = document.querySelector(`[data-stock-editor="${type}"]`);
    const toggle = document.querySelector(`[data-stock-toggle="${type}"]`);
    const rows = document.querySelector(`[data-stock-rows="${type}"]`);
    if (!editor || !rows) return;

    if (editor.hidden) editor.hidden = false;
    if (toggle && !toggle.hidden) toggle.hidden = true;

    const note = editor.querySelector('.mini');
    const noteText = '料理名は1品でも入力。2品以上あるときだけ下の追加ボタンを使う。料理名と人前が揃った行から残量を自動計算する。';
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
  }

  function updateUI() {
    const section = document.getElementById('mealStockSection');
    if (!section) return;

    const help = section.querySelector(':scope > .help');
    const helpText = '料理名は1品でも入力。残りは0〜4をタップし、料理名と人前を両方入れた場合は内訳から自動計算する。';
    if (help && help.textContent !== helpText) help.textContent = helpText;

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
      const add = event.target.closest('[data-stock-add]');
      if (!add) return;

      const type = add.dataset.stockAdd;
      const firstRow = document.querySelector(`[data-stock-rows="${type}"] [data-stock-item-row]`);
      if (!firstRow) return;

      const name = firstRow.querySelector('[data-stock-item-name]');
      const servings = firstRow.querySelector('[data-stock-item-servings]');
      if ((name?.value || '').trim() || servings?.value) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      name?.focus();
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
