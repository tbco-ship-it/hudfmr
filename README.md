# FMR Finder — HUD Fair Market Rent by county and ZIP

Static site. Sources: HUD User FMR history (FMR_All_1983_2027.csv) + FY27 Small Area FMRs (FY27_safmrs.xlsx), both under data/raw (huduser.gov serves 202 challenge pages to curl — download through a browser session).

```
../martday/.venv/bin/python scripts/normalize.py   # -> data/fmr.json
../martday/.venv/bin/python scripts/build.py --base / --origin https://<domain> --cname <domain>
```
