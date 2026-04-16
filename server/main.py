from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel
from typing import Any
import psycopg
import json
import os

app = FastAPI(title="Pirátský volební atlas API", version="1.0.0")

app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB = os.getenv(
    "DATABASE_URL",
    "host=localhost dbname=volby2021 user=postgres password=master"
)

TABLES = {"obce": "obce_gwr", "orp": "orp", "okresy": "okresy", "kraje": "kraje"}

NAME_COLS = {
    "obce":   "nazev_obce",
    "orp":    "naz_orp",
    "okresy": "naz_lau1",
    "kraje":  "naz_cznuts3",
}

STATS_QUERY = """
    SELECT
        ROUND(AVG(o.pirati_pct)::numeric, 2)       AS pirati_pct,
        ROUND(AVG(o.fitted_ols)::numeric, 2)        AS fitted_ols,
        ROUND(AVG(o.resid_ols)::numeric, 2)         AS resid_ols,
        ROUND(AVG(o.resid_gwr)::numeric, 2)         AS resid_gwr,
        ROUND(AVG(o."local_R2")::numeric, 4)        AS local_r2,
        ROUND(AVG(o.muzi)::numeric, 2)              AS muzi,
        ROUND(AVG(o.zeny)::numeric, 2)              AS zeny,
        ROUND(AVG(o.vek0_14)::numeric, 2)           AS vek0_14,
        ROUND(AVG(o.vek15_64)::numeric, 2)          AS vek15_64,
        ROUND(AVG(o.vek65)::numeric, 2)             AS vek65,
        ROUND(AVG(o.vzdelani_bez)::numeric, 2)      AS vzdelani_bez,
        ROUND(AVG(o.vzdelani_zaklad)::numeric, 2)   AS vzdelani_zaklad,
        ROUND(AVG(o.vzdelani_str_bez)::numeric, 2)  AS vzdelani_str_bez,
        ROUND(AVG(o.vzdelani_str_s)::numeric, 2)    AS vzdelani_str_s,
        ROUND(AVG(o.vzdelani_vos)::numeric, 2)      AS vzdelani_vos,
        ROUND(AVG(o.vzdelani_vysoko)::numeric, 2)   AS vzdelani_vysoko,
        ROUND(AVG(o.romove)::numeric, 2)            AS romove,
        ROUND(AVG(o.verici2)::numeric, 2)           AS verici,
        ROUND(AVG(o.zamestnanci)::numeric, 2)       AS zamestnanci,
        ROUND(AVG(o.zamestnavatele)::numeric, 2)    AS zamestnavatele,
        ROUND(AVG(o.podnikatele2)::numeric, 2)      AS podnikatele,
        ROUND(AVG(o.nezamest2)::numeric, 2)         AS nezamest,
        ROUND(AVG(o.prac_duch)::numeric, 2)         AS prac_duch,
        ROUND(AVG(o.neprac_duch2)::numeric, 2)      AS neprac_duch,
        COUNT(*)                                    AS pocet_obci
"""


@app.get("/api/geojson/{level}")
async def get_geojson(level: str):
    if level not in TABLES:
        raise HTTPException(400, "Neznámá úroveň")
    table = TABLES[level]
    with psycopg.connect(DB) as conn:
        row = conn.execute(f"""
            SELECT json_build_object(
                'type', 'FeatureCollection',
                'features', json_agg(ST_AsGeoJSON(t.*)::json)
            ) FROM {table} t
        """).fetchone()
    return row[0]


@app.get("/api/units/{level}")
async def get_units(level: str):
    if level not in TABLES:
        raise HTTPException(400, "Neznámá úroveň")
    table = TABLES[level]
    name_col = NAME_COLS[level]
    with psycopg.connect(DB) as conn:
        rows = conn.execute(
            f"SELECT id, {name_col} AS name FROM {table} ORDER BY {name_col}"
        ).fetchall()
    return [{"id": r[0], "name": r[1]} for r in rows]


@app.get("/api/stats/{level}/{id}")
async def get_stats(level: str, id: int):
    if level not in TABLES:
        raise HTTPException(400, "Neznámá úroveň")
    table = TABLES[level]
    with psycopg.connect(DB) as conn:
        cur = conn.execute(
            STATS_QUERY + f"""
            FROM obce_gwr o
            JOIN {table} a ON ST_Intersects(o.geom, a.geom)
            WHERE a.id = %s
            """,
            (id,)
        )
        row = cur.fetchone()
        cols = [desc[0] for desc in cur.description]
    return dict(zip(cols, row))


class CustomPolygon(BaseModel):
    geometry: Any


@app.post("/api/stats/custom")
async def stats_custom(body: CustomPolygon):
    geojson = json.dumps(body.geometry)
    with psycopg.connect(DB) as conn:
        cur = conn.execute(
            STATS_QUERY + """
            FROM obce_gwr o
            WHERE ST_Intersects(o.geom, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))
            """,
            (geojson,)
        )
        row = cur.fetchone()
        cols = [desc[0] for desc in cur.description]
    return dict(zip(cols, row))


@app.get("/health")
async def health():
    return {"status": "ok"}
