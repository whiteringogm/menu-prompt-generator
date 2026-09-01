(() => {
  'use strict';

  document.title = document.title.replace(/v5\.1\.[45]/g, 'v5.1.6');
  const appTitle = document.querySelector('h1');
  if (appTitle) appTitle.textContent = appTitle.textContent.replace(/v5\.1\.[45]/g, 'v5.1.6');

  const HISTORY_KEY = 'menuPromptGenerator.v5.history';
  const HISTORY_DISPLAY_LIMIT = 31;
  const $ = (id) => document.getElementById(id);
  const textarea = $('yesterdayEdit');
  const warning = $('yesterdayWarning');
  const editStatus = $('yesterdayEditStatus');
  const resetButton = $('resetYesterday');
  const dateDisplay = $('dateDisplay');

  if (!textarea || !warning || !editStatus || !resetButton || !dateDisplay) return;

  const pad = (value) => String(value).padStart(2, '0');
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[character]));

  function addDays(key, amount) {
    const [year, month, day] = key.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + amount);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function displayDate(key) {
    const [year, month, day] = key.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const weekday = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
    return `${month}月${day}日(${weekday})`;
  }

  function currentDateKey() {
    const input = $('dateInput');
    if (input?.value) return input.value;
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  function previousDateKey() {
    return addDays(currentDateKey(), -1);
  }

  function readHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
    } catch (error) {
      console.warn('history read failed', error);
      return {};
    }
  }

  function recordText(record) {
    if (!record) return '';
    if (typeof record.rawText === 'string' && record.rawText.trim()) return record.rawText.trim();
    const meals = record.meals || {};
    const rows = [
      ['朝', meals.breakfast],
      ['昼', meals.lunch],
      ['夕', meals.dinner],
      ['間食', meals.snack],
    ].filter(([, value]) => String(value || '').trim());
    return rows.map(([label, value]) => `${label}：${value}`).join('\n');
  }

  function historySummary(record) {
    const meals = record?.meals || {};
    return [
      ['朝', meals.breakfast],
      ['昼', meals.lunch],
      ['夕', meals.dinner],
      ['間食', meals.snack],
    ].map(([label, value]) => `${label}:${String(value || '').trim() || '未定'}`).join('\n');
  }

  function savedRecord() {
    return readHistory()[previousDateKey()] || null;
  }

  function savedText() {
    return recordText(savedRecord());
  }

  function updateIndicators() {
    const saved = textarea.dataset.savedValue || '';
    const current = textarea.value.trim();

    if (!savedRecord()) {
      warning.hidden = false;
      warning.textContent = '⚠️昨日分未入力';
    } else {
      warning.hidden = true;
      warning.textContent = '';
    }

    if (current === saved.trim()) {
      editStatus.textContent = saved ? '保存済み' : '未入力';
      editStatus.dataset.state = saved ? 'saved' : 'empty';
    } else {
      editStatus.textContent = '未保存';
      editStatus.dataset.state = 'dirty';
    }
  }

  function loadSavedRecord() {
    const value = savedText();
    textarea.value = value;
    textarea.dataset.savedValue = value;
    updateIndicators();
  }

  function snapshot() {
    const record = savedRecord();
    return { exists: Boolean(record), text: recordText(record) };
  }

  function historyChanged(before) {
    const after = snapshot();
    return before.exists !== after.exists || before.text !== after.text;
  }

  function ensureExtraHistoryEntry() {
    const root = $('historyList');
    if (!root) return;

    const existing = root.querySelector('[data-extra-history-entry]');
    const history = readHistory();
    const keys = Object.keys(history).sort().reverse();
    if (keys.length < HISTORY_DISPLAY_LIMIT) {
      existing?.remove();
      return;
    }

    const key = keys[HISTORY_DISPLAY_LIMIT - 1];
    if (!key || root.querySelector(`[data-history-view="${key}"]`)) {
      existing?.remove();
      return;
    }
    if (existing?.dataset.extraHistoryEntry === key) return;
    existing?.remove();

    const entry = document.createElement('div');
    entry.className = 'history-entry';
    entry.dataset.extraHistoryEntry = key;
    entry.innerHTML = `
      <b>${displayDate(key)}</b>
      <div class="history-summary">${escapeHtml(historySummary(history[key]))}</div>
      <div class="buttons">
        <button class="small" data-extra-history-view="${key}">表示</button>
        <button class="small danger" data-extra-history-delete="${key}">削除</button>
      </div>`;
    root.append(entry);
  }

  let pantryOpenState = [];

  function capturePantryOpenState() {
    const root = $('pantryEditor');
    if (!root) return;
    pantryOpenState = [...root.querySelectorAll('details.pantry-category')]
      .map((details, index) => ({
        index,
        summary: details.querySelector(':scope > summary')?.textContent.trim() || '',
        open: details.open,
      }))
      .filter((entry) => entry.open);
  }

  function restorePantryOpenState() {
    const root = $('pantryEditor');
    if (!root || !pantryOpenState.length) return;
    const detailsList = [...root.querySelectorAll('details.pantry-category')];
    pantryOpenState.forEach((state) => {
      const sameSummary = detailsList.find((details) => (
        details.querySelector(':scope > summary')?.textContent.trim() === state.summary
      ));
      const target = sameSummary || detailsList[state.index];
      if (target) target.open = true;
    });
  }

  textarea.addEventListener('input', updateIndicators);
  resetButton.addEventListener('click', loadSavedRecord);

  $('saveYesterday')?.addEventListener('click', () => {
    const before = snapshot();
    const attempted = textarea.value.trim();
    setTimeout(() => {
      const after = snapshot();
      if ((after.exists && after.text.trim() === attempted) || historyChanged(before)) {
        loadSavedRecord();
      } else {
        updateIndicators();
      }
    }, 0);
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-history-delete]')) {
      const before = snapshot();
      setTimeout(() => {
        if (historyChanged(before)) loadSavedRecord();
        else updateIndicators();
      }, 0);
    }

    const extraView = event.target.closest('[data-extra-history-view]');
    if (extraView) {
      const record = readHistory()[extraView.dataset.extraHistoryView];
      const finalMenu = $('finalMenu');
      if (record && finalMenu) finalMenu.value = record.rawText || historySummary(record);
    }

    const extraDelete = event.target.closest('[data-extra-history-delete]');
    if (extraDelete) {
      const key = extraDelete.dataset.extraHistoryDelete;
      if (!confirm(`${displayDate(key)}の履歴を削除する？`)) return;
      const history = readHistory();
      delete history[key];
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      location.reload();
      return;
    }

    const pantryAction = event.target.closest([
      '[data-pantry-add]',
      '[data-pantry-edit]',
      '[data-pantry-delete]',
      '[data-pantry-save]',
      '[data-pantry-cancel]',
      '[data-cat-rename]',
      '[data-cat-note]',
    ].join(','));
    if (pantryAction && $('pantryEditor')?.contains(pantryAction)) {
      capturePantryOpenState();
    }
  }, true);

  new MutationObserver(() => {
    setTimeout(loadSavedRecord, 0);
  }).observe(dateDisplay, { childList: true, characterData: true, subtree: true });

  const historyList = $('historyList');
  if (historyList) {
    let historyRefreshQueued = false;
    new MutationObserver(() => {
      if (historyRefreshQueued) return;
      historyRefreshQueued = true;
      queueMicrotask(() => {
        historyRefreshQueued = false;
        ensureExtraHistoryEntry();
      });
    }).observe(historyList, { childList: true });
    ensureExtraHistoryEntry();
  }

  const pantryEditor = $('pantryEditor');
  if (pantryEditor) {
    new MutationObserver(() => {
      queueMicrotask(restorePantryOpenState);
    }).observe(pantryEditor, { childList: true, subtree: true });
  }

  const promptDetails = $('promptText')?.closest('details');
  const pantrySettings = $('pantryOutput')?.closest('.two-col');
  if (promptDetails && pantrySettings) {
    const summary = promptDetails.querySelector('summary');
    if (summary) summary.textContent = 'AIへの指示文・出力設定を編集する';
    const resetRow = $('resetPrompt')?.closest('.buttons');
    if (resetRow) resetRow.after(pantrySettings);
    else promptDetails.appendChild(pantrySettings);
  }
  if (promptDetails) promptDetails.open = false;

  const usualMenuDetails = [...document.querySelectorAll('details.card')].find((node) => {
    const summary = node.firstElementChild;
    return summary?.tagName === 'SUMMARY' && summary.textContent.trim() === 'いつものメニュー編集';
  });
  if (usualMenuDetails) usualMenuDetails.open = false;

  const useMealFieldsButton = $('useOutput');
  const finalMenu = $('finalMenu');
  if (useMealFieldsButton && finalMenu) {
    useMealFieldsButton.textContent = '今日の食事欄を入れる';
    useMealFieldsButton.onclick = () => {
      const meals = [
        ['朝', $('breakfastText')?.value],
        ['昼', $('lunchText')?.value],
        ['夕', $('dinnerText')?.value],
        ['間食', $('snackText')?.value],
      ];
      finalMenu.value = meals
        .map(([label, value]) => `${label}：${String(value || '').trim() || '未定'}`)
        .join('\n');
      finalMenu.dispatchEvent(new Event('input', { bubbles: true }));
      finalMenu.focus();
    };
  }

  loadSavedRecord();
})();
