from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "inventory.json"
DEFAULT_LIMIT = 10
MAX_LIMIT = 50

TOOL_NAME = "inventory-search"
TOOL_DESCRIPTION = (
    "Filter synthetic inventory by budget, range/MPG, odometer miles, and required features."
)
TOOL_INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "min_price": {"type": "number"},
        "max_price": {"type": "number"},
        "min_ev_range_miles": {"type": "number"},
        "min_mpg": {"type": "number"},
        "max_odometer_miles": {"type": "number"},
        "year_min": {"type": "integer"},
        "year_max": {"type": "integer"},
        "required_features": {
            "type": "array",
            "items": {"type": "string"}
        },
        "sort_by": {
            "type": "string",
            "enum": ["price", "year", "ev_range_miles", "mpg", "odometer_miles"],
        },
        "sort_direction": {"type": "string", "enum": ["asc", "desc"]},
        "limit": {"type": "integer", "minimum": 1, "maximum": MAX_LIMIT},
    },
}


def load_inventory(path: Path = DATA_PATH) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def normalize_feature(feature: str) -> str:
    return " ".join(feature.casefold().strip().split())


def _coerce_number(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _coerce_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _matches_required_features(car: dict[str, Any], required_features: list[str]) -> bool:
    if not required_features:
        return True

    car_features = [normalize_feature(f) for f in car.get("features", [])]
    return all(any(req in available for available in car_features) for req in required_features)


def search_inventory(
    inventory: list[dict[str, Any]],
    *,
    min_price: float | None = None,
    max_price: float | None = None,
    min_ev_range_miles: float | None = None,
    min_mpg: float | None = None,
    max_odometer_miles: float | None = None,
    year_min: int | None = None,
    year_max: int | None = None,
    required_features: list[str] | None = None,
    sort_by: str = "price",
    sort_direction: str = "asc",
    limit: int = DEFAULT_LIMIT,
) -> list[dict[str, Any]]:
    required_features = [normalize_feature(f) for f in (required_features or [])]
    filtered: list[dict[str, Any]] = []

    for car in inventory:
        price = _coerce_number(car.get("price"))
        ev_range = _coerce_number(car.get("ev_range_miles"))
        mpg = _coerce_number(car.get("mpg"))
        odometer = _coerce_number(car.get("odometer_miles"))
        year = _coerce_int(car.get("year"))

        if min_price is not None and (price is None or price < min_price):
            continue
        if max_price is not None and (price is None or price > max_price):
            continue
        if min_ev_range_miles is not None and (ev_range is None or ev_range < min_ev_range_miles):
            continue
        if min_mpg is not None and (mpg is None or mpg < min_mpg):
            continue
        if max_odometer_miles is not None and (odometer is None or odometer > max_odometer_miles):
            continue
        if year_min is not None and (year is None or year < year_min):
            continue
        if year_max is not None and (year is None or year > year_max):
            continue
        if not _matches_required_features(car, required_features):
            continue

        filtered.append(car)

    reverse = sort_direction.casefold() == "desc"

    def _sort_key(car: dict[str, Any]) -> tuple[int, float]:
        value = _coerce_number(car.get(sort_by))
        if value is None:
            return (1, 0.0)
        return (0, value)

    filtered.sort(key=_sort_key, reverse=reverse)
    return filtered[: max(1, min(limit, MAX_LIMIT))]


def run_inventory_search(payload: dict[str, Any], inventory: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    inventory_data = inventory if inventory is not None else load_inventory()

    min_price = _coerce_number(payload.get("min_price"))
    max_price = _coerce_number(payload.get("max_price"))
    min_ev_range_miles = _coerce_number(payload.get("min_ev_range_miles"))
    min_mpg = _coerce_number(payload.get("min_mpg"))
    max_odometer_miles = _coerce_number(payload.get("max_odometer_miles"))
    year_min = _coerce_int(payload.get("year_min"))
    year_max = _coerce_int(payload.get("year_max"))
    sort_by = str(payload.get("sort_by") or "price")
    sort_direction = str(payload.get("sort_direction") or "asc")
    limit = _coerce_int(payload.get("limit")) or DEFAULT_LIMIT

    required_features = payload.get("required_features") or payload.get("features") or []
    if isinstance(required_features, str):
        required_features = [required_features]

    matches = search_inventory(
        inventory_data,
        min_price=min_price,
        max_price=max_price,
        min_ev_range_miles=min_ev_range_miles,
        min_mpg=min_mpg,
        max_odometer_miles=max_odometer_miles,
        year_min=year_min,
        year_max=year_max,
        required_features=list(required_features),
        sort_by=sort_by,
        sort_direction=sort_direction,
        limit=limit,
    )

    return {
        "tool": TOOL_NAME,
        "query": {
            "min_price": min_price,
            "max_price": max_price,
            "min_ev_range_miles": min_ev_range_miles,
            "min_mpg": min_mpg,
            "max_odometer_miles": max_odometer_miles,
            "year_min": year_min,
            "year_max": year_max,
            "required_features": required_features,
            "sort_by": sort_by,
            "sort_direction": sort_direction,
            "limit": limit,
        },
        "total_inventory": len(inventory_data),
        "match_count": len(matches),
        "matches": matches,
    }


def inventory_search_tool(arguments: dict[str, Any]) -> dict[str, Any]:
    """MCP tool entrypoint when this Function App is hosted as a toolserver."""
    return run_inventory_search(arguments)
