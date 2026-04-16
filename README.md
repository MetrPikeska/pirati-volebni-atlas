# Pirátský volební atlas

Interaktivní volební atlas výsledků České pirátské strany v parlamentních volbách 2025. Prostorová explorace výsledků GWR (Geographically Weighted Regression) analýzy na úrovni obcí, ORP, okresů a krajů.

## Co to je

Webová aplikace kombinuje interaktivní mapu s detailní statistickou analýzou. Pro každou obec, ORP, okres nebo kraj zobrazuje volební výsledky Pirátů, výstupy prostorové regrese a demografické charakteristiky (vzdělání, věková struktura, zaměstnanost, sociální složení). Uživatel může také nakreslit vlastní polygon a získat agregované statistiky pro libovolné území.

## Architektura

```
pirati-volebni-atlas/
  index.html        — HTML shell + CDN závislosti (Leaflet, Chart.js)
  app.js            — veškerá logika frontendu (~640 řádků, vanilla JS)
  style.css         — styly
  server/
    main.py         — FastAPI backend (PostGIS)
    requirements.txt
    .env.example
```

**Frontend** je čisté vanilla JS/HTML/CSS bez buildu. Stačí otevřít `index.html` nebo servovat staticky.

**Backend** je FastAPI server s PostGIS databází obsahující GWR výsledky za všechny obce ČR.

## Lokální spuštění

### Frontend

```bash
# Z kořene repozitáře — libovolný statický server
python3 -m http.server 8080
# Pak otevřít http://localhost:8080/
```

### Backend

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # doplnit DATABASE_URL
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Backend poběží na `http://localhost:8000`. V `app.js` na řádku 4 nastav:

```javascript
const API = 'http://localhost:8000';
```

### PostGIS — import dat

```bash
ogr2ogr -f "PostgreSQL" PG:"dbname=pogeo user=postgres" \
  data/processed/pirati_final.gpkg -nln obce -overwrite
```

## API endpointy

| Metoda | Endpoint | Popis |
|--------|----------|-------|
| GET | `/api/geojson/{level}` | GeoJSON hranic pro úroveň `obce / orp / okresy / kraje` |
| GET | `/api/units/{level}` | Seznam jednotek pro dropdown (id + název) |
| GET | `/api/stats/{level}/{id}` | Detailní statistiky vybrané jednotky |
| POST | `/api/stats/custom` | Statistiky pro vlastní GeoJSON polygon |

## Ukazatele

### Volební
| Klíč | Popis |
|------|-------|
| `pirati_pct` | % hlasů pro Piráty (skutečnost) |
| `fitted_ols` | Predikce globálního OLS modelu |
| `resid_ols` | Reziduum OLS (skutečnost − predikce) |
| `resid_gwr` | Reziduum GWR (lokální model) |
| `local_r2` | Lokální R² GWR modelu |

### Demografické
Vzdělanost, věková struktura (0–14 / 15–64 / 65+), zaměstnanost, podnikání, nezaměstnanost, věřící, Romové, podíl mužů.

## Technologie

- **Frontend:** Leaflet 1.9, Leaflet.Draw, Chart.js 4, vanilla JS (ES2022)
- **Backend:** FastAPI, asyncpg, PostGIS
- **Podkladové mapy:** CartoDB Dark, OpenStreetMap, ČÚZK ortofoto (WMS)

## Produkční nasazení

Backend lze vystavit přes **Cloudflare Tunnel** bez veřejné IP:

```bash
cloudflared tunnel run <nazev-tunelu>
```

URL tunelu pak nastav v `app.js`:
```javascript
const API = 'https://<subdomain>.trycloudflare.com';
```
