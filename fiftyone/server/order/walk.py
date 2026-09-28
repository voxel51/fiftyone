"""
FiftyOne Server tie-aware seek over a single-field index.

The order is ``(segment, value, _id)``: the None segment (null or missing)
first, then values. Only a single-field index on the value is assumed, so a
seek never asks MongoDB to sort by two keys.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from dataclasses import dataclass
import typing as t


@dataclass(frozen=True)
class Row:
    segment: int
    value: t.Any
    id: t.Any


def _get(doc: dict, path: str):
    value = doc
    for part in path.split("."):
        if not isinstance(value, dict):
            return None
        value = value.get(part)

    return value


class Walker:
    """Walks ``limit`` rows from a start in one direction of the ascending
    order (``o=1`` up, ``o=-1`` down). ``path=None`` orders by ``_id``."""

    def __init__(self, collection, pipeline: t.List[dict], path):
        self._collection = collection
        self._pipeline = pipeline
        self._path = path

    def walk(
        self, start: t.Optional[Row], inclusive: bool, o: int, limit: int
    ) -> t.List[Row]:
        op = "$gt" if o == 1 else "$lt"
        id_op = op + "e" if inclusive else op
        if self._path is None:
            match = {} if start is None else {"_id": {id_op: start.id}}
            return self._run(match, {"_id": o}, limit)

        f = self._path
        segments = [0, 1] if o == 1 else [1, 0]
        if start is not None:
            segments = segments[segments.index(start.segment) :]

        out: t.List[Row] = []
        for segment in segments:
            remaining = limit - len(out)
            if remaining <= 0:
                break

            here = start if start and start.segment == segment else None
            if segment == 0:
                match = {f: None}
                if here:
                    match["_id"] = {id_op: here.id}
                out += self._run(match, {"_id": o}, remaining)
            elif here:
                # the rest of the tie block, then the values beyond it
                match = {f: here.value, "_id": {id_op: here.id}}
                out += self._run(match, {"_id": o}, remaining)
                remaining = limit - len(out)
                if remaining > 0:
                    out += self._values({f: {op: here.value}}, o, remaining)
            else:
                out += self._values({f: {"$ne": None}}, o, remaining)

        return out[:limit]

    def _values(self, match: dict, o: int, limit: int) -> t.List[Row]:
        """The next ``limit`` rows of the values segment. Index order breaks
        ties by record, not id, so only the last value's block can be cut
        short; it is refetched by id."""
        rows = self._run(match, {self._path: o}, limit)
        if len(rows) < limit:
            return _order_blocks(rows, o)

        last = rows[-1].value
        cut = len(rows)
        while cut > 0 and rows[cut - 1].value == last:
            cut -= 1

        whole = _order_blocks(rows[:cut], o)
        tail = self._run({self._path: last}, {"_id": o}, limit - len(whole))
        return whole + tail

    def _run(self, match: dict, sort: dict, limit: int) -> t.List[Row]:
        if limit <= 0:
            return []

        f = self._path
        project = {"_id": 1} if f is None else {f: 1}
        pipeline = self._pipeline + [
            {"$match": match},
            {"$sort": sort},
            {"$limit": limit},
            {"$project": project},
        ]
        rows = []
        for doc in self._collection.aggregate(pipeline):
            if f is None:
                rows.append(Row(segment=1, value=None, id=doc["_id"]))
                continue

            value = _get(doc, f)
            rows.append(
                Row(
                    segment=0 if value is None else 1,
                    value=value,
                    id=doc["_id"],
                )
            )

        return rows


def _order_blocks(rows: t.List[Row], o: int) -> t.List[Row]:
    """Sorts each run of equal values by id, keeping the runs in place."""
    out: t.List[Row] = []
    i = 0
    while i < len(rows):
        j = i
        while j < len(rows) and rows[j].value == rows[i].value:
            j += 1

        out += sorted(rows[i:j], key=lambda r: r.id, reverse=o == -1)
        i = j

    return out
