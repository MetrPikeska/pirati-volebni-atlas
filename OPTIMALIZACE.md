# Optimalizace výkonu

Aplikace se seká hlavně kvůli velkým nekomprimovaným GeoJSON payloadům (obce ~5–15 MB) přes Cloudflare Tunnel. V PM2 logách jsou vidět `context canceled` timeouty při přenosu dat.

## Postup (seřazeno podle priority)

### ✅ Hotovo
- Základní funkčnost — frontend na Vercel, backend přes Cloudflare Tunnel

---

### 1. Gzip komprese na backendu
**Dopad: 80–90 % menší přenos dat**

Přidat `GZipMiddleware` do FastAPI — komprimuje všechny odpovědi nad 1 kB.

```python
from fastapi.middleware.gzip import GZipMiddleware
app.add_middleware(GZipMiddleware, minimum_size=1000)
```

Volitelně přidat HTTP caching hlavičky:
```python
response.headers["Cache-Control"] = "max-age=86400, public"
```

---

### 2. Opravit ST_AsGeoJSON — selectovat jen potřebné sloupce
**Dopad: 50–70 % menší payload**

Aktuální backend vrací `ST_AsGeoJSON(t.*)` — všechny sloupce tabulky. Frontend potřebuje jen geometrii + konkrétní properties.

Místo:
```sql
SELECT json_agg(ST_AsGeoJSON(t.*)::json) FROM obce_gwr t
```

Selectovat explicitně:
```sql
SELECT json_build_object(
  'type', 'Feature',
  'geometry', ST_AsGeoJSON(t.geom)::json,
  'properties', json_build_object(
    'id', t.id,
    'nazev_obce', t.nazev_obce,
    'pirati_pct', t.pirati_pct,
    'fitted_ols', t.fitted_ols,
    -- ... jen co frontend používá
  )
) FROM obce_gwr t
```

---

### 3. Ověřit GIST prostorové indexy na PostGIS
**Dopad: 50–80 % rychlejší dotazy, méně timeoutů**

Ověřit na serveru:
```sql
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename IN ('obce_gwr', 'orp', 'okresy', 'kraje')
AND indexdef LIKE '%GIST%';
```

Pokud chybí, vytvořit:
```sql
CREATE INDEX idx_obce_geom   ON obce_gwr USING GIST(geom);
CREATE INDEX idx_orp_geom    ON orp      USING GIST(geom);
CREATE INDEX idx_okresy_geom ON okresy   USING GIST(geom);
CREATE INDEX idx_kraje_geom  ON kraje    USING GIST(geom);
```

---

### 4. Batch endpoint nebo parallel fetch
**Dopad: 40–50 % rychlejší přepínání úrovní**

Při přepnutí úrovně se dělají dvě HTTP volání za sebou (`/api/geojson/{level}` + `/api/units/{level}`). Řešení:
- Nový endpoint `/api/level/{level}` vrací GeoJSON + units najednou
- nebo na frontendu volat obě `fetch()` paralelně přes `Promise.all()`

---

### 5. IndexedDB cache na frontendu
**Dopad: Okamžité načtení při opakované návštěvě**

Po prvním načtení uložit GeoJSON do IndexedDB s TTL (např. 24h). Při dalším načtení stránky číst z IndexedDB místo API volání.

---

## Nasazení backend změn na server

```bash
# Stáhnout nový main.py ze repozitáře
curl -o ~/volebni_api/main.py https://raw.githubusercontent.com/MetrPikeska/pirati-volebni-atlas/main/server/main.py

# Restartovat backend
pm2 restart volebni-api
```
