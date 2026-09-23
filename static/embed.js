// Embeddable ZIP lookup (/embed/). Same ZIP shards as the home search; income needed uses the state hubs' rule (rent × 40 a year).
(function () {
  const base = document.currentScript.src.replace(/static\/embed\.js.*$/, '');
  const $ = id => document.getElementById(id);
  const usd = n => '$' + Math.round(n).toLocaleString('en-US');
  const zip = $('zip'), out = $('out'), by = $('by'), cache = {};
  const BR = ['Studio', '1 bedroom', '2 bedrooms', '3 bedrooms', '4 bedrooms'];
  async function shard(d) {
    if (!cache[d]) cache[d] = fetch(`${base}static/zips/${d}.json`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).catch(e => { delete cache[d]; throw e; });
    return cache[d];
  }
  async function paint() {
    const z = zip.value.replace(/\D/g, '');
    if (z.length !== 5) { out.innerHTML = ''; by.href = base; return; }
    let j; try { j = await shard(z[0]); } catch (e) { out.textContent = 'Data could not be loaded.'; return; }
    if (zip.value.replace(/\D/g, '') !== z) return;
    const row = j.zips.find(r => r[0] === z);
    if (!row) { out.innerHTML = '<span class="sub">No HUD Fair Market Rent for this ZIP (PO boxes and some rural ZIPs have none).</span>'; by.href = base; return; }
    const [area, path] = j.codes[row[1]];
    by.href = `${base}zip/${z}/`;
    out.innerHTML = `<div class="sub">${area}</div><table><thead><tr><th>Unit</th><th>Rent / month</th><th>Income needed</th></tr></thead><tbody>${row[2].map((r, i) => `<tr><td>${BR[i]}</td><td>${usd(r)}</td><td>${usd(r * 40)}/yr</td></tr>`).join('')}</tbody></table>`;
  }
  zip.addEventListener('input', paint);
})();
