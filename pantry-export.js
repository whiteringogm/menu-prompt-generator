(() => {
  'use strict';

  const STORAGE_KEY = 'menuPromptGenerator.v5.pantry';
  const pantryEditor = document.getElementById('pantryEditor');
  if (!pantryEditor) return;

  const details = pantryEditor.closest('details');
  if (!details) return;

  const controls = document.createElement('div');
  controls.className = 'buttons';
  controls.innerHTML = `
    <button id="exportPantryTxt" class="small primary">常備在庫表.txtを書き出す</button>
    <button id="copyPantryText" class="small">テキストをコピー</button>
    <span id="pantryExportStatus" class="edit-state" data-state="empty" aria-live="polite">説明・調味料を含む完全版</span>`;

  const help = details.querySelector('.help');
  if (help) help.after(controls);
  else details.prepend(controls);

  const status = document.getElementById('pantryExportStatus');

  function readPantry() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return Array.isArray(value?.categories) ? value : { categories: [] };
    } catch (error) {
      console.warn('pantry read failed', error);
      return { categories: [] };
    }
  }

  function localDateKey() {
    const date = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function pantryText() {
    const pantry = readPantry();
    const lines = [
      '# 常備在庫表',
      '',
      `更新日：${localDateKey()}`,
      '',
      '食事相談補助ツールの常備在庫表から書き出した完全版です。',
    ];

    if (!pantry.categories.length) {
      lines.push('', '登録なし');
      return `${lines.join('\n')}\n`;
    }

    pantry.categories.forEach((category) => {
      const name = String(category?.name || '未分類').trim() || '未分類';
      const heading = category?.seasoning ? `${name}（調味料）` : name;
      const note = String(category?.note || '').trim();
      const items = (Array.isArray(category?.items) ? category.items : [])
        .map((item) => typeof item === 'string' ? item : item?.name)
        .map((item) => String(item || '').trim())
        .filter(Boolean);

      lines.push('', `## ${heading}`);
      if (note) lines.push('', '説明：', note);
      lines.push('');
      if (items.length) items.forEach((item) => lines.push(`- ${item}`));
      else lines.push('- なし');
    });

    return `${lines.join('\n')}\n`;
  }

  function setStatus(message, state = 'saved') {
    status.textContent = message;
    status.dataset.state = state;
  }

  function downloadText() {
    const text = pantryText();
    const blob = new Blob(['\ufeff', text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '常備在庫表.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('TXTを書き出した');
  }

  async function copyText() {
    const text = pantryText();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement('textarea');
        area.value = text;
        area.readOnly = true;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const copied = document.execCommand('copy');
        area.remove();
        if (!copied) throw new Error('copy command failed');
      }
      setStatus('全文をコピーした');
    } catch (error) {
      console.error(error);
      setStatus('コピーできなかった', 'dirty');
    }
  }

  document.getElementById('exportPantryTxt').addEventListener('click', downloadText);
  document.getElementById('copyPantryText').addEventListener('click', copyText);
})();
