# CLAUDE.md — Pirátský volební atlas

## Architektura

```
Vercel
  index.html + app.js + style.css   ← frontend (čistý vanilla JS, žádný build)
        │
        │ HTTPS API volání
        ▼
Domácí Ubuntu server (MetrPikeska)
  ~/volebni_api/main.py             ← FastAPI + psycopg + PostGIS
  spravován přes PM2
  vystavený přes Cloudflare Tunnel
        │
        ▼
  PostgreSQL: dbname=volby2021
    Tabulky: obce_gwr, orp, okresy, kraje
```

## Frontend (`index.html`, `app.js`, `style.css`)

Čisté vanilla JS/HTML/CSS — **žádný bundler, žádný npm, žádná kompilace**. Stačí otevřít v prohlížeči nebo servovat staticky.

API URL je na řádku 4 v `app.js`:
```javascript
const API = 'https://<subdomain>.trycloudflare.com';
```
Při změně tunelu aktualizovat tuto konstantu.

### Lokální vývoj frontendu
```bash
python3 -m http.server 8080
# http://localhost:8080/
```

## Backend (`server/main.py`)

FastAPI server s PostGIS. **Běží na domácím Ubuntu serveru, NEPŘESOUVAT jinam.**

### PM2 příkazy (na serveru)
```bash
pm2 list                      # seznam procesů
pm2 restart volebni_api       # restart po změně kódu
pm2 logs volebni_api          # logy
pm2 stop volebni_api          # zastavení
```

### Aktualizace backendu ze repozitáře
```bash
curl -o ~/volebni_api/main.py https://raw.githubusercontent.com/MetrPikeska/pirati-volebni-atlas/main/server/main.py
pm2 restart volebni_api
```

### Lokální vývoj backendu
```bash
cd ~/volebni_api
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## API endpointy

| Metoda | Endpoint | Popis |
|--------|----------|-------|
| GET | `/api/geojson/{level}` | GeoJSON hranic (`obce/orp/okresy/kraje`) |
| GET | `/api/units/{level}` | Dropdown seznam jednotek |
| GET | `/api/stats/{level}/{id}` | Statistiky jednotky |
| POST | `/api/stats/custom` | Statistiky vlastního polygonu |
| GET | `/health` | Health check |

## Databáze

- Host: `localhost` (na domácím serveru)
- DB: `volby2021`
- User: `postgres`
- Klíčová tabulka: `obce_gwr` — obsahuje GWR výsledky + demografii za všechny obce ČR
- Prostorové dotazy přes `ST_Intersects` (PostGIS)

## Nasazení frontendu (Vercel)

Frontend se nasazuje na Vercel z `main` větve. Vercel servuje statické soubory přímo — žádný build krok není potřeba.

## Důležité poznámky

- Backend nikdy nepoběží na Vercelu — nemá přístup k lokální PostGIS DB
- Cloudflare Tunnel URL se může změnit → vždy aktualizovat `const API` v `app.js`
- Heslo k DB je v kódu pouze jako fallback — pro produkci použít env proměnnou `DATABASE_URL`
