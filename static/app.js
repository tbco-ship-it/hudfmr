(async function () {
  const cssHref = document.querySelector('link[href*="static/style.css"]').getAttribute('href');
  const v = (cssHref.match(/\?v=([^&]+)/) || [])[1] || '';
  const base = cssHref.replace(/static\/style\.css.*$/, '');
  const $ = id => document.getElementById(id);
  const usd = n => Number.isFinite(n) ? '$' + n.toLocaleString('en-US') : '—';
  const BRL = ['Studio', '1 bedroom', '2 bedrooms', '3 bedrooms', '4 bedrooms'];
  const segWire = (seg, onPick) => seg && seg.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); onPick(+b.dataset.b); });

  // area / ZIP page: bedroom toggle re-renders FMR, the 90–110% range, the change and the area comparison for that bedroom size.
  const sheet = document.querySelector('.sheet[data-fmr]');
  if (sheet && $('br') && !$('q')) {
    const fmr = JSON.parse(sheet.dataset.fmr), prev = sheet.dataset.prev ? JSON.parse(sheet.dataset.prev) : null, ref = sheet.dataset.ref ? JSON.parse(sheet.dataset.ref) : null;
    const fy = (document.querySelector('.sheet-label')?.textContent.match(/FY\d{4}/) || [''])[0];
    const render = b => {
      const val = fmr[b];
      sheet.querySelector('[data-fmr-num]').textContent = usd(val);
      sheet.querySelector('[data-fmr-for]').textContent = BRL[b] + ' / month';
      let ps = val ? `Illustrative 90–110% range ${usd(Math.round(val * 0.9))}–${usd(Math.round(val * 1.1))}` : '';
      if (prev && prev[b] && val) { const ch = ((val - prev[b]) / prev[b] * 100).toFixed(1); ps += ` · ${+ch > 0 ? '+' : ''}${ch}% from last year`; }
      sheet.querySelector('[data-ps]').textContent = ps;
      const vs = sheet.querySelector('[data-vs]');
      if (vs && ref && ref[b] && val) { const d = ((val - ref[b]) / ref[b] * 100).toFixed(1); vs.textContent = +d === 0 ? 'Same as the area-wide FMR.' : `${+d > 0 ? '+' : ''}${d}% versus the same-bedroom area-wide FMR of ${usd(ref[b])}.`; }
      history.replaceState(null, '', b === 2 ? location.pathname : `${location.pathname}?br=${b}`);
    };
    segWire($('br'), render);
    const want = +(new URLSearchParams(location.search).get('br') || 2);
    if (want !== 2 && fmr[want] != null) { $('br').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', +x.dataset.b === want)); render(want); }
    return;
  }

  // home: ZIP or county typeahead
  const input = $('q'); if (!input) return;
  const out = $('result'), menu = $('q-menu'), status = $('search-status');
  let items = [], active = -1, current = null, br = 2;
  segWire($('br'), b => { br = b; if (current) out.innerHTML = card(current); });
  const say = msg => { status.hidden = !msg; status.textContent = msg || ''; };
  // ZIPs load per leading digit on first use (static/zips/<d>.json, ~300 KB each); failures are not cached, so a retry works.
  const ZC = {}, pendingZips = new Map(); let Z = [];
  async function loadZips(d) {
    if (ZC[d]) return ZC[d];
    if (pendingZips.has(d)) return pendingZips.get(d);
    const pending = (async () => {
      const r = await fetch(`${base}static/zips/${d}.json?v=${v}`); if (!r.ok) throw new Error('ZIP index: ' + r.status);
      const j = await r.json();
      ZC[d] = j.zips.map(z => ({ kind: 'zip', zip: z[0], area: j.codes[z[1]][0], path: j.codes[z[1]][1], fmr: z[2] }));
      Z = Object.values(ZC).flat(); return ZC[d];
    })();
    pendingZips.set(d, pending);
    try { return await pending; } finally { pendingZips.delete(d); }
  }
  // Area index loads in the background; ZIP search does not wait for it.
  let A = [];
  say('Loading county search…');
  const areasReady = (async () => {
    for (let attempt = 0; ; attempt++) {
      try { const r = await fetch(base + 'static/index.json?v=' + v); if (!r.ok) throw new Error(r.status); const IDX = await r.json(); A = IDX.areas.map(a => ({ kind: 'area', name: a[0], st: a[1], slug: a[2], area: a[3], fmr: a[4], prev2: a[5], town: !!a[6], q: (a[0] + ' ' + a[1] + ' ' + a[0] + a[1]).toLowerCase() })); say(''); return; }
      catch (e) { if (attempt < 2) { await new Promise(r => setTimeout(r, 1200 * (attempt + 1))); continue; } say('County search is unavailable — ZIP search still works, or browse by state.'); return; }
    }
  })();
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const EFFECTIVE = document.querySelector('.hero p')?.textContent.match(/effective ([^)]+)\)/)?.[1] || 'October 1';
  function card(c) {
    const f = c.fmr[br];
    const q = br === 2 ? '' : `?br=${br}`;
    const note = `Gross rent including utilities. Illustrative 90–110% range ${usd(Math.round(f * 0.9))}–${usd(Math.round(f * 1.1))} — not your PHA's verified payment standard or your voucher payment.`;
    if (c.kind === 'zip') return `<section class="sheet quiet"><p class="sheet-label">ZIP ${c.zip} · ${c.area} · Small Area FMR · effective ${EFFECTIVE}</p><div class="sheet-num"><span class="num">${usd(f)}</span><span class="pct">${BRL[br]} / month</span></div><p class="sheet-title">Studio ${usd(c.fmr[0])} · 1BR ${usd(c.fmr[1])} · 2BR ${usd(c.fmr[2])} · 3BR ${usd(c.fmr[3])} · 4BR ${usd(c.fmr[4])}</p><p class="sheet-text">${note}</p><p class="sheet-actions"><a class="next" href="${base}zip/${c.zip}/${q}">ZIP details & ranges</a>${c.path ? `<a class="next" href="${base}${c.path}${q}">${c.area.split(',')[0]} area FMR</a>` : ''}</p></section>`;
    const ch = c.prev2 && c.fmr[2] ? ((c.fmr[2] - c.prev2) / c.prev2 * 100).toFixed(1) : null;
    return `<section class="sheet quiet"><p class="sheet-label">${c.area} · effective ${EFFECTIVE}</p><div class="sheet-num"><span class="num">${usd(f)}</span><span class="pct">${BRL[br]} / month</span></div><p class="sheet-title">${c.name}, ${c.st}${ch !== null ? ` · 2BR ${+ch > 0 ? '+' : ''}${ch}% from last year` : ''}</p><p class="sheet-text">Studio ${usd(c.fmr[0])} · 1BR ${usd(c.fmr[1])} · 2BR ${usd(c.fmr[2])} · 3BR ${usd(c.fmr[3])} · 4BR ${usd(c.fmr[4])}. ${note}</p><p class="sheet-actions"><a class="next" href="${base}${c.st.toLowerCase()}/${c.slug}/${q}">All bedrooms, history & ZIPs</a></p></section>`;
  }
  let seq = 0;
  async function open(q) {
    const nq = norm(q), my = ++seq;
    let empty = nq ? 'Nothing by that name. Try the ZIP code or the county name.' : 'Type a ZIP code or a county.';
    if (/^\d{1,5}$/.test(nq)) {
      if (nq.length < 3) { items = []; menu.innerHTML = '<li class="empty">Keep typing the ZIP code…</li>'; menu.hidden = false; return; }
      try { const part = await loadZips(nq[0]); if (my !== seq) return; items = part.filter(z => z.zip.startsWith(nq)).slice(0, 8); empty = 'No Small Area FMR for this ZIP — try the county name.'; }
      catch (e) { if (my !== seq) return; items = []; empty = 'Couldn\'t load ZIP rents. Try again or browse by state.'; }
    } else { if (!A.length) await areasReady; if (my !== seq) return; items = nq ? A.filter(a => a.q.includes(nq)).sort((a, b) => a.town - b.town || (b.fmr[2] || 0) - (a.fmr[2] || 0)).slice(0, 8) : []; }
    menu.innerHTML = items.length ? items.map((c, i) => `<li role="option" id="q-option-${i}" data-i="${i}" aria-selected="${i === active}">${c.kind === 'zip' ? `ZIP ${c.zip}<small class="muted"> ${c.area}</small>` : `${c.name}, ${c.st}<small class="muted"> ${c.town ? 'town · ' : ''}2BR ${usd(c.fmr[2])}</small>`}</li>`).join('') : `<li class="empty">${empty}</li>`;
    menu.hidden = false; input.setAttribute('aria-expanded', 'true');
    if (active >= 0 && items[active]) input.setAttribute('aria-activedescendant', `q-option-${active}`); else input.removeAttribute('aria-activedescendant');
  }
  function close() { menu.hidden = true; active = -1; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
  function leaveLanding() {
    const html = document.documentElement; if (!html.classList.contains('landing')) return;
    const stage = $('stage'), hero = stage.firstElementChild;
    const y0 = hero.getBoundingClientRect().top;
    html.classList.remove('landing');
    const dy = y0 - hero.getBoundingClientRect().top;
    if (dy > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      stage.style.transition = 'none'; stage.style.transform = `translateY(${dy}px)`; void stage.offsetHeight;
      stage.style.transition = 'transform 1s cubic-bezier(.16,1,.3,1)'; stage.style.transform = 'translateY(0)';
      stage.addEventListener('transitionend', () => { stage.style.transition = ''; stage.style.transform = ''; }, { once: true });
    }
    if (window.__reveal) window.__reveal($('below'), true, 500);
  }
  // The answer appears at once; only the sections below rise in.
  function show(html) { leaveLanding(); out.classList.remove('reveal', 'is-in'); out.innerHTML = html; }
  function choose(c) {
    current = c; input.value = c.kind === 'zip' ? c.zip : `${c.name}, ${c.st}`; close(); show(card(c));
    say(`${c.kind === 'zip' ? 'ZIP ' + c.zip : c.name + ', ' + c.st}. ${BRL[br]} HUD rent: ${usd(c.fmr[br])} per month.`);
    localStorage.setItem('fmr.q', JSON.stringify(c.kind === 'zip' ? ['zip', c.zip] : ['area', c.st, c.slug]));
    if (innerWidth < 900) setTimeout(() => out.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 60);
  }
  input.addEventListener('focus', () => { setTimeout(() => input.select(), 0); open(input.value); });
  input.addEventListener('input', () => { active = -1; open(input.value); });
  input.addEventListener('keydown', e => {
    if (menu.hidden) return;
    if (e.key === 'ArrowDown') { active = Math.min(active + 1, items.length - 1); open(input.value); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); open(input.value); e.preventDefault(); }
    else if (e.key === 'Enter') { const it = items[active >= 0 ? active : 0]; if (it) choose(it); e.preventDefault(); }
    else if (e.key === 'Escape') close();
  });
  menu.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { choose(items[+li.dataset.i]); e.preventDefault(); } });
  input.addEventListener('blur', () => setTimeout(close, 120));
  const rem = JSON.parse(localStorage.getItem('fmr.q') || 'null');
  if (rem && rem[0] === 'zip') await loadZips(rem[1][0]).catch(() => {}); else await areasReady;
  const remembered = rem && (rem[0] === 'zip' ? Z.find(z => z.zip === rem[1]) : A.find(a => a.st === rem[1] && a.slug === rem[2]));
  if (remembered) { $('last-name').textContent = remembered.kind === 'zip' ? 'ZIP ' + remembered.zip : `${remembered.name}, ${remembered.st}`; $('last').hidden = false; $('last').addEventListener('click', () => choose(remembered)); }
})();
