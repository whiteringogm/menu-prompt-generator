(() => {
  'use strict';

  const APP_VERSION = 'v5.1.16';
  const EXPIRY_TAG = '期限注意';
  const WEEKLY_TAG = '今週の候補';
  const EXPIRY_IDS_KEY = 'menuPromptGenerator.v5.expiryPlanIds';
  const PLANS_KEY = 'menuPromptGenerator.v5.planItems';
  const SERVING_VALUES = ['', '1', '2', '3', '4'];
  const originalParse = JSON.parse.bind(JSON);
  const originalStringify = JSON.stringify.bind(JSON);
  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;
  const textareaValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  let expiryIds = loadExpiryIds();
  let planDecorateQueued = false;
  let stockDecorateQueued = false;

  const NEW_STANDARD_PROMPT = `以下をもとに、ダイエット相談メモ.txtと常備在庫表.txtを参照し、未定部分と足りていない部分を提案してください。
済のものは変更しないでください。
夕食の主菜は、昨日と重なりすぎないようにしてください。

「今日中」は、今日の献立で使用してください。
「近日中」は数日以内に使いたいものですが、今日一日で使い切ったり、昼と夕の両方へ無理に詰め込んだりしないでください。

「期限注意」は、期限切れ・期限間近など、状態確認のうえで使用する予定のものです。今日中・近日中ほど急ぎませんが、「今週の候補」より一段優先して採用を検討してください。期限切れの場合は、状態確認を前提にしてください。

「今週の候補」は、現在ある食材の共有用です。同じ区分内では、上にあるものほど傷みやすさなどから先に使いたい順です。ただし今日使う義務はなく、未定部分に自然に合う候補が複数ある場合の判断材料としてのみ使用してください。在庫を減らすこと自体を献立の目的にしないでください。

「願望」は、食べたい気持ちとして可能な範囲で考慮してください。
「今日だけ使わないもの」は、在庫・候補・願望としてリストに残っていますが、今日の献立には使用しないでください。
避けたいもの・在庫切れは使わないでください。

副菜や汁物に少量含まれる肉・魚・卵・豆腐は、主菜一品分のたんぱく質として数えないでください。鍋全体の使用量ではなく、一人分に入る量で判断してください。

回答の最後に、朝・昼・夕・間食をそれぞれ1行で書いてコードブロックでください。`;

  function loadExpiryIds() {
    try {
      const raw = originalGetItem.call(localStorage, EXPIRY_IDS_KEY);
      const parsed = raw ? originalParse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch (error) {
      console.warn('expiry plan ids read failed', error);
      return new Set();
    }
  }

  function storeExpiryIds() {
    try {
      originalSetItem.call(localStorage, EXPIRY_IDS_KEY, originalStringify([...expiryIds]));
    } catch (error) {
      console.warn('expiry plan ids write failed', error);
    }
  }

  function storedPlans() {
    try {
      const raw = originalGetItem.call(localStorage, PLANS_KEY);
      const parsed = raw ? originalParse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function expiryNames() {
    return storedPlans()
      .filter((item) => expiryIds.has(String(item?.id || '')))
      .map((item) => String(item?.name || '').trim())
      .filter(Boolean);
  }

  function setVersion() {
    document.title = document.title.replace(/v5\.1\.\d+/g, APP_VERSION);
    const heading = document.querySelector('h1');
    if (heading) heading.textContent = heading.textContent.replace(/v5\.1\.\d+/g, APP_VERSION);
  }

  function ensureOption(select, value, beforeValue = null) {
    if (!select || [...select.options].some((option) => option.value === value)) return;
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    const before = beforeValue
      ? [...select.options].find((entry) => entry.value === beforeValue)
      : null;
    if (before) select.insertBefore(option, before);
    else select.append(option);
  }

  function planGroup(tag) {
    return [...document.querySelectorAll('#planGroups > .plan-group')]
      .find((group) => group.querySelector(':scope > h3')?.textContent.trim().startsWith(tag));
  }

  function ensureExpiryGroup() {
    const root = document.getElementById('planGroups');
    if (!root) return null;
    let group = planGroup(EXPIRY_TAG);
    if (group) return group;

    group = document.createElement('div');
    group.className = 'plan-group';
    group.dataset.expiryGroup = '1';
    group.innerHTML = `<h3>${EXPIRY_TAG}<span class="count">0</span></h3><div><div class="empty">未登録</div></div>`;
    const weekly = planGroup(WEEKLY_TAG);
    if (weekly) root.insertBefore(group, weekly);
    else root.append(group);
    return group;
  }

  function groupBody(group) {
    return group?.querySelector(':scope > div');
  }

  function updateGroupCount(group) {
    if (!group) return;
    const body = groupBody(group);
    const rows = body ? [...body.children].filter((node) => node.classList?.contains('item')) : [];
    const count = group.querySelector(':scope > h3 .count');
    if (count && count.textContent !== String(rows.length)) count.textContent = String(rows.length);
    const empty = body?.querySelector(':scope > .empty');
    if (rows.length && empty) empty.remove();
    if (!rows.length && body && !empty) body.innerHTML = '<div class="empty">未登録</div>';
  }

  function decoratePlans() {
    planDecorateQueued = false;
    const root = document.getElementById('planGroups');
    const addSelect = document.getElementById('planTag');
    if (!root || !addSelect) return;

    ensureOption(addSelect, EXPIRY_TAG, WEEKLY_TAG);
    const expiryGroup = ensureExpiryGroup();
    const expiryBody = groupBody(expiryGroup);
    const weeklyGroup = planGroup(WEEKLY_TAG);
    const weeklyBody = groupBody(weeklyGroup);
    const visibleIds = new Set();

    root.querySelectorAll('.item [data-plan-tag]').forEach((select) => {
      const id = String(select.dataset.planTag || '');
      if (!id) return;
      visibleIds.add(id);
      ensureOption(select, EXPIRY_TAG, WEEKLY_TAG);
      const row = select.closest('.item');
      if (!row) return;

      if (expiryIds.has(id)) {
        select.value = EXPIRY_TAG;
        row.querySelector('[data-plan-order-controls]')?.remove();
        row.querySelector('.item-actions')?.removeAttribute('data-plan-order-actions');
        if (expiryBody && row.parentElement !== expiryBody) expiryBody.append(row);
      } else if (select.value === EXPIRY_TAG) {
        select.value = WEEKLY_TAG;
        if (weeklyBody && row.parentElement !== weeklyBody) weeklyBody.append(row);
      }
    });

    let changed = false;
    [...expiryIds].forEach((id) => {
      if (!visibleIds.has(id) && !storedPlans().some((item) => String(item?.id || '') === id)) {
        expiryIds.delete(id);
        changed = true;
      }
    });
    if (changed) storeExpiryIds();

    updateGroupCount(expiryGroup);
    updateGroupCount(weeklyGroup);
    setVersion();
  }

  function queuePlanDecorate() {
    if (planDecorateQueued) return;
    planDecorateQueued = true;
    requestAnimationFrame(decoratePlans);
  }

  function markNewExpiry(beforeIds) {
    const after = [...document.querySelectorAll('#planGroups [data-plan-tag]')]
      .map((select) => String(select.dataset.planTag || ''))
      .filter(Boolean);
    const newId = after.find((id) => !beforeIds.has(id));
    if (!newId) return;
    expiryIds.add(newId);
    storeExpiryIds();
  }

  function expiryInstruction(text) {
    if (!text.includes('「今日中」は') || text.includes('「期限注意」は')) return text;
    const instruction = '「期限注意」は、期限切れ・期限間近など、状態確認のうえで使用する予定のものです。今日中・近日中ほど急ぎませんが、「今週の候補」より一段優先して採用を検討してください。期限切れの場合は、状態確認を前提にしてください。';
    if (text.includes('\n\n「今週の候補」は')) {
      return text.replace('\n\n「今週の候補」は', `\n\n${instruction}\n\n「今週の候補」は`);
    }
    return text;
  }

  function injectExpiryText(value) {
    let text = String(value || '');
    text = text.replace(/\n\n【期限注意】\n[^\n]*(?=\n\n【今週の候補】)/, '');
    text = expiryInstruction(text);

    const match = text.match(/【今週の候補】\n([^\n]*)/);
    if (!match) return text;
    const weekly = match[1] === 'なし' ? [] : match[1].split('、').map((name) => name.trim()).filter(Boolean);
    const expirySet = new Set(expiryNames());
    const activeExpiry = weekly.filter((name) => expirySet.has(name));
    const remainingWeekly = weekly.filter((name) => !expirySet.has(name));
    const replacement = `【期限注意】\n${activeExpiry.length ? activeExpiry.join('、') : 'なし'}\n\n【今週の候補】\n${remainingWeekly.length ? remainingWeekly.join('、') : 'なし'}`;
    return text.replace(/【今週の候補】\n[^\n]*/, replacement);
  }

  function patchOutput() {
    if (!textareaValue?.get || !textareaValue?.set) return;
    Object.defineProperty(HTMLTextAreaElement.prototype, 'value', {
      configurable: textareaValue.configurable,
      enumerable: textareaValue.enumerable,
      get: textareaValue.get,
      set(value) {
        const next = this.id === 'outputText' ? injectExpiryText(value) : value;
        return textareaValue.set.call(this, next);
      },
    });
  }

  function refreshOutput() {
    const output = document.getElementById('outputText');
    if (output) output.value = output.value;
  }

  function upgradePrompt(force = false) {
    const field = document.getElementById('promptText');
    if (!field) return;
    const value = field.value.trim();
    const looksLikeOldStandard = value.startsWith('以下をもとに、ダイエット相談メモ.txtと常備在庫表.txtを参照し')
      && value.includes('「今日中」は、今日の献立で使用してください。')
      && value.includes('最終回答は、朝・昼・夕・間食をそれぞれ1行で書いてください。')
      && !value.includes('「期限注意」は');
    if (!force && !looksLikeOldStandard) return;
    field.value = NEW_STANDARD_PROMPT;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function servingLabel(select) {
    return select.closest('label');
  }

  function renderServingButtons(select) {
    const group = select.parentElement?.querySelector('[data-serving-button-group]');
    if (!group) return;
    group.querySelectorAll('[data-serving-value]').forEach((button) => {
      const active = button.dataset.servingValue === select.value;
      button.classList.toggle('soft', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function decorateServingSelect(select) {
    if (!select || select.dataset.buttonsInstalled === '1') {
      if (select) renderServingButtons(select);
      return;
    }
    select.dataset.buttonsInstalled = '1';
    select.hidden = true;
    const label = servingLabel(select);
    if (!label) return;
    label.dataset.stockServingLabel = '1';
    const group = document.createElement('div');
    group.className = 'buttons serving-button-group';
    group.dataset.servingButtonGroup = '1';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', '残り人前');
    SERVING_VALUES.forEach((value) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'small';
      button.dataset.servingValue = value;
      button.textContent = value || '未';
      button.addEventListener('click', () => {
        select.value = value;
        renderServingButtons(select);
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      group.append(button);
    });
    label.append(group);
    renderServingButtons(select);
  }

  function cookSelect(id) {
    return document.getElementById(id);
  }

  function syncCookToggle(id) {
    const select = cookSelect(id);
    if (!select) return;
    if (!select.value) {
      select.value = '不可';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const checkbox = document.querySelector(`[data-cook-toggle="${id}"]`);
    if (checkbox) checkbox.checked = select.value === '可能';
  }

  function decorateCookSelect(select) {
    if (!select || select.dataset.toggleInstalled === '1') {
      if (select) syncCookToggle(select.id);
      return;
    }
    select.dataset.toggleInstalled = '1';
    const originalLabel = select.closest('label');
    if (!originalLabel) return;
    originalLabel.hidden = true;

    const wrap = document.createElement('div');
    wrap.className = 'cook-toggle-wrap';
    wrap.innerHTML = `
      <div style="font-weight:700;font-size:14px">新規作成</div>
      <div class="switch-line" style="margin-top:6px">
        <span>不可</span>
        <label class="switch">
          <input type="checkbox" data-cook-toggle="${select.id}">
          <span class="track"></span>
        </label>
        <span>可能</span>
      </div>`;
    originalLabel.insertAdjacentElement('afterend', wrap);
    const checkbox = wrap.querySelector('[data-cook-toggle]');
    checkbox.addEventListener('change', () => {
      select.value = checkbox.checked ? '可能' : '不可';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    syncCookToggle(select.id);
  }

  function installStockStyles() {
    if (document.getElementById('ux-v516-style')) return;
    const style = document.createElement('style');
    style.id = 'ux-v516-style';
    style.textContent = `
      .serving-button-group{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr));gap:3px;margin-top:5px!important}
      .serving-button-group button{min-width:0;padding:5px 4px;white-space:nowrap}
      [data-stock-serving-label]{min-width:150px}
      .cook-toggle-wrap{min-width:150px}
      @media(max-width:520px){
        [data-stock-item-row]{grid-template-columns:minmax(0,1fr) auto!important}
        [data-stock-item-row] > label:first-child{grid-column:1/-1}
        [data-stock-serving-label]{grid-column:1/2;min-width:0}
      }
    `;
    document.head.append(style);
  }

  function decorateStock() {
    stockDecorateQueued = false;
    installStockStyles();
    document.querySelectorAll('[data-stock-item-servings]').forEach(decorateServingSelect);
    ['sideCanCook', 'soupCanCook'].forEach((id) => decorateCookSelect(cookSelect(id)));
    setVersion();
  }

  function queueStockDecorate() {
    if (stockDecorateQueued) return;
    stockDecorateQueued = true;
    requestAnimationFrame(decorateStock);
  }

  function importExpiryIds(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = originalParse(reader.result);
        if (!Array.isArray(data?.expiryPlanIds)) return;
        expiryIds = new Set(data.expiryPlanIds.map(String));
        storeExpiryIds();
      } catch (error) {
        console.warn('expiry ids import failed', error);
      }
    };
    reader.readAsText(file);
  }

  function patchBackup() {
    JSON.stringify = function patchedStringify(value, replacer, space) {
      let next = value;
      if (value && typeof value === 'object' && value.version && value.drafts && value.history) {
        next = { ...value, expiryPlanIds: [...expiryIds] };
      }
      return originalStringify(next, replacer, space);
    };
  }

  function bind() {
    document.addEventListener('click', (event) => {
      const add = event.target.closest('#addPlan');
      if (add) {
        const select = document.getElementById('planTag');
        if (select?.value === EXPIRY_TAG) {
          const beforeIds = new Set([...document.querySelectorAll('#planGroups [data-plan-tag]')]
            .map((node) => String(node.dataset.planTag || ''))
            .filter(Boolean));
          select.value = WEEKLY_TAG;
          setTimeout(() => {
            markNewExpiry(beforeIds);
            ensureOption(select, EXPIRY_TAG, WEEKLY_TAG);
            select.value = EXPIRY_TAG;
            queuePlanDecorate();
            refreshOutput();
          }, 0);
        }
      }

      if (event.target.closest('#resetPrompt')) {
        setTimeout(() => upgradePrompt(true), 0);
      }
    }, true);

    document.addEventListener('change', (event) => {
      const select = event.target.closest('#planGroups [data-plan-tag]');
      if (select) {
        const id = String(select.dataset.planTag || '');
        if (select.value === EXPIRY_TAG) {
          expiryIds.add(id);
          storeExpiryIds();
          select.value = WEEKLY_TAG;
        } else if (expiryIds.has(id)) {
          expiryIds.delete(id);
          storeExpiryIds();
        }
        setTimeout(() => {
          queuePlanDecorate();
          refreshOutput();
        }, 0);
      }

      if (event.target?.id === 'importFile' && event.target.files?.length) {
        importExpiryIds(event.target.files[0]);
      }

      if (['sideCanCook', 'soupCanCook'].includes(event.target?.id)) {
        syncCookToggle(event.target.id);
      }
    }, true);

    ['prevDay', 'nextDay', 'todayBtn'].forEach((id) => {
      document.getElementById(id)?.addEventListener('click', () => setTimeout(() => {
        queuePlanDecorate();
        queueStockDecorate();
      }, 0));
    });
    document.getElementById('dateInput')?.addEventListener('change', () => setTimeout(() => {
      queuePlanDecorate();
      queueStockDecorate();
    }, 0));

    const plans = document.getElementById('planGroups');
    if (plans) new MutationObserver(queuePlanDecorate).observe(plans, { childList: true, subtree: true });
    const stock = document.getElementById('mealStockSection');
    if (stock) new MutationObserver(queueStockDecorate).observe(stock, { childList: true, subtree: true });
  }

  function init() {
    patchOutput();
    patchBackup();
    upgradePrompt(false);
    bind();
    queuePlanDecorate();
    queueStockDecorate();
    refreshOutput();
    setVersion();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0), { once: true });
  } else {
    setTimeout(init, 0);
  }
})();
