(() => {
  'use strict';

  const VERSION = 'v5.1.20';
  const GROUP_TAGS = ['期限注意', '今週の候補'];
  let scheduled = false;

  function setVersion() {
    document.title = document.title.replace(/v5\.1\.\d+/g, VERSION);
    const heading = document.querySelector('h1');
    if (heading) heading.textContent = heading.textContent.replace(/v5\.1\.\d+/g, VERSION);
  }

  function installStyles() {
    if (document.getElementById('compact-plan-controls-style')) return;
    const style = document.createElement('style');
    style.id = 'compact-plan-controls-style';
    style.textContent = [
      '.item-actions[data-compact-plan-actions]{display:grid!important;grid-template-columns:48px 44px 76px 38px 38px;justify-content:space-between;gap:3px!important;align-items:center;flex-wrap:nowrap!important;width:100%;max-width:100%;min-width:0;margin:0}',
      '.item-actions[data-compact-plan-actions][data-compact-has-skip="false"]{grid-template-columns:48px 44px 38px 38px;justify-content:start}',
      '.item-actions[data-compact-plan-actions]>*{order:0!important}',
      '.item-actions[data-compact-plan-actions] [data-candidate-drag][hidden],.item-actions[data-compact-plan-actions] [data-expiry-drag][hidden]{display:none!important}',
      '.item-actions[data-compact-plan-actions]>button{width:100%!important;min-width:0!important;min-height:40px!important;height:40px;padding:4px 1px!important;flex:none!important;font-size:12px;line-height:1.1;white-space:nowrap!important;overflow:hidden;text-overflow:ellipsis}',
      '.item-actions[data-compact-plan-actions]>[data-candidate-drag],.item-actions[data-compact-plan-actions]>[data-expiry-drag]{min-width:0!important;width:100%!important;height:42px;min-height:42px!important;font-size:26px!important;font-weight:850;line-height:1!important;background:var(--soft);border-color:var(--accent);color:var(--accent);touch-action:none;user-select:none}',
      '.item-actions[data-compact-plan-actions]>[data-plan-skip]{font-size:11px!important;letter-spacing:0}',
      '.item-actions[data-compact-plan-actions]>[data-plan-edit],.item-actions[data-compact-plan-actions]>[data-plan-delete]{font-size:18px!important}',
      '.item-actions[data-compact-plan-actions]>[data-plan-frozen-label]{height:40px;min-width:0;max-width:none;width:100%!important;display:flex!important;flex-wrap:nowrap;align-items:center;justify-content:center;gap:1px;padding:2px 1px;margin:0;font-size:15px;white-space:nowrap;overflow:hidden}',
      '.item-actions[data-compact-plan-actions]>[data-plan-frozen-label] input{display:block;position:static;opacity:1;width:16px;min-width:16px;height:16px;margin:0;padding:0;flex:0 0 16px}',
      '.item-actions[data-compact-plan-actions] [data-compact-snowflake]{font-size:16px;line-height:1}',
      '@media(max-width:360px){.item-actions[data-compact-plan-actions]{grid-template-columns:44px 40px 68px 34px 34px;gap:3px!important}.item-actions[data-compact-plan-actions][data-compact-has-skip="false"]{grid-template-columns:44px 40px 34px 34px}.item-actions[data-compact-plan-actions]>[data-plan-skip]{font-size:10px!important}}'
    ].join('\n');
    document.head.append(style);
  }

  function decorateActions(row) {
    if (row.querySelector('[data-plan-save]')) return;
    const actions = row.querySelector('.item-actions');
    if (!actions) return;

    const tag = row.closest('.plan-group')?.querySelector(':scope > h3')?.textContent.trim() || '';
    const expectedHandle = tag.startsWith('期限注意') ? '[data-expiry-drag]' : '[data-candidate-drag]';
    const staleHandle = tag.startsWith('期限注意') ? '[data-candidate-drag]' : '[data-expiry-drag]';
    actions.querySelectorAll(staleHandle).forEach((button) => button.remove());
    const matchingHandles = [...actions.querySelectorAll(expectedHandle)];
    matchingHandles.slice(1).forEach((button) => button.remove());
    const handle = matchingHandles[0];
    const frozen = actions.querySelector('[data-plan-frozen-label]');
    const skip = actions.querySelector('[data-plan-skip]');
    const edit = actions.querySelector('[data-plan-edit]');
    const del = actions.querySelector('[data-plan-delete]');
    if (!handle || !frozen || !edit || !del) return;

    actions.dataset.compactPlanActions = '1';
    actions.dataset.compactHasSkip = skip ? 'true' : 'false';

    const checkbox = frozen.querySelector('[data-plan-frozen]');
    if (checkbox) {
      checkbox.setAttribute('aria-label', '冷凍として扱う');
      frozen.title = 'チェックで冷凍扱い。未チェックは冷蔵。';
    }

    if (!frozen.querySelector('[data-compact-snowflake]')) {
      [...frozen.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).forEach((node) => node.remove());
      const snowflake = document.createElement('span');
      snowflake.dataset.compactSnowflake = '1';
      snowflake.setAttribute('aria-hidden', 'true');
      snowflake.textContent = '❄️';
      frozen.append(snowflake);
    }

    if (edit.textContent !== '✏️') edit.textContent = '✏️';
    edit.title = '名前編集';
    edit.setAttribute('aria-label', '名前編集');
    if (del.textContent !== '🗑️') del.textContent = '🗑️';
    del.title = '削除';
    del.setAttribute('aria-label', '削除');
    handle.title = '長押しして並べ替え';
    handle.setAttribute('aria-label', '長押しして並べ替え');
    if (skip) {
      const excluded = skip.classList.contains('soft');
      const desiredText = excluded ? '除外解除' : '今日除外';
      skip.title = excluded ? '今日だけ使わない設定を解除する' : '今日は使わない';
      skip.setAttribute('aria-label', skip.title);
      if (skip.textContent !== desiredText) skip.textContent = desiredText;
    }

    const prioritized = [handle, frozen, skip, edit, del].filter(Boolean);
    const remainder = [...actions.children].filter((child) => !prioritized.includes(child));
    const desired = [...prioritized, ...remainder];
    if (desired.some((child, index) => actions.children[index] !== child)) {
      actions.append(...desired);
    }
  }

  function decorate() {
    scheduled = false;
    setVersion();
    const root = document.getElementById('planGroups');
    if (!root) return;
    [...root.querySelectorAll(':scope > .plan-group')].forEach((group) => {
      const heading = group.querySelector(':scope > h3')?.textContent.trim() || '';
      if (!GROUP_TAGS.some((tag) => heading.startsWith(tag))) return;
      group.querySelectorAll(':scope > div > .item').forEach(decorateActions);
    });
  }

  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(decorate);
  }

  function init() {
    installStyles();
    setVersion();
    scheduleDecorate();

    const root = document.getElementById('planGroups');
    if (root) new MutationObserver(scheduleDecorate).observe(root, { childList: true, subtree: true });

    ['prevDay', 'nextDay', 'todayBtn', 'addPlan'].forEach((id) => {
      document.getElementById(id)?.addEventListener('click', () => setTimeout(scheduleDecorate, 0));
    });
    document.getElementById('dateInput')?.addEventListener('change', () => setTimeout(scheduleDecorate, 0));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0), { once: true });
  } else {
    setTimeout(init, 0);
  }
})();