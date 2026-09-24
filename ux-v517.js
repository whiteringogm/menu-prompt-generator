(() => {
  'use strict';

  const APP_VERSION = 'v5.1.17';
  const HISTORY_KEY = 'menuPromptGenerator.v5.history';
  const PLANS_KEY = 'menuPromptGenerator.v5.planItems';
  const WEEKLY_TAG = '今週の候補';
  const HISTORY_COLLAPSED = 3;
  const HISTORY_MAX = 31;
  const MEALS = [
    ['breakfast', '朝'],
    ['lunch', '昼'],
    ['dinner', '夕'],
    ['snack', '間食'],
  ];
  let historyExpanded = false;
  let historyDecorateQueued = false;
  let planDecorateQueued = false;
  let arrangeAttempts = 0;
  let dragState = null;

  const $ = (id) => document.getElementById(id);
  const pad = (value) => String(value).padStart(2, '0');

  function addDays(key, amount) {
    const parts = String(key || '').split('-').map(Number);
    if (parts.length !== 3 || !parts.every(Number.isFinite)) return '';
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    date.setDate(date.getDate() + amount);
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function displayDate(key) {
    const parts = String(key || '').split('-').map(Number);
    if (parts.length !== 3 || !parts.every(Number.isFinite)) return '';
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    const weekday = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
    return parts[1] + '月' + parts[2] + '日(' + weekday + ')';
  }

  function currentDateKey() {
    const input = $('dateInput');
    if (input && input.value) return input.value;
    const now = new Date();
    return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  }

  function readObject(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '');
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function setVersion() {
    document.title = document.title.replace(/v5\.1\.\d+/g, APP_VERSION);
    const heading = document.querySelector('h1');
    if (heading) heading.textContent = heading.textContent.replace(/v5\.1\.\d+/g, APP_VERSION);
  }

  function installStyles() {
    if ($('ux-v517-style')) return;
    const style = document.createElement('style');
    style.id = 'ux-v517-style';
    style.textContent = [
      '@media(min-width:900px){.layout{display:block!important;max-width:860px;margin:0 auto}.secondary{display:none!important}.primary-column{width:100%}}',
      '.meal-input-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px}',
      '.meal-input-heading label{margin:0}',
      '.meal-input-heading [data-register-usual]{flex:0 0 auto;min-height:32px;padding:4px 9px;font-size:12px}',
      '.history-edit-panel{margin-top:9px;padding-top:9px;border-top:1px dashed var(--line)}',
      '.history-edit-grid{display:grid;gap:7px}',
      '.history-more-controls{margin:8px 0 2px}',
      '.candidate-drag-handle{cursor:grab;touch-action:none;user-select:none;font-size:18px;line-height:1;min-width:42px}',
      '.candidate-drag-handle:active{cursor:grabbing}',
      '.candidate-dragging{opacity:.72;outline:2px solid var(--accent);outline-offset:2px}',
      '[data-plan-order-controls]{display:none!important}',
      '@media(max-width:520px){.candidate-drag-handle{order:-1}.item-actions[data-plan-order-actions]{display:flex!important}.item-actions[data-plan-order-actions] button{width:auto!important;flex:1 1 auto}}'
    ].join('\n');
    document.head.append(style);
  }

  function findDetails(text) {
    return [...document.querySelectorAll('details.card')].find((details) => (
      details.querySelector(':scope > summary')?.textContent.trim() === text
    )) || null;
  }

  function arrangeSections() {
    const primary = document.querySelector('.primary-column');
    if (!primary) return false;
    const nodes = [
      $('dateDisplay')?.closest('section'),
      $('yesterdayEdit')?.closest('section'),
      findDetails('保存履歴'),
      $('mealStockSection'),
      $('planName')?.closest('section'),
      $('meals')?.closest('section'),
      $('dailyNote')?.closest('section'),
      $('outputText')?.closest('section'),
      $('finalMenu')?.closest('section'),
      findDetails('いつものメニュー編集'),
      findDetails('常備在庫表'),
      findDetails('JSONバックアップ'),
    ];
    if (nodes.some((node) => !node)) return false;
    nodes.forEach((node) => primary.append(node));
    const secondary = document.querySelector('.secondary');
    if (secondary) secondary.hidden = true;
    return true;
  }

  function scheduleArrange() {
    if (arrangeSections()) return;
    arrangeAttempts += 1;
    if (arrangeAttempts < 40) setTimeout(scheduleArrange, 50);
  }

  function updateYesterdayHeading() {
    const section = $('yesterdayEdit')?.closest('section');
    const heading = section?.querySelector(':scope > h2');
    if (!heading) return;
    const key = addDays(currentDateKey(), -1);
    heading.textContent = '昨日食べたもの（' + displayDate(key) + '）';
  }

  function removeSameAllMeals() {
    const button = $('sameAllMeals');
    if (!button) return;
    const row = button.closest('.buttons');
    button.remove();
    if (row && !row.children.length) row.remove();
  }

  function moveUsualRegisterButtons() {
    document.querySelectorAll('[data-register-usual]').forEach((button) => {
      const key = button.dataset.registerUsual;
      const field = $(key + 'Text');
      const inputWrap = field?.parentElement;
      const label = inputWrap?.querySelector('label[for="' + key + 'Text"]');
      if (!inputWrap || !label) return;

      let heading = inputWrap.querySelector(':scope > .meal-input-heading');
      if (!heading) {
        heading = document.createElement('div');
        heading.className = 'meal-input-heading';
        label.before(heading);
        heading.append(label);
      }

      button.textContent = 'いつものに登録';
      button.classList.add('soft');
      heading.append(button);

      const oldRow = button.closest('.meal-card')?.querySelector('.buttons');
      if (oldRow && !oldRow.children.length) oldRow.remove();
    });
  }

  function historyKeyForEntry(entry) {
    const button = entry.querySelector('[data-history-view],[data-extra-history-view]');
    return button?.dataset.historyView || button?.dataset.extraHistoryView || '';
  }

  function ensureHistoryEditButton(entry) {
    const key = historyKeyForEntry(entry);
    if (!key || entry.querySelector('[data-history-edit]')) return;
    const buttons = entry.querySelector('.buttons');
    if (!buttons) return;
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'small soft';
    edit.dataset.historyEdit = key;
    edit.textContent = '編集';
    const danger = buttons.querySelector('.danger');
    if (danger) buttons.insertBefore(edit, danger);
    else buttons.append(edit);
  }

  function updateHistoryVisibility() {
    const root = $('historyList');
    if (!root) return;
    const entries = [...root.querySelectorAll(':scope > .history-entry')].slice(0, HISTORY_MAX);
    entries.forEach((entry, index) => {
      entry.hidden = !historyExpanded && index >= HISTORY_COLLAPSED;
    });
    let controls = $('historyMoreControls');
    if (!controls) {
      controls = document.createElement('div');
      controls.id = 'historyMoreControls';
      controls.className = 'buttons history-more-controls';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'small';
      button.dataset.historyMore = '1';
      controls.append(button);
      root.after(controls);
    }
    const more = controls.querySelector('[data-history-more]');
    if (entries.length <= HISTORY_COLLAPSED) {
      controls.hidden = true;
    } else {
      controls.hidden = false;
      more.textContent = historyExpanded
        ? '3日分に戻す'
        : 'さらに表示（最大' + Math.min(HISTORY_MAX, entries.length) + '日分）';
    }
  }

  function decorateHistory() {
    historyDecorateQueued = false;
    const root = $('historyList');
    if (!root) return;
    root.querySelectorAll(':scope > .history-entry').forEach(ensureHistoryEditButton);
    updateHistoryVisibility();
  }

  function queueHistoryDecorate() {
    if (historyDecorateQueued) return;
    historyDecorateQueued = true;
    requestAnimationFrame(decorateHistory);
  }

  function historyRecord(key) {
    return readObject(HISTORY_KEY, {})[key] || null;
  }

  function openHistoryEditor(key, entry) {
    entry.querySelector('[data-history-edit-panel]')?.remove();
    const record = historyRecord(key);
    if (!record) return;
    const panel = document.createElement('div');
    panel.className = 'history-edit-panel';
    panel.dataset.historyEditPanel = key;
    const grid = document.createElement('div');
    grid.className = 'history-edit-grid';
    MEALS.forEach(([mealKey, label]) => {
      const wrap = document.createElement('label');
      wrap.textContent = label;
      const input = document.createElement('textarea');
      input.rows = 2;
      input.dataset.historyMeal = mealKey;
      input.value = String(record.meals?.[mealKey] || '');
      wrap.append(input);
      grid.append(wrap);
    });
    const actions = document.createElement('div');
    actions.className = 'buttons';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'small primary';
    save.dataset.historyEditSave = key;
    save.textContent = '保存';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'small';
    cancel.dataset.historyEditCancel = '1';
    cancel.textContent = 'キャンセル';
    actions.append(save, cancel);
    panel.append(grid, actions);
    entry.append(panel);
    panel.querySelector('textarea')?.focus();
  }

  function saveHistoryEdit(key, panel) {
    const history = readObject(HISTORY_KEY, {});
    const existing = history[key];
    if (!existing) return;
    const meals = {};
    MEALS.forEach(([mealKey]) => {
      meals[mealKey] = panel.querySelector('[data-history-meal="' + mealKey + '"]')?.value.trim() || '';
    });
    const rawText = MEALS.map(([mealKey, label]) => label + '：' + (meals[mealKey] || '未定')).join('\n');
    history[key] = Object.assign({}, existing, {
      meals,
      rawText,
      savedAt: new Date().toISOString(),
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    const status = $('saveStatus');
    if (status) status.textContent = '履歴を更新済み';
    setTimeout(() => location.reload(), 180);
  }

  function candidateGroup() {
    return [...document.querySelectorAll('#planGroups > .plan-group')].find((group) => (
      group.querySelector(':scope > h3')?.textContent.trim().startsWith(WEEKLY_TAG)
    )) || null;
  }

  function candidateRows() {
    const group = candidateGroup();
    if (!group) return [];
    return [...group.querySelectorAll(':scope > div > .item')].filter((row) => {
      const select = row.querySelector('[data-plan-tag]');
      return select?.value === WEEKLY_TAG && !row.querySelector('[data-plan-save]');
    });
  }

  function decorateCandidateDrag() {
    planDecorateQueued = false;
    const rows = candidateRows();
    rows.forEach((row) => {
      const actions = row.querySelector('.item-actions');
      const select = row.querySelector('[data-plan-tag]');
      const id = select?.dataset.planTag;
      if (!actions || !id) return;
      actions.dataset.planOrderActions = '1';
      let handle = row.querySelector('[data-candidate-drag]');
      if (!handle) {
        handle = document.createElement('button');
        handle.type = 'button';
        handle.className = 'small candidate-drag-handle';
        handle.dataset.candidateDrag = id;
        handle.textContent = '≡';
        handle.title = '長押しして並べ替え';
        handle.setAttribute('aria-label', '長押しして今週の候補を並べ替え');
        actions.prepend(handle);
      } else {
        handle.dataset.candidateDrag = id;
      }
    });
    const note = candidateGroup()?.querySelector('[data-plan-order-note]');
    if (note) note.textContent = '上にあるものほど先に使いたい順。≡を長押しして好きな位置へ移動できる。';
  }

  function queueCandidateDecorate() {
    if (planDecorateQueued) return;
    planDecorateQueued = true;
    requestAnimationFrame(decorateCandidateDrag);
  }

  function persistCandidateOrder() {
    const rows = candidateRows();
    const orderedIds = rows.map((row) => row.querySelector('[data-plan-tag]')?.dataset.planTag).filter(Boolean);
    if (orderedIds.length < 2) return;
    try {
      const items = JSON.parse(localStorage.getItem(PLANS_KEY) || '[]');
      if (!Array.isArray(items)) return;
      const idSet = new Set(orderedIds.map(String));
      const byId = new Map(items.filter((item) => idSet.has(String(item?.id || ''))).map((item) => [String(item.id), item]));
      const positions = items.map((item, index) => idSet.has(String(item?.id || '')) ? index : -1).filter((index) => index >= 0);
      if (positions.length !== orderedIds.length) return;
      orderedIds.forEach((id, index) => {
        items[positions[index]] = byId.get(String(id));
      });
      localStorage.setItem(PLANS_KEY, JSON.stringify(items));
      const status = $('saveStatus');
      if (status) status.textContent = '並び順を保存済み';
      setTimeout(() => location.reload(), 450);
    } catch (error) {
      console.warn('candidate drag save failed', error);
    }
  }

  function startCandidateDrag(handle, event) {
    const row = handle.closest('.item');
    if (!row) return;
    const originX = event.clientX;
    const originY = event.clientY;
    const pointerId = event.pointerId;
    const timer = setTimeout(() => {
      if (!dragState || dragState.pointerId !== pointerId) return;
      dragState.active = true;
      row.classList.add('candidate-dragging');
      try { handle.setPointerCapture(pointerId); } catch {}
      if (navigator.vibrate) navigator.vibrate(18);
    }, 220);
    dragState = { handle, row, pointerId, originX, originY, timer, active: false, moved: false };
  }

  function moveCandidateDrag(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const dx = Math.abs(event.clientX - dragState.originX);
    const dy = Math.abs(event.clientY - dragState.originY);
    if (!dragState.active && (dx > 10 || dy > 10)) {
      clearTimeout(dragState.timer);
      dragState = null;
      return;
    }
    if (!dragState.active) return;
    event.preventDefault();
    const rows = candidateRows().filter((row) => row !== dragState.row);
    const target = rows.find((row) => {
      const rect = row.getBoundingClientRect();
      return event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
    if (!target) return;
    const rect = target.getBoundingClientRect();
    if (event.clientY < rect.top + rect.height / 2) target.before(dragState.row);
    else target.after(dragState.row);
    dragState.moved = true;
  }

  function endCandidateDrag(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    clearTimeout(dragState.timer);
    const state = dragState;
    dragState = null;
    state.row.classList.remove('candidate-dragging');
    if (state.active && state.moved) persistCandidateOrder();
  }

  function bind() {
    document.addEventListener('click', (event) => {
      const more = event.target.closest('[data-history-more]');
      if (more) {
        historyExpanded = !historyExpanded;
        updateHistoryVisibility();
        return;
      }
      const edit = event.target.closest('[data-history-edit]');
      if (edit) {
        const entry = edit.closest('.history-entry');
        if (entry) openHistoryEditor(edit.dataset.historyEdit, entry);
        return;
      }
      const cancel = event.target.closest('[data-history-edit-cancel]');
      if (cancel) {
        cancel.closest('[data-history-edit-panel]')?.remove();
        return;
      }
      const save = event.target.closest('[data-history-edit-save]');
      if (save) {
        const panel = save.closest('[data-history-edit-panel]');
        if (panel) saveHistoryEdit(save.dataset.historyEditSave, panel);
      }
    }, true);

    document.addEventListener('pointerdown', (event) => {
      const handle = event.target.closest('[data-candidate-drag]');
      if (!handle || event.button > 0) return;
      startCandidateDrag(handle, event);
    }, true);
    document.addEventListener('pointermove', moveCandidateDrag, { passive: false, capture: true });
    document.addEventListener('pointerup', endCandidateDrag, true);
    document.addEventListener('pointercancel', endCandidateDrag, true);

    ['prevDay', 'nextDay', 'todayBtn'].forEach((id) => {
      $(id)?.addEventListener('click', () => setTimeout(() => {
        updateYesterdayHeading();
        queueHistoryDecorate();
      }, 0));
    });
    $('dateInput')?.addEventListener('change', () => setTimeout(() => {
      updateYesterdayHeading();
      queueHistoryDecorate();
    }, 0));

    const historyList = $('historyList');
    if (historyList) new MutationObserver(queueHistoryDecorate).observe(historyList, { childList: true, subtree: true });
    const planGroups = $('planGroups');
    if (planGroups) new MutationObserver(queueCandidateDecorate).observe(planGroups, { childList: true, subtree: true });
  }

  function init() {
    installStyles();
    setVersion();
    scheduleArrange();
    updateYesterdayHeading();
    removeSameAllMeals();
    moveUsualRegisterButtons();
    decorateHistory();
    decorateCandidateDrag();
    bind();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0), { once: true });
  } else {
    setTimeout(init, 0);
  }
})();