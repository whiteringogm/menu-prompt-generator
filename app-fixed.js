(async () => {
  'use strict';
  try {
    const response = await fetch('./app.js?v=502', { cache: 'no-store' });
    if (!response.ok) throw new Error(`app.jsの取得に失敗: ${response.status}`);
    let source = await response.text();
    const broken = "  let currentDate=todayKey(), draft=blankDraft(), saveTimer, toastTimer, editingPlan=null, editingUsual=null, editingPantry=null;\n  const pad=(n)=>String(n).padStart(2,'0');";
    const fixed = "  const pad=(n)=>String(n).padStart(2,'0');\n  let currentDate=todayKey(), draft=blankDraft(), saveTimer, toastTimer, editingPlan=null, editingUsual=null, editingPantry=null;";
    if (!source.includes(broken)) throw new Error('初期化順の修正対象が見つからない');
    source = source.replace(broken, fixed);
    (0, eval)(source);
  } catch (error) {
    console.error(error);
    const status = document.getElementById('saveStatus');
    const output = document.getElementById('outputText');
    if (status) status.textContent = '読み込み失敗';
    if (output) output.value = `初期化エラー: ${error.message || error}`;
  }
})();
