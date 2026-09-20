#!/usr/bin/env python3
"""HUD FMR history (data/raw/FMR_All_1983_2027.csv) + FY27 Small Area FMRs (FY27_safmrs.xlsx) -> data/fmr.json
One record per FMR row (county, or New England town when cousub != 99999), plus one per ZIP with a SAFMR."""
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data/raw"
FY = 27
STATES = {"01": ("Alabama", "AL"), "02": ("Alaska", "AK"), "04": ("Arizona", "AZ"), "05": ("Arkansas", "AR"), "06": ("California", "CA"), "08": ("Colorado", "CO"), "09": ("Connecticut", "CT"), "10": ("Delaware", "DE"), "11": ("District of Columbia", "DC"), "12": ("Florida", "FL"), "13": ("Georgia", "GA"), "15": ("Hawaii", "HI"), "16": ("Idaho", "ID"), "17": ("Illinois", "IL"), "18": ("Indiana", "IN"), "19": ("Iowa", "IA"), "20": ("Kansas", "KS"), "21": ("Kentucky", "KY"), "22": ("Louisiana", "LA"), "23": ("Maine", "ME"), "24": ("Maryland", "MD"), "25": ("Massachusetts", "MA"), "26": ("Michigan", "MI"), "27": ("Minnesota", "MN"), "28": ("Mississippi", "MS"), "29": ("Missouri", "MO"), "30": ("Montana", "MT"), "31": ("Nebraska", "NE"), "32": ("Nevada", "NV"), "33": ("New Hampshire", "NH"), "34": ("New Jersey", "NJ"), "35": ("New Mexico", "NM"), "36": ("New York", "NY"), "37": ("North Carolina", "NC"), "38": ("North Dakota", "ND"), "39": ("Ohio", "OH"), "40": ("Oklahoma", "OK"), "41": ("Oregon", "OR"), "42": ("Pennsylvania", "PA"), "44": ("Rhode Island", "RI"), "45": ("South Carolina", "SC"), "46": ("South Dakota", "SD"), "47": ("Tennessee", "TN"), "48": ("Texas", "TX"), "49": ("Utah", "UT"), "50": ("Vermont", "VT"), "51": ("Virginia", "VA"), "53": ("Washington", "WA"), "54": ("West Virginia", "WV"), "55": ("Wisconsin", "WI"), "56": ("Wyoming", "WY"), "72": ("Puerto Rico", "PR"), "66": ("Guam", "GU"), "78": ("U.S. Virgin Islands", "VI"), "60": ("American Samoa", "AS"), "69": ("Northern Mariana Islands", "MP")}


def slug(s):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")


def ints(row, prefix):
    out = []
    for b in range(5):
        v = row.get(f"{prefix}_{b}", "")
        out.append(int(float(v)) if v not in ("", None) else None)
    return out


def main():
    rows = list(csv.DictReader(open(RAW / "FMR_All_1983_2027.csv", encoding="latin-1")))
    areas, seen = [], {}
    for r in rows:
        st = STATES.get(r["state"])
        if not st:
            continue
        name = r["name"].strip()
        if not name:
            # HUD ships one unnamed Vermont cousub row (fips 5000724400, Burlington MSA). An empty name makes an empty
            # slug → the page path "vt//" collapses onto the state hub and overwrites it. Skip rather than guess a name.
            print(f"skip unnamed row fips={r['fips2027']} area={r[f'areaname{FY}']!r}")
            continue
        cur, prev = ints(r, f"fmr{FY}"), ints(r, f"fmr{FY - 1}")
        hist = {f"20{y:02d}": ints(r, f"fmr{y:02d}")[2] for y in range(FY - 10, FY + 1)}  # 2BR, last 11 fiscal years
        a = {"fips": r["fips2027"], "st": st[1], "state": st[0], "name": name, "town": r["cousub"] != "99999", "area": r[f"areaname{FY}"].strip(),
             "area_code": r[f"msa{FY}"], "metro": r[f"msa{FY}"].startswith("METRO"), "fmr": cur, "prev": prev, "hist2br": hist, "slug": slug(name)}
        k = (a["st"], a["slug"])
        n = 2
        while k in seen:
            a["slug"] = f"{slug(name)}-{n}"; k = (a["st"], a["slug"]); n += 1
        seen[k] = 1
        areas.append(a)
    # ZIP SAFMRs
    wb = openpyxl.load_workbook(RAW / f"FY{FY}_safmrs.xlsx", read_only=True)
    ws = wb.worksheets[0]
    it = ws.iter_rows(values_only=True)
    head = [str(h).replace("\n", " ") for h in next(it)]
    idx = {h: i for i, h in enumerate(head)}
    zips = []
    for row in it:
        z = str(row[idx["ZIP Code"]]).zfill(5)
        vals = [row[idx[f"SAFMR {b}BR"]] for b in range(5)]
        if any(v is None for v in vals):
            continue
        zips.append({"zip": z, "area_code": row[idx["HUD Area Code"]], "area": row[idx["HUD Fair Market Rent Area Name"]], "safmr": [int(v) for v in vals],
                     "ps90": [int(row[idx[f"SAFMR {b}BR - 90% Payment Standard"]]) for b in range(5)], "ps110": [int(row[idx[f"SAFMR {b}BR - 110% Payment Standard"]]) for b in range(5)]})
    by_area = defaultdict(list)
    for z in zips:
        by_area[z["area_code"]].append(z["zip"])
    for a in areas:
        a["zips"] = sorted(by_area.get(a["area_code"], []))
    out = {"source": {"fmr": "https://www.huduser.gov/portal/datasets/fmr.html", "fmr_file": "FMR_All_1983_2027.csv", "safmr_file": f"FY{FY}_safmrs.xlsx", "fetched": "2026-09-19", "fy": f"FY20{FY}", "effective": "October 1, 2026"},
           "areas": areas, "zips": zips}
    (ROOT / "data/fmr.json").write_text(json.dumps(out, separators=(",", ":")))
    print(f"{len(areas)} areas ({sum(1 for a in areas if a['town'])} towns, {sum(1 for a in areas if a['metro'])} metro), {len(zips)} ZIPs, {len(by_area)} SAFMR areas")


if __name__ == "__main__":
    main()
