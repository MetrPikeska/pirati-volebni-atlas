# Bezpečnost systému

## Architektura

```
Prohlížeč → Vercel (frontend) → Cloudflare Tunnel → FastAPI (port 8000) → PostgreSQL
```

## Aktuální stav

### Opraveno

| Problém | Řešení | Kdy |
|---------|--------|-----|
| Heslo k DB v kódu na GitHubu | `os.environ["DATABASE_URL"]`, heslo pouze v `ecosystem.config.js` na serveru | 2026-04-16 |
| CORS wide-open (`allow_origins=["*"]`) | Omezeno na `pirati-volebni-atlas.vercel.app` + localhost | 2026-04-16 |
| Žádný rate limiting | `slowapi` — limity per IP viz níže | 2026-04-16 |

### Záměrně neřešeno

| Problém | Důvod |
|---------|-------|
| Cloudflare Tunnel s dočasnou URL | Dočasné řešení, URL se mění při restartu — přijatelné pro dev/demo |
| PostgreSQL superuser `postgres` | Nízké riziko — data jsou veřejná, DB není přístupná z internetu |
| Žádná autentizace | Data jsou veřejná (volební výsledky z ČSÚ) |

## Rate limiting

Limity jsou per IP adresa:

| Endpoint | Limit | Důvod |
|----------|-------|-------|
| `GET /api/geojson/{level}` | 30/min | Velká odpověď (MB GeoJSON) |
| `GET /api/units/{level}` | 60/min | Lehký dotaz |
| `GET /api/stats/{level}/{id}` | 120/min | Standardní dotaz |
| `POST /api/stats/custom` | 10/min | Drahý PostGIS ST_Intersects dotaz |

Při překročení limitu API vrátí `429 Too Many Requests`.

## Secrets management

Heslo k databázi žije **pouze** v `~/volebni_api/ecosystem.config.js` na serveru.
Tento soubor **nikdy** nejde do gitu — je v `.gitignore`.

Při nasazení nové verze `main.py` na server je potřeba:
1. Zkopírovat nový `main.py` do `~/volebni_api/`
2. Nainstalovat závislosti: `venv/bin/pip install -r requirements.txt`
3. Restartovat: `npx pm2 restart ecosystem.config.js --update-env`

## SQL injection

Všechny SQL dotazy jsou chráněny:
- Parametr `level` — validován whitelistem (`TABLES` dict), nikdy přímo do SQL
- Parametr `id` — FastAPI ho typuje jako `int`, psycopg předá jako parametr `%s`
- Custom polygon — serializován přes `json.dumps()`, předán jako parametr `%s`
