(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const MEALS = [
    ['breakfast', '朝'],
    ['lunch', '昼'],
    ['dinner', '夕'],
    ['snack', '間食'],
  ];
  const ALL_TAGS = ['今日中', '近日中', '今週の候補', '願望', '避けたい', '在庫切れ'];
  const SKIPPABLE_TAGS = ['近日中', '今週の候補', '願望'];
  const STORAGE = {
    history: 'menuPromptGenerator.v5.history',
    usuals: 'menuPromptGenerator.v5.usuals',
    drafts: 'menuPromptGenerator.v5.drafts',
    settings: 'menuPromptGenerator.v5.settings',
    pantry: 'menuPromptGenerator.v5.pantry',
  };

  const DEFAULT_PROMPT = `以下をもとに、ダイエット相談メモ.txtと常備在庫表.txtを参照し、未定部分と足りていない部分を提案してください。
済のものは変更しないでください。
夕食の主菜は、昨日と重なりすぎないようにしてください。

「今日中」は、今日の献立で使用してください。
「近日中」は数日以内に使いたいものですが、今日一日で使い切ったり、昼と夕の両方へ無理に詰め込んだりしないでください。

「今週の候補」は、現在ある食材の共有用です。今日使う義務や優先度はありません。未定部分に自然に合うものだけ使用し、在庫を減らすこと自体を献立の目的にしないでください。

「願望」は、食べたい気持ちとして可能な範囲で考慮してください。
「今日だけ使わないもの」は、在庫・候補・願望としてリストに残っていますが、今日の献立には使用しないでください。
避けたいもの・在庫切れは使わないでください。

副菜や汁物に少量含まれる肉・魚・卵・豆腐は、主菜一品分のたんぱく質として数えないでください。鍋全体の使用量ではなく、一人分に入る量で判断してください。

最終回答は、朝・昼・夕・間食をそれぞれ1行で書いてください。`;

  const DEFAULT_USUALS = {
    breakfast: ['素トースト1枚（5枚切）、ゆで卵1/2個'],
    lunch: ['ごはん150g、主菜未定、即席味噌汁（冷凍・救済野菜入り）'],
    dinner: ['主菜未定、副菜未定、汁物未定'],
    snack: ['無脂肪ギリシャヨーグルト100g', '炒り大豆15g'],
  };

  function uid() {
    return globalThis.crypto?.randomUUID?.()
      || `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  const named = (name) => ({ id: uid(), name });
  const category = (name, seasoning = false, note = '', items = []) => ({
    id: uid(),
    name,
    seasoning,
    note,
    items: items.map(named),
  });

  const DEFAULT_PANTRY = {
    categories: [
      category('常備たんぱく質', false, '', ['納豆', '豆腐150g', '卵', '鯖水煮缶', 'ツナ缶（油漬け）', 'サラダチキン110g', '無脂肪ギリシャヨーグルト']),
      category('肉・加工肉', false, '', ['豚こま', '鶏もも', '鶏むね', 'ひき肉', '冷凍唐揚げ', 'ウインナー', 'ベーコン', 'ロースハム', 'ランチョンミート缶', '油揚げ']),
      category('野菜・海藻・缶詰', false, '', ['キャベツ', '玉ねぎ', 'にんじん', '乾燥わかめ', 'コーン缶', 'トマト缶', '米ひじき', '韓国海苔', 'きざみのり', 'きざみねぎ（冷凍）', '出汁昆布', '塩昆布', '鰹節']),
      category('冷凍・救済野菜', false, '市販の冷凍ブロッコリーやほうれん草の場合もある。多くはキャベツの外葉や使い切れなかった野菜を細かく刻んで冷凍したもの。主に昼食で、即席味噌汁やスープへレンジ加熱して加える。種類と量は一定ではなく、家族分の副菜や特定の野菜が必要な料理には勝手に使用しない。', ['冷凍・救済野菜（種類不定）']),
      category('主食・麺・粉類', false, '', ['米', 'もちむぎ', '食パン5枚切', 'そうめん', 'そば', 'スパゲッティ', 'マカロニ', 'ホットケーキミックス', '薄力粉', '片栗粉', 'ベーキングパウダー', 'あえるだけのパスタソース', 'カレールー（甘口）']),
      category('乳製品・間食材料', false, '', ['牛乳', '無調整豆乳200ml', 'スライスチーズ', 'シュレッドチーズ', '粉チーズ', '冷凍ブルーベリー', 'マーガリン', 'はちみつ', 'ピーナッツバター', 'ケーキシロップ', 'きなこ', 'すりごま']),
      category('基本調味料', true, '', ['醤油', '料理酒', 'みりん風調味料', '穀物酢', '米油', 'ごま油', '中濃ソース', 'オリーブオイル', 'マヨネーズ', 'ケチャップ', 'レモン汁', 'ごまドレッシング', 'ポン酢', '塩', '砂糖']),
      category('味噌・だし・スープ類', true, '', ['赤味噌', 'あわせ味噌', 'すぐとけるみそ（即席味噌汁用）', '顆粒だし', 'めんつゆ', '白だし', 'コンソメ顆粒', 'コンソメ固形', '創味シャンタンDX']),
      category('香味・中華・洋風調味料', true, '', ['チューブにんにく', 'チューブ生姜', 'オイスターソース', '塩麹', '粒マスタード', '豆板醤']),
      category('香辛料・ハーブ', true, '', ['カレー粉', 'カイエンペッパー粉末', 'エルブドプロバンス（ミックスハーブ）']),
    ],
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : clone(fallback);
    } catch (error) {
      console.warn('localStorage read failed', key, error);
      return clone(fallback);
    }
  }

  function store(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn('localStorage write failed', key, error);
    }
  }

  function normalizeNamed(list) {
    return (Array.isArray(list) ? list : [])
      .map((value) => typeof value === 'string'
        ? named(value)
        : { id: value.id || uid(), name: String(value.name || '') })
      .filter((value) => value.name.trim());
  }

  function normalizeUsuals(value) {
    const out = {};
    MEALS.forEach(([key]) => {
      out[key] = normalizeNamed(value?.[key] || DEFAULT_USUALS[key]);
    });
    return out;
  }

  function normalizePantry(value) {
    const source = Array.isArray(value?.categories) ? value.categories : DEFAULT_PANTRY.categories;
    return {
      categories: source.map((entry) => ({
        id: entry.id || uid(),
        name: String(entry.name || '未分類'),
        seasoning: Boolean(entry.seasoning),
        note: String(entry.note || ''),
        items: normalizeNamed(entry.items),
      })),
    };
  }

  function normalizePlanItem(value, fallbackTag = '今週の候補') {
    if (typeof value === 'string') {
      return { id: uid(), name: value, tag: fallbackTag, skipToday: false };
    }
    const tag = ALL_TAGS.includes(value?.tag) ? value.tag : fallbackTag;
    return {
      id: value?.id || uid(),
      name: String(value?.name || ''),
      tag,
      skipToday: SKIPPABLE_TAGS.includes(tag) && Boolean(value?.skipToday),
    };
  }

  function blankDraft() {
    const meals = {};
    MEALS.forEach(([key]) => {
      meals[key] = { text: '', status: '未' };
    });
    return { note: '', meals, items: [] };
  }

  function normalizeDraft(value) {
    const out = blankDraft();
    if (!value) return out;

    out.note = String(value.note || '');
    MEALS.forEach(([key]) => {
      const meal = value.meals?.[key];
      if (meal) {
        out.meals[key] = {
          text: String(meal.text || ''),
          status: meal.status === '済' ? '済' : '未',
        };
      }
    });

    if (Array.isArray(value.items)) {
      out.items = value.items.map((entry) => normalizePlanItem(entry)).filter((entry) => entry.name.trim());
      return out;
    }

    const migrated = [];
    (Array.isArray(value.urgent) ? value.urgent : []).forEach((entry) => {
      migrated.push(normalizePlanItem(entry, entry?.tag === '今日中' ? '今日中' : '近日中'));
    });
    (Array.isArray(value.candidates) ? value.candidates : []).forEach((entry) => {
      migrated.push(normalizePlanItem(entry, '今週の候補'));
    });
    (Array.isArray(value.wishes) ? value.wishes : []).forEach((entry) => {
      migrated.push(normalizePlanItem(entry, '願望'));
    });
    (Array.isArray(value.avoids) ? value.avoids : []).forEach((entry) => {
      migrated.push(normalizePlanItem(entry, entry?.tag === '在庫切れ' ? '在庫切れ' : '避けたい'));
    });
    out.items = migrated.filter((entry) => entry.name.trim());
    return out;
  }

  function normalizeSettings(value) {
    return {
      appendMode: Boolean(value?.appendMode),
      promptOn: value?.promptOn !== false,
      prompt: typeof value?.prompt === 'string' && value.prompt.trim() ? value.prompt : DEFAULT_PROMPT,
      pantryOutput: Boolean(value?.pantryOutput),
      includeSeasonings: Boolean(value?.includeSeasonings),
    };
  }

  const pad = (value) => String(value).padStart(2, '0');

  function todayKey() {
    const date = new Date();
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

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

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }[character]));
  }

  let history = load(STORAGE.history, {});
  let usuals = normalizeUsuals(load(STORAGE.usuals, DEFAULT_USUALS));
  let drafts = load(STORAGE.drafts, {});
  let settings = normalizeSettings(load(STORAGE.settings, {}));
  let pantry = normalizePantry(load(STORAGE.pantry, DEFAULT_PANTRY));
  let currentDate = todayKey();
  let draft = blankDraft();
  let saveTimer = null;
  let toastTimer = null;
  let editingPlanId = null;
  let editingUsual = null;
  let editingPantry = null;

  function showToast(message) {
    const node = $('toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 1700);
  }

  function setStatus(message) {
    $('saveStatus').textContent = message;
  }

  function draftFromPrevious(key) {
    const previous = normalizeDraft(drafts[addDays(key, -1)]);
    const out = blankDraft();
    out.items = previous.items
      .filter((entry) => entry.tag !== '今日中')
      .map((entry) => ({ ...clone(entry), id: uid(), skipToday: false }));
    return out;
  }

  function readUI() {
    draft.note = $('dailyNote').value;
    MEALS.forEach(([key]) => {
      draft.meals[key] = {
        text: $(`${key}Text`).value.trim(),
        status: $(`${key}Done`).checked ? '済' : '未',
      };
    });
  }

  function updateSwitches() {
    $('appendModeText').textContent = $('appendMode').checked ? '追記' : '上書き';
    $('promptState').textContent = $('promptOn').checked ? 'ON' : 'OFF';
    MEALS.forEach(([key]) => {
      const state = $(`${key}State`);
      const toggle = $(`${key}Done`);
      if (state && toggle) state.textContent = toggle.checked ? '済' : '未';
    });
  }

  function saveSettings() {
    settings = {
      appendMode: $('appendMode').checked,
      promptOn: $('promptOn').checked,
      prompt: $('promptText').value,
      pantryOutput: $('pantryOutput').checked,
      includeSeasonings: $('includeSeasonings').checked,
    };
    store(STORAGE.settings, settings);
    updateSwitches();
  }

  function saveDraftNow() {
    readUI();
    drafts[currentDate] = clone(draft);
    store(STORAGE.drafts, drafts);
    saveSettings();
    setStatus('下書き保存済み');
  }

  function scheduleSave() {
    setStatus('保存中…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveDraftNow();
      generateText();
    }, 250);
  }

  function writeUI() {
    $('dailyNote').value = draft.note;
    MEALS.forEach(([key]) => {
      $(`${key}Text`).value = draft.meals[key].text;
      $(`${key}Done`).checked = draft.meals[key].status === '済';
    });
    updateSwitches();
  }

  function loadDay(key, saveCurrent = true) {
    if (saveCurrent && currentDate) saveDraftNow();
    currentDate = key;
    $('dateInput').value = key;
    $('dateDisplay').textContent = displayDate(key);

    if (drafts[key]) {
      draft = normalizeDraft(drafts[key]);
    } else {
      draft = draftFromPrevious(key);
      drafts[key] = clone(draft);
      store(STORAGE.drafts, drafts);
    }

    writeUI();
    renderAll();
    setStatus('読み込み済み');
  }

  function renderMeals() {
    const root = $('meals');
    root.innerHTML = '';

    MEALS.forEach(([key, label]) => {
      const card = document.createElement('div');
      card.className = 'meal-card';
      card.innerHTML = `
        <div class="title">${label}</div>
        <div class="meal-grid">
          <div>
            <label for="${key}Text">${label}の予定・食べたもの</label>
            <textarea id="${key}Text"></textarea>
          </div>
          <div>
            <label>状態</label>
            <label class="switch">
              <input id="${key}Done" type="checkbox">
              <span class="track"></span>
              <span id="${key}State">未</span>
            </label>
          </div>
        </div>
        <div class="buttons">
          <button class="small" data-yesterday-meal="${key}">昨日と同じ</button>
          <button class="small" data-undecided="${key}">未定</button>
          <button class="small" data-clear-meal="${key}">クリア</button>
          <button class="small" data-register-usual="${key}">今の内容をいつものに登録</button>
        </div>
        <div id="${key}Chips" class="chips"></div>`;
      root.appendChild(card);
    });

    MEALS.forEach(([key]) => {
      $(`${key}Text`).addEventListener('input', scheduleSave);
      $(`${key}Done`).addEventListener('change', () => {
        updateSwitches();
        scheduleSave();
      });
    });

    root.querySelectorAll('[data-yesterday-meal]').forEach((button) => {
      button.onclick = () => copyYesterdayMeal(button.dataset.yesterdayMeal);
    });
    root.querySelectorAll('[data-undecided]').forEach((button) => {
      button.onclick = () => {
        const key = button.dataset.undecided;
        $(`${key}Text`).value = '未定';
        $(`${key}Done`).checked = false;
        updateSwitches();
        saveDraftNow();
        generateText();
      };
    });
    root.querySelectorAll('[data-clear-meal]').forEach((button) => {
      button.onclick = () => {
        const key = button.dataset.clearMeal;
        $(`${key}Text`).value = '';
        $(`${key}Done`).checked = false;
        updateSwitches();
        saveDraftNow();
        generateText();
      };
    });
    root.querySelectorAll('[data-register-usual]').forEach((button) => {
      button.onclick = () => registerUsual(button.dataset.registerUsual);
    });

    renderUsualChips();
  }

  function renderUsualChips() {
    MEALS.forEach(([key]) => {
      const root = $(`${key}Chips`);
      if (!root) return;
      root.innerHTML = '';
      usuals[key].forEach((entry) => {
        const button = document.createElement('button');
        button.className = 'chip';
        button.textContent = entry.name;
        button.onclick = () => {
          const field = $(`${key}Text`);
          field.value = settings.appendMode && field.value.trim()
            ? `${field.value.trim()}、${entry.name}`
            : entry.name;
          scheduleSave();
        };
        root.appendChild(button);
      });
    });
  }

  function yesterdayMeals() {
    return history[addDays(currentDate, -1)]?.meals || {};
  }

  function copyYesterdayMeal(key) {
    const value = yesterdayMeals()[key];
    if (!value) return showToast('昨日の保存がない');
    $(`${key}Text`).value = value;
    $(`${key}Done`).checked = false;
    updateSwitches();
    saveDraftNow();
    generateText();
  }

  function sameAllMeals() {
    const meals = yesterdayMeals();
    let used = false;
    MEALS.forEach(([key]) => {
      if (meals[key]) {
        $(`${key}Text`).value = meals[key];
        $(`${key}Done`).checked = false;
        used = true;
      }
    });
    if (!used) return showToast('昨日の保存がない');
    updateSwitches();
    saveDraftNow();
    generateText();
    showToast('昨日と同じにした');
  }

  function registerUsual(key) {
    const name = $(`${key}Text`).value.trim();
    if (!name) return showToast('内容を入力して');
    usuals[key].push(named(name));
    store(STORAGE.usuals, usuals);
    renderUsualChips();
    renderUsualEditor();
    showToast('いつものに登録した');
  }

  function addPlan(name, tag) {
    const cleanName = String(name || '').trim();
    if (!cleanName) return showToast('品名を入力して');
    draft.items.push({ id: uid(), name: cleanName, tag, skipToday: false });
    saveDraftNow();
    renderPlans();
    generateText();
  }

  function deletePlan(id) {
    draft.items = draft.items.filter((entry) => entry.id !== id);
    if (editingPlanId === id) editingPlanId = null;
    saveDraftNow();
    renderPlans();
    generateText();
  }

  function changePlanTag(id, tag) {
    const entry = draft.items.find((item) => item.id === id);
    if (!entry) return;
    entry.tag = tag;
    if (!SKIPPABLE_TAGS.includes(tag)) entry.skipToday = false;
    saveDraftNow();
    renderPlans();
    generateText();
  }

  function toggleSkipToday(id) {
    const entry = draft.items.find((item) => item.id === id);
    if (!entry || !SKIPPABLE_TAGS.includes(entry.tag)) return;
    entry.skipToday = !entry.skipToday;
    saveDraftNow();
    renderPlans();
    generateText();
  }

  function savePlanName(id, name) {
    const cleanName = name.trim();
    if (!cleanName) return showToast('空欄では保存できない');
    const entry = draft.items.find((item) => item.id === id);
    if (!entry) return;
    entry.name = cleanName;
    editingPlanId = null;
    saveDraftNow();
    renderPlans();
    generateText();
  }

  function renderPlanRow(entry) {
    if (editingPlanId === entry.id) {
      return `
        <div class="item${entry.skipToday ? ' paused' : ''}">
          <div class="edit-grid">
            <input data-plan-edit-name value="${escapeHtml(entry.name)}">
            <select data-plan-tag="${entry.id}">
              ${ALL_TAGS.map((tag) => `<option${tag === entry.tag ? ' selected' : ''}>${tag}</option>`).join('')}
            </select>
            <div class="item-actions">
              <button class="small primary" data-plan-save="${entry.id}">保存</button>
              <button class="small" data-plan-cancel>キャンセル</button>
            </div>
          </div>
        </div>`;
    }

    const skipButton = SKIPPABLE_TAGS.includes(entry.tag)
      ? `<button class="small${entry.skipToday ? ' soft' : ''}" data-plan-skip="${entry.id}">${entry.skipToday ? '今日も使える' : '今日は使わない'}</button>`
      : '';

    return `
      <div class="item${entry.skipToday ? ' paused' : ''}">
        <div>
          <b>${escapeHtml(entry.name)}</b>
          ${entry.skipToday ? '<span class="tag pause-tag">今日だけ除外</span>' : ''}
        </div>
        <div class="item-controls">
          <select aria-label="区分" data-plan-tag="${entry.id}">
            ${ALL_TAGS.map((tag) => `<option${tag === entry.tag ? ' selected' : ''}>${tag}</option>`).join('')}
          </select>
          <div class="item-actions">
            ${skipButton}
            <button class="small" data-plan-edit="${entry.id}">名前編集</button>
            <button class="small danger" data-plan-delete="${entry.id}">削除</button>
          </div>
        </div>
      </div>`;
  }

  function renderPlans() {
    const root = $('planGroups');
    root.innerHTML = ALL_TAGS.map((tag) => {
      const list = draft.items.filter((entry) => entry.tag === tag);
      return `
        <div class="plan-group">
          <h3>${tag}<span class="count">${list.length}</span></h3>
          <div>${list.length ? list.map(renderPlanRow).join('') : '<div class="empty">未登録</div>'}</div>
        </div>`;
    }).join('');

    root.querySelectorAll('[data-plan-tag]').forEach((select) => {
      select.onchange = () => changePlanTag(select.dataset.planTag, select.value);
    });
    root.querySelectorAll('[data-plan-skip]').forEach((button) => {
      button.onclick = () => toggleSkipToday(button.dataset.planSkip);
    });
    root.querySelectorAll('[data-plan-edit]').forEach((button) => {
      button.onclick = () => {
        editingPlanId = button.dataset.planEdit;
        renderPlans();
      };
    });
    root.querySelectorAll('[data-plan-delete]').forEach((button) => {
      button.onclick = () => deletePlan(button.dataset.planDelete);
    });
    root.querySelectorAll('[data-plan-save]').forEach((button) => {
      button.onclick = () => {
        const row = button.closest('.item');
        savePlanName(button.dataset.planSave, row.querySelector('[data-plan-edit-name]').value);
      };
    });
    root.querySelectorAll('[data-plan-cancel]').forEach((button) => {
      button.onclick = () => {
        editingPlanId = null;
        renderPlans();
      };
    });
  }

  function renderUsualEditor() {
    const root = $('usualEditor');
    root.innerHTML = MEALS.map(([key, label]) => `
      <div>
        <h3>${label}</h3>
        <div id="usual-${key}"></div>
        <div class="row">
          <input id="usual-add-${key}" placeholder="${label}の定番">
          <button class="primary small" data-usual-add="${key}">登録</button>
        </div>
      </div>`).join('');

    MEALS.forEach(([key]) => {
      const list = $(`usual-${key}`);
      list.innerHTML = usuals[key].length
        ? usuals[key].map((entry) => editingUsual?.id === entry.id
          ? `<div class="item"><div class="edit-grid"><input data-usual-edit-name value="${escapeHtml(entry.name)}"><div></div><div class="item-actions"><button class="small primary" data-usual-save="${entry.id}" data-usual-key="${key}">保存</button><button class="small" data-usual-cancel>キャンセル</button></div></div></div>`
          : `<div class="item"><div>${escapeHtml(entry.name)}</div><div class="item-actions"><button class="small" data-usual-edit="${entry.id}" data-usual-key="${key}">編集</button><button class="small danger" data-usual-delete="${entry.id}" data-usual-key="${key}">削除</button></div></div>`).join('')
        : '<div class="empty">未登録</div>';
    });

    root.querySelectorAll('[data-usual-add]').forEach((button) => {
      button.onclick = () => {
        const key = button.dataset.usualAdd;
        const name = $(`usual-add-${key}`).value.trim();
        if (!name) return showToast('内容を入力して');
        usuals[key].push(named(name));
        store(STORAGE.usuals, usuals);
        renderUsualEditor();
        renderUsualChips();
      };
    });
    root.querySelectorAll('[data-usual-edit]').forEach((button) => {
      button.onclick = () => {
        editingUsual = { id: button.dataset.usualEdit, key: button.dataset.usualKey };
        renderUsualEditor();
      };
    });
    root.querySelectorAll('[data-usual-delete]').forEach((button) => {
      button.onclick = () => {
        const key = button.dataset.usualKey;
        usuals[key] = usuals[key].filter((entry) => entry.id !== button.dataset.usualDelete);
        store(STORAGE.usuals, usuals);
        renderUsualEditor();
        renderUsualChips();
      };
    });
    root.querySelectorAll('[data-usual-save]').forEach((button) => {
      button.onclick = () => {
        const name = root.querySelector('[data-usual-edit-name]').value.trim();
        if (!name) return showToast('空欄では保存できない');
        const entry = usuals[button.dataset.usualKey].find((item) => item.id === button.dataset.usualSave);
        if (entry) entry.name = name;
        editingUsual = null;
        store(STORAGE.usuals, usuals);
        renderUsualEditor();
        renderUsualChips();
      };
    });
    root.querySelectorAll('[data-usual-cancel]').forEach((button) => {
      button.onclick = () => {
        editingUsual = null;
        renderUsualEditor();
      };
    });
  }

  function renderPantry() {
    const root = $('pantryEditor');
    root.innerHTML = pantry.categories.map((entry) => `
      <details class="pantry-category">
        <summary>${escapeHtml(entry.name)}${entry.seasoning ? ' <span class="tag">調味料</span>' : ''}</summary>
        <div class="pantry-note">${escapeHtml(entry.note)}</div>
        <div class="buttons">
          <button class="small" data-cat-rename="${entry.id}">分類名編集</button>
          <button class="small" data-cat-note="${entry.id}">説明編集</button>
          <button class="small danger" data-cat-delete="${entry.id}">分類削除</button>
        </div>
        <div>${entry.items.length
          ? entry.items.map((item) => editingPantry?.id === item.id
            ? `<div class="item"><div class="edit-grid"><input data-pantry-edit-name value="${escapeHtml(item.name)}"><div></div><div class="item-actions"><button class="small primary" data-pantry-save="${item.id}" data-cat-id="${entry.id}">保存</button><button class="small" data-pantry-cancel>キャンセル</button></div></div></div>`
            : `<div class="item"><div>${escapeHtml(item.name)}</div><div class="item-actions"><button class="small" data-pantry-edit="${item.id}" data-cat-id="${entry.id}">編集</button><button class="small danger" data-pantry-delete="${item.id}" data-cat-id="${entry.id}">削除</button></div></div>`).join('')
          : '<div class="empty">未登録</div>'}</div>
        <div class="row">
          <input id="pantry-add-${entry.id}" placeholder="在庫品名">
          <button class="small primary" data-pantry-add="${entry.id}">追加</button>
        </div>
      </details>`).join('');

    root.querySelectorAll('[data-pantry-add]').forEach((button) => {
      button.onclick = () => {
        const entry = pantry.categories.find((item) => item.id === button.dataset.pantryAdd);
        const name = $(`pantry-add-${entry.id}`).value.trim();
        if (!name) return showToast('品名を入力して');
        entry.items.push(named(name));
        store(STORAGE.pantry, pantry);
        renderPantry();
        generateText();
      };
    });
    root.querySelectorAll('[data-pantry-edit]').forEach((button) => {
      button.onclick = () => {
        editingPantry = { id: button.dataset.pantryEdit, catId: button.dataset.catId };
        renderPantry();
      };
    });
    root.querySelectorAll('[data-pantry-delete]').forEach((button) => {
      button.onclick = () => {
        const entry = pantry.categories.find((item) => item.id === button.dataset.catId);
        entry.items = entry.items.filter((item) => item.id !== button.dataset.pantryDelete);
        store(STORAGE.pantry, pantry);
        renderPantry();
        generateText();
      };
    });
    root.querySelectorAll('[data-pantry-save]').forEach((button) => {
      button.onclick = () => {
        const name = root.querySelector('[data-pantry-edit-name]').value.trim();
        if (!name) return showToast('空欄では保存できない');
        const entry = pantry.categories.find((item) => item.id === button.dataset.catId);
        const item = entry.items.find((value) => value.id === button.dataset.pantrySave);
        if (item) item.name = name;
        editingPantry = null;
        store(STORAGE.pantry, pantry);
        renderPantry();
        generateText();
      };
    });
    root.querySelectorAll('[data-pantry-cancel]').forEach((button) => {
      button.onclick = () => {
        editingPantry = null;
        renderPantry();
      };
    });
    root.querySelectorAll('[data-cat-rename]').forEach((button) => {
      button.onclick = () => {
        const entry = pantry.categories.find((item) => item.id === button.dataset.catRename);
        const name = prompt('分類名', entry.name);
        if (name?.trim()) {
          entry.name = name.trim();
          store(STORAGE.pantry, pantry);
          renderPantry();
          generateText();
        }
      };
    });
    root.querySelectorAll('[data-cat-note]').forEach((button) => {
      button.onclick = () => {
        const entry = pantry.categories.find((item) => item.id === button.dataset.catNote);
        const note = prompt('説明', entry.note);
        if (note !== null) {
          entry.note = note;
          store(STORAGE.pantry, pantry);
          renderPantry();
          generateText();
        }
      };
    });
    root.querySelectorAll('[data-cat-delete]').forEach((button) => {
      button.onclick = () => {
        const entry = pantry.categories.find((item) => item.id === button.dataset.catDelete);
        if (!confirm(`「${entry.name}」を削除する？`)) return;
        pantry.categories = pantry.categories.filter((item) => item.id !== entry.id);
        store(STORAGE.pantry, pantry);
        renderPantry();
        generateText();
      };
    });
  }

  const cleanMeal = (value) => String(value || '').replace(/[（(]\s*(済|未)\s*[）)]/g, '').trim();

  function mealLines(meals, statusOn) {
    return MEALS.map(([key, label]) => {
      const value = meals?.[key];
      if (value && typeof value === 'object') {
        return `${label}:${cleanMeal(value.text) || '未定'}${statusOn ? `(${value.status})` : ''}`;
      }
      return `${label}:${cleanMeal(value) || '未定'}`;
    }).join('\n');
  }

  function names(list) {
    return list.length ? list.map((entry) => entry.name).join('、') : 'なし';
  }

  function activeItems(tag) {
    return draft.items.filter((entry) => entry.tag === tag && !entry.skipToday);
  }

  function urgentLines() {
    return `今日中：${names(activeItems('今日中'))}\n近日中：${names(activeItems('近日中'))}`;
  }

  function avoidLines() {
    return `避けたい：${names(activeItems('避けたい'))}\n在庫切れ：${names(activeItems('在庫切れ'))}`;
  }

  function todaySkipLines() {
    return names(draft.items.filter((entry) => entry.skipToday));
  }

  function pantryText() {
    return pantry.categories
      .filter((entry) => settings.includeSeasonings || !entry.seasoning)
      .map((entry) => `［${entry.name}］\n${names(entry.items)}${entry.note ? `\n注：${entry.note}` : ''}`)
      .join('\n\n') || 'なし';
  }

  function historyText(key) {
    const record = history[key];
    return record ? mealLines(record.meals, false) : '保存なし';
  }

  function generateText() {
    readUI();
    saveSettings();
    const parts = [displayDate(currentDate)];
    if (settings.promptOn && settings.prompt.trim()) parts.push(settings.prompt.trim());
    parts.push(`【今日の補足・相談したいこと】\n${draft.note.trim() || 'なし'}`);
    parts.push(`【今日食べるもの】\n${mealLines(draft.meals, true)}`);
    parts.push(`【使い切りを優先したいもの】\n${urgentLines()}`);
    parts.push(`【今週の候補】\n${names(activeItems('今週の候補'))}`);
    parts.push(`【食べたいもの】\n願望：${names(activeItems('願望'))}`);
    parts.push(`【今日だけ使わないもの】\n${todaySkipLines()}`);
    parts.push(`【避けたいもの・在庫切れ】\n${avoidLines()}`);
    parts.push(`【昨日食べたもの】\n${historyText(addDays(currentDate, -1))}`);
    if (settings.pantryOutput) parts.push(`【常備在庫表】\n${pantryText()}`);
    $('outputText').value = parts.join('\n\n');
    return $('outputText').value;
  }

  function parseFinalMenu(raw) {
    const text = String(raw || '').replace(/\r\n/g, '\n');
    const aliases = {
      breakfast: ['朝', '朝食', 'あさ', '朝ごはん', '朝ご飯'],
      lunch: ['昼', '昼食', 'ひる', '昼ごはん', '昼ご飯', 'ランチ'],
      dinner: ['夕', '夕食', '夜', '夜食', '晩', '晩ごはん', '晩ご飯', '夕ごはん', '夕ご飯', '夜ごはん', '夜ご飯', 'ディナー'],
      snack: ['間食', 'おやつ', 'お菓子', '補食', 'デザート'],
    };
    const out = {};
    Object.entries(aliases).forEach(([key, values]) => {
      const escaped = values.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      const match = text.match(new RegExp(`(?:^|\\n)\\s*(?:${escaped})\\s*[:：]\\s*([^\\n]+)`, 'm'));
      if (match) out[key] = cleanMeal(match[1]);
    });
    return out;
  }

  function saveRecord(key, raw) {
    const parsed = parseFinalMenu(raw);
    if (!Object.keys(parsed).length) {
      showToast('朝・昼・夕・間食の行が見つからない');
      return false;
    }
    if (key === currentDate) saveDraftNow();
    const base = drafts[key] ? normalizeDraft(drafts[key]) : blankDraft();
    const meals = {};
    MEALS.forEach(([mealKey]) => {
      meals[mealKey] = parsed[mealKey] || '';
    });
    history[key] = {
      date: key,
      meals,
      rawText: String(raw || '').trim(),
      items: clone(base.items),
      savedAt: new Date().toISOString(),
    };
    store(STORAGE.history, history);
    renderYesterday();
    renderHistory();
    generateText();
    return true;
  }

  function renderYesterday() {
    const key = addDays(currentDate, -1);
    $('yesterdayBox').textContent = `${displayDate(key)}\n${historyText(key)}`;
  }

  function renderHistory() {
    const root = $('historyList');
    const keys = Object.keys(history).sort().reverse();
    root.innerHTML = keys.length
      ? keys.slice(0, 30).map((key) => `
        <div class="history-entry">
          <b>${displayDate(key)}</b>
          <div class="history-summary">${escapeHtml(historyText(key))}</div>
          <div class="buttons">
            <button class="small" data-history-view="${key}">表示</button>
            <button class="small danger" data-history-delete="${key}">削除</button>
          </div>
        </div>`).join('')
      : '<div class="empty">保存履歴なし</div>';

    root.querySelectorAll('[data-history-view]').forEach((button) => {
      button.onclick = () => {
        $('finalMenu').value = history[button.dataset.historyView].rawText || historyText(button.dataset.historyView);
      };
    });
    root.querySelectorAll('[data-history-delete]').forEach((button) => {
      button.onclick = () => {
        if (!confirm(`${displayDate(button.dataset.historyDelete)}の履歴を削除する？`)) return;
        delete history[button.dataset.historyDelete];
        store(STORAGE.history, history);
        renderHistory();
        renderYesterday();
        generateText();
      };
    });
    updateMonths();
  }

  function monthKeys() {
    return [...new Set([...Object.keys(history), ...Object.keys(drafts)]
      .filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key))
      .map((key) => key.slice(0, 7)))].sort().reverse();
  }

  function updateMonths() {
    const select = $('monthSelect');
    const old = select.value;
    const months = monthKeys();
    select.innerHTML = months.map((month) => `<option value="${month}">${month.slice(0, 4)}年${Number(month.slice(5))}月</option>`).join('');
    if (months.includes(old)) select.value = old;
  }

  function subset(object, month) {
    const out = {};
    Object.entries(object).forEach(([key, value]) => {
      if (key.startsWith(`${month}-`)) out[key] = value;
    });
    return out;
  }

  function exportJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!confirm('現在のv5データへ読み込み内容を統合する？')) return;
        history = { ...history, ...(data.history || {}) };
        drafts = { ...drafts, ...(data.drafts || {}) };
        if (data.usuals) usuals = normalizeUsuals(data.usuals);
        if (data.settings) settings = normalizeSettings(data.settings);
        if (data.pantry) pantry = normalizePantry(data.pantry);
        store(STORAGE.history, history);
        store(STORAGE.drafts, drafts);
        store(STORAGE.usuals, usuals);
        store(STORAGE.settings, settings);
        store(STORAGE.pantry, pantry);
        applySettings();
        renderUsualEditor();
        renderPantry();
        loadDay(currentDate, false);
        showToast('JSONを読み込んだ');
      } catch (error) {
        console.error(error);
        showToast('JSONを読み込めなかった');
      }
    };
    reader.readAsText(file);
  }

  async function copyOutput() {
    const text = generateText();
    try {
      await navigator.clipboard.writeText(text);
      showToast('コピーした');
    } catch {
      $('outputText').focus();
      $('outputText').select();
      document.execCommand('copy');
      showToast('コピーした');
    }
  }

  function applySettings() {
    $('appendMode').checked = settings.appendMode;
    $('promptOn').checked = settings.promptOn;
    $('promptText').value = settings.prompt;
    $('pantryOutput').checked = settings.pantryOutput;
    $('includeSeasonings').checked = settings.includeSeasonings;
    updateSwitches();
  }

  function renderAll() {
    renderPlans();
    renderYesterday();
    renderHistory();
    renderUsualChips();
    generateText();
  }

  function bind() {
    $('prevDay').onclick = () => loadDay(addDays(currentDate, -1));
    $('nextDay').onclick = () => loadDay(addDays(currentDate, 1));
    $('todayBtn').onclick = () => loadDay(todayKey());
    $('dateInput').onchange = () => $('dateInput').value && loadDay($('dateInput').value);
    $('dailyNote').oninput = scheduleSave;
    $('appendMode').onchange = saveSettings;
    $('sameAllMeals').onclick = sameAllMeals;

    $('addPlan').onclick = () => {
      addPlan($('planName').value, $('planTag').value);
      $('planName').value = '';
      $('planName').focus();
    };
    $('planName').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        $('addPlan').click();
      }
    });

    ['promptOn', 'promptText', 'pantryOutput', 'includeSeasonings'].forEach((id) => {
      $(id).addEventListener(id === 'promptText' ? 'input' : 'change', () => {
        saveSettings();
        generateText();
      });
    });
    $('resetPrompt').onclick = () => {
      $('promptText').value = DEFAULT_PROMPT;
      saveSettings();
      generateText();
      showToast('標準へ戻した');
    };
    $('generateText').onclick = () => {
      generateText();
      showToast('相談文を更新した');
    };
    $('copyText').onclick = copyOutput;
    $('selectText').onclick = () => {
      $('outputText').focus();
      $('outputText').select();
    };

    $('pasteFinal').onclick = async () => {
      try {
        $('finalMenu').value = await navigator.clipboard.readText();
      } catch {
        showToast('貼り付け権限がないので手動で貼ってね');
      }
    };
    $('useOutput').onclick = () => {
      $('finalMenu').value = generateText();
    };
    $('saveToday').onclick = () => saveRecord(currentDate, $('finalMenu').value) && showToast('今日として保存した');
    $('saveYesterday').onclick = () => saveRecord(addDays(currentDate, -1), $('yesterdayEdit').value) && showToast('昨日として保存した');
    $('loadYesterdayToEdit').onclick = () => {
      const key = addDays(currentDate, -1);
      $('yesterdayEdit').value = history[key]?.rawText || historyText(key);
    };
    $('reloadYesterday').onclick = renderYesterday;

    $('addCategory').onclick = () => {
      const name = $('newCategoryName').value.trim();
      if (!name) return showToast('分類名を入力して');
      pantry.categories.push(category(name, $('newCategorySeasoning').checked));
      $('newCategoryName').value = '';
      $('newCategorySeasoning').checked = false;
      store(STORAGE.pantry, pantry);
      renderPantry();
      generateText();
    };

    $('exportAll').onclick = () => exportJson({
      version: '5.1.0',
      exportedAt: new Date().toISOString(),
      history,
      drafts,
      usuals,
      settings,
      pantry,
    }, `menu-prompt-backup-${todayKey()}.json`);
    $('importBtn').onclick = () => $('importFile').click();
    $('importFile').onchange = () => {
      const file = $('importFile').files?.[0];
      if (file) importJson(file);
      $('importFile').value = '';
    };
    $('exportMonth').onclick = () => {
      const month = $('monthSelect').value;
      if (!month) return showToast('月の記録がない');
      exportJson({
        version: '5.1.0',
        type: 'month',
        month,
        exportedAt: new Date().toISOString(),
        history: subset(history, month),
        drafts: subset(drafts, month),
      }, `menu-prompt-${month}.json`);
    };
    $('deleteMonth').onclick = () => {
      const month = $('monthSelect').value;
      if (!month) return showToast('月の記録がない');
      if (!confirm(`${month.slice(0, 4)}年${Number(month.slice(5))}月の履歴と下書きを削除する？`)) return;
      Object.keys(history).forEach((key) => {
        if (key.startsWith(`${month}-`)) delete history[key];
      });
      Object.keys(drafts).forEach((key) => {
        if (key.startsWith(`${month}-`)) delete drafts[key];
      });
      store(STORAGE.history, history);
      store(STORAGE.drafts, drafts);
      loadDay(currentDate, false);
      showToast('月別データを削除した');
    };
  }

  function init() {
    renderMeals();
    applySettings();
    bind();
    renderUsualEditor();
    renderPantry();
    loadDay(currentDate, false);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('service worker failed', error));
    }
    window.addEventListener('beforeunload', saveDraftNow);
    window.addEventListener('scroll', () => {
      if (window.scrollX) window.scrollTo(0, window.scrollY);
    }, { passive: true });
  }

  init();
})();