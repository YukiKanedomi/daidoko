/* だいどこ — ビルド不要の静的アプリ。data/*.json を読んで描画する。 */
(function () {
  'use strict';

  const $app = document.getElementById('app');
  const $tab = document.getElementById('tab');
  const DOW = ['日', '月', '火', '水', '木', '金', '土'];
  const D = {}; // 読み込んだデータ

  // ---- 日付 --------------------------------------------------------------
  const params = new URLSearchParams(location.search);
  function todayStr() {
    if (params.get('today')) return params.get('today');
    const t = new Date();
    const jst = new Date(t.getTime() + (t.getTimezoneOffset() + 540) * 60000);
    return jst.toISOString().slice(0, 10);
  }
  const TODAY = todayStr();
  const fmtDate = (s) => { const [y, m, d] = s.split('-').map(Number); return `${m}月${d}日 ${DOW[new Date(y, m - 1, d).getDay()]}曜日`; };
  const md = (s) => { const [, m, d] = s.split('-').map(Number); return `${m}/${d}`; };
  const isWeekend = (s) => { const [y, m, d] = s.split('-').map(Number); const w = new Date(y, m - 1, d).getDay(); return w === 0 || w === 6; };

  // ---- 状態（この端末だけ） ----------------------------------------------
  const store = {
    get(k, def) { try { const v = localStorage.getItem('daidoko:' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem('daidoko:' + k, JSON.stringify(v)); } catch (e) { /* 保存できなくても動く */ } }
  };
  const picks = () => store.get('picks', {});      // {date: dishId}  「これにする」
  const checks = () => store.get('checks', {});    // {week|store|item: true}
  const notes = () => store.get('notes', {});      // {date: text}

  // ---- 部品 --------------------------------------------------------------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const photo = (p) => p ? `photos/${p}` : '';
  let toastT;
  function toast(msg, chara) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
    el.innerHTML = (chara ? `<img src="chara/${chara}.png" alt="">` : '') + `<span>${esc(msg)}</span>`;
    el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), chara ? 2200 : 1600);
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); toast('コピーしました。チャットに貼ってください'); }
    catch (e) { window.prompt('コピーしてチャットに貼ってください', t); }
  }

  // 主菜に合わせてヘッダーの住人を替える（せいろ=4人組、卵の日=卵、それ以外=マンドゥ2人）
  const charaFor = (m) => ((m.tags || []).includes('せいろ') ? 'friends' : /卵|かき玉/.test(m.name) ? 'egg' : 'peek');
  const head = (sub, title, chara) => `<div class="top"><div><div class="date">${esc(sub)}</div><h1>${esc(title)}</h1></div>${chara ? `<img class="chara" src="chara/${chara}.png" alt="">` : ''}</div>`;
  function dayOf(date) { return D.plan.days.find((d) => d.date === date); }
  // 候補カードは名前と写真だけなので、同じ料理が主案になっている日から副菜・汁物・作り方を引き当てる
  function fullDish(x) {
    if (x.steps) return x;
    const src = D.plan.days.map((d) => d.main).find((m) => m.id === x.id && m.steps);
    return src ? Object.assign({}, src, { photo: x.photo || src.photo }) : x;
  }
  function allDishes(day) { return [day.main, ...(day.alts || [])].map(fullDish); }
  function chosen(day) { const id = picks()[day.date]; return allDishes(day).find((x) => x.id === id) || null; }
  function shown(day) { return chosen(day) || day.main; }

  // ---- 今夜（平日） ------------------------------------------------------
  function viewTonight(date) {
    const day = dayOf(date);
    if (!day) return `${head(fmtDate(date), '今夜のこんだて')}<div class="empty"><img src="chara/sleep.png" alt=""><p>この日の案はまだありません。<br>次の生成で出ます。</p></div>`;
    if (day.weekend) return viewWeekend(day);
    const main = shown(day);
    const done = !!picks()[day.date];
    const alts = allDishes(day).filter((x) => x.id !== main.id).slice(0, 2);
    const chips = [`<span class="chip acc">${main.minutes ? main.minutes + '分' : '買って帰る'}</span>`, '<span class="chip">2人前</span>', ...(main.tags || []).map((t) => `<span class="chip">${esc(t)}</span>`)].join('');
    const set = [main.side ? `副菜 <b>${esc(main.side)}</b>` : '', main.soup ? `汁物 <b>${esc(main.soup)}</b>` : ''].filter(Boolean).join('　');
    const steps = (main.steps || []).map((s, i) => `<li><b>${i + 1}</b><span>${esc(s)}</span></li>`).join('');
    const shopN = countShopping();
    return `
      ${head(fmtDate(date), '今夜のこんだて', charaFor(main))}
      ${weekStrip(date)}
      <div class="hero"><img src="${photo(main.photo)}" alt=""><div class="body">
        <div class="chips">${chips}</div>
        <h2>${esc(main.name)}</h2>
        <div class="set">${set}</div>
        <div class="row"><button class="btn ${done ? 'done' : ''}" data-pick="${esc(main.id)}" data-date="${day.date}">${done ? 'これにした' : 'これにする'}</button><button class="btn ghost" data-toggle="steps">作り方</button></div>
        <ol class="steps" id="steps" hidden>${steps}${main.recipe_url ? `<li class="link"><a href="${esc(main.recipe_url)}" target="_blank" rel="noopener">ちゃんとしたレシピ: ${esc(main.recipe_site || 'レシピサイト')} ›</a></li>` : ''}</ol>
      </div></div>
      <div class="sec"><h3>ほかの案</h3></div>
      <div class="alts">${alts.map((a) => `<button class="alt" data-swap="${esc(a.id)}" data-date="${day.date}"><img src="${photo(a.photo)}" alt=""><div class="b"><div class="t">${a.minutes ? a.minutes + '分' : '買って帰る'}</div><h4>${esc(a.name)}</h4></div></button>`).join('')}</div>
      <a class="card shopsum" href="#shop"><svg viewBox="0 0 24 24"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="10" cy="20" r="1"/><circle cx="17" cy="20" r="1"/></svg><div><div class="k">買い出し ${shopN.left}点</div><div class="v">${esc(D.plan.shopping.for)}</div></div><span class="chev">›</span></a>
      ${D.plan.health ? `<div class="foot health"><img src="chara/broccoli.png" alt=""><span>${esc(D.plan.health)}</span></div>` : ''}
      ${noteBox(day.date)}`;
  }

  function weekStrip(date) {
    const p = picks();
    return `<div class="weekstrip">${D.plan.days.map((d) => {
      const cls = [d.date === date ? 'on' : '', p[d.date] ? 'done' : '', d.weekend ? 'wk' : ''].join(' ');
      return `<a href="#tonight/${d.date}" class="${cls}">${d.dow}<b>${Number(d.date.slice(8))}</b><i></i></a>`;
    }).join('')}</div>`;
  }

  function noteBox(date) {
    const t = notes()[date] || '';
    return `<div class="note"><textarea id="note" data-date="${date}" placeholder="「鶏むねが余ってる」「来週は水曜が外食」など、ひとこと">${esc(t)}</textarea>
      <div class="foot"><span>このスマホに残ります</span><button data-copy="1">まとめてコピー</button></div></div>`;
  }

  // ---- 今週末 ------------------------------------------------------------
  function viewWeekend(day) {
    const w = D.plan.weekend;
    const prep = w.prep;
    const p = picks();
    const main = prep[0], alts = prep.slice(1, 3);
    const nextDays = D.plan.days.filter((d) => !d.weekend);
    const tonight = shown(day);
    return `
      ${head(fmtDate(day.date), '今週末', 'apron')}
      <div class="lead">来週の平日ぶんを、仕込みと買い出しで用意します。</div>
      <div class="sec"><h3>仕込み</h3></div>
      <div class="hero"><img src="${photo(main.photo)}" alt=""><div class="body">
        <div class="chips"><span class="chip acc">${main.minutes}分</span><span class="chip">冷凍 ${esc(main.servings)}</span><span class="chip">${esc(main.reheat)}</span></div>
        <h2>${esc(main.name)}</h2>
        <div class="set">${esc(main.why)}</div>
        ${main.recipe_url ? `<div class="set" style="margin-top:4px"><a class="lnk" href="${esc(main.recipe_url)}" target="_blank" rel="noopener">レシピ: ${esc(main.recipe_site || 'レシピサイト')} ›</a></div>` : ''}
        <div class="row"><button class="btn ${p['prep:' + main.id] ? 'done' : ''}" data-prep="${esc(main.id)}">${p['prep:' + main.id] ? 'やる' : 'やる'}</button><button class="btn ghost" data-prep-no="${esc(main.id)}">今回はなし</button></div>
      </div></div>
      <div class="alts">${alts.map((a) => `<div class="alt"><button class="altbtn" data-prep="${esc(a.id)}"><img src="${photo(a.photo)}" alt=""><div class="b"><div class="t">${a.minutes}分 · ${esc(a.servings)}${p['prep:' + a.id] ? ' · やる' : ''}</div><h4>${esc(a.name)}</h4></div></button>${a.recipe_url ? `<a class="lnk small" href="${esc(a.recipe_url)}" target="_blank" rel="noopener">レシピ ›</a>` : ''}</div>`).join('')}</div>
      <div class="sec"><h3>買い出し</h3><a href="#shop">リストを開く</a></div>
      <div class="stores">${D.plan.shopping.stores.map((s) => {
        const items = s.groups.flatMap((g) => g.items);
        const names = items.filter((i) => !i.maybe).map((i) => i.n).join('・');
        return `<a class="st" href="#shop/${esc(s.id)}"><div class="ico">${esc(s.name.slice(0, 1))}</div><div><div class="k">${esc(shortStore(s.name))}<span>${items.length}点</span></div><div class="v">${esc(names)}${s.flyer ? `<b>${esc(s.flyer)}</b>` : ''}</div></div><span class="chev">›</span></a>`;
      }).join('')}</div>
      <div class="sec"><h3>今夜</h3></div>
      <div class="hero"><img src="${photo(tonight.photo)}" alt=""><div class="body">
        <div class="chips"><span class="chip acc">${tonight.minutes ? tonight.minutes + '分' : '買って帰る'}</span>${(tonight.tags || []).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>
        <h2>${esc(tonight.name)}</h2>
        <div class="set">${[tonight.side ? `副菜 <b>${esc(tonight.side)}</b>` : '', tonight.soup ? `汁物 <b>${esc(tonight.soup)}</b>` : ''].filter(Boolean).join('　')}</div>
        <div class="row"><button class="btn ${p[day.date] ? 'done' : ''}" data-pick="${esc(tonight.id)}" data-date="${day.date}">${p[day.date] ? 'これにした' : 'これにする'}</button></div>
      </div></div>
      <div class="alts">${allDishes(day).filter((x) => x.id !== tonight.id).slice(0, 2).map((a) => `<button class="alt" data-swap="${esc(a.id)}" data-date="${day.date}"><img src="${photo(a.photo)}" alt=""><div class="b"><div class="t">${a.minutes ? a.minutes + '分' : '買って帰る'}</div><h4>${esc(a.name)}</h4></div></button>`).join('')}</div>
      ${newcomerCard()}
      <div class="sec"><h3>来週の平日</h3><a href="#week">こんだて表</a></div>
      <div class="wdays">${nextDays.map((d) => `<a class="wd" href="#tonight/${d.date}"><div class="d">${d.dow}</div><div class="n">${esc(shortName(shown(d).name))}</div><div class="m">${shown(d).minutes}分</div></a>`).join('')}</div>
      ${D.plan.health ? `<div class="foot health"><img src="chara/broccoli.png" alt=""><span>${esc(D.plan.health)}</span></div>` : ''}
      ${noteBox(day.date)}`;
  }
  function newcomerCard() {
    const n = D.plan.newcomer; if (!n) return '';
    const on = !!picks()['new:' + n.id];
    return `<div class="sec"><h3>今週の新顔</h3><span class="sub" style="font-size:12px;color:var(--mute)">1つだけ</span></div>
      <div class="card"><div class="k">${esc(n.name)}<span style="font-weight:500;color:var(--sub);font-size:12px;margin-left:6px">${esc(n.store)}</span></div>
      <div class="v">${esc(n.how)}</div><div class="v" style="margin-top:6px;color:var(--ink)">${esc(n.why)}</div>${n.note ? `<div class="v">${esc(n.note)}</div>` : ''}${n.url ? `<div class="v" style="margin-top:6px"><a class="lnk" href="${esc(n.url)}" target="_blank" rel="noopener">商品ページ（写真・原材料） ›</a></div>` : ''}
      <div class="row"><button class="btn ${on ? 'done' : ''}" data-new="${esc(n.id)}">${on ? '買い物に入れた' : '試してみる'}</button></div></div>`;
  }
  const shortStore = (n) => n.replace('イトーヨーカドー アリオ橋本', 'ヨーカドー').replace('ミートショップ', '').replace('さかなや', '').replace('（家の前）', '');
  const shortName = (n) => n.split(/[ （(]/)[0];

  // ---- こんだて表 --------------------------------------------------------
  function viewWeek() {
    const p = picks();
    return `
      ${head(D.plan.week, 'こんだて表', 'steamer')}
      <div class="list">${D.plan.days.map((d) => {
        const m = shown(d);
        const past = d.date < TODAY;
        const t = p[d.date] ? '<div class="t done">これにした</div>' : (past ? '<div class="t done" style="color:var(--mute)">記録なし</div>' : `<div class="t">${d.date === TODAY ? '今夜 · ' : ''}${m.minutes ? m.minutes + '分' : '買って帰る'}</div>`);
        const set = [m.side, m.soup].filter(Boolean).join(' · ');
        return `<a class="dayrow ${d.date === TODAY ? 'today' : ''}" href="#tonight/${d.date}"><div class="cal"><div class="w">${d.dow}</div><div class="n">${Number(d.date.slice(8))}</div></div><img src="${photo(m.photo)}" alt=""><div class="b">${t}<h4>${esc(m.name)}</h4><div class="set">${esc(set || (d.weekend ? '仕込みと買い出しの日' : ''))}</div></div><span class="chev">›</span></a>`;
      }).join('')}</div>
      <div class="foot">${esc(D.plan.note)}<br>作らなかった日はそのまま。何も操作しなくて大丈夫です。</div>`;
  }

  // ---- 買い物 ------------------------------------------------------------
  function countShopping() {
    const c = checks(); let total = 0, left = 0;
    D.plan.shopping.stores.forEach((s) => s.groups.forEach((g) => g.items.forEach((i) => { total++; if (!c[ck(s, i)]) left++; })));
    return { total, left };
  }
  const ck = (s, i) => `${D.plan.week}|${s.id}|${i.n}`;
  function viewShop(storeId) {
    const stores = D.plan.shopping.stores;
    const cur = stores.find((s) => s.id === storeId) || stores[0];
    const c = checks();
    const n = countShopping();
    return `
      ${head(D.plan.shopping.for, '買い物', 'basket')}
      <div class="seg">${stores.map((s) => `<button class="${s.id === cur.id ? 'on' : ''}" data-store="${esc(s.id)}">${esc(shortStore(s.name))}</button>`).join('')}</div>
      <div class="store"><div><div class="name">${esc(cur.name)}</div><div class="meta">${esc(cur.when)}</div></div></div>
      ${cur.flyer ? `<div class="flyer">${esc(cur.flyer)}</div>` : ''}
      ${cur.groups.map((g) => `<div class="group"><h3>${esc(g.cat)}</h3>${g.items.map((i) => {
        const on = !!c[ck(cur, i)];
        const dim = i.maybe || (g.cat.startsWith('新顔') && D.plan.newcomer && !picks()['new:' + D.plan.newcomer.id]);
        return `<button class="item ${on ? 'on' : ''} ${dim ? 'maybe' : ''}" data-check="${esc(ck(cur, i))}"><span class="box"></span><div><div class="n">${esc(i.n)}</div><div class="for">${esc(i.for)}</div></div><span class="q">${esc(i.maybe && !i.q ? '家にあるかも' : i.q)}</span></button>`;
      }).join('')}</div>`).join('')}
      <div class="tip"><b>薄い字は家にありそうな物</b>。確認してからで大丈夫です。全部で ${n.total} 点、残り ${n.left} 点。チェックはこのスマホに残ります。</div>`;
  }

  // ---- ルーター ----------------------------------------------------------
  function route() {
    const h = location.hash.replace(/^#/, '') || 'tonight';
    const [view, arg] = h.split('/');
    let html = '';
    if (view === 'week') html = viewWeek();
    else if (view === 'shop') html = viewShop(arg);
    else html = viewTonight(arg || TODAY);
    $app.innerHTML = html;
    $tab.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.view === (['week', 'shop'].includes(view) ? view : 'tonight')));
    window.scrollTo(0, 0);
  }

  // ---- 操作 --------------------------------------------------------------
  $app.addEventListener('click', (e) => {
    const t = e.target.closest('[data-pick],[data-swap],[data-toggle],[data-check],[data-store],[data-prep],[data-prep-no],[data-copy],[data-new]');
    if (!t) return;
    const p = picks();
    if (t.dataset.pick) { p[t.dataset.date] = t.dataset.pick; store.set('picks', p); toast('今夜はこれに', 'cheer'); route(); }
    else if (t.dataset.swap) { p[t.dataset.date] = t.dataset.swap; store.set('picks', p); route(); }
    else if (t.dataset.toggle) { const s = document.getElementById('steps'); s.hidden = !s.hidden; }
    else if (t.dataset.check) { const c = checks(); c[t.dataset.check] = !c[t.dataset.check]; store.set('checks', c); t.classList.toggle('on'); }
    else if (t.dataset.store) { location.hash = '#shop/' + t.dataset.store; }
    else if (t.dataset.prep) { p['prep:' + t.dataset.prep] = !p['prep:' + t.dataset.prep]; store.set('picks', p); toast(p['prep:' + t.dataset.prep] ? '仕込みに入れました' : '外しました', p['prep:' + t.dataset.prep] ? 'cheer' : null); route(); }
    else if (t.dataset.prepNo) { delete p['prep:' + t.dataset.prepNo]; store.set('picks', p); toast('今回はなしに'); route(); }
    else if (t.dataset.new) { p['new:' + t.dataset.new] = !p['new:' + t.dataset.new]; store.set('picks', p); toast(p['new:' + t.dataset.new] ? '買い物リストに入れました' : '外しました'); route(); }
    else if (t.dataset.copy) { copyText(summary()); }
  });
  $app.addEventListener('input', (e) => {
    if (e.target.id === 'note') { const n = notes(); n[e.target.dataset.date] = e.target.value; store.set('notes', n); }
  });
  window.addEventListener('hashchange', route);

  function summary() {
    const p = picks(), n = notes();
    const lines = ['だいどこ ' + D.plan.week];
    D.plan.days.forEach((d) => {
      const c = chosen(d);
      if (c) lines.push(`${md(d.date)}(${d.dow}) これにした: ${c.name}`);
      if (n[d.date]) lines.push(`${md(d.date)}(${d.dow}) ひとこと: ${n[d.date]}`);
    });
    const prep = D.plan.weekend.prep.filter((x) => p['prep:' + x.id]).map((x) => x.name);
    if (prep.length) lines.push('仕込み やる: ' + prep.join('、'));
    if (D.plan.newcomer && p['new:' + D.plan.newcomer.id]) lines.push('新顔 試す: ' + D.plan.newcomer.name);
    const c = checks(); const bought = [];
    D.plan.shopping.stores.forEach((s) => s.groups.forEach((g) => g.items.forEach((i) => { if (c[ck(s, i)]) bought.push(i.n); })));
    if (bought.length) lines.push('買った: ' + bought.join('、'));
    return lines.join('\n');
  }

  // ---- 起動 --------------------------------------------------------------
  async function load(name) { const r = await fetch(`data/${name}.json`, { cache: 'no-cache' }); if (!r.ok) throw new Error(name); return r.json(); }
  Promise.all(['plan'].map(load))
    .then(([plan]) => { Object.assign(D, { plan }); route(); })
    .catch((e) => { $app.innerHTML = `<div class="loading">データを読めませんでした（${esc(e.message)}）。しばらくしてから開き直してください。</div>`; });
})();
