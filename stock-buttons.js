(() => {
  'use strict';

  const MEAL_STOCK_KEY = 'menuPromptGenerator.v5.mealStock';
  const OPTIONS = ['', '0', '1', '2', '3', '4'];
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
      soupRemaining: '',
      soupCanCook: '',
    };
  }

  function normalizeRemaining(value) {
    if (value === '' || value === null || value === undefined) return '';
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return '';
    return String(Math.min(4, Math.floor(number)));
  }

  function normalizeStock(value) {
    const out = blankStock();
    out.sideRemaining = normalizeRemaining(value?.sideRemaining);
    out.soupRemaining = normalizeRemaining(value?.soupRemaining);
    out.sideCanCook = ['可能', '不可'].includes(value?.sideCanCook) ? value.sideCanCook : '';
    out.soupCanCook = ['可能', '不可'].includes(value?.soupCanCook) ? value.soupCanCook : '';
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

  function stockLine(label, remaining, canCook) {
    const amount = remaining === '' ? '未入力' : `約${remaining}人前`;
    const cooking = canCook ? `新規作成${canCook}` : '新規作成未入力';
    return `${label}：残り${amount}／${cooking}`;
  }

  function stockText(dateKey = currentDateKey()) {
    const stock = normalizeStock(loadMealStocks()[dateKey]);
    return `【副菜・汁物の残量と調理可否】\n${stockLine('副菜', stock.sideRemaining, stock.sideCanCook)}\n${stockLine('汁物', stock.soupRemaining, stock.soupCanCook)}\n※夕食の副菜・汁物は、本人と同居大人の2人分を基準にしてください。子どもは原則として必要人数に含めません。\n※残量だけでは2人分に足りない場合、新規作成の可否を守って不足分を提案してください。\n※本人が食べない場合でも、同居大人分として必要な新しい副菜・汁物は提案してください。`;
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
      <p class="help">残りは0〜4をタップ。夕食は本人＋同居大人の2人分を基準にし、子どもは原則人数に含めない。</p>
      <div class="two-col">
        <div>
          <h3>副菜</h3>
          <div class="row">
            ${remainingButtons('sideRemaining', '副菜の残り')}
            <label for="sideCanCook">新規作成<select id="sideCanCook"><option value="">未入力</option><option>可能</option><option>不可</option></select></label>
          </div>
        </div>
        <div>
          <h3>汁物</h3>
          <div class="row">
            ${remainingButtons('soupRemaining', '汁物の残り')}
            <label for="soupCanCook">新規作成<select id="soupCanCook"><option value="">未入力</option><option>可能</option><option>不可</option></select></label>
          </div>
        </div>
      </div>`;
    planSection.before(section);
  }

  function renderGroup(id) {
    const input = document.getElementById(id);
    const group = document.querySelector(`[data-stock-group="${id}"]`);
    if (!input || !group) return;
    group.querySelectorAll('[data-stock-value]').forEach((button) => {
      const active = button.dataset.stockValue === input.value;
      button.classList.toggle('soft', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function readStockUI() {
    return normalizeStock({
      sideRemaining: document.getElementById('sideRemaining')?.value,
      sideCanCook: document.getElementById('sideCanCook')?.value,
      soupRemaining: document.getElementById('soupRemaining')?.value,
      soupCanCook: document.getElementById('soupCanCook')?.value,
    });
  }

  function writeStockUI() {
    const stock = normalizeStock(loadMealStocks()[currentDateKey()]);
    Object.entries(stock).forEach(([id, value]) => {
      const node = document.getElementById(id);
      if (node) node.value = value;
    });
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

  function init() {
    createStockSection();
    writeStockUI();
    refreshOutput();

    ['sideRemaining', 'soupRemaining'].forEach((id) => {
      const group = document.querySelector(`[data-stock-group="${id}"]`);
      group?.querySelectorAll('[data-stock-value]').forEach((button) => {
        button.addEventListener('click', () => {
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

    document.title = document.title.replace(/v5\.1\.\d+/, 'v5.1.10');
    const heading = document.querySelector('h1');
    if (heading) heading.textContent = heading.textContent.replace(/v5\.1\.\d+/, 'v5.1.10');
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
