(() => {
  'use strict';

  const DRAFTS_KEY = 'menuPromptGenerator.v5.drafts';
  const PLANS_KEY = 'menuPromptGenerator.v5.planItems';
  const ALL_TAGS = ['今日中', '近日中', '今週の候補', '願望', '避けたい', '在庫切れ'];
  const SKIPPABLE_TAGS = ['近日中', '今週の候補', '願望'];
  const originalParse = JSON.parse.bind(JSON);
  const originalStringify = JSON.stringify.bind(JSON);
  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;
  let wrapNextDraftParse = false;

  const pad = (value) => String(value).padStart(2, '0');
  const todayKey = () => {
    const date = new Date();
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };
  const addDays = (key, amount) => {
    const [year, month, day] = key.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + amount);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };
  const uid = () => globalThis.crypto?.randomUUID?.()
    || `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const cleanName = (value) => String(value || '').trim();
  const nameKey = (value) => cleanName(value).normalize('NFKC').toLocaleLowerCase('ja-JP');

  function normalizeItem(value, fallbackTag = '今週の候補') {
    if (typeof value === 'string') {
      const name = cleanName(value);
      return name ? { id: uid(), name, tag: fallbackTag, skipToday: false } : null;
    }
    const name = cleanName(value?.name);
    if (!name) return null;
    return {
      id: cleanName(value?.id) || uid(),
      name,
      tag: ALL_TAGS.includes(value?.tag) ? value.tag : fallbackTag,
      skipToday: SKIPPABLE_TAGS.includes(value?.tag) && Boolean(value?.skipToday),
    };
  }

  function draftItems(value) {
    if (Array.isArray(value?.items)) {
      return value.items.map((item) => normalizeItem(item)).filter(Boolean);
    }
    const migrated = [];
    (Array.isArray(value?.urgent) ? value.urgent : []).forEach((item) => {
      migrated.push(normalizeItem(item, item?.tag === '今日中' ? '今日中' : '近日中'));
    });
    (Array.isArray(value?.candidates) ? value.candidates : []).forEach((item) => {
      migrated.push(normalizeItem(item, '今週の候補'));
    });
    (Array.isArray(value?.wishes) ? value.wishes : []).forEach((item) => {
      migrated.push(normalizeItem(item, '願望'));
    });
    (Array.isArray(value?.avoids) ? value.avoids : []).forEach((item) => {
      migrated.push(normalizeItem(item, item?.tag === '在庫切れ' ? '在庫切れ' : '避けたい'));
    });
    return migrated.filter(Boolean);
  }

  function dedupeItems(lists) {
    const seen = new Set();
    const out = [];
    lists.flat().forEach((value) => {
      const item = normalizeItem(value);
      if (!item) return;
      const key = nameKey(item.name);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ ...item, skipToday: false });
    });
    return out;
  }

  function loadStoredPlans() {
    try {
      const raw = originalGetItem.call(localStorage, PLANS_KEY);
      if (!raw) return null;
      const parsed = originalParse(raw);
      if (!Array.isArray(parsed)) return null;
      return dedupeItems([parsed]);
    } catch (error) {
      console.warn('plan list read failed', error);
      return null;
    }
  }

  function migratePlans(drafts) {
    const today = todayKey();
    const preferredKeys = [today, addDays(today, -1), addDays(today, 1)];
    const preferred = preferredKeys
      .filter((key) => drafts && Object.prototype.hasOwnProperty.call(drafts, key))
      .map((key) => draftItems(drafts[key]));
    let items = dedupeItems(preferred);

    if (!items.length && drafts && typeof drafts === 'object') {
      const latestKey = Object.keys(drafts)
        .filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key) && draftItems(drafts[key]).length)
        .sort()
        .reverse()[0];
      if (latestKey) items = dedupeItems([draftItems(drafts[latestKey])]);
    }
    return items;
  }

  function persistPlans(items) {
    try {
      originalSetItem.call(localStorage, PLANS_KEY, originalStringify(items.map((item) => ({
        id: item.id,
        name: item.name,
        tag: item.tag,
        skipToday: false,
      }))));
    } catch (error) {
      console.warn('plan list write failed', error);
    }
  }

  function makeDraftProxy(source) {
    const target = source && typeof source === 'object' ? source : {};
    let sharedItems = loadStoredPlans();
    if (!sharedItems) {
      sharedItems = migratePlans(target);
      persistPlans(sharedItems);
    }

    const itemSnapshotForDate = (dateKey) => {
      const baseItems = draftItems(target[dateKey]);
      const skippedIds = new Set(baseItems.filter((item) => item.skipToday).map((item) => item.id));
      const skippedNames = new Set(baseItems.filter((item) => item.skipToday).map((item) => nameKey(item.name)));
      return sharedItems.map((item) => ({
        ...item,
        skipToday: SKIPPABLE_TAGS.includes(item.tag)
          && (skippedIds.has(item.id) || skippedNames.has(nameKey(item.name))),
      }));
    };

    return new Proxy(target, {
      get(object, property, receiver) {
        if (typeof property === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(property)) {
          const base = Reflect.get(object, property, receiver);
          if (!base) return { note: '', meals: {}, items: itemSnapshotForDate(property) };
          return { ...base, items: itemSnapshotForDate(property) };
        }
        return Reflect.get(object, property, receiver);
      },
      set(object, property, value, receiver) {
        if (typeof property === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(property) && value && typeof value === 'object') {
          const existed = Object.prototype.hasOwnProperty.call(object, property);
          const incoming = draftItems(value);
          const skipped = incoming.filter((item) => item.skipToday);

          if (existed) {
            sharedItems = dedupeItems([incoming]);
            persistPlans(sharedItems);
          }

          const stored = {
            ...value,
            items: sharedItems.map((item) => ({
              ...item,
              skipToday: SKIPPABLE_TAGS.includes(item.tag) && skipped.some((skip) => (
                skip.id === item.id || nameKey(skip.name) === nameKey(item.name)
              )),
            })),
          };
          return Reflect.set(object, property, stored, receiver);
        }
        return Reflect.set(object, property, value, receiver);
      },
      deleteProperty(object, property) {
        return Reflect.deleteProperty(object, property);
      },
    });
  }

  Storage.prototype.getItem = function patchedGetItem(key) {
    const value = originalGetItem.call(this, key);
    if (this === localStorage && key === DRAFTS_KEY) wrapNextDraftParse = true;
    return value;
  };

  JSON.parse = function patchedParse(text, reviver) {
    const parsed = originalParse(text, reviver);
    if (!wrapNextDraftParse) return parsed;
    wrapNextDraftParse = false;
    return makeDraftProxy(parsed);
  };

  document.addEventListener('change', (event) => {
    if (event.target?.id !== 'importFile' || !event.target.files?.length) return;
    setTimeout(() => location.reload(), 900);
  }, true);
})();
