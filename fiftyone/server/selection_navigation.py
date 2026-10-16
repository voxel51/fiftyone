"""
Bounded grid navigation from a selected sample's identity.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from bson import ObjectId
import pymongo

import fiftyone.core.fields as fof
import fiftyone.core.odm as foo
import fiftyone.server.selection as foss

QUERY_SECONDS = 5
PAGE_SIZE = 20


def sample_neighborhood(dataset, request):
    """Resolves a grid destination without computing its rank when possible.

    Stable field sorts seek around an identity. Other views retain their
    exact ordering through the existing position resolver, under the same
    deadline. Cursors contain identities, never client-supplied predicates.

    Args:
        dataset: the authorized dataset
        request: the grid scope, sampleId, and optional direction

    Returns:
        the scoped view and a location descriptor
    """
    sample_id = request.get("sampleId")
    direction = request.get("direction", "at")
    if not ObjectId.is_valid(sample_id):
        raise ValueError("A sample id is required")
    if direction not in ("at", "before", "after"):
        raise ValueError("Invalid navigation direction")

    with pymongo.timeout(QUERY_SECONDS):
        view, _, _ = foss._scoped_view(dataset, request)
        pipeline = view._pipeline()
        sort_index = _seek_sort(pipeline)
        if sort_index is not None and not _scalar_sort(
            view, pipeline[sort_index]["$sort"]
        ):
            sort_index = None
        collection = view._dataset._sample_collection
        oid = ObjectId(sample_id)
        if sort_index is not None:
            # Keep membership-changing stages but read sort keys before any
            # field projection. The accepted suffix preserves identities.
            target = list(
                foo.aggregate(
                    collection,
                    pipeline[:sort_index]
                    + [{"$match": {"_id": oid}}, {"$limit": 1}],
                )
            )
            if not target:
                return view, {"kind": "missing"}
            sort = pipeline[sort_index]["$sort"]
            values = [_value(target[0], key) for key in sort]
            if all(not isinstance(v, (list, dict)) for v in values):
                before = direction == "before"
                predicate = _seek_predicate(
                    sort, values, before, inclusive=direction == "at"
                )
                order = {k: -v if before else v for k, v in sort.items()}
                # The projection suffix doesn't change membership/order.
                query = pipeline[:sort_index] + [
                    {"$match": predicate},
                    {"$sort": order},
                    {"$limit": PAGE_SIZE + 1},
                    {"$project": {"_id": 1}},
                ]
                docs = list(foo.aggregate(collection, query))
                more = len(docs) > PAGE_SIZE
                ids = [str(doc["_id"]) for doc in docs[:PAGE_SIZE]]
                if before:
                    ids.reverse()
                return view, {
                    "kind": "seek",
                    "ids": ids,
                    "previous": (
                        _cursor(ids, "before")
                        if (more if before else True)
                        else None
                    ),
                    "next": (
                        _cursor(ids, "after")
                        if (True if before else more)
                        else None
                    ),
                }

        # A continuation must not switch from relative cursor pages to
        # absolute offsets if the ordering or anchor changed underneath it.
        if direction != "at":
            raise ValueError("The grid order changed; show the item again")
        position = foss.sample_position(
            dataset, {**request, "maxQueryTime": QUERY_SECONDS}
        )
        index = position["index"]
        return view, (
            {"kind": "offset", "index": index}
            if index is not None
            else {"kind": "missing"}
        )


def _seek_sort(pipeline):
    """Only seek stable, sample-preserving sorts with unchanged sort keys."""
    # Reconstructing groups or identities for every cursor query costs more
    # than ordinary paging and can invalidate sample-identity cursors.
    if any(
        operator in stage
        for stage in pipeline
        for operator in (
            "$group",
            "$bucket",
            "$bucketAuto",
            "$unwind",
            "$replaceRoot",
            "$replaceWith",
            "$facet",
            "$unionWith",
        )
    ):
        return None
    for index in range(len(pipeline) - 1, -1, -1):
        stage = pipeline[index]
        if "$sort" in stage:
            sort = stage["$sort"]
            return (
                index
                if "_id" in sort
                and all(order in (-1, 1) for order in sort.values())
                else None
            )
        if (
            set(stage) != {"$project"}
            or any(value not in (0, 1) for value in stage["$project"].values())
            or stage["$project"].get("_id") == 0
        ):
            return None
    return None


def _value(document, path):
    for part in path.split("."):
        if not isinstance(document, dict):
            return None
        document = document.get(part)
    return document


def _scalar_sort(view, sort):
    # Mongo sorts array fields by their min/max element, whereas expression
    # comparisons compare the whole array. Such sorts must use the fallback.
    for key in sort:
        if key == "_id":
            continue
        parts = key.split(".")
        for end in range(1, len(parts) + 1):
            field = view.get_field(".".join(parts[:end]))
            if field is None or isinstance(
                field, (fof.ListField, fof.DictField)
            ):
                return False
    return True


def _seek_predicate(sort, values, before, inclusive=False):
    clauses = []
    keys = list(sort.items())
    for index, (key, order) in enumerate(keys):
        # Query equality matches both null and missing, like Mongo sorting,
        # and preserves index bounds through a long run of null sort values.
        prefix = [
            (
                {k: None}
                if value is None
                else {"$expr": {"$eq": ["$" + k, {"$literal": value}]}}
            )
            for (k, _), value in zip(keys[:index], values[:index])
        ]
        comparison = "$lt" if (order > 0) == before else "$gt"
        # Include the anchor in the final lexicographic branch. A separate
        # OR on _id prevents Mongo from stopping after one ordered page.
        if inclusive and index == len(keys) - 1:
            comparison += "e"
        clause = {
            "$expr": {comparison: ["$" + key, {"$literal": values[index]}]}
        }
        if values[index] is None:
            # Expressions order missing below null, whereas sorting ties
            # them. Correct only those comparisons where this matters.
            if comparison == "$lt":
                prefix.append({key: {"$ne": None}})
            elif comparison == "$gte":
                clause = {"$or": [{key: None}, clause]}
        prefix.append(clause)
        clauses.append({"$and": prefix})
    # Aggregation comparisons preserve BSON ordering across scalar types.
    return {"$or": clauses}


def _cursor(ids, direction):
    if not ids:
        return None
    return {
        "sampleId": ids[0] if direction == "before" else ids[-1],
        "direction": direction,
    }
