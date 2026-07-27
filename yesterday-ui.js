(() => {
  'use strict';

  const HISTORY_KEY = 'menuPromptGenerator.v5.history';
  const $ = (id) => document.getElementById(id);
  const textarea = $('yesterdayEdit');
  const warning = $('yesterdayWarning');
  const editStatus = $('yesterdayEditStatus');
  const resetButton = $('resetYesterday');
  const dateDisplay = $('dateDisplay');

  if (!textarea || !warning || !editStatus || !resetButton || !dateDisplay) return;

  const pad = (value) => String(value).padStart(2, '0');

  function addDays(key, amount) {
    const [year, month, day] = key.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + amount);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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
    if (!event.target.closest('[data-history-delete]')) return;
    const before = snapshot();
    setTimeout(() => {
      if (historyChanged(before)) loadSavedRecord();
      else updateIndicators();
    }, 0);
  });

  new MutationObserver(() => {
    setTimeout(loadSavedRecord, 0);
  }).observe(dateDisplay, { childList: true, characterData: true, subtree: true });

  const promptDetails = $('promptText')?.closest('details');
  const pantrySettings = $('pantryOutput')?.closest('.two-col');
  if (promptDetails && pantrySettings) {
    const summary = promptDetails.querySelector('summary');
    if (summary) summary.textContent = 'AIへの指示文・出力設定を編集する';
    const resetRow = $('resetPrompt')?.closest('.buttons');
    if (resetRow) resetRow.after(pantrySettings);
    else promptDetails.appendChild(pantrySettings);
  }

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