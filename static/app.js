(async function () {
  const cssHref = document.querySelector('link[href*="static/style.css"]').getAttribute('href');
  const v = (cssHref.match(/\?v=([^&]+)/) || [])[1] || '';
  const base = cssHref.replace(/static\/style\.css.*$/, '');
  const $ = id => document.getElementById(id);
  const usd = n => Number.isFinite(n) ? '$' + n.toLocaleString('en-US') : '—';
  const BRL = ['Studio', '1 bedroom', '2 bedrooms', '3 bedrooms', '4 bedrooms'];
  const segWire = (seg, onPick) => seg && seg.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); onPick(+b.dataset.b); });

  // area / ZIP page: bedroom toggle drives the big number (first sheet on the page)
  const sheet = document.querySelector('.sheet[data-fmr]');
  if (sheet && $('br') && !$('q')) {
    const fmr = JSON.parse(sheet.dataset.fmr);
    segWire($('br'), b => { $('fmr-num').textContent = usd(fmr[b]); $('fmr-for').textContent = BRL[b] + ' / month'; });
    return;
  }

  // home: ZIP or county typeahead
  const input = $('q'); if (!input) return;
  const out = $('result'), menu = $('q-menu');
  let br = 2; segWire($('br'), b => { br = b; if (current) out.innerHTML = card(current); });
  const ph = input.placeholder; input.placeholder = 'Loading areas…'; input.disabled = true;
  let IDX;
  for (let attempt = 0; ; attempt++) {
    try { const r = await fetch(base + 'static/index.json?v=' + v); if (!r.ok) throw new Error(r.status); IDX = await r.json(); break; }
    catch (e) { if (attempt < 2) { await new Promise(r => setTimeout(r, 1200 * (attempt + 1))); continue; } input.placeholder = 'Could not load — reload or browse by state'; return; }
  }
  input.placeholder = ph; input.disabled = false;
  const A = IDX.areas.map(a => ({ kind: 'area', name: a[0], st: a[1], slug: a[2], area: a[3], fmr: a[4], prev2: a[5], town: !!a[6], q: (a[0] + ' ' + a[1] + ' ' + a[0] + a[1]).toLowerCase() }));
  // ZIPs load per leading digit on first use (static/zips/<d>.json, ~300 KB each)
  const ZC = {}; let Z = [];
  async function loadZips(d) {
    if (ZC[d]) return ZC[d];
    try { const r = await fetch(base + `static/zips/${d}.json?v=` + v); const j = await r.json(); ZC[d] = j.zips.map(z => ({ kind: 'zip', zip: z[0], area: j.codes[z[1]][0], path: j.codes[z[1]][1], fmr: z[2] })); }
    catch (e) { ZC[d] = []; }
    Z = Object.values(ZC).flat(); return ZC[d];
  }
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  let items = [], active = -1, current = null;
  function card(c) {
    const f = c.fmr[br];
    if (c.kind === 'zip') return `<section class="sheet balanced"><p class="sheet-label">ZIP ${c.zip} · ${c.area} · Small Area FMR</p><div class="sheet-num"><span class="num">${usd(f)}</span><span class="pct">${BRL[br]} / month</span></div><p class="sheet-title">Payment standard ${usd(Math.round(f * 0.9))}–${usd(Math.round(f * 1.1))}</p><p class="sheet-text">Studio ${usd(c.fmr[0])} · 1BR ${usd(c.fmr[1])} · 2BR ${usd(c.fmr[2])} · 3BR ${usd(c.fmr[3])} · 4BR ${usd(c.fmr[4])}.</p><p class="sheet-actions"><a class="next" href="${base}zip/${c.zip}/">ZIP details & payment standards</a>${c.path ? `<a class="next" href="${base}${c.path}">County FMR</a>` : ''}</p></section>`;
    const ch = c.prev2 && c.fmr[2] ? ((c.fmr[2] - c.prev2) / c.prev2 * 100).toFixed(1) : null;
    return `<section class="sheet ${ch !== null && +ch >= 8 ? 'mild' : 'balanced'}"><p class="sheet-label">${c.area}</p><div class="sheet-num"><span class="num">${usd(f)}</span><span class="pct">${BRL[br]} / month</span></div><p class="sheet-title">${c.name}, ${c.st}${ch !== null ? ` · 2BR ${+ch > 0 ? '+' : ''}${ch}% from last year` : ''}</p><p class="sheet-text">Studio ${usd(c.fmr[0])} · 1BR ${usd(c.fmr[1])} · 2BR ${usd(c.fmr[2])} · 3BR ${usd(c.fmr[3])} · 4BR ${usd(c.fmr[4])}. Payment standard for ${BRL[br].toLowerCase()}: ${usd(Math.round(f * 0.9))}–${usd(Math.round(f * 1.1))}.</p><p class="sheet-actions"><a class="next" href="${base}${c.st.toLowerCase()}/${c.slug}/">All bedrooms, history & ZIPs</a></p></section>`;
  }
  let seq = 0;
  async function open(q) {
    const nq = norm(q), my = ++seq;
    if (/^\d{1,5}$/.test(nq)) { const part = await loadZips(nq[0]); if (my !== seq) return; items = nq.length >= 3 ? part.filter(z => z.zip.startsWith(nq)).slice(0, 8) : []; if (nq.length < 3) { menu.innerHTML = '<li class="empty">Keep typing the ZIP code…</li>'; menu.hidden = false; return; } }
    else items = nq ? A.filter(a => a.q.includes(nq)).sort((a, b) => a.town - b.town || (b.fmr[2] || 0) - (a.fmr[2] || 0)).slice(0, 8) : [];
    menu.innerHTML = items.length ? items.map((c, i) => `<li role="option" data-i="${i}" ${i === active ? 'aria-selected="true"' : ''}>${c.kind === 'zip' ? `ZIP ${c.zip}<small class="muted"> ${c.area}</small>` : `${c.name}, ${c.st}<small class="muted"> ${c.town ? 'town · ' : ''}2BR ${usd(c.fmr[2])}</small>`}</li>`).join('') : (nq ? '<li class="empty">Nothing by that name. Try the ZIP code or the county name.</li>' : '<li class="empty">Type a ZIP code or a county.</li>');
    menu.hidden = false; input.setAttribute('aria-expanded', 'true');
  }
  function close() { menu.hidden = true; active = -1; input.setAttribute('aria-expanded', 'false'); }
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
  function show(html) {
    leaveLanding(); out.innerHTML = html;
    out.classList.remove('is-in'); out.classList.add('reveal');
    let i = 0; out.querySelectorAll(':scope > *').forEach(c => { [c, ...c.children].forEach(el => { el.classList.add('rv'); el.style.setProperty('--d', (i++ * 45) + 'ms'); }); });
    void out.offsetHeight; out.classList.add('is-in');
  }
  function choose(c) {
    current = c; input.value = c.kind === 'zip' ? c.zip : `${c.name}, ${c.st}`; close(); show(card(c));
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
  if (rem && rem[0] === 'zip') await loadZips(rem[1][0]);
  const remembered = rem && (rem[0] === 'zip' ? Z.find(z => z.zip === rem[1]) : A.find(a => a.st === rem[1] && a.slug === rem[2]));
  if (remembered) { $('last-name').textContent = remembered.kind === 'zip' ? 'ZIP ' + remembered.zip : `${remembered.name}, ${remembered.st}`; $('last').hidden = false; $('last').addEventListener('click', () => choose(remembered)); }
})();
