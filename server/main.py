"""
Pirátský volební atlas — FastAPI backend
Připojuje se na PostGIS databázi a slouží GeoJSON + statistiky pro frontend.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncpg
import os

app = FastAPI(title="Pirátský volební atlas API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres@localhost/pogeo"
)


async def get_conn():
    return await asyncpg.connect(DATABASE_URL)


# ─── GeoJSON endpointy ────────────────────────────────────────────────────────

@app.get("/api/geojson/{level}")
async def geojson(level: str):
    """
    Vrací GeoJSON pro danou úroveň (obce / orp / okresy / kraje).
    Obce obsahují všechny hodnoty ukazatelů v properties (choropleth).
    """
    allowed = {"obce", "orp", "okresy", "kraje"}
    if level not in allowed:
        raise HTTPException(status_code=400, detail="Neplatná úroveň")

    conn = await get_conn()
    try:
        # TODO: implementovat dotaz na PostGIS
        raise NotImplementedError("Dotaz zatím není implementován")
    finally:
        await conn.close()


# ─── Jednotky (dropdown) ──────────────────────────────────────────────────────

@app.get("/api/units/{level}")
async def units(level: str):
    """Vrací seznam jednotek pro dropdown (id + název)."""
    allowed = {"obce", "orp", "okresy", "kraje"}
    if level not in allowed:
        raise HTTPException(status_code=400, detail="Neplatná úroveň")

    conn = await get_conn()
    try:
        # TODO: implementovat
        raise NotImplementedError("Dotaz zatím není implementován")
    finally:
        await conn.close()


# ─── Statistiky ───────────────────────────────────────────────────────────────

@app.get("/api/stats/{level}/{id}")
async def stats(level: str, id: str):
    """Vrací detailní statistiky pro vybranou jednotku."""
    allowed = {"obce", "orp", "okresy", "kraje"}
    if level not in allowed:
        raise HTTPException(status_code=400, detail="Neplatná úroveň")

    conn = await get_conn()
    try:
        # TODO: implementovat
        raise NotImplementedError("Dotaz zatím není implementován")
    finally:
        await conn.close()


# ─── Vlastní polygon ──────────────────────────────────────────────────────────

class PolygonPayload(BaseModel):
    geometry: dict  # GeoJSON geometry


@app.post("/api/stats/custom")
async def stats_custom(payload: PolygonPayload):
    """
    Přijme GeoJSON polygon z Leaflet.Draw a vrátí
    agregované statistiky pro průnik s obcemi.
    """
    conn = await get_conn()
    try:
        # TODO: implementovat ST_Intersects dotaz
        raise NotImplementedError("Dotaz zatím není implementován")
    finally:
        await conn.close()
