(() => {
  'use strict';

  const APP_VERSION = 'v5.1.11';
  const MEAL_STOCK_KEY = 'menuPromptGenerator.v5.mealStock';
  const OPTIONS = ['', '0', '1', '2', '3', '4'];
  const ITEM_SERVINGS = ['', '1', '2', '3', '4'];
  const originalParse = JSON.parse.bind(JSON);
  const originalStringify = JSON.stringify.bind(JSON);
  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;
  const textareaValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');

  const pad = (value) => String(value).padStart(2, '0');
  const todayKey = () => {
    const date = new Date();
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };

  function blankStock() {
    return {
      sideRemaining: '',
      sideCanCook: '',
      sideItems: [],
      soupRemaining: '',
      soupCanCook: '',
      soupItems: [],
    };
  }

  function normalizeRemaining(value) {
    if (value === '' || value === null || value === undefined) return '';
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return '';
    return String(Math.min(4, Math.floor(number)));
  }

  function normalizeItemServings(value) {
    if (value === '' || value === null || value === undefined) return '';
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return '';
    return String(Math.min(4, Math.floor(number)));
  }

  function normalizeItems(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => ({
        name: String(item?.name || '').trim().slice(0, 120),
        servings: normalizeItemServings(item?.servings),
      }))
      .filter((item) => item.name || item.servings)
      .slice(0, 12);
  }

  function detailTotal(items) {
    return normalizeItems(items).reduce((sum, item) => {
      if (!item.name || !item.servings) return sum;
      return sum + Number(item.servings);
    }, 0);
  }

  function normalizeStock(value) {
    const out = blankStock();
    out.sideRemaining = normalizeRemaining(value?.sideRemaining);
    out.soupRemaining = normalizeRemaining(value?.soupRemaining);
    out.sideCanCook = ['可能', '不可'].includes(value?.sideCanCook) ? value.sideCanCook : '';
    out.soupCanCook = ['可能', '不可'].includes(value?.soupCanCook) ? value.soupCanCook : '';
    out.sideItems = normalizeItems(value?.sideItems);
    out.soupItems = normalizeItems(value?.soupItems);

    const sideTotal = detailTotal(out.sideItems);
    const soupTotal = detailTotal(out.soupItems);
    if (sideTotal > 0) out.sideRemaining = String(Math.min(4, sideTotal));
    if (soupTotal > 0) out.soupRemaining = String(Math.min(4, soupTotal));
    return out;
  }

  function loadMealStocks() {
    try {
      const raw = originalGetItem.call(localStorage, MEAL_STOCK_KEY);
      const parsed = raw ? originalParse(raw) : {};
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const out = {};
      Object.entries(parsed).forEach(([key, value]) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(key)) out[key] = normalizeStock(value);
      });
      return out;
    } catch (error) {
      console.warn('meal stock read failed', error);
      return {};
    }
  }

  function storeMealStocks(value) {
    try {
      originalSetItem.call(localStorage, MEAL_STOCK_KEY, originalStringify(value));
    } catch (error) {
      console.warn('meal stock write failed', error);
    }
  }

  function currentDateKey() {
    return document.getElementById('dateInput')?.value || todayKey();
  }

  function stockLine(label, remaining, canCook, items) {
    const total = detailTotal(items);
    const amount = total > 0
      ? `約${total}人前`
      : remaining === '' ? '未入力' : `約${remaining}人前`;
    const cooking = canCook ? `新規作成${canCook}` : '新規作成未入力';
    return `${label}：残り${amount}／${cooking}`;
  }

  function itemLines(items) {
    const normalized = normalizeItems(items).filter((item) => item.name);
    if (!normalized.length) return '';
    return `\n内訳：\n${normalized.map((item) => (
      item.servings ? `・${item.name} ${item.servings}人前` : `・${item.name}（人前未入力）`
    )).join('\n')}`;
  }

  function stockText(dateKey = currentDateKey()) {
    const stock = normalizeStock(loadMealStocks()[dateKey]);
    const side = `${stockLine('副菜', stock.sideRemaining, stock.sideCanCook, stock.sideItems)}${itemLines(stock.sideItems)}`;
    const soup = `${stockLine('汁物', stock.soupRemaining, stock.soupCanCook, stock.soupItems)}${itemLines(stock.soupItems)}`;
    return `【副菜・汁物の残量と調理可否】\n${side}\n${soup}\n※夕食の副菜・汁物は、本人と同居大人の2人分を基準にしてください。子どもは原則として必要人数に含めません。\n※残量だけでは2人分に足りない場合、新規作成の可否を守って不足分を提案してください。\n※本人が食べない場合でも、同居大人分として必要な新しい副菜・汁物は提案してください。`;
  }

  function injectStockText(value) {
    const text = String(value || '');
    if (!text.includes('【今日食べるもの】')) return text;
    const withoutOld = text.replace(/\n\n【副菜・汁物の残量と調理可否】[\s\S]*?(?=\n\n【使い切りを優先したいもの】)/, '');
    const marker = '\n\n【使い切りを優先したいもの】';
    if (!withoutOld.includes(marker)) return `${withoutOld}\n\n${stockText()}`;
    return withoutOld.replace(marker, `\n\n${stockText()}${marker}`);
  }

  if (textareaValue?.get && textareaValue?.set) {
    Object.defineProperty(HTMLTextAreaElement.prototype, 'value', {
      configurable: textareaValue.configurable,
      enumerable: textareaValue.enumerable,
      get: textareaValue.get,
      set(value) {
        const next = this.id === 'outputText' ? injectStockText(value) : value;
        return textareaValue.set.call(this, next);
      },
    });
  }

  JSON.stringify = function patchedStringify(value, replacer, space) {
    let next = value;
    if (value && typeof value === 'object' && value.version && value.drafts && value.history) {
      const mealStocks = loadMealStocks();
      if (value.type === 'month' && typeof value.month === 'string') {
        const subset = {};
        Object.entries(mealStocks).forEach(([key, stock]) => {
          if (key.startsWith(`${value.month}-`)) subset[key] = stock;
        });
        next = { ...value, mealStock: subset };
      } else {
        next = { ...value, mealStock: mealStocks };
      }
    }
    return originalStringify(next, replacer, space);
  };

  function remainingButtons(id, label) {
    return `
      <div>
        <div style="font-weight:700;font-size:14px">残り（約・人前）</div>
        <input id="${id}" type="hidden">
        <div class="buttons" role="group" aria-label="${label}" data-stock-group="${id}">
          ${OPTIONS.map((value) => `<button type="button" class="small" data-stock-value="${value}">${value === '' ? '未入力' : value}</button>`).join('')}
        </div>
      </div>`;
  }

  function itemEditor(type, label) {
    return `
      <div class="buttons" style="margin-top:10px">
        <button type="button" class="small" data-stock-toggle="${type}" aria-expanded="false">内訳を追加</button>
        <span class="mini" data-stock-total="${type}"></span>
      </div>
      <div data-stock-editor="${type}" hidden style="margin-top:8px">
        <p class="mini">${label}が複数あるときだけ入力。料理名と人前が揃った行から残量を自動計算する。</p>
        <div data-stock-rows="${type}"></div>
        <div class="buttons">
          <button type="button" class="small" data-stock-add="${type}">料理を追加</button>
        </div>
      </div>`;
  }

  function createStockSection() {
    if (document.getElementById('mealStockSection')) return;
    const planHeading = [...document.querySelectorAll('section > h2')]
      .find((heading) => heading.textContent.trim() === '食材・希望リスト');
    const planSection = planHeading?.closest('section');
    if (!planSection) return;

    const section = document.createElement('section');
    section.id = 'mealStockSection';
    section.innerHTML = `
      <h2>副菜・汁物の残り</h2>
      <p class="help">残りは0〜4をタップ。複数の料理がある日だけ「内訳を追加」を使う。</p>
      <div class="two-col">
        <div>
          <h3>副菜</h3>
          <div class="row">
            ${remainingButtons('sideRemaining', '副菜の残り')}
            <label for="sideCanCook">新規作成<select id="sideCanCook"><option value="">未入力</option><option>可能</option><option>不可</option></select></label>
          </div>
          ${itemEditor('side', '副菜')}
        </div>
        <div>
          <h3>汁物</h3>
          <div class="row">
            ${remainingButtons('soupRemaining', '汁物の残り')}
            <label for="soupCanCook">新規作成<select id="soupCanCook"><option value="">未入力</option><option>可能</option><option>不可</option></select></label>
          </div>
          ${itemEditor('soup', '汁物')}
        </div>
      </div>
      <p class="help" style="margin-top:10px">夕食は本人＋同居大人の2人分を基準にし、子どもは原則人数に含めない。</p>`;
    planSection.before(section);
  }

  function remainingId(type) {
    return type === 'side' ? 'sideRemaining' : 'soupRemaining';
  }

  function readItemsFromUI(type) {
    const rows = document.querySelectorAll(`[data-stock-rows="${type}"] [data-stock-item-row]`);
    return normalizeItems([...rows].map((row) => ({
      name: row.querySelector('[data-stock-item-name]')?.value,
      servings: row.querySelector('[data-stock-item-servings]')?.value,
    })));
  }

  function itemRow(type, item = { name: '', servings: '' }) {
    const row = document.createElement('div');
    row.dataset.stockItemRow = type;
    row.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) 92px auto;gap:7px;align-items:end;margin-top:7px';
    row.innerHTML = `
      <label>料理名<input type="text" data-stock-item-name maxlength="120" placeholder="例：ブロッコリーのおかか和え"></label>
      <label>人前<select data-stock-item-servings>${ITEM_SERVINGS.map((value) => `<option value="${value}">${value || '未入力'}</option>`).join('')}</select></label>
      <button type="button" class="small danger" data-stock-remove="${type}" aria-label="この内訳を削除">削除</button>`;
    row.querySelector('[data-stock-item-name]').value = item.name || '';
    row.querySelector('[data-stock-item-servings]').value = item.servings || '';
    return row;
  }

  function setEditorOpen(type, open) {
    const editor = document.querySelector(`[data-stock-editor="${type}"]`);
    const toggle = document.querySelector(`[data-stock-toggle="${type}"]`);
    if (!editor || !toggle) return;
    editor.hidden = !open;
    toggle.textContent = open ? '内訳を閉じる' : '内訳を追加';
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function renderItems(type, items, open = false) {
    const rows = document.querySelector(`[data-stock-rows="${type}"]`);
    if (!rows) return;
    rows.replaceChildren();
    normalizeItems(items).forEach((item) => rows.append(itemRow(type, item)));
    setEditorOpen(type, open || normalizeItems(items).length > 0);
    renderDetailState(type);
  }

  function renderGroup(id) {
    const input = document.getElementById(id);
    const group = document.querySelector(`[data-stock-group="${id}"]`);
    if (!input || !group) return;
    const type = id.startsWith('side') ? 'side' : 'soup';
    const total = detailTotal(readItemsFromUI(type));
    group.querySelectorAll('[data-stock-value]').forEach((button) => {
      const active = button.dataset.stockValue === input.value;
      button.classList.toggle('soft', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.disabled = total > 0;
      button.title = total > 0 ? '内訳から自動計算中' : '';
    });
  }

  function renderDetailState(type) {
    const items = readItemsFromUI(type);
    const total = detailTotal(items);
    const totalNode = document.querySelector(`[data-stock-total="${type}"]`);
    const remaining = document.getElementById(remainingId(type));
    if (total > 0 && remaining) remaining.value = String(Math.min(4, total));
    if (totalNode) {
      if (!items.length) totalNode.textContent = '';
      else if (total > 0) totalNode.textContent = `内訳合計：約${total}人前（自動）`;
      else totalNode.textContent = '内訳を入力中';
    }
    renderGroup(remainingId(type));
  }

  function readStockUI() {
    return normalizeStock({
      sideRemaining: document.getElementById('sideRemaining')?.value,
      sideCanCook: document.getElementById('sideCanCook')?.value,
      sideItems: readItemsFromUI('side'),
      soupRemaining: document.getElementById('soupRemaining')?.value,
      soupCanCook: document.getElementById('soupCanCook')?.value,
      soupItems: readItemsFromUI('soup'),
    });
  }

  function writeStockUI() {
    const stock = normalizeStock(loadMealStocks()[currentDateKey()]);
    ['sideRemaining', 'sideCanCook', 'soupRemaining', 'soupCanCook'].forEach((id) => {
      const node = document.getElementById(id);
      if (node) node.value = stock[id];
    });
    renderItems('side', stock.sideItems);
    renderItems('soup', stock.soupItems);
    renderGroup('sideRemaining');
    renderGroup('soupRemaining');
  }

  function refreshOutput() {
    const output = document.getElementById('outputText');
    if (!output || !textareaValue?.get || !textareaValue?.set) return;
    textareaValue.set.call(output, injectStockText(textareaValue.get.call(output)));
  }

  function saveStockUI() {
    const stocks = loadMealStocks();
    stocks[currentDateKey()] = readStockUI();
    storeMealStocks(stocks);
    refreshOutput();
    const status = document.getElementById('saveStatus');
    if (status) status.textContent = '下書き保存済み';
  }

  function loadImportedStock(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = originalParse(reader.result);
        if (data?.mealStock && typeof data.mealStock === 'object') {
          const current = loadMealStocks();
          Object.entries(data.mealStock).forEach(([key, value]) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(key)) current[key] = normalizeStock(value);
          });
          storeMealStocks(current);
        }
      } catch (error) {
        console.warn('meal stock import failed', error);
      }
    };
    reader.readAsText(file);
  }

  function bindItemEditor() {
    const section = document.getElementById('mealStockSection');
    if (!section) return;

    section.addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-stock-toggle]');
      if (toggle) {
        const type = toggle.dataset.stockToggle;
        const editor = document.querySelector(`[data-stock-editor="${type}"]`);
        const nextOpen = editor?.hidden ?? true;
        setEditorOpen(type, nextOpen);
        if (nextOpen && !document.querySelector(`[data-stock-rows="${type}"] [data-stock-item-row]`)) {
          document.querySelector(`[data-stock-rows="${type}"]`)?.append(itemRow(type));
        }
        renderDetailState(type);
        return;
      }

      const add = event.target.closest('[data-stock-add]');
      if (add) {
        const type = add.dataset.stockAdd;
        const rows = document.querySelector(`[data-stock-rows="${type}"]`);
        if (rows && rows.children.length < 12) rows.append(itemRow(type));
        renderDetailState(type);
        return;
      }

      const remove = event.target.closest('[data-stock-remove]');
      if (remove) {
        const type = remove.dataset.stockRemove;
        remove.closest('[data-stock-item-row]')?.remove();
        renderDetailState(type);
        saveStockUI();
      }
    });

    section.addEventListener('input', (event) => {
      const row = event.target.closest('[data-stock-item-row]');
      if (!row) return;
      const type = row.dataset.stockItemRow;
      renderDetailState(type);
      saveStockUI();
    });

    section.addEventListener('change', (event) => {
      const row = event.target.closest('[data-stock-item-row]');
      if (!row) return;
      const type = row.dataset.stockItemRow;
      renderDetailState(type);
      saveStockUI();
    });
  }

  function init() {
    createStockSection();
    writeStockUI();
    refreshOutput();
    bindItemEditor();

    ['sideRemaining', 'soupRemaining'].forEach((id) => {
      const group = document.querySelector(`[data-stock-group="${id}"]`);
      group?.querySelectorAll('[data-stock-value]').forEach((button) => {
        button.addEventListener('click', () => {
          if (button.disabled) return;
          const input = document.getElementById(id);
          if (!input) return;
          input.value = button.dataset.stockValue;
          renderGroup(id);
          saveStockUI();
        });
      });
    });

    ['sideCanCook', 'soupCanCook'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', saveStockUI);
    });

    ['prevDay', 'nextDay', 'todayBtn'].forEach((id) => {
      document.getElementById(id)?.addEventListener('click', () => setTimeout(() => {
        writeStockUI();
        refreshOutput();
      }, 0));
    });
    document.getElementById('dateInput')?.addEventListener('change', () => setTimeout(() => {
      writeStockUI();
      refreshOutput();
    }, 0));

    document.title = document.title.replace(/v5\.1\.\d+/, APP_VERSION);
    const heading = document.querySelector('h1');
    if (heading) heading.textContent = heading.textContent.replace(/v5\.1\.\d+/, APP_VERSION);
  }

  document.addEventListener('change', (event) => {
    if (event.target?.id !== 'importFile' || !event.target.files?.length) return;
    loadImportedStock(event.target.files[0]);
    setTimeout(() => location.reload(), 900);
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
