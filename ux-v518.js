(() => {
  'use strict';

  const VERSION = 'v5.1.18';
  const EXPIRY_TAG = '期限注意';
  const WEEKLY_TAG = '今週の候補';
  const PLANS_KEY = 'menuPromptGenerator.v5.planItems';
  const EXPIRY_IDS_KEY = 'menuPromptGenerator.v5.expiryPlanIds';
  const FROZEN_KEY = 'menuPromptGenerator.v5.planFrozenIds';
  const ORDER_KEY = 'menuPromptGenerator.v5.expiryOrderIds';
  const nativeValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  let frozenIds = readIds(FROZEN_KEY);
  let orderedIds = readList(ORDER_KEY);
  let frame = null;
  let dragState = null;

  function readList(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? [...new Set(value.map(String))] : [];
    } catch {
      return [];
    }
  }

  function readIds(key) {
    return new Set(readList(key));
  }

  function saveList(key, ids) {
    try {
      localStorage.setItem(key, JSON.stringify([...ids]));
      return true;
    } catch (error) {
      console.warn('expiry order save failed', error);
      document.getElementById('saveStatus').textContent = '並び順の保存に失敗';
      return false;
    }
  }

  function plans() {
    try {
      const value = JSON.parse(localStorage.getItem(PLANS_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function expiryGroup() {
    return [...document.querySelectorAll('#planGroups > .plan-group')].find((group) =>
      group.querySelector(':scope > h3')?.textContent.trim().startsWith(EXPIRY_TAG)
    ) || null;
  }

  function expiryRows() {
    const group = expiryGroup();
    const body = group?.querySelector(':scope > div');
    if (!body) return [];
    return [...body.children].filter((row) =>
      row.classList?.contains('item') && row.querySelector('[data-plan-tag]')
    );
  }

  function weeklyGroup() {
    return [...document.querySelectorAll('#planGroups > .plan-group')].find((group) =>
      group.querySelector(':scope > h3')?.textContent.trim().startsWith(WEEKLY_TAG)
    ) || null;
  }

  function weeklyRows() {
    const body = weeklyGroup()?.querySelector(':scope > div');
    if (!body) return [];
    return [...body.children].filter((row) =>
      row.classList?.contains('item') && row.querySelector('[data-plan-tag]')
    );
  }

  function rowId(row) {
    return String(row.querySelector('[data-plan-tag]')?.dataset.planTag || '');
  }

  function isFrozen(row) {
    return frozenIds.has(rowId(row));
  }

  function setVersion() {
    document.title = document.title.replace(/v5\.1\.\d+/g, VERSION);
    const h1 = document.querySelector('h1');
    if (h1) h1.textContent = h1.textContent.replace(/v5\.1\.\d+/g, VERSION);
  }

  function refreshOutput() {
    const output = document.getElementById('outputText');
    if (output) output.value = output.value;
  }

  function setStatus(message) {
    const status = document.getElementById('saveStatus');
    if (status) status.textContent = message;
  }

  function tidyIds() {
    const allIds = new Set(plans().map((item) => String(item?.id || '')).filter(Boolean));
    const expiryIds = readIds(EXPIRY_IDS_KEY);
    const eligible = new Set([...expiryIds].filter((id) => allIds.has(id)));
    const existingOrder = orderedIds.filter((id) => eligible.has(id));
    plans().forEach((item) => {
      const id = String(item?.id || '');
      if (eligible.has(id) && !existingOrder.includes(id)) existingOrder.push(id);
    });
    const newFrozen = new Set([...frozenIds].filter((id) => allIds.has(id)));
    if (existingOrder.join('\u0000') !== orderedIds.join('\u0000')) {
      orderedIds = existingOrder;
      saveList(ORDER_KEY, orderedIds);
    }
    if ([...newFrozen].join('\u0000') !== [...frozenIds].join('\u0000')) {
      frozenIds = newFrozen;
      saveList(FROZEN_KEY, frozenIds);
    }
  }

  function sortedRows(rows) {
    const ranks = new Map(orderedIds.map((id, index) => [id, index]));
    return rows.map((row, index) => ({ row, index })).sort((a, b) =>
      Number(isFrozen(a.row)) - Number(isFrozen(b.row))
      || (ranks.get(rowId(a.row)) ?? Number.MAX_SAFE_INTEGER)
        - (ranks.get(rowId(b.row)) ?? Number.MAX_SAFE_INTEGER)
      || a.index - b.index
    ).map((entry) => entry.row);
  }

  function installStyles() {
    if (document.getElementById('expiry-order-styles')) return;
    const style = document.createElement('style');
    style.id = 'expiry-order-styles';
    style.textContent = [
      '.plan-input [data-plan-frozen-new]{grid-column:1/-1;justify-content:flex-start;width:max-content}.expiry-frozen-label{display:inline-flex;align-items:center;gap:5px;font-weight:700;font-size:12px;padding:4px 6px;white-space:nowrap;border:1px solid var(--line);border-radius:9px;background:#fff}',
      '.expiry-frozen-label input{display:inline-block;width:18px;height:18px;min-width:18px;margin:0;accent-color:var(--accent)}',
      '.expiry-drag-handle{cursor:grab;touch-action:none;user-select:none;font-size:18px;line-height:1;min-width:42px}',
      '.expiry-drag-handle:active{cursor:grabbing}',
      '.expiry-row-dragging{opacity:.7;outline:2px solid var(--accent);outline-offset:2px}',
      '.expiry-group-note{font-size:12px;color:var(--muted);margin:4px 0 6px}',
      '@media(max-width:520px){.item-actions[data-expiry-actions]{display:flex!important;flex-wrap:wrap;gap:5px}.item-actions[data-expiry-actions] button{flex:0 1 auto!important;width:auto!important;min-width:0}.expiry-drag-handle{order:-2}.expiry-frozen-label{order:-1}}'
    ].join('\n');
    document.head.append(style);
  }

  function decorateRow(row, isExpiry) {
    const id = rowId(row);
    if (!id) return;
    const actions = row.querySelector('.item-actions');
    if (!actions) return;
    if (isExpiry) {
      actions.dataset.expiryActions = '1';
      let handle = actions.querySelector('[data-expiry-drag]');
      if (!handle) {
        handle = document.createElement('button');
        handle.type = 'button';
        handle.className = 'small expiry-drag-handle';
        handle.textContent = '≡';
        handle.title = '長押しで並び替え／キーボードの↑↓でも移動';
        handle.setAttribute('aria-label', '期限注意の同じ保存状態内で並び替え');
        handle.dataset.expiryDrag = id;
        actions.prepend(handle);
      }
    }

    let label = actions.querySelector('[data-plan-frozen-label]');
    if (!label) {
      label = document.createElement('label');
      label.className = 'expiry-frozen-label';
      label.dataset.planFrozenLabel = '1';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.planFrozen = id;
      label.append(input, document.createTextNode('冷凍'));
      actions.prepend(label);
    }
    const checkbox = label.querySelector('[data-plan-frozen]');
    checkbox.dataset.planFrozen = id;
    checkbox.checked = frozenIds.has(id);
  }

  function decorate() {
    frame = null;
    setVersion();
    tidyIds();
    const group = expiryGroup();
    const body = group?.querySelector(':scope > div');
    if (!body) return;

    if (!group.querySelector('[data-expiry-note]')) {
      const note = document.createElement('p');
      note.className = 'expiry-group-note';
      note.dataset.expiryNote = '1';
      note.textContent = '≡を長押しして並び替え。冷凍にチェックすると冷蔵品より下へ移動（冷蔵・冷凍の中で順番を保存）。';
      group.querySelector(':scope > h3')?.after(note);
    }
    const weekly = weeklyGroup();
    if (weekly && !weekly.querySelector('[data-frozen-weekly-note]')) {
      const note = document.createElement('p');
      note.className = 'expiry-group-note';
      note.dataset.frozenWeeklyNote = '1';
      note.textContent = '冷凍にチェックしたものは、冷蔵品より下に表示されます。';
      weekly.querySelector(':scope > h3')?.after(note);
    }

    const rows = expiryRows();
    rows.forEach((row) => decorateRow(row, true));
    const candidates = weeklyRows();
    candidates.forEach((row) => decorateRow(row, false));
    if (dragState?.active) return;
    const target = sortedRows(rows);
    target.forEach((row, index) => {
      if (body.children[index] !== row) body.insertBefore(row, body.children[index] || null);
    });

    const weeklyBody = weeklyGroup()?.querySelector(':scope > div');
    if (weeklyBody && !candidates.some((row) => row.classList.contains('candidate-dragging'))) {
      const candidateRank = new Map(plans().map((item, index) => [String(item.id), index]));
      const sorted = candidates.map((row, index) => ({ row, index })).sort((a, b) =>
        Number(isFrozen(a.row)) - Number(isFrozen(b.row))
        || (candidateRank.get(rowId(a.row)) ?? Number.MAX_SAFE_INTEGER)
          - (candidateRank.get(rowId(b.row)) ?? Number.MAX_SAFE_INTEGER)
        || a.index - b.index
      ).map((entry) => entry.row);
      sorted.forEach((row, index) => {
        if (weeklyBody.children[index] !== row) weeklyBody.insertBefore(row, weeklyBody.children[index] || null);
      });
    }
  }

  function queueDecorate() {
    if (frame !== null) return;
    frame = requestAnimationFrame(decorate);
  }

  function updateOrderFromUI() {
    const ids = expiryRows().map(rowId).filter(Boolean);
    const existing = orderedIds.filter((id) => !ids.includes(id));
    orderedIds = [...ids, ...existing];
    if (!saveList(ORDER_KEY, orderedIds)) return;
    refreshOutput();
    setStatus('期限注意の並び順を保存済み');
  }

  function moveRow(row, direction) {
    const rows = expiryRows().filter((other) => isFrozen(other) === isFrozen(row));
    const index = rows.indexOf(row);
    const target = rows[index + direction];
    if (!target || index < 0) return;
    if (direction < 0) target.before(row);
    else target.after(row);
    updateOrderFromUI();
    queueDecorate();
  }

  function startDrag(handle, event) {
    const row = handle.closest('.item');
    if (!row || event.button > 0) return;
    if (dragState) clearTimeout(dragState.timer);
    const pointerId = event.pointerId;
    const timer = setTimeout(() => {
      if (!dragState || dragState.pointerId !== pointerId) return;
      dragState.active = true;
      row.classList.add('expiry-row-dragging');
      try { handle.setPointerCapture(pointerId); } catch {}
      if (navigator.vibrate) navigator.vibrate(15);
    }, 220);
    dragState = {
      handle, row, pointerId, timer, active: false, moved: false,
      originX: event.clientX, originY: event.clientY,
    };
  }

  function dragMove(event) {
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
    const rows = expiryRows().filter((row) =>
      row !== dragState.row && isFrozen(row) === isFrozen(dragState.row)
    );
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

  function endDrag(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    clearTimeout(dragState.timer);
    const state = dragState;
    dragState = null;
    state.row.classList.remove('expiry-row-dragging');
    if (state.active && state.moved) updateOrderFromUI();
    queueDecorate();
  }

  function decorateOutput(text) {
    const value = String(text || '');
    const expiryIds = readIds(EXPIRY_IDS_KEY);
    const skipSection = value.match(/【今日だけ使わないもの】\n([^\n]*)/);
    const skipped = new Set(
      skipSection && skipSection[1] !== 'なし'
        ? skipSection[1].split('、').map((name) => name.trim())
        : []
    );
    const ranks = new Map(orderedIds.map((id, index) => [id, index]));
    const activeItems = plans().filter((item) => !skipped.has(String(item?.name || '').trim()));
    const priority = activeItems.filter((item) => expiryIds.has(String(item?.id || '')));
    priority.sort((a, b) =>
      Number(frozenIds.has(String(a.id))) - Number(frozenIds.has(String(b.id)))
      || (ranks.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER)
        - (ranks.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER)
    );
    const candidates = activeItems.filter((item) =>
      item.tag === WEEKLY_TAG && !expiryIds.has(String(item?.id || ''))
    );
    candidates.sort((a, b) =>
      Number(frozenIds.has(String(a.id))) - Number(frozenIds.has(String(b.id)))
    );
    const label = (items) => items.length
      ? items.map((item) => String(item.name) + (frozenIds.has(String(item.id)) && !String(item.name).includes('冷凍') ? '（冷凍）' : '')).join('、')
      : 'なし';
    return value
      .replace(/(【期限注意】\n)[^\n]*/, (_, prefix) => prefix + label(priority))
      .replace(/(【今週の候補】\n)[^\n]*/, (_, prefix) => prefix + label(candidates));
  }

  function patchOutput() {
    const previous = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (!previous?.get || !previous?.set || !nativeValue?.set || !nativeValue?.get) return;
    Object.defineProperty(HTMLTextAreaElement.prototype, 'value', {
      configurable: previous.configurable,
      enumerable: previous.enumerable,
      get: previous.get,
      set(value) {
        const result = previous.set.call(this, value);
        if (this.id === 'outputText') {
          const next = decorateOutput(nativeValue.get.call(this));
          nativeValue.set.call(this, next);
        }
        return result;
      },
    });
  }

  function patchBackup() {
    const previousStringify = JSON.stringify.bind(JSON);
    JSON.stringify = function patchedStringify(value, replacer, space) {
      if (value && typeof value === 'object' && value.version && value.drafts && value.history) {
        value = {
          ...value,
          planFrozenIds: [...frozenIds],
          expiryOrderIds: [...orderedIds],
        };
      }
      return previousStringify(value, replacer, space);
    };
  }

  function installImport() {
    document.addEventListener('change', (event) => {
      if (event.target?.id !== 'importFile' || !event.target.files?.[0]) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const backup = JSON.parse(reader.result);
          const importedFrozen = Array.isArray(backup?.expiryFrozenIds) ? backup.expiryFrozenIds.map(String) : [];
          const importedOrder = Array.isArray(backup?.expiryOrderIds) ? backup.expiryOrderIds.map(String) : [];
          frozenIds = new Set(importedFrozen);
          orderedIds = [...new Set(importedOrder)];
          saveList(FROZEN_KEY, frozenIds);
          saveList(ORDER_KEY, orderedIds);
          queueDecorate();
        } catch (error) {
          console.warn('expiry order backup import failed', error);
        }
      };
      reader.readAsText(event.target.files[0]);
    }, true);
  }

  function installHandlers() {
    document.addEventListener('change', (event) => {
      const checkbox = event.target.closest?.('[data-plan-frozen]');
      if (!checkbox) return;
      const id = String(checkbox.dataset.planFrozen || '');
      if (!id) return;
      if (checkbox.checked) frozenIds.add(id);
      else frozenIds.delete(id);
      saveList(FROZEN_KEY, frozenIds);
      orderedIds = orderedIds.filter((value) => value !== id);
      orderedIds.push(id);
      saveList(ORDER_KEY, orderedIds);
      queueDecorate();
      refreshOutput();
      setStatus(checkbox.checked ? '冷凍として保存済み' : '冷蔵として保存済み');
    }, true);

    document.addEventListener('pointerdown', (event) => {
      const handle = event.target.closest?.('[data-expiry-drag]');
      if (handle) startDrag(handle, event);
    }, true);
    document.addEventListener('pointermove', dragMove, { passive: false, capture: true });
    document.addEventListener('pointerup', endDrag, true);
    document.addEventListener('pointercancel', endDrag, true);
    document.addEventListener('keydown', (event) => {
      const handle = event.target.closest?.('[data-expiry-drag]');
      if (!handle || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      moveRow(handle.closest('.item'), event.key === 'ArrowUp' ? -1 : 1);
    }, true);

    const root = document.getElementById('planGroups');
    if (root) new MutationObserver(queueDecorate).observe(root, { childList: true, subtree: true });
    const add = document.getElementById('addPlan');
    if (add) {
      const label = document.createElement('label');
      label.className = 'expiry-frozen-label';
      label.dataset.planFrozenNew = '1';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = 'newPlanFrozen';
      label.append(input, document.createTextNode('冷凍として追加（未チェックは冷蔵）'));
      add.after(label);
      add.addEventListener('click', () => {
        const before = new Set(plans().map((item) => String(item?.id || '')));
        const frozen = input.checked;
        setTimeout(() => {
          const entry = plans().find((item) => !before.has(String(item?.id || '')));
          if (!entry) return;
          if (frozen) {
            frozenIds.add(String(entry.id));
            saveList(FROZEN_KEY, frozenIds);
          }
          input.checked = false;
          queueDecorate();
          refreshOutput();
        }, 0);
      });
    }
    ['prevDay', 'nextDay', 'todayBtn', 'generateText'].forEach((id) => {
      document.getElementById(id)?.addEventListener('click', () => setTimeout(() => {
        queueDecorate();
        refreshOutput();
      }, 0));
    });
    document.getElementById('dateInput')?.addEventListener('change', () =>
      setTimeout(queueDecorate, 0)
    );
  }

  function init() {
    installStyles();
    patchOutput();
    patchBackup();
    installImport();
    installHandlers();
    queueDecorate();
    refreshOutput();
    setVersion();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0), { once: true });
  } else {
    setTimeout(init, 0);
  }
})();