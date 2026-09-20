#!/usr/bin/env python3
"""Generate the static FMR Finder site into dist/ from data/fmr.json."""
import argparse
import datetime as dt
import hashlib
import json
import shutil
from collections import defaultdict
from pathlib import Path
from decimal import Decimal, ROUND_HALF_UP
from statistics import median
from xml.sax.saxutils import escape

from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
SITE = "FMR Finder"
BR = ["Studio", "1 bedroom", "2 bedrooms", "3 bedrooms", "4 bedrooms"]


def usd(n):
    return "—" if n is None else f"${n:,}"


def chg(cur, prev):
    return None if not cur or not prev else round((cur - prev) / prev * 100, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="/hudfmr/")
    ap.add_argument("--origin", default="https://tbco-ship-it.github.io")
    ap.add_argument("--cname", default="")
    ap.add_argument("--adsense-pub", default="pub-8425563704095379")
    args = ap.parse_args()
    base = args.base if args.base.endswith("/") else args.base + "/"
    origin = args.origin.rstrip("/")
    today = dt.date.today()

    data = json.loads((ROOT / "data/fmr.json").read_text())
    areas, zips, source = data["areas"], data["zips"], data["source"]
    states = {}
    pct_dollars = lambda v, f: None if v is None else int((Decimal(v) * Decimal(f)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))  # one rounding rule, computed once
    for a in areas:
        a["path"] = f"{a['st'].lower()}/{a['slug']}/"
        a["ps90"] = [pct_dollars(v, "0.9") for v in a["fmr"]]
        a["ps110"] = [pct_dollars(v, "1.1") for v in a["fmr"]]
        a["chg"] = [chg(c, p) for c, p in zip(a["fmr"], a["prev"])]
        a["chg2"] = a["chg"][2]
        s = states.setdefault(a["st"], {"st": a["st"], "name": a["state"], "path": f"{a['st'].lower()}/", "areas": []})
        s["areas"].append(a)
    for s in states.values():
        s["areas"].sort(key=lambda a: -(a["fmr"][2] or 0))
        two = [a["fmr"][2] for a in s["areas"] if a["fmr"][2]]
        s["med2"] = round(median(two)) if two else None
        s["n_fmr_areas"] = len({a["area_code"] for a in s["areas"]})
        s["max"], s["min"] = s["areas"][0], s["areas"][-1]
        s["n_towns"] = sum(1 for a in s["areas"] if a["town"])
        # FY-over-FY change, counties/towns with both years: median %, how many rose/fell, the extremes
        ch = [a for a in s["areas"] if a["chg2"] is not None]
        s["chg_med"] = round(median(a["chg2"] for a in ch), 1) if ch else None
        s["n_up"], s["n_down"], s["n_flat"] = sum(1 for a in ch if a["chg2"] > 0), sum(1 for a in ch if a["chg2"] < 0), sum(1 for a in ch if a["chg2"] == 0)
        s["top_up"] = max(ch, key=lambda a: a["chg2"]) if ch else None
        s["top_down"] = min(ch, key=lambda a: a["chg2"]) if ch else None
    state_list = sorted(states.values(), key=lambda s: s["name"])
    counties_only = [a for a in areas if not a["town"] and a["fmr"][2]]
    ranked = sorted(counties_only, key=lambda a: -a["fmr"][2])
    movers_up = sorted([a for a in counties_only if a["chg2"] is not None], key=lambda a: -a["chg2"])[:60]
    movers_down = sorted([a for a in counties_only if a["chg2"] is not None], key=lambda a: a["chg2"])[:60]
    us_med2 = round(median(a["fmr"][2] for a in counties_only))
    us_ch = [a["chg2"] for a in counties_only if a["chg2"] is not None]
    us_chg = {"med": round(median(us_ch), 1), "n": len(us_ch), "up": sum(1 for c in us_ch if c > 0), "down": sum(1 for c in us_ch if c < 0), "flat": sum(1 for c in us_ch if c == 0)}
    # ZIP groups (a ZIP can sit in two FMR areas)
    by_zip = defaultdict(list)
    for z in zips:
        by_zip[z["zip"]].append(z)
    area_by_code = defaultdict(list)
    for a in areas:
        area_by_code[a["area_code"]].append(a)
    for z in zips:
        z["areas"] = area_by_code.get(z["area_code"], [])
        ref = z["areas"][0]["fmr"] if z["areas"] else None
        z["vs_area"] = [chg(sv, rv) for sv, rv in zip(z["safmr"], ref)] if ref else [None] * 5

    h = hashlib.md5()
    for f in sorted((ROOT / "static").glob("*")):
        h.update(f.read_bytes())
    h.update((ROOT / "data/fmr.json").read_bytes())
    v = h.hexdigest()[:8]
    env = Environment(loader=FileSystemLoader(ROOT / "templates"), autoescape=select_autoescape(["html"]))
    env.filters["usd"] = usd
    fy_number = int(source["fy"][2:])
    effective_date = dt.date(fy_number - 1, 10, 1)
    env.globals.update(upcoming=today < effective_date, fmr_period=f"{fy_number - 1}-10-01/{fy_number}-09-30")
    env.globals.update(site=SITE, base=base, origin=origin, today=today.isoformat(), v=v, adsense_pub=args.adsense_pub, BR=BR,
                       states=states, state_list=state_list, n_areas=len(areas), n_zips=len(by_zip), source=source, us_med2=us_med2, us_chg=us_chg, fy=source["fy"], fy_prev=f"FY{int(source['fy'][2:]) - 1}")

    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    shutil.copytree(ROOT / "static", DIST / "static")
    # search index: areas [name, st, slug, area, fmr[5], prev[5], town?, state name] ; zips [zip, area_code, safmr[5], area]
    idx = {"areas": [[a["name"], a["st"], a["slug"], a["area"], a["fmr"], a["prev"], 1 if a["town"] else 0, a["state"]] for a in areas]}
    (DIST / "static/index.json").write_text(json.dumps(idx, separators=(",", ":")))
    # ZIP index split by first digit (~300 KB each), loaded only when the user types digits; area names via a code table
    area_name = {}
    for z in zips:
        area_name.setdefault(z["area_code"], z["area"])
    (DIST / "static/zips").mkdir()
    for d in "0123456789":  # each shard carries only the area codes it uses
        rows = [z for z in zips if z["zip"][0] == d]
        used = sorted({z["area_code"] for z in rows})
        local_i = {c: i for i, c in enumerate(used)}
        code_meta = [[area_name.get(c, ""), next((a["path"] for a in area_by_code.get(c, [])), "")] for c in used]
        part = [[z["zip"], local_i[z["area_code"]], z["safmr"]] for z in rows]
        (DIST / f"static/zips/{d}.json").write_text(json.dumps({"codes": code_meta, "zips": part}, separators=(",", ":")))

    urls = []

    written = set()

    def write(path, template, **ctx):
        # A malformed path ("vt//" from an empty slug, or two records sharing one slug) silently overwrites another
        # page's index.html; fail the build instead so the sitemap and the output stay one-to-one.
        if path and (not path.endswith("/") or any(p in ("", ".", "..") for p in path[:-1].split("/"))):
            raise ValueError(f"bad page path {path!r}")
        if path in written:
            raise ValueError(f"page path collision {path!r}")
        written.add(path)
        out = DIST / path
        out.mkdir(parents=True, exist_ok=True)
        (out / "index.html").write_text(env.get_template(template).render(path=path, **ctx))
        urls.append(path)

    write("", "index.html", top=ranked[:8], up=movers_up[:8], down=movers_down[:8])
    for page in ("about", "methodology", "privacy", "contact"):
        write(f"{page}/", f"{page}.html")
    write("states/", "states.html")
    write("rankings/highest/", "ranking.html", title=f"Highest fair market rents in the U.S. ({source['fy']}, 2-bedroom)", rows=ranked[:100], kind="highest")
    write("rankings/lowest/", "ranking.html", title=f"Lowest fair market rents in the U.S. ({source['fy']}, 2-bedroom)", rows=ranked[-100:][::-1], kind="lowest")
    write("rankings/biggest-increases/", "ranking.html", title=f"Biggest FMR increases {fy_prev_label(source)} → {source['fy']} (2-bedroom)", rows=movers_up, kind="up")
    write("rankings/change-by-state/", "change_states.html", rows=sorted(state_list, key=lambda s: -(s["chg_med"] if s["chg_med"] is not None else -999)))
    write("rankings/biggest-decreases/", "ranking.html", title=f"Biggest FMR decreases {fy_prev_label(source)} → {source['fy']} (2-bedroom)", rows=movers_down, kind="down")
    write("guide/what-is-fair-market-rent/", "guide_fmr.html")
    write("guide/payment-standard/", "guide_ps.html")
    for s in state_list:
        write(s["path"], "state.html", s=s)
        for a in s["areas"]:
            same = [x for x in s["areas"] if x is not a and x["area_code"] == a["area_code"]][:12]
            near = sorted([x for x in s["areas"] if x is not a and x["fmr"][2]], key=lambda x: abs(x["fmr"][2] - (a["fmr"][2] or 0)))[:6]
            zrows = [z for zc in a["zips"] for z in by_zip.get(zc, []) if z["area_code"] == a["area_code"]]
            write(a["path"], "area.html", s=s, a=a, same=same, near=near, zrows=zrows)
    for zc, lst in by_zip.items():
        same_safmr = len({tuple(z["safmr"]) for z in lst}) == 1
        write(f"zip/{zc}/", "zip.html", zc=zc, lst=lst, same_safmr=same_safmr)
        (DIST / f"zip/{zc}/data.json").write_text(json.dumps({"zip": zc, "fiscal_year": source["fy"], "unit": "USD per month, gross rent", "source": {"file": source["safmr_file"], "url": source["fmr"], "retrieved": source["fetched"]},
                                                              "records": [{k: z[k] for k in ("area_code", "area", "safmr", "ps90", "ps110")} for z in lst]}, separators=(",", ":")))

    chunks = [urls[i:i + 40000] for i in range(0, len(urls), 40000)]
    names = []
    for i, ch in enumerate(chunks):
        name = "sitemap.xml" if len(chunks) == 1 else f"sitemap-{i + 1}.xml"
        names.append(name)
        sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
        sm += [f"<url><loc>{escape(origin + base + u)}</loc></url>" for u in ch]
        sm.append("</urlset>")
        (DIST / name).write_text("\n".join(sm))
    if len(chunks) > 1:
        (DIST / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(f"<sitemap><loc>{origin}{base}{n}</loc></sitemap>" for n in names) + "</sitemapindex>")
    (DIST / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {origin}{base}sitemap.xml\n")
    (DIST / "404.html").write_text(env.get_template("404.html").render(path="404"))
    (DIST / ".nojekyll").write_text("")
    key = (ROOT / "static/indexnow-key.txt").read_text().strip()
    (DIST / f"{key}.txt").write_text(key + "\n")
    if args.adsense_pub:
        (DIST / "ads.txt").write_text(f"google.com, {args.adsense_pub}, DIRECT, f08c47fec0942fa0\n")
    if args.cname:
        (DIST / "CNAME").write_text(args.cname + "\n")
    print(f"built {len(urls)} pages ({len(areas)} areas, {len(by_zip)} ZIPs) -> {DIST}")


def fy_prev_label(source):
    return f"FY{int(source['fy'][2:]) - 1}"


if __name__ == "__main__":
    main()
