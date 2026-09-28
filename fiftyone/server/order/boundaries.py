"""
FiftyOne Server order boundaries from one ``$setWindowFields`` pass.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import typing as t

from pymongo.errors import ExecutionTimeout

from fiftyone.server.order.backend import (
    Boundary,
    BudgetExceeded,
    OrderHandle,
)
from fiftyone.server.order.positions import GAP, Key, encode_key

MIN_STEP = 20


def boundary_step(total: int) -> int:
    return max(MIN_STEP, total // 1000)


def build_boundaries(handle: OrderHandle) -> t.List[Boundary]:
    """Boundaries every ``max(20, N / 1000)`` ranks. ``$documentNumber``
    takes a single sort key, and the subdocument ``{a: value, b: _id}``
    compares exactly like ``(value, _id)``."""
    if not handle.plan.supports_random_access or handle.total == 0:
        return []

    step = boundary_step(handle.total)
    path = handle.state["path"]
    o = -1 if handle.spec.desc else 1
    if path:
        key = {"a": {"$ifNull": ["$" + path, None]}, "b": "$_id"}
        project = {"$project": {"k": key}}
        sort = {"k": o}
    else:
        project = {"$project": {"_id": 1}}
        sort = {"_id": o}

    first_of_step = {"$eq": [{"$mod": [{"$subtract": ["$rank", 1]}, step]}, 0]}
    pipeline = handle.state["pipeline"] + [
        project,
        {
            "$setWindowFields": {
                "sortBy": sort,
                "output": {"rank": {"$documentNumber": {}}},
            }
        },
        {"$match": {"$expr": first_of_step}},
    ]
    coll = handle.state["view"]._dataset._sample_collection
    try:
        docs = list(
            coll.aggregate(
                pipeline,
                allowDiskUse=True,
                maxTimeMS=handle.budget.max_time_ms,
            )
        )
    except ExecutionTimeout as err:
        raise BudgetExceeded("building boundaries took too long") from err

    stored = []
    for doc in docs:
        rank = doc["rank"] - 1
        value = doc["k"]["a"] if path else None
        _id = doc["k"]["b"] if path else doc["_id"]
        segment = 0 if path and value is None else 1
        position = Key(
            kind=GAP, rank=rank, id=_id, segment=segment, value=value
        )
        stored.append(
            Boundary(rank=rank, position=encode_key(position), value=value)
        )

    return stored
