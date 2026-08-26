"""Refresh `data/inventory.json` with real EPA specs from fueleconomy.gov.

fueleconomy.gov is the U.S. government's free, no-API-key vehicle fuel
economy database. It has zero dealer/pricing/location data, so this script
only pulls the fields it actually has for free: MPG (`comb08`), EV range
(`range`), and drivetrain (`fuelType1`). Price, mileage, features, and
dealer/ZIP fields remain clearly-labeled synthetic demo data layered on top,
because no free source has real-time dealer listings (see
`docs/data-sourcing.md` at the repo root for the researched alternative,
Auto.dev, and its cost).

Usage:
    cd src/skills/inventory-search
    uv run python scripts/refresh_inventory.py

Idempotent: re-running just re-fetches the same EPA fields and overwrites
`ev_range_miles`/`mpg` in place, leaving `price`/`odometer_miles`/`features`
untouched so synthetic demo data doesn't drift on each run.
"""

from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

FUELECONOMY_BASE = "https://www.fueleconomy.gov/ws/rest/vehicle"
DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "inventory.json"

# Maps each synthetic inventory row (make, model, year) to the exact
# fueleconomy.gov model-menu string for that trim, since fueleconomy.gov's
# `model` values are full trim names (e.g. "Model Y AWD"), not the plain
# marketing name in our inventory ("Model Y"). Looked up once by hand via
# the `/menu/model?year=&make=` endpoint; see the module docstring.
# Some inventory years aren't present in fueleconomy.gov's menu for that
# model (e.g. Ioniq 5 isn't listed under model-year 2023); query the nearest
# year that has real EPA data for the same generation/trim instead.
QUERY_YEAR_OVERRIDES: dict[tuple[str, str, int], int] = {
    ("Hyundai", "Ioniq 5", 2023): 2022,
}

TRIM_OVERRIDES: dict[tuple[str, str, int], str] = {
    ("Tesla", "Model 3", 2024): "Model 3 Long Range RWD",
    ("Tesla", "Model Y", 2023): "Model Y AWD",
    ("Hyundai", "Ioniq 5", 2023): "Ioniq 5 RWD (Long Range)",
    ("Kia", "EV6", 2022): "EV6 RWD (Long Range)",
    ("Ford", "Mustang Mach-E", 2023): "Mustang Mach-E RWD Extended",
    ("Chevrolet", "Bolt EUV", 2023): "Bolt EUV",
    ("Nissan", "Ariya", 2024): "ARIYA ENGAGE FWD 63kWh",
    ("Volkswagen", "ID.4", 2023): "ID.4 Pro",
    ("Subaru", "Solterra", 2023): "Solterra AWD",
    ("Rivian", "R1S", 2022): "R1S",
    ("Toyota", "RAV4 Hybrid", 2022): "RAV4 Hybrid AWD",
    ("Toyota", "Highlander Hybrid", 2021): "Highlander Hybrid AWD",
    ("Honda", "CR-V Hybrid", 2022): "CR-V Hybrid AWD",
    ("Kia", "Sportage Hybrid", 2023): "Sportage Hybrid AWD",
    ("Hyundai", "Tucson Hybrid", 2022): "Tucson Hybrid",
    ("Lexus", "NX 350h", 2022): "NX 350h AWD",
    ("Mazda", "CX-5", 2021): "CX-5 2WD",
    ("Subaru", "Outback", 2022): "Outback AWD",
    ("Ford", "Escape", 2021): "Escape FWD",
    ("Chevrolet", "Equinox", 2022): "Equinox FWD",
    ("Honda", "Odyssey", 2020): "Odyssey",
    ("Chrysler", "Pacifica Hybrid", 2021): "Pacifica Hybrid",
    ("Volvo", "XC90 Recharge", 2022): "XC90 T8 AWD Recharge",
    ("BMW", "iX", 2023): "iX xDrive50 (20 inch wheels)",
}


def _get_json(url: str) -> Any:
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=15) as response:  # noqa: S310 (fixed https gov host)
        return json.load(response)


def _menu_items(payload: Any) -> list[dict[str, str]]:
    items = (payload or {}).get("menuItem") or []
    if isinstance(items, dict):
        items = [items]
    return items


def resolve_trim(make: str, model: str, year: int) -> str:
    override = TRIM_OVERRIDES.get((make, model, year))
    if override:
        return override
    return model


def fetch_vehicle_id(make: str, trim: str, year: int) -> str | None:
    params = urllib.parse.urlencode({"year": year, "make": make, "model": trim})
    options = _menu_items(_get_json(f"{FUELECONOMY_BASE}/menu/options?{params}"))
    if not options:
        return None
    # Prefer the first automatic-transmission option; falls back to first result.
    for option in options:
        if "auto" in option.get("text", "").casefold():
            return option["value"]
    return options[0]["value"]


def fetch_vehicle_detail(vehicle_id: str) -> dict[str, Any]:
    return _get_json(f"{FUELECONOMY_BASE}/{vehicle_id}?format=json")


def _coerce_float(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def refresh_car(car: dict[str, Any]) -> dict[str, Any]:
    make, model, year = car["make"], car["model"], car["year"]
    trim = resolve_trim(make, model, year)
    query_year = QUERY_YEAR_OVERRIDES.get((make, model, year), year)

    try:
        vehicle_id = fetch_vehicle_id(make, trim, query_year)
        if vehicle_id is None:
            print(f"  ! no fueleconomy.gov match for {year} {make} {trim}", file=sys.stderr)
            return car
        detail = fetch_vehicle_detail(vehicle_id)
    except Exception as exc:  # noqa: BLE001 - best-effort refresh, keep prior data on any failure
        print(f"  ! fetch failed for {year} {make} {trim}: {exc}", file=sys.stderr)
        return car

    # Plug-in hybrids report `range` as blended gas+electric total; the
    # electric-only figure is `rangeA`. Pure EVs only populate `range`.
    is_phev = (detail.get("phevBlended") or "").casefold() == "true"
    ev_range = _coerce_float(detail.get("rangeA")) if is_phev else _coerce_float(detail.get("range"))
    comb_mpg = _coerce_float(detail.get("comb08"))

    updated = dict(car)
    updated["epa_source_id"] = vehicle_id
    if ev_range and not is_phev:
        updated["ev_range_miles"] = int(ev_range)
        updated["mpg"] = None
    elif is_phev:
        updated["ev_range_miles"] = int(ev_range) if ev_range else car.get("ev_range_miles")
        if comb_mpg:
            updated["mpg"] = int(comb_mpg)
    elif comb_mpg:
        updated["mpg"] = int(comb_mpg)

    print(f"  OK {year} {make} {model} -> id={vehicle_id} range={ev_range} mpg={comb_mpg} phev={is_phev}")
    return updated


def main() -> None:
    inventory = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    print(f"Refreshing {len(inventory)} vehicles from fueleconomy.gov (EPA specs only)...")
    refreshed = [refresh_car(car) for car in inventory]
    DATA_PATH.write_text(json.dumps(refreshed, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {DATA_PATH}")


if __name__ == "__main__":
    main()
