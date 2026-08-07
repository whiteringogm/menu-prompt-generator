(() => {
  'use strict';

  const APP_VERSION = 'v5.1.14';
  const PLANS_KEY = 'menuPromptGenerator.v5.planItems';
  const TARGET_TAG = '今週の候補';
  const originalParse = JSON.parse.bind(JSON);
  const originalStringify = JSON.stringify.bind(JSON);
  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;
  const textareaValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  let reloadTimer = null;
  let decorateFrame = null;

  function injectOrderInstruction(value) {
    const text = String(value || '');
    if (!text.includes(`「${TARGET_TAG}」`)) return text;
    if (text.includes('上にあるものほど傷みやすさなどから先に使いたい順')) return text;

    const oldParagraph = `「${TARGET_TAG}」は、現在ある食材の共有用です。今日使う義務や優先度はありません。未定部分に自然に合うものだけ使用し、在庫を減らすこと自体を献立の目的にしないでください。`;
    const newParagraph = `「${TARGET_TAG}」は、現在ある食材の共有用です。同じ区分内では、上にあるものほど傷みやすさなどから先に使いたい順です。ただし今日使う義務はなく、未定部分に自然に合う候補が複数ある場合の判断材料としてのみ使用してください。在庫を減らすこと自体を献立の目的にしないでください。`;

    if (text.includes(oldParagraph)) return text.replace(oldParagraph, newParagraph);

    const marker = '\n\n「願望」';
    if (!text.includes(marker)) return text;
    return text.replace(marker, `\n\n同じ「${TARGET_TAG}」内では、上にあるものほど傷みやすさなどから先に使いたい順です。ただし今日使う義務はなく、自然に合う候補が複数ある場合の判断材料としてのみ使用してください。${marker}`);
  }

  if (textareaValue?.get && textareaValue?.set) {
    Object.defineProperty(HTMLTextAreaElement.prototype, 'value', {
      configurable: textareaValue.configurable,
      enumerable: textareaValue.enumerable,
      get: textareaValue.get,
      set(value) {
        const next = this.id === 'outputText' ? injectOrderInstruction(value) : value;
        return textareaValue.set.call(this, next);
      },
    });
  }

  function setVersion() {
    document.title = document.title.replace(/v5\.1\.\d+/, APP_VERSION);
    const heading = document.querySelector('h1');
    if (heading) heading.textContent = heading.textContent.replace(/v5\.1\.\d+/, APP_VERSION);
  }

  function loadPlans() {
    try {
      const raw = originalGetItem.call(localStorage, PLANS_KEY);
      const parsed = raw ? originalParse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('plan order read failed', error);
      return [];
    }
  }

  function storePlans(items) {
    try {
      originalSetItem.call(localStorage, PLANS_KEY, originalStringify(items));
      return true;
    } catch (error) {
      console.warn('plan order write failed', error);
      return false;
    }
  }

  function candidateGroup() {
    const root = document.getElementById('planGroups');
    if (!root) return null;
    return [...root.querySelectorAll('.plan-group')].find((group) => (
      group.querySelector('h3')?.textContent.trim().startsWith(TARGET_TAG)
    )) || null;
  }

  function candidateRows() {
    const group = candidateGroup();
    if (!group) return [];
    return [...group.querySelectorAll('.item')].filter((row) => {
      const select = row.querySelector('[data-plan-tag]');
      return select?.value === TARGET_TAG;
    });
  }

  function setStatus(message) {
    const status = document.getElementById('saveStatus');
    if (status) status.textContent = message;
  }

  function moveCandidate(id, direction) {
    const items = loadPlans();
    const positions = items
      .map((item, index) => item?.tag === TARGET_TAG ? index : -1)
      .filter((index) => index >= 0);
    const currentPosition = positions.findIndex((index) => String(items[index]?.id) === String(id));
    const nextPosition = currentPosition + direction;
    if (currentPosition < 0 || nextPosition < 0 || nextPosition >= positions.length) return;

    const currentIndex = positions[currentPosition];
    const nextIndex = positions[nextPosition];
    [items[currentIndex], items[nextIndex]] = [items[nextIndex], items[currentIndex]];
    if (!storePlans(items)) {
      setStatus('並び替え保存失敗');
      return;
    }

    const rows = candidateRows();
    const currentRow = rows[currentPosition];
    const nextRow = rows[nextPosition];
    if (currentRow && nextRow) {
      if (direction < 0) nextRow.before(currentRow);
      else nextRow.after(currentRow);
    }

    decorateCandidates();
    setStatus('並び順を保存済み');
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => location.reload(), 1200);
  }

  function orderButton(id, direction, disabled) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'small';
    button.dataset.planOrderId = id;
    button.dataset.planOrderDirection = String(direction);
    button.textContent = direction < 0 ? '↑ 上へ' : '↓ 下へ';
    button.disabled = disabled;
    button.setAttribute('aria-label', direction < 0 ? '今週の候補で上へ移動' : '今週の候補で下へ移動');
    return button;
  }

  function updateOrderControls(controls, id, index, length) {
    const up = controls.querySelector('[data-plan-order-direction="-1"]');
    const down = controls.querySelector('[data-plan-order-direction="1"]');
    if (up) {
      up.dataset.planOrderId = id;
      up.disabled = index === 0;
    }
    if (down) {
      down.dataset.planOrderId = id;
      down.disabled = index === length - 1;
    }
  }

  function decorateCandidates() {
    setVersion();
    const group = candidateGroup();
    if (!group) return;

    const heading = group.querySelector('h3');
    if (heading && !group.querySelector('[data-plan-order-note]')) {
      const note = document.createElement('p');
      note.className = 'mini';
      note.dataset.planOrderNote = '1';
      note.textContent = '上にあるものほど先に使いたい順。今日使う義務ではなく、自然に合う候補が複数あるときの判断材料。';
      heading.after(note);
    }

    const rows = candidateRows();
    rows.forEach((row, index) => {
      let controls = row.querySelector('[data-plan-order-controls]');
      if (row.querySelector('[data-plan-save]')) {
        controls?.remove();
        return;
      }

      const select = row.querySelector('[data-plan-tag]');
      const actions = row.querySelector('.item-actions');
      const id = select?.dataset.planTag;
      if (!id || !actions) return;

      if (!controls) {
        controls = document.createElement('span');
        controls.dataset.planOrderControls = '1';
        controls.style.cssText = 'display:inline-flex;flex-wrap:wrap;gap:6px';
        controls.append(
          orderButton(id, -1, index === 0),
          orderButton(id, 1, index === rows.length - 1),
        );
        actions.prepend(controls);
      } else {
        updateOrderControls(controls, id, index, rows.length);
      }
    });
  }

  function scheduleDecorate() {
    if (decorateFrame !== null) cancelAnimationFrame(decorateFrame);
    decorateFrame = requestAnimationFrame(() => {
      decorateFrame = null;
      decorateCandidates();
    });
  }

  function refreshOutput() {
    const output = document.getElementById('outputText');
    if (output) output.value = injectOrderInstruction(output.value);
  }

  function init() {
    decorateCandidates();
    refreshOutput();

    const root = document.getElementById('planGroups');
    if (root) {
      const observer = new MutationObserver(scheduleDecorate);
      observer.observe(root, { childList: true, subtree: true });
    }

    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-plan-order-id]');
      if (!button || button.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      moveCandidate(button.dataset.planOrderId, Number(button.dataset.planOrderDirection));
    }, true);

    ['prevDay', 'nextDay', 'todayBtn', 'generateText'].forEach((id) => {
      document.getElementById(id)?.addEventListener('click', () => setTimeout(() => {
        setVersion();
        decorateCandidates();
        refreshOutput();
      }, 0));
    });
    document.getElementById('dateInput')?.addEventListener('change', () => setTimeout(() => {
      setVersion();
      decorateCandidates();
      refreshOutput();
    }, 0));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0), { once: true });
  } else {
    setTimeout(init, 0);
  }
})();
