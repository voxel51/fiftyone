"""
Resolution of complete grid selection scopes, independent of pagination.

These operations use synchronous Dataset and storage APIs. Async callers must
run the complete operation in a worker via ``fou.run_sync_task``; large captures
and writes use the bounded selection job workers.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from contextlib import contextmanager
import copy
from datetime import datetime, timedelta, timezone
from functools import lru_cache
import hashlib
from itertools import chain, groupby, islice
import math

from bson import BSON, ObjectId

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.odm as foo
import fiftyone.core.selection as fosel
import fiftyone.core.selection_refs as fosr
import fiftyone.core.storage as fost
import fiftyone.core.subsets as fosub
import fiftyone.core.tags as fot
import fiftyone.core.utils as fou
import fiftyone.core.selection_context as fosc
from fiftyone.server.filters import GroupElementFilter, SampleFilter
import fiftyone.server.tags as fostag
import fiftyone.server.view as fosv
from fiftyone.server.selection_extensions import resolve_filters

SNAPSHOT_TTL = timedelta(hours=1)
SNAPSHOT_CHUNK = 5000


def _scoped_view(dataset, request):
    """Builds the view the grid shows: stages, filters, and the active slice.

    Returns the view, the browsing boundary, and whether the view converts
    samples into other elements (patches, frames, clips).
    """
    boundary = request.get("boundary") or {}
    filters = copy.deepcopy(request.get("filters") or {})
    filters.pop("_selection_scope", None)
    selection_scope = boundary or None
    stages = request.get("view")
    # Identity restriction commutes with supported filters and sort stages,
    # but must remain after a window that changes membership by position.
    detail_ids = None
    if request.get("detailsOnly") and not any(
        stage.get("_cls", "").rsplit(".", 1)[-1]
        in {"Skip", "Limit", "Take", "GroupBy", "Flatten"}
        for stage in [
            *(stages or []),
            *({"_cls": cls} for cls in request.get("extendedStages", {})),
        ]
    ):
        detail_ids = [
            i for i in request.get("episodeIds", []) if ObjectId.is_valid(i)
        ]
    slice_name = request.get("slice")
    sample_filter = (
        SampleFilter(
            group=GroupElementFilter(slice=slice_name, slices=[slice_name])
        )
        if slice_name
        else None
    )
    filters, constrain_view = resolve_filters(dataset, filters)
    view = fosv.get_view(
        dataset,
        stages=stages,
        filters=filters,
        extended_stages=copy.deepcopy(request.get("extendedStages") or {}),
        sample_filter=sample_filter,
        selection_scope=selection_scope,
        selection_ids=detail_ids,
        sort_by=request.get("sortBy"),
        desc=request.get("desc", False),
    )
    view = constrain_view(view)
    converted = view._dataset is not dataset
    if converted and boundary.get("provider"):
        raise ValueError("Segment sources are available in the samples view")
    return view, boundary, converted


# Stages that never change which document comes before another.
_ORDER_PRESERVING = {
    "$addFields",
    "$limit",
    "$lookup",
    "$project",
    "$set",
    "$unset",
}


def _final_sort(pipeline):
    """The index of the pipeline's ordering ``$sort``, or None.

    The sort must be the last stage that can reorder or drop documents;
    projections and limits after it keep every remaining document in place.
    """
    for index in range(len(pipeline) - 1, -1, -1):
        stage = pipeline[index]
        if "$sort" in stage:
            return index
        if next(iter(stage)) not in _ORDER_PRESERVING:
            return None
    return None


def _before_sorted(sort, target):
    """Matches documents the sort places before ``target``.

    Ties on every sort key fall back to ``_id`` order, which is the best a
    caller can do when the sort itself does not break them.
    """
    keys = list(sort.items())
    if any(
        target.get(key) is None or isinstance(target.get(key), (list, dict))
        for key, _ in keys
    ):
        return None
    clauses = []
    for index, (key, order) in enumerate(keys):
        prefix = [
            {"$eq": ["$" + prior, {"$literal": target[prior]}]}
            for prior, _ in keys[:index]
        ]
        comparison = {
            "$lt" if order > 0 else "$gt": [
                "$" + key,
                {"$literal": target[key]},
            ]
        }
        clauses.append({"$and": prefix + [comparison]})
    tie = [{"$eq": ["$" + key, {"$literal": target[key]}]} for key, _ in keys]
    tie.append({"$lt": ["$_id", {"$literal": target["_id"]}]})
    clauses.append({"$and": tie})
    return {"$expr": {"$or": clauses}}


def _count(collection, pipeline, max_time_ms):
    result = list(
        foo.aggregate(
            collection, pipeline + [{"$count": "n"}], maxTimeMS=max_time_ms
        )
    )
    return result[0]["n"] if result else 0


def sample_position(dataset, request):
    """The grid index of one sample in the requested scope, or None.

    The grid pages by offset, so the index names the page that shows the
    sample. Sorted views count the documents the sort places first;
    otherwise walk the grid's own pipeline, projected to ids, until the
    sample appears. ObjectId order cannot stand in for insertion order:
    patches reuse label ids, and imported samples can carry existing ids.
    """
    sample_id = request.get("sampleId")
    if not ObjectId.is_valid(sample_id):
        raise ValueError("A sample id is required")
    oid = ObjectId(sample_id)
    view, _, _ = _scoped_view(dataset, request)
    if not view.select(sample_id).count():
        return {"index": None}
    collection = view._dataset._sample_collection
    max_time = request.get("maxQueryTime")
    max_time_ms = int(max_time) * 1000 if max_time else None
    pipeline = view._pipeline()
    sort_index = _final_sort(pipeline)
    if sort_index is not None:
        before = pipeline[:sort_index]
        target = list(
            foo.aggregate(
                collection,
                before + [{"$match": {"_id": oid}}],
                maxTimeMS=max_time_ms,
            )
        )
        predicate = (
            _before_sorted(pipeline[sort_index]["$sort"], target[0])
            if target
            else None
        )
        if predicate is not None:
            return {
                "index": _count(
                    collection, before + [{"$match": predicate}], max_time_ms
                )
            }
    ids = foo.aggregate(
        collection,
        pipeline + [{"$project": {"_id": True}}],
        maxTimeMS=max_time_ms,
    )
    for index, doc in enumerate(ids):
        if doc["_id"] == oid:
            return {"index": index}
    return {"index": None}


def _expands_groups(request, view):
    return (
        request.get("expand") == "dynamic-groups" and view._is_dynamic_groups
    )


def _scope_counts(view, boundary):
    if boundary.get("provider"):
        counts = _whole_counts(0)
        for batch in _provider_member_batches(view, boundary):
            for key, count in fosel.count_members(batch).items():
                counts[key] += count
        return counts
    if boundary.get("subsetId"):
        return fosub.view_counts(
            view, boundary["subsetId"], boundary.get("subsetScope")
        )
    if view._is_clips and not (
        view._classification_field or fosr.is_trajectory(view)
    ):
        counts = _whole_counts(0)
        for _ in _counted_members(fosr.iter_members(view), counts):
            pass
        return counts
    return _whole_counts(view.count())


def _scope_members(view, boundary):
    if boundary.get("provider"):
        return chain.from_iterable(_provider_member_batches(view, boundary))
    if boundary.get("subsetId"):
        return fosub.iter_view_members(
            view, boundary["subsetId"], boundary.get("subsetScope")
        )
    return fosr.iter_members(view)


def _constrained(request, boundary):
    return bool(
        request.get("view")
        or request.get("filters")
        or request.get("extendedStages")
        or boundary.get("provider")
    )


def _whole_counts(total):
    return {
        "episodes": total,
        "fullEpisodes": total,
        "segments": 0,
        "segmentEpisodes": 0,
        "unavailable": 0,
    }


def _dynamic_group_details(dataset, view, request, wanted, progress=None):
    """Describe bounded group cards; complete captures stay on the server."""
    if not wanted:
        return []
    expression, _, root, _ = view._parse_dynamic_groups()
    # Modal checkboxes can name any member. Resolve its group in the input
    # view, then select that group only if it survives the grouped windows.
    aliases = {}
    values = []
    for row in root.select(wanted)._aggregate(
        pipeline=[{"$project": {"value": expression}}]
    ):
        value = row.get("value")
        key = BSON.encode({"value": value})
        aliases.setdefault(key, []).append(str(row["_id"]))
        values.append(value)
    if not values:
        return []
    selected = view.mongo(
        [{"$match": {"$expr": {"$in": [expression, {"$literal": values}]}}}]
    )
    flat = selected.flatten()
    boundary = request.get("boundary") or {}
    details = sample_details_map(view._dataset, wanted, clips=view._is_clips)

    def cards(value, group):
        group["key"] = hashlib.sha256(
            BSON.encode({"expression": expression, "value": value})
        ).hexdigest()
        return [
            {
                "episodeId": sid,
                "members": [],
                "group": group,
                **details.get(sid, {}),
            }
            for sid in aliases.get(BSON.encode({"value": value}), [])
        ]

    if boundary.get("provider"):
        groups = []
        for row in selected._aggregate(
            pipeline=[{"$project": {"value": expression}}]
        ):
            members = _scope_members(
                view.select(str(row["_id"])).flatten(), boundary
            )
            fingerprint = 0

            def fingerprinted():
                nonlocal fingerprint
                for member in members:
                    digest = hashlib.sha256(fosel.member_key(member).encode())
                    fingerprint ^= int.from_bytes(digest.digest(), "big")
                    yield member

            group = _capture_group(dataset, request, fingerprinted(), progress)
            group.update(
                label=str(row.get("value")), fingerprint="%064x" % fingerprint
            )
            groups.extend(cards(row.get("value"), group))
        return groups

    # Lookup/unwind stays fused: Mongo streams group members rather than
    # assembling one large sample-document array per group.
    pipeline = selected._dynamic_groups_pipeline()
    pipeline[0]["$project"]["_fo_selection_rep"] = "$_id"
    pipeline[-1] = {
        "$replaceRoot": {
            "newRoot": {
                "$mergeObjects": [
                    "$groups",
                    {
                        "_fo_selection_rep": "$_fo_selection_rep",
                        "_fo_selection_label": "$_group_expr",
                    },
                ]
            }
        }
    }
    projection = {"_id": 1, "_fo_selection_rep": 1, "_fo_selection_label": 1}
    reference = fosr.reference_expression(flat)
    if boundary.get("subsetId"):
        query = fosub.member_query(
            dataset, boundary["subsetId"], boundary.get("subsetScope")
        )
        pipeline.extend(
            [
                fosub._member_lookup(flat, query),
                {"$unwind": "$_fo_subset_members"},
            ]
        )
        projection["saved"] = "$_fo_subset_members"
    if reference is not None:
        projection["reference"] = reference
    pipeline.append({"$project": projection})
    if (
        reference is not None
        and flat._is_clips
        and not (flat._classification_field or fosr.is_trajectory(flat))
    ):
        pipeline.extend(
            [
                {
                    "$group": {
                        "_id": {
                            "rep": "$_fo_selection_rep",
                            "reference": "$reference",
                        },
                        "row": {"$first": "$$ROOT"},
                    }
                },
                {"$replaceRoot": {"newRoot": "$row"}},
                {"$sort": {"_fo_selection_rep": 1, "_id": 1}},
            ]
        )
    identity = {
        "$ifNull": [
            "$reference",
            {
                "episodeId": {"$toString": "$_id"},
                "kind": {"$ifNull": ["$saved.member.kind", "episode"]},
                "range": {
                    key: "$saved.member.range." + key
                    for key in ("start", "end", "timebase", "streams")
                },
            },
        ]
    }
    # This checksum is only a membership-change hint, not a security digest.
    # Summing decimal hashes is order independent and supported on Mongo 4.4+.
    pipeline.append(
        {
            "$set": {
                "fingerprint": {"$toDecimal": {"$toHashedIndexKey": identity}}
            }
        }
    )
    if not request.get("capture"):
        pipeline.extend(
            [
                {
                    "$group": {
                        "_id": {"rep": "$_fo_selection_rep", "parent": "$_id"},
                        "value": {"$first": "$_fo_selection_label"},
                        "full": {
                            "$sum": {
                                "$cond": [
                                    {"$eq": ["$saved.member.kind", "segment"]},
                                    0,
                                    1,
                                ]
                            }
                        },
                        "segments": {
                            "$sum": {
                                "$cond": [
                                    {"$eq": ["$saved.member.kind", "segment"]},
                                    1,
                                    0,
                                ]
                            }
                        },
                        "fingerprint": {"$sum": "$fingerprint"},
                    }
                },
                {
                    "$group": {
                        "_id": "$_id.rep",
                        "value": {"$first": "$value"},
                        "episodes": {"$sum": 1},
                        "fullEpisodes": {"$sum": "$full"},
                        "segments": {"$sum": "$segments"},
                        "segmentEpisodes": {
                            "$sum": {
                                "$cond": [{"$gt": ["$segments", 0]}, 1, 0]
                            }
                        },
                        "fingerprint": {"$sum": "$fingerprint"},
                    }
                },
            ]
        )
        groups = []
        for row in selected._aggregate(pipeline=pipeline):
            counts = {key: row.get(key, 0) for key in _whole_counts(0)}
            groups.extend(
                cards(
                    row.get("value"),
                    {
                        "label": str(row.get("value")),
                        "counts": counts,
                        "size": counts["fullEpisodes"] + counts["segments"],
                        "fingerprint": str(
                            int(row["fingerprint"].to_decimal())
                        ),
                    },
                )
            )
        return groups

    rows = selected._aggregate(pipeline=pipeline).batch_size(1000)
    groups = []
    for _, rows_for_group in groupby(
        rows, lambda row: row["_fo_selection_rep"]
    ):
        first = next(rows_for_group)
        fingerprint = 0

        def whole_members():
            nonlocal fingerprint
            for row in chain([first], rows_for_group):
                fingerprint += int(row["fingerprint"].to_decimal())
                if "saved" in row:
                    member = fosub._member(row["saved"])
                    member["episodeId"] = str(row["_id"])
                else:
                    member = {"episodeId": str(row["_id"]), "kind": "episode"}
                    if reference is not None:
                        member["reference"] = fosr.normalize_reference(
                            row["reference"]
                        )
                yield member

        group = _capture_group(dataset, request, whole_members(), progress)
        value = first.get("_fo_selection_label")
        group.update(label=str(value), fingerprint=str(fingerprint))
        groups.extend(cards(value, group))
    return groups


def _capture_group(dataset, request, members, progress):
    if request.get("capture"):
        snapshot = _write_snapshot(
            dataset,
            members,
            request.get("view"),
            progress=progress,
            group_count=1,
        )
        retain_snapshot(dataset, snapshot["snapshotId"])
        result = snapshot
    else:
        counts = _whole_counts(0)
        for _ in _counted_members(members, counts):
            pass
        result = {"counts": counts}
    result["size"] = (
        result["counts"]["fullEpisodes"] + result["counts"]["segments"]
    )
    return result


def _scope_details(
    dataset, view, boundary, converted, request, wanted, progress=None
):
    """Reads clicked parents without recounting the surrounding scope."""
    if _expands_groups(request, view):
        return {
            "groups": _dynamic_group_details(
                dataset, view, request, wanted, progress
            )
        }
    target = view._dataset if converted else dataset
    selected = view.select(wanted)
    if boundary.get("provider"):
        members = list(
            chain.from_iterable(_provider_member_batches(selected, boundary))
        )
    elif boundary.get("subsetId"):
        members = list(
            fosub.iter_view_members(
                selected, boundary["subsetId"], boundary.get("subsetScope")
            )
        )
        present = set(fosel.select_parents(target, wanted).values("id"))
        members.extend(
            fosub.iter_parent_members(
                dataset,
                boundary["subsetId"],
                boundary.get("subsetScope"),
                set(wanted) - present,
            )
        )
    else:
        members = list(fosr.iter_members(selected))
    samples = sample_details_map(
        target, wanted, clips=converted and view._is_clips
    )
    return {"groups": fosel.group_members(members, samples)}


def resolve_scope(dataset, request, progress=None):
    """Counts the complete scope and describes only the requested parents.

    Browsing never enumerates every member for the browser. ``episodeIds``
    limits the returned groups to the parents the tray needs: selected cards
    and clicked tiles. Missing saved references are reported separately.
    """
    if "snapshotIds" in request:
        return {"groups": [], "counts": _capture_counts(dataset, request)}
    view, boundary, converted = _scoped_view(dataset, request)
    wanted = [
        i for i in request.get("episodeIds") or [] if ObjectId.is_valid(i)
    ]
    if request.get("detailsOnly"):
        return _scope_details(
            dataset, view, boundary, converted, request, wanted, progress
        )
    if _expands_groups(request, view):
        flat = view.flatten()
        counts = _scope_counts(flat, boundary)
        counts["groups"] = view.count()
        return {
            "groups": _dynamic_group_details(
                dataset, view, request, wanted, progress
            ),
            "unavailableGroups": [],
            "counts": counts,
        }
    if not (boundary.get("subsetId") or boundary.get("provider")):
        total = view.count()
        groups = []
        if wanted:
            target = view._dataset if converted else dataset
            present = view.select(wanted).values("id")
            samples = sample_details_map(
                target, present, clips=converted and view._is_clips
            )
            groups = fosel.group_members(
                list(fosr.iter_members(view.select(present))),
                samples,
            )
        return {
            "groups": groups,
            "unavailableGroups": [],
            "counts": _whole_counts(total),
        }
    if boundary.get("subsetId") and not boundary.get("provider"):
        subset_id = boundary["subsetId"]
        scope = boundary.get("subsetScope")
        unfiltered = (
            not _constrained(request, boundary)
            and dataset.media_type != "group"
        )
        counts = (
            fosub.subset_counts(dataset, subset_id, scope)
            if unfiltered
            else fosub.view_counts(view, subset_id, scope)
        )
        missing_counts = (
            fosub.missing_counts(dataset, subset_id, scope)
            if not unfiltered or counts["unavailable"]
            else _whole_counts(0)
        )
        missing = (
            fosub.missing_member_page(
                dataset,
                subset_id,
                scope,
                skip=int(request.get("unavailableSkip", 0)),
            )
            if missing_counts["episodes"]
            else []
        )
        if not unfiltered and not _constrained(request, boundary):
            counts = {key: counts[key] + missing_counts[key] for key in counts}
        described = (
            list(
                fosub.iter_view_members(view.select(wanted), subset_id, scope)
            )
            if wanted
            else []
        )
        wanted_set = set(wanted)
        described.extend(m for m in missing if m["episodeId"] in wanted_set)
        samples = sample_details_map(
            view._dataset, wanted, clips=view._is_clips
        )
        return {
            "groups": fosel.group_members(described, samples),
            "unavailableGroups": fosel.group_members(missing, {}),
            "unavailableTotal": missing_counts["episodes"],
            "counts": counts,
        }
    counts = _whole_counts(0)
    described = []
    wanted_set = set(wanted)
    for batch in _provider_member_batches(view, boundary):
        batch_counts = fosel.count_members(batch)
        counts = {key: counts[key] + batch_counts[key] for key in counts}
        described.extend(m for m in batch if m["episodeId"] in wanted_set)
    samples = sample_details_map(dataset, wanted)
    missing = []
    missing_total = 0
    if boundary.get("subsetId"):
        subset_id, scope = boundary["subsetId"], boundary.get("subsetScope")
        missing_total = fosub.missing_counts(dataset, subset_id, scope)[
            "episodes"
        ]
        if missing_total:
            missing = fosub.missing_member_page(
                dataset,
                subset_id,
                scope,
                skip=int(request.get("unavailableSkip", 0)),
            )
    return {
        "groups": fosel.group_members(described, samples),
        "unavailableGroups": fosel.group_members(missing, {}),
        "unavailableTotal": missing_total,
        "counts": counts,
    }


def create_snapshot(dataset, request, progress=None):
    """Streams complete membership into chunks, including very large parents."""
    if "snapshotIds" in request or "members" in request:
        return _combine_snapshot(dataset, request, progress)
    view, boundary, _ = _scoped_view(dataset, request)
    group_count = None
    if _expands_groups(request, view):
        group_count = view.count()
        view = view.flatten()
    counts = _whole_counts(0)
    if boundary.get("provider"):
        members = chain.from_iterable(_provider_member_batches(view, boundary))
    elif boundary.get("subsetId"):
        subset_id = boundary["subsetId"]
        scope = boundary.get("subsetScope")
        members = fosub.iter_view_members(view, subset_id, scope)
        if not _constrained(request, boundary):

            def missing_members():
                for member in fosub.iter_missing_members(
                    dataset, subset_id, scope
                ):
                    counts["unavailable"] += 1
                    yield member

            members = chain(members, missing_members())
    else:
        members = fosr.iter_members(view)
    return _write_snapshot(
        dataset, members, request.get("view"), progress, counts, group_count
    )


def _counted_members(members, counts):
    """Count a unique stream in parent order without retaining its identities."""
    previous = None
    has_segment = False
    for member in members:
        episode = member["episodeId"]
        if episode != previous:
            counts["episodes"] += 1
            previous, has_segment = episode, False
        if member["kind"] == "segment":
            counts["segments"] += 1
            if not has_segment:
                counts["segmentEpisodes"] += 1
                has_segment = True
        else:
            counts["fullEpisodes"] += 1
        yield member


def _write_snapshot(
    dataset, members, stages=None, progress=None, counts=None, group_count=None
):
    counts = counts if counts is not None else _whole_counts(0)
    if group_count is not None:
        counts["groups"] = group_count
    now = datetime.now(timezone.utc)
    doc = {
        "_id": ObjectId(),
        "_dataset_id": dataset._doc.id,
        "created_at": now,
        "expires_at": now + timedelta(days=7),
        "view": stages or [],
        "count": 0,
    }
    chunks = _collection("selection_snapshot_members")
    index = 0
    pending = []

    def flush():
        nonlocal index
        chunks.insert_one(
            {
                "snapshot_id": doc["_id"],
                "_dataset_id": dataset._doc.id,
                "index": index,
                "expires_at": doc["expires_at"],
                "members": pending.copy(),
                "count": len(pending),
            }
        )
        pending.clear()
        index += 1
        if progress:
            progress("capturing", doc["count"], None)

    try:
        for member in _counted_members(members, counts):
            doc["count"] += 1
            pending.append(member)
            if len(pending) == SNAPSHOT_CHUNK:
                flush()
        if pending:
            flush()
        # Retention starts after the scan; queued saves pin this for seven days.
        doc["expires_at"] = datetime.now(timezone.utc) + SNAPSHOT_TTL
        chunks.update_many(
            {"snapshot_id": doc["_id"]},
            {"$set": {"expires_at": doc["expires_at"]}},
        )
        doc["counts"] = counts
        if progress:
            progress("capturing", doc["count"], doc["count"])
        _collection("selection_snapshots").insert_one(doc)
        return {"snapshotId": str(doc["_id"]), "counts": counts}
    except Exception:
        chunks.delete_many({"snapshot_id": doc["_id"]})
        raise


def _combined_pipeline(documents, provenance=False):
    """Deduplicate frozen identities without materializing the union."""
    identity = {
        "$ifNull": [
            "$members.reference",
            {
                "episodeId": "$members.episodeId",
                "kind": "$members.kind",
                "range": {
                    "start": "$members.range.start",
                    "end": "$members.range.end",
                    "timebase": "$members.range.timebase",
                    "streams": "$members.range.streams",
                },
            },
        ]
    }
    pipeline = [
        {
            "$match": {
                "snapshot_id": {"$in": [doc["_id"] for doc in documents]}
            }
        },
        {"$unwind": "$members"},
        {
            "$group": {
                "_id": identity,
                "member": {
                    "$first": (
                        "$members"
                        if provenance
                        else {
                            "episodeId": "$members.episodeId",
                            "kind": "$members.kind",
                        }
                    )
                },
                **(
                    {"provenance": {"$addToSet": "$members.range.provenance"}}
                    if provenance
                    else {}
                ),
            }
        },
    ]
    return pipeline


def _combined_members(documents):
    """Stream a frozen union in parent order, preserving range evidence."""
    pipeline = _combined_pipeline(documents, provenance=True)
    pipeline.append({"$sort": {"member.episodeId": 1}})
    for row in _collection("selection_snapshot_members").aggregate(
        pipeline, allowDiskUse=True, batchSize=1000
    ):
        member = row["member"]
        if member["kind"] == "segment":
            member["range"]["provenance"] = list(
                chain.from_iterable(row["provenance"])
            )
            member = fosel.normalize_members([member])[0]
        yield member


def _all_slice_members(dataset, snapshot):
    """Expand captured group IDs once, streaming every concrete sibling."""
    if (
        dataset.media_type != "group"
        or fosub.split_subset_view(snapshot.get("view"))[0]
    ):
        raise ValueError(
            "All slices requires source samples in a grouped dataset"
        )
    if snapshot["counts"]["segments"]:
        raise ValueError(
            "All slices requires whole samples; segments keep their captured scope"
        )
    field = dataset.group_field + "._id"
    collection = dataset._sample_collection_name
    pipeline = [
        {"$match": {"snapshot_id": snapshot["_id"]}},
        {"$unwind": "$members"},
        {"$set": {"sample_id": {"$toObjectId": "$members.episodeId"}}},
        {
            "$lookup": {
                "from": collection,
                "localField": "sample_id",
                "foreignField": "_id",
                "as": "sample",
            }
        },
        {"$unwind": {"path": "$sample", "preserveNullAndEmptyArrays": True}},
        {"$group": {"_id": "$sample." + field}},
        {
            "$lookup": {
                "from": collection,
                "localField": "_id",
                "foreignField": field,
                "as": "sibling",
            }
        },
        {"$unwind": {"path": "$sibling", "preserveNullAndEmptyArrays": True}},
        {"$project": {"_id": 1, "sample_id": "$sibling._id"}},
        {"$sort": {"sample_id": 1}},
    ]
    for row in _collection("selection_snapshot_members").aggregate(
        pipeline, allowDiskUse=True, batchSize=1000
    ):
        if row.get("_id") is None or row.get("sample_id") is None:
            raise ValueError(
                "Remove unavailable samples before expanding their groups"
            )
        yield {"episodeId": str(row["sample_id"]), "kind": "episode"}


@contextmanager
def _capture_documents(dataset, request):
    documents = [
        snapshot_info(dataset, sid)
        for sid in set(request.get("snapshotIds") or [])
    ]
    stages = request.get("view") or []
    domain = fosub.subset_view_key(stages, dataset)
    if any(
        fosub.subset_view_key(doc["view"], dataset) != domain
        for doc in documents
    ):
        raise ValueError("Captures must belong to the same entity view")
    temporary = None
    try:
        if request.get("members"):
            captured = _write_snapshot(
                dataset, fosel.normalize_members(request["members"]), stages
            )
            temporary = ObjectId(captured["snapshotId"])
            documents.append(snapshot_info(dataset, captured["snapshotId"]))
        yield documents
    finally:
        if temporary is not None:
            _collection("selection_snapshot_members").delete_many(
                {"snapshot_id": temporary}
            )
            _collection("selection_snapshots").delete_one({"_id": temporary})


def _capture_counts(dataset, request):
    """Count a deduplicated union in Mongo without writing its membership."""
    with _capture_documents(dataset, request) as documents:
        if len(documents) == 1:
            counts = dict(documents[0]["counts"])
        else:
            pipeline = _combined_pipeline(documents)
            pipeline.extend(
                [
                    {
                        "$group": {
                            "_id": "$member.episodeId",
                            "full": {
                                "$sum": {
                                    "$cond": [
                                        {"$eq": ["$member.kind", "episode"]},
                                        1,
                                        0,
                                    ]
                                }
                            },
                            "segments": {
                                "$sum": {
                                    "$cond": [
                                        {"$eq": ["$member.kind", "segment"]},
                                        1,
                                        0,
                                    ]
                                }
                            },
                        }
                    },
                    {
                        "$group": {
                            "_id": None,
                            "episodes": {"$sum": 1},
                            "fullEpisodes": {"$sum": "$full"},
                            "segments": {"$sum": "$segments"},
                            "segmentEpisodes": {
                                "$sum": {
                                    "$cond": [{"$gt": ["$segments", 0]}, 1, 0]
                                }
                            },
                        }
                    },
                ]
            )
            result = next(
                _collection("selection_snapshot_members").aggregate(
                    pipeline, allowDiskUse=True
                ),
                {},
            )
            counts = {key: result.get(key, 0) for key in _whole_counts(0)}
        if request.get("groupCount") is not None:
            counts["groups"] = request["groupCount"]
        return counts


def _combine_snapshot(dataset, request, progress=None):
    stages = request.get("view") or []
    with _capture_documents(dataset, request) as documents:
        if (
            len(documents) == 1
            and not request.get("members")
            and request.get("groups") != "all"
        ):
            doc = documents[0]
            if not request.get("transient"):
                retain_snapshot(dataset, str(doc["_id"]))
            counts = dict(doc["counts"])
            if request.get("groupCount") is not None:
                counts["groups"] = request["groupCount"]
            return {"snapshotId": str(doc["_id"]), "counts": counts}
        temporary = None
        try:
            result = _write_snapshot(
                dataset,
                _combined_members(documents),
                stages,
                progress,
                group_count=request.get("groupCount"),
            )
            if request.get("groups") == "all":
                temporary = ObjectId(result["snapshotId"])
                snapshot = snapshot_info(dataset, result["snapshotId"])
                result = _write_snapshot(
                    dataset,
                    _all_slice_members(dataset, snapshot),
                    stages,
                    progress,
                )
            if not request.get("transient"):
                retain_snapshot(dataset, result["snapshotId"])
            return result
        finally:
            if temporary is not None:
                _collection("selection_snapshot_members").delete_many(
                    {"snapshot_id": temporary}
                )
                _collection("selection_snapshots").delete_one(
                    {"_id": temporary}
                )


def _expired(doc):
    expires = doc["expires_at"]
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return expires < datetime.now(timezone.utc)


def snapshot_info(dataset, snapshot_id):
    """Checks a snapshot's dataset, expiry, and complete chunk count."""
    if not ObjectId.is_valid(snapshot_id):
        raise ValueError("Unknown capture")
    doc = _collection("selection_snapshots").find_one(
        {"_id": ObjectId(snapshot_id), "_dataset_id": dataset._doc.id}
    )
    if doc is None or _expired(doc):
        raise ValueError("This capture has expired; open the action again")
    chunks = _collection("selection_snapshot_members")
    result = next(
        chunks.aggregate(
            [
                {"$match": {"snapshot_id": doc["_id"]}},
                {"$group": {"_id": None, "count": {"$sum": "$count"}}},
            ],
            hint={"snapshot_id": 1, "count": 1},
        ),
        {"count": 0},
    )
    if result["count"] != doc["count"]:
        raise ValueError("This capture is incomplete; open the action again")
    return doc


def retain_snapshot(dataset, snapshot_id):
    """Pins a capture for the complete queue and retry window before enqueueing."""
    doc = snapshot_info(dataset, snapshot_id)
    expires = datetime.now(timezone.utc) + timedelta(days=7)
    _collection("selection_snapshot_members").update_many(
        {"snapshot_id": doc["_id"]}, {"$max": {"expires_at": expires}}
    )
    _collection("selection_snapshots").update_one(
        {"_id": doc["_id"]}, {"$max": {"expires_at": expires}}
    )


def iter_snapshot(doc):
    """Streams a validated snapshot without assembling its members in memory."""
    for chunk in (
        _collection("selection_snapshot_members")
        .find({"snapshot_id": doc["_id"]})
        .batch_size(1)
        .sort("index", 1)
    ):
        yield from chunk["members"]


def load_snapshot(dataset, snapshot_id):
    """Returns frozen members and metadata for consumers needing a list."""
    doc = snapshot_info(dataset, snapshot_id)
    members = list(iter_snapshot(doc))
    if len(members) != doc["count"]:
        raise ValueError("This capture is incomplete; open the action again")
    return members, doc


def prepare_subset_add(dataset, data, progress=None, preview=True):
    """Validates source identity and streams server captures into an add."""
    snapshot = (
        snapshot_info(dataset, data["snapshotId"])
        if data.get("snapshotId")
        else None
    )
    stages = snapshot.get("view") if snapshot else data.get("view")
    fosub.subset_base_view(dataset, data["subsetId"], stages or [])
    return fosub.prepare_add(
        dataset,
        data["subsetId"],
        data["operationId"],
        iter_snapshot(snapshot) if snapshot else data["members"],
        snapshot=snapshot,
        progress=progress,
        preview=preview,
    )


def remove_captured_members(dataset, subset_id, data):
    """Remove a frozen capture in bounded batches, preserving retry semantics."""
    fosc.check_access(dataset, "edit")
    if not data.get("snapshotId"):
        return fosub.remove_members(dataset, subset_id, data["members"], False)
    snapshot = snapshot_info(dataset, data["snapshotId"])
    removed = 0
    for batch in fou.iter_batches(iter_snapshot(snapshot), SNAPSHOT_CHUNK):
        removed += fosub.remove_members(dataset, subset_id, batch, False)[
            "removed"
        ]
    return {"subsetId": subset_id, "removed": removed, "counts": None}


def tag_captured_members(dataset, data):
    """Validate a complete capture, then tag in bounded, idempotent batches."""
    if not data.get("snapshotId"):
        return tag_selection(
            dataset,
            data["members"],
            data.get("change"),
            data.get("target", "members"),
            data.get("view"),
        )
    snapshot = snapshot_info(dataset, data["snapshotId"])
    stages = snapshot.get("view") or None
    target = data.get("target", "members")
    change = data.get("change")
    first = None
    labels_per_batch = []
    result = {
        "counts": snapshot["counts"],
        "tags": [],
        "applied": {},
        "targets": 0,
        "labels": 0 if target == "labels" else None,
    }

    def include(batch_result):
        result["targets"] += batch_result["targets"]
        if target == "labels":
            result["labels"] += batch_result["labels"] or 0
        for tag, count in batch_result["applied"].items():
            result["applied"][tag] = result["applied"].get(tag, 0) + count

    for batch in fou.iter_batches(iter_snapshot(snapshot), SNAPSHOT_CHUNK):
        first = first or batch
        inspected = tag_selection(
            dataset, batch, target=target, stages=stages, _include_values=False
        )
        if inspected.get("disabledReason"):
            if change is not None:
                raise ValueError(inspected["disabledReason"])
            return {**inspected, "counts": snapshot["counts"]}
        labels_per_batch.append(inspected["labels"])
        if change is None:
            include(inspected)
    if first is None:
        raise ValueError("Choose samples or segments to tag")
    if change is not None:
        if target == "labels" and not any(labels_per_batch):
            raise ValueError("No labels in these items")
        for index, batch in enumerate(
            fou.iter_batches(iter_snapshot(snapshot), SNAPSHOT_CHUNK)
        ):
            if target == "labels" and not labels_per_batch[index]:
                continue
            include(
                tag_selection(
                    dataset,
                    batch,
                    change,
                    target,
                    stages,
                    _include_values=False,
                )
            )
    # Available tag values are dataset-wide. Fetch once after all changes,
    # rather than repeating that dataset scan for every capture chunk.
    if target == "members":
        counts = snapshot["counts"]
        result["tags"] = sorted(
            _member_tag_values(
                dataset, bool(counts["fullEpisodes"]), bool(counts["segments"])
            )
        )
    else:
        result["tags"] = tag_selection(
            dataset, first, target=target, stages=stages
        )["tags"]
    return result


def _collection(name):
    db = foo.get_db_conn()
    _ensure_snapshot_indexes(db.client, db.name, name)
    return db[name]


@lru_cache(maxsize=16)
def _ensure_snapshot_indexes(client, database, name):
    collection = client[database][name]
    collection.create_index("_dataset_id")
    collection.create_index("expires_at", expireAfterSeconds=0)
    if name == "selection_snapshot_members":
        collection.create_index([("snapshot_id", 1), ("index", 1)])
        collection.create_index([("snapshot_id", 1), ("count", 1)])
        collection.create_index([("members.episodeId", 1), ("snapshot_id", 1)])


def view_dataset(dataset, stages=None):
    """Returns the collection that owns the ids shown by the given stages.

    A converted view (patches, frames, clips) generates its own dataset, so
    ids captured there resolve against it rather than the source dataset.
    """
    if not stages:
        return dataset
    return fosv.get_view(dataset, stages=stages)._dataset


def selection_availability(dataset, episode_ids, stages=None):
    """Resolves live display metadata without changing captured membership."""
    target = view_dataset(dataset, stages)
    result = {episode_id: {"unavailable": True} for episode_id in episode_ids}
    present = sample_details_map(
        target, episode_ids, clips=target is not dataset and _is_clips(target)
    )
    for sample_id, details in present.items():
        result[sample_id] = {"unavailable": False, **details}
    return result


def _is_clips(generated_dataset):
    return generated_dataset.media_type == "video" and bool(
        generated_dataset.get_field("support")
    )


_ASPECT_FIELDS = (
    "metadata.width",
    "metadata.height",
    "metadata.frame_width",
    "metadata.frame_height",
)


def _aspect_ratio(width, height, frame_width, frame_height):
    """Width over height from image or video metadata, when both are known."""
    for w, h in ((width, height), (frame_width, frame_height)):
        if w and h:
            return w / h
    return None


def _details_rows(view, extra_paths):
    """Yields one dict of requested values plus the aspect ratio per sample.

    Everything comes from a single projection so rows stay aligned, and only
    metadata paths the schema declares are requested.
    """
    schema = view.get_field_schema(flat=True)
    aspect_paths = [path for path in _ASPECT_FIELDS if path in schema]
    paths = ["id", "filepath", *extra_paths, *aspect_paths]
    for row in zip(*view.values(paths)):
        values = dict(zip(paths, row))
        yield values, _aspect_ratio(*[values.get(p) for p in _ASPECT_FIELDS])


def sample_details_map(dataset, sample_ids, clips=False):
    """Resolves display metadata for many parents with a single projection.

    Plain media only needs each sample's filepath and, when metadata knows
    it, the media aspect ratio so previews can show the whole frame; avoid
    loading full documents. Media-reference datasets resolve their preview
    asset per sample. Clips also carry their first frame so previews start
    inside the clip. Patches carry their normalized crop bounds.
    """
    view = fosel.select_parents(dataset, sample_ids)
    if dataset._contains_media_references():
        return {sample.id: sample_details(sample, dataset) for sample in view}
    extras = ["support", "metadata.frame_rate"] if clips else []
    patch_paths = _patch_geometry_paths(dataset)
    extras.extend(patch_paths)
    group_path = (
        dataset.group_field + ".id"
        if dataset.media_type == "group" and dataset.group_field
        else None
    )
    if group_path:
        extras.append(group_path)
    result = {}
    for values, aspect in _details_rows(view, extras):
        details = {"filepath": values["filepath"]}
        if aspect:
            details["aspectRatio"] = aspect
        if patch_paths:
            crop = _patch_crop(values, patch_paths)
            if crop:
                details["crop"] = crop
        if clips:
            support, rate = values["support"], values["metadata.frame_rate"]
            if support and rate:
                details["previewStart"] = max(support[0] - 1, 0) / rate
        if group_path:
            details["groupId"] = values[group_path]
        result[values["id"]] = details
    return result


def _patch_geometry_paths(dataset):
    """Projects patch geometry without loading masks or full label documents."""
    if not dataset._is_patches:
        return {}
    paths = {}
    for path, field in dataset.get_field_schema(flat=True).items():
        while isinstance(field, fof.ListField):
            field = field.field
        if isinstance(field, fof.EmbeddedDocumentField):
            if issubclass(field.document_type, fol.Detection):
                paths[path + ".bounding_box"] = True
            elif issubclass(field.document_type, fol.Polyline):
                paths[path + ".points"] = False
    return paths


def _patch_crop(values, paths):
    """Bounds all labels in a patch, including matched evaluation labels."""
    points = []

    def collect(value, boxes):
        if not isinstance(value, (list, tuple)) or not value:
            return
        if all(isinstance(v, (int, float)) for v in value):
            if not all(math.isfinite(v) for v in value):
                return
            if boxes and len(value) == 4:
                x, y, w, h = value
                if w > 0 and h > 0:
                    points.extend(((x, y), (x + w, y + h)))
            elif not boxes and len(value) == 2:
                points.append(value)
            return
        for item in value:
            collect(item, boxes)

    for path, boxes in paths.items():
        collect(values.get(path), boxes)
    if not points:
        return None
    xs, ys = zip(*points)
    left, top = max(0, min(xs)), max(0, min(ys))
    right, bottom = min(1, max(xs)), min(1, max(ys))
    if right <= left or bottom <= top:
        return None
    return [left, top, right - left, bottom - top]


def sample_details(sample, dataset):
    """Resolves live thumbnail media without storing media content in captures."""
    if not dataset._contains_media_references():
        return {"filepath": sample.filepath}
    from fiftyone.multimodal.media_reference.field_model import (
        _resolve_media_references,
        MediaAssetRole,
    )

    reference = sample.media_reference.to_dict()
    resolved = _resolve_media_references(
        dataset, {reference["key"]: reference}
    )
    for asset in resolved[reference["key"]].assets:
        if asset.description.role == MediaAssetRole.VIDEO_STREAM:
            details = {
                "filepath": asset.path,
                "previewStart": asset.description.selector.from_timestamp,
            }
            metadata = sample.metadata
            aspect = _aspect_ratio(
                *[
                    getattr(metadata, name, None)
                    for name in (
                        "width",
                        "height",
                        "frame_width",
                        "frame_height",
                    )
                ]
            )
            if aspect:
                details["aspectRatio"] = aspect
            return details
    return {}


def candidate_members(view, provider=None, streams_cache=None):
    """Returns full episodes or normalized provider ranges in the given view."""
    if provider is None:
        return [
            {"episodeId": sample_id, "kind": "episode"}
            for sample_id in view.values("id")
        ]
    kind = provider.get("kind")
    if kind == "intersection":
        providers = provider["providers"]
        if not providers:
            raise ValueError("An intersection requires range providers")
        members = candidate_members(view, providers[0], streams_cache)
        for constraint in providers[1:]:
            members = fosel.intersect_members(
                members, candidate_members(view, constraint, streams_cache)
            )
        return members
    if kind == "events":
        return _event_members(view, provider)
    if kind == "temporal-tags":
        return _tag_members(view, provider, streams_cache)
    if kind == "ranges":
        if any(m.get("kind") != "segment" for m in provider["members"]):
            raise ValueError("A range provider must return segments")
        allowed_ids = set(view.values("id"))
        return fosel.normalize_members(
            m for m in provider["members"] if m["episodeId"] in allowed_ids
        )
    if kind == "snapshot":
        snapshot = _range_snapshot(view._dataset, provider)
        ids = set(view.values("id"))
        chunks = _collection("selection_snapshot_members").find(
            {
                "snapshot_id": snapshot["_id"],
                "members.episodeId": {"$in": list(ids)},
            }
        )
        return fosel.normalize_members(
            member
            for chunk in chunks
            for member in chunk["members"]
            if member["episodeId"] in ids
        )
    raise ValueError("Unknown segment provider: %r" % kind)


def constrain_view(view, boundary):
    """Constrains grid pagination to complete provider results."""
    if boundary.get("subsetId") and not boundary.get("provider"):
        # The indexed subset join has already been applied before view stages.
        return view
    if not boundary.get("provider") or view._is_dynamic_groups:
        return view
    return view.mongo(
        _provider_filter_pipeline(view, boundary),
        _needs_frames=False,
        _group_slices=[],
    )


def _provider_filter_pipeline(view, boundary, keep_ranges=False, depth=0):
    """Filters parent documents by ranges in Mongo, without an all-ID array."""
    provider = boundary["provider"]
    kind = provider.get("kind")
    stages = []
    if kind == "intersection":
        providers = provider["providers"]
        if not providers:
            raise ValueError("An intersection requires range providers")
        accumulated = "_fo_intersection_%d" % depth
        for index, constraint in enumerate(providers):
            stages.extend(
                _provider_filter_pipeline(
                    view,
                    {"provider": constraint},
                    keep_ranges=True,
                    depth=depth + 1,
                )
            )
            expression = "$_fo_provider_ranges"
            if index:
                expression = _intersect_ranges_expression(
                    "$" + accumulated, expression
                )
            stages.append({"$set": {accumulated: expression}})
        stages.extend(
            [
                {"$set": {"_fo_provider_ranges": "$" + accumulated}},
                {"$unset": accumulated},
            ]
        )
        ranges = "$_fo_provider_ranges"
    elif kind == "events":
        field = _event_field(view, provider)
        ranges = {"$ifNull": ["$" + field + ".detections", []]}
        if provider.get("values"):
            ranges = {
                "$filter": {
                    "input": ranges,
                    "as": "event",
                    "cond": {
                        "$in": [
                            "$$event.label",
                            {"$literal": provider["values"]},
                        ]
                    },
                }
            }
        ranges = {
            "$map": {
                "input": ranges,
                "as": "event",
                "in": {
                    "start": {
                        "$subtract": [
                            {"$arrayElemAt": ["$$event.support", 0]},
                            1,
                        ]
                    },
                    "end": {"$arrayElemAt": ["$$event.support", 1]},
                    "timebase": "sequence",
                    "streams": ["filepath"],
                },
            }
        }
    elif kind == "temporal-tags":
        query = {"_dataset_id": view._dataset._doc.id, "kind": "temporal"}
        if provider.get("values"):
            query["tag"] = {"$in": provider["values"]}
        stages.append(
            {
                "$lookup": {
                    "from": fot.TAGS_COLLECTION_NAME,
                    "let": {"parent": "$_id"},
                    "pipeline": [
                        {
                            "$match": {
                                **query,
                                "$expr": {"$eq": ["$_sample_id", "$$parent"]},
                            }
                        }
                    ],
                    "as": "_fo_provider_tags",
                }
            }
        )
        streams = _provider_streams_expression(view._dataset)
        ranges = {
            "$map": {
                "input": "$_fo_provider_tags",
                "as": "tag",
                "in": {
                    "start": "$$tag.start",
                    "end": "$$tag.end",
                    "timebase": {
                        "$switch": {
                            "branches": [
                                {
                                    "case": {
                                        "$eq": ["$$tag.index_type", code]
                                    },
                                    "then": name,
                                }
                                for code, name in (
                                    (1, "sequence"),
                                    (2, "duration-ns"),
                                    (3, "timestamp-ns"),
                                )
                            ],
                            "default": None,
                        }
                    },
                    "streams": {
                        "$cond": [
                            {
                                "$ne": [
                                    {"$ifNull": ["$$tag.anchor", None]},
                                    None,
                                ]
                            },
                            ["$$tag.anchor"],
                            streams,
                        ]
                    },
                },
            }
        }
    elif kind == "snapshot":
        snapshot = _range_snapshot(view._dataset, provider)
        stages.extend(
            [
                {"$set": {"_fo_provider_parent": {"$toString": "$_id"}}},
                {
                    "$lookup": {
                        "from": _collection("selection_snapshot_members").name,
                        "localField": "_fo_provider_parent",
                        "foreignField": "members.episodeId",
                        "let": {"parent": "$_fo_provider_parent"},
                        "pipeline": [
                            {
                                "$match": {
                                    "snapshot_id": snapshot["_id"],
                                    "_dataset_id": view._dataset._doc.id,
                                }
                            },
                            {
                                "$project": {
                                    "members": {
                                        "$filter": {
                                            "input": "$members",
                                            "as": "member",
                                            "cond": {
                                                "$eq": [
                                                    "$$member.episodeId",
                                                    "$$parent",
                                                ]
                                            },
                                        }
                                    }
                                }
                            },
                        ],
                        "as": "_fo_provider_chunks",
                    }
                },
            ]
        )
        ranges = {
            "$reduce": {
                "input": "$_fo_provider_chunks",
                "initialValue": [],
                "in": {"$concatArrays": ["$$value", "$$this.members.range"]},
            }
        }
    elif kind == "ranges":
        members = fosel.normalize_members(provider["members"])
        if any(m["kind"] != "segment" for m in members):
            raise ValueError("A range provider must return segments")
        ranges = {
            "$map": {
                "input": {
                    "$filter": {
                        "input": {"$literal": members},
                        "as": "member",
                        "cond": {
                            "$eq": [
                                "$$member.episodeId",
                                {"$toString": "$_id"},
                            ]
                        },
                    }
                },
                "as": "member",
                "in": "$$member.range",
            }
        }
    else:
        raise ValueError("Unknown segment provider: %r" % kind)
    stages.append({"$set": {"_fo_provider_ranges": ranges}})
    if boundary.get("subsetId"):
        query = fosub.member_query(
            view._dataset, boundary["subsetId"], boundary.get("subsetScope")
        )
        intersects = {
            "$or": [
                {"$eq": ["$member.kind", "episode"]},
                {
                    "$and": [
                        {
                            "$eq": [
                                "$member.range.timebase",
                                "$$range.timebase",
                            ]
                        },
                        {
                            "$lt": [
                                {"$toDecimal": "$member.range.start"},
                                {"$toDecimal": "$$range.end"},
                            ]
                        },
                        {
                            "$lt": [
                                {"$toDecimal": "$$range.start"},
                                {"$toDecimal": "$member.range.end"},
                            ]
                        },
                        {
                            "$gt": [
                                {
                                    "$size": {
                                        "$setIntersection": [
                                            {
                                                "$ifNull": [
                                                    "$member.range.streams",
                                                    [],
                                                ]
                                            },
                                            "$$range.streams",
                                        ]
                                    }
                                },
                                0,
                            ]
                        },
                    ]
                },
            ]
        }
        lookup = fosub._member_lookup(view, query)
        lookup["$lookup"]["let"]["ranges"] = "$_fo_provider_ranges"
        lookup["$lookup"]["pipeline"].extend(
            [
                {
                    "$match": {
                        "$expr": {
                            "$anyElementTrue": {
                                "$map": {
                                    "input": "$$ranges",
                                    "as": "range",
                                    "in": intersects,
                                }
                            }
                        }
                    }
                },
                {"$limit": 1},
                {"$project": {"_id": 1}},
            ]
        )
        stages.append(lookup)
        matches = {"$gt": [{"$size": "$_fo_subset_members"}, 0]}
    else:
        matches = {"$gt": [{"$size": "$_fo_provider_ranges"}, 0]}
    stages.append({"$match": {"$expr": matches}})
    if keep_ranges:
        return stages
    stages.extend(
        [
            {
                "$unset": [
                    "_fo_provider_ranges",
                    "_fo_provider_tags",
                    "_fo_subset_members",
                    "_fo_provider_parent",
                    "_fo_provider_chunks",
                ]
            },
        ]
    )
    return stages


def _range_snapshot(dataset, provider):
    snapshot = snapshot_info(dataset, provider["snapshotId"])
    if snapshot["counts"]["fullEpisodes"]:
        raise ValueError("A range provider must return segments")
    return snapshot


def _intersect_ranges_expression(left, right):
    """Intersects per-parent native ranges without materializing the view."""
    clipped = {
        "start": {
            "$max": [
                {"$toDecimal": "$$left.start"},
                {"$toDecimal": "$$right.start"},
            ]
        },
        "end": {
            "$min": [
                {"$toDecimal": "$$left.end"},
                {"$toDecimal": "$$right.end"},
            ]
        },
        "timebase": "$$left.timebase",
        "streams": {"$setIntersection": ["$$left.streams", "$$right.streams"]},
    }
    return {
        "$reduce": {
            "input": left,
            "initialValue": [],
            "in": {
                "$concatArrays": [
                    "$$value",
                    {
                        "$let": {
                            "vars": {"left": "$$this"},
                            "in": {
                                "$filter": {
                                    "input": {
                                        "$map": {
                                            "input": {
                                                "$filter": {
                                                    "input": right,
                                                    "as": "right",
                                                    "cond": {
                                                        "$eq": [
                                                            "$$left.timebase",
                                                            "$$right.timebase",
                                                        ]
                                                    },
                                                }
                                            },
                                            "as": "right",
                                            "in": clipped,
                                        }
                                    },
                                    "as": "range",
                                    "cond": {
                                        "$and": [
                                            {
                                                "$lt": [
                                                    "$$range.start",
                                                    "$$range.end",
                                                ]
                                            },
                                            {
                                                "$gt": [
                                                    {
                                                        "$size": "$$range.streams"
                                                    },
                                                    0,
                                                ]
                                            },
                                        ]
                                    },
                                }
                            },
                        }
                    },
                ]
            },
        }
    }


def _provider_streams_expression(dataset):
    if dataset.media_type == "video":
        return ["filepath"]
    from fiftyone.multimodal.media_reference.field_model import (
        addressable_media_sources,
    )

    sources = addressable_media_sources(dataset)
    branches = []
    for source in dataset.media_sources:
        if source.get("kind") != "lerobot-episode":
            continue
        info = fost.read_json(
            fost.join(sources[source["id"]], "meta/info.json")
        )
        streams = [
            "lerobot:" + name
            for name in info["features"]
            if name
            not in {
                "timestamp",
                "frame_index",
                "episode_index",
                "index",
                "task_index",
            }
        ]
        branches.append(
            {
                "case": {
                    "$eq": [
                        {
                            "$arrayElemAt": [
                                {"$split": ["$media_reference.key", "/"]},
                                0,
                            ]
                        },
                        source["id"],
                    ]
                },
                "then": {"$literal": streams},
            }
        )
    return (
        {"$switch": {"branches": branches, "default": []}} if branches else []
    )


def _provider_member_batches(view, boundary):
    """Resolves providers and saved-range intersections one parent batch at a time."""
    ids = (
        str(doc["_id"])
        for doc in view._aggregate(
            pipeline=[{"$project": {"_id": 1}}]
        ).batch_size(1000)
    )
    while batch_ids := list(islice(ids, 1000)):
        streams_cache = {}
        batch_view = view.select(batch_ids)
        candidates = candidate_members(
            batch_view, boundary.get("provider"), streams_cache
        )
        if boundary.get("subsetId"):
            allowed = fosub.iter_view_members(
                batch_view, boundary["subsetId"], boundary.get("subsetScope")
            )
            candidates = fosel.intersect_members(candidates, allowed)
        yield sorted(candidates, key=lambda m: m["episodeId"])


def validate_subset_stages(stages, extended_stages):
    """Fails closed for pipelines not yet supported inside a saved subset."""
    supported = {
        "Match",
        "MatchTags",
        "Exists",
        "Select",
        "Exclude",
        "SortBy",
        "Limit",
        "Skip",
        "FilterLabels",
        "FilterField",
        "SelectFields",
        "ExcludeFields",
        "SelectLabels",
        "ExcludeLabels",
        "MatchLabels",
        "GroupBy",
        "Flatten",
        "SelectGroupSlices",
        "ExcludeGroupSlices",
    }
    classes = [stage["_cls"] for stage in stages or []] + list(
        extended_stages or {}
    )
    for cls in classes:
        if cls not in {"fiftyone.core.stages." + name for name in supported}:
            raise ValueError(
                "Stage %s is not supported within a saved subset; remove it or return to the dataset"
                % cls.rsplit(".", 1)[-1]
            )


def provider_options(dataset):
    """Lists built-in range sources without activating a range constraint."""
    fields = dataset.get_field_schema(
        ftype=fof.EmbeddedDocumentField,
        embedded_doc_type=fol.TemporalDetections,
    )
    return {
        "eventFields": list(fields) if dataset.media_type == "video" else [],
        "temporalTags": sorted(fot.count_temporal_tags(dataset)),
    }


def _event_field(view, provider):
    if view.media_type != "video":
        raise ValueError("Frame event ranges require a video source")
    field = provider["field"]
    schema = view.get_field_schema()
    if (
        field not in schema
        or not isinstance(schema[field], fof.EmbeddedDocumentField)
        or schema[field].document_type is not fol.TemporalDetections
    ):
        raise ValueError("Events require a TemporalDetections field")
    return field


def _event_members(view, provider):
    field = _event_field(view, provider)
    values = set(provider.get("values", []))
    result = []
    for sample in view.select_fields(field):
        labels = sample[field]
        for event in labels.detections if labels else []:
            if values and event.label not in values:
                continue
            start, end = event.support
            result.append(
                {
                    "episodeId": sample.id,
                    "kind": "segment",
                    "range": {
                        "start": str(start - 1),
                        "end": str(end),
                        "timebase": "sequence",
                        "streams": ["filepath"],
                        "provenance": [
                            {
                                "provider": "events",
                                "source": field,
                                "label": event.label,
                                "itemId": event.id,
                                "nativeStart": str(start),
                                "nativeEnd": str(end),
                            }
                        ],
                    },
                }
            )
    return fosel.normalize_members(result)


def _tag_members(view, provider, streams_cache=None):
    values = provider.get("values") or None
    tags = fot.list_temporal_tags(
        view, filter=fot.TemporalTagFilter(tags=values)
    )
    references = view._dataset._contains_media_references()
    samples = (
        {
            sample.id: sample
            for sample in view.select_fields(
                "media_reference" if references else []
            )
        }
        if references or view._dataset.media_type == "group"
        else {}
    )
    result = []
    streams_cache = streams_cache if streams_cache is not None else {}
    for tag in tags:
        sample_id = str(tag.sample_id)
        if references and sample_id not in samples:
            continue
        timebase = {1: "sequence", 2: "duration-ns", 3: "timestamp-ns"}.get(
            tag.index_type
        )
        if timebase is None:
            raise ValueError("Unsupported temporal tag timebase")
        streams = (
            [tag.anchor]
            if tag.anchor
            else _sample_streams(
                samples.get(sample_id), view._dataset, streams_cache
            )
        )
        result.append(
            {
                "episodeId": sample_id,
                "kind": "segment",
                "range": {
                    "start": str(tag.start),
                    "end": str(tag.end),
                    "timebase": timebase,
                    "streams": streams,
                    "provenance": [
                        {
                            "provider": "temporal-tags",
                            "source": tag.tag,
                            "label": tag.tag,
                            "itemId": str(tag.id),
                            "nativeStart": str(tag.start),
                            "nativeEnd": str(tag.end),
                        }
                    ],
                },
            }
        )
    return fosel.normalize_members(result)


def _sample_streams(sample, dataset, cache=None):
    if dataset.media_type == "video" or (
        sample is not None and sample.media_type == "video"
    ):
        return ["filepath"]
    from fiftyone.multimodal.media_reference.field_model import (
        addressable_media_sources,
    )

    reference = getattr(sample, "media_reference", None)
    if reference:
        source_id = reference.key.split("/", 1)[0]
        for source in dataset.media_sources:
            if (
                source["id"] == source_id
                and source.get("kind") == "lerobot-episode"
            ):
                root = addressable_media_sources(dataset)[source_id]
                if cache is not None and source_id in cache:
                    return cache[source_id]
                info = fost.read_json(fost.join(root, "meta/info.json"))
                streams = [
                    "lerobot:" + name
                    for name in info["features"]
                    if name
                    not in {
                        "timestamp",
                        "frame_index",
                        "episode_index",
                        "index",
                        "task_index",
                    }
                ]
                if cache is not None:
                    cache[source_id] = streams
                return streams
    raise ValueError(
        "This source cannot resolve all streams; use stream-anchored tags "
        "or a range provider with explicit stream IDs"
    )


_TAG_INDEX_TYPES = {"sequence": 1, "duration-ns": 2, "timestamp-ns": 3}


def tag_selection(
    dataset,
    members,
    change=None,
    target="members",
    stages=None,
    _include_values=True,
):
    """Inspects or tags frozen episode and segment membership.

    Whole episodes use sample tags. Segments use temporal tags on each
    captured stream. Removal matches exact bounds; overlapping intervals and
    unselected streams are preserved. Every parent and range is validated
    before writing, and applying the same change again is idempotent.

    Args:
        dataset: the source dataset
        members: captured episode/segment dictionaries
        change (None): optional ``{"tag": str, "add": bool}`` mutation
        target ("members"): ``members`` or ``labels`` in whole episodes
        stages (None): the serialized view stages the members were captured
            in; generated entities support only durable source label tags

    Returns:
        scope counts and the existing tag values on the captured targets
    """
    if change is not None:
        fosc.check_access(dataset, "tag")
    if target not in ("members", "labels"):
        raise ValueError("Choose members or labels to tag")
    members = fosel.normalize_members(members)
    if target == "labels" and any(m["kind"] == "segment" for m in members):
        raise ValueError("Label tagging requires whole episodes")
    if not members:
        raise ValueError("Choose samples or segments to tag")
    sample_ids = {member["episodeId"] for member in members}
    prefix, _ = fosub.split_subset_view(stages)
    scope = fosv.get_view(dataset, stages=prefix) if prefix else dataset
    if scope._dataset is not dataset:
        if any(m["kind"] == "segment" for m in members):
            raise ValueError("Segments are tagged in the samples view")
        return _tag_converted(scope, members, change, target, _include_values)
    view = fosel.select_parents(dataset, sample_ids)
    if set(view.values("id")) != sample_ids:
        raise ValueError("Remove unavailable episodes before tagging")

    full = []
    targets = {}
    for member in members:
        sample_id = member["episodeId"]
        if member["kind"] == "episode":
            full.append(sample_id)
            continue
        bounds = member["range"]
        index_type = _TAG_INDEX_TYPES.get(bounds["timebase"])
        if index_type is None:
            raise ValueError("This segment timebase does not support tags")
        start, end = int(bounds["start"]), int(bounds["end"])
        if not -(2**63) <= start < end < 2**63:
            raise ValueError("Tag bounds must fit signed 64-bit integers")
        targets.setdefault((sample_id, index_type, start, end), set()).update(
            bounds["streams"]
        )

    existing = []
    streams_cache = {}
    if targets:
        for tag in fot.list_temporal_tags(view):
            streams = targets.get(
                (str(tag.sample_id), tag.index_type, tag.start, tag.end)
            )
            if streams is None:
                continue
            anchors = (
                {tag.anchor}
                if tag.anchor
                else set(
                    _sample_streams(
                        dataset[str(tag.sample_id)], dataset, streams_cache
                    )
                )
            )
            if anchors <= streams:
                existing.append(tag)

    full_view = fosel.select_parents(dataset, full)
    label_count = None
    if target == "labels":
        counts, _ = fostag.build_label_tag_aggregations(full_view)
        label_count = sum(full_view.aggregate(counts)) if counts else 0
    if change is not None:
        tag_value = change.get("tag")
        add = change.get("add")
        if (
            not isinstance(tag_value, str)
            or not tag_value.strip()
            or not isinstance(add, bool)
        ):
            raise ValueError("Provide a nonempty tag and an add boolean")
        tag_value = tag_value.strip()
        if target == "labels":
            if not label_count:
                raise ValueError("No labels in these episodes")
            if add:
                full_view.tag_labels(tag_value)
            else:
                full_view.untag_labels(tag_value)
        if targets:
            if add:
                fot.add_temporal_tags(
                    view,
                    [
                        fot.TemporalTag(
                            sample_id=sample_id,
                            index_type=index_type,
                            start=start,
                            end=end,
                            anchor=stream,
                            tag=tag_value,
                        )
                        for (
                            sample_id,
                            index_type,
                            start,
                            end,
                        ), streams in targets.items()
                        for stream in streams
                    ],
                )
            else:
                ids = [tag.id for tag in existing if tag.tag == tag_value]
                if ids:
                    fot.delete_temporal_tags(view, ids=ids)
        if full and target == "members":
            if add:
                full_view.tag_samples(tag_value)
            else:
                full_view.untag_samples(tag_value)

    return {
        "counts": fosel.count_members(members),
        "tags": (
            sorted(_tag_values(dataset, full_view, full, targets, target))
            if _include_values
            else []
        ),
        "labels": label_count,
        "applied": _applied_tags(
            dataset, view, full_view, full, targets, target
        ),
        "targets": (
            label_count
            if target == "labels"
            else len(full) + sum(len(streams) for streams in targets.values())
        ),
    }


def _applied_tags(dataset, view, full_view, full, targets, target):
    """Counts, per tag, how many scope targets carry it right now.

    A picker compares these with the target total to show a tag as on every
    target, on some, or on none, and to decide whether a press adds or
    removes. Sample tags count samples, label tags count labels, and temporal
    tags count the captured streams whose exact range carries them.
    """
    if target == "labels":
        _, tag_aggs = fostag.build_label_tag_aggregations(full_view)
        applied = {}
        for histogram in full_view.aggregate(tag_aggs) if tag_aggs else []:
            for value, count in histogram.items():
                if value is not None:
                    applied[value] = applied.get(value, 0) + count
        return applied
    applied = dict(full_view.count_values("tags")) if full else {}
    streams_cache = {}
    if targets:
        for tag in fot.list_temporal_tags(view):
            streams = targets.get(
                (str(tag.sample_id), tag.index_type, tag.start, tag.end)
            )
            if streams is None:
                continue
            anchors = (
                {tag.anchor}
                if tag.anchor
                else set(
                    _sample_streams(
                        dataset[str(tag.sample_id)], dataset, streams_cache
                    )
                )
            )
            if anchors <= streams:
                applied[tag.tag] = applied.get(tag.tag, 0) + len(anchors)
    return applied


def _tag_converted(scope, members, change, target, include_values=True):
    """Tags only labels that the converted view writes back to its source."""
    sample_ids = {m["episodeId"] for m in members}
    if target != "labels":
        raise ValueError("Generated views support source label tags only")
    if scope._is_clips and not scope._classification_field:
        reason = (
            "These clips have no single source label to tag. "
            "Save them to a subset, or tag labels in the source view."
        )
        if change is not None:
            raise ValueError(reason)
        return {
            "counts": _whole_counts(len(sample_ids)),
            "tags": [],
            "labels": 0,
            "applied": {},
            "targets": 0,
            "disabledReason": reason,
        }
    if fosr.reference_fields(scope) is not None:
        if fosub._missing_references(scope, members):
            raise ValueError("Remove unavailable items before tagging")
        source = scope._root_dataset
        references = [m["reference"] for m in members]
        full_view = source.select({r["sampleId"] for r in references})
        if scope._is_frames:
            frame_ids = [
                d["_id"]
                for batch in fou.iter_batches(references, 1000)
                for d in source._frame_collection.find(
                    {"$or": [fosr.row_query(scope, r) for r in batch]},
                    {"_id": 1},
                )
            ]
            fields = [
                f
                for f in source._get_label_fields()
                if f.startswith("frames.")
            ]
            full_view = full_view.select_frames(frame_ids).select_fields(
                fields
            )
        else:
            field = scope._classification_field
            full_view = full_view.select_labels(
                ids=[r["labelId"] for r in references],
                fields=field,
            ).select_fields(field)
    else:
        full_view = scope.select(sample_ids)
        if set(full_view.values("id")) != sample_ids:
            raise ValueError("Remove unavailable items before tagging")
    counts, _ = fostag.build_label_tag_aggregations(full_view)
    label_count = sum(full_view.aggregate(counts)) if counts else 0
    if change is not None:
        tag_value = change.get("tag")
        add = change.get("add")
        if (
            not isinstance(tag_value, str)
            or not tag_value.strip()
            or not isinstance(add, bool)
        ):
            raise ValueError("Provide a nonempty tag and an add boolean")
        if not label_count:
            raise ValueError("No labels in these items")
        if add:
            full_view.tag_labels(tag_value.strip())
        else:
            full_view.untag_labels(tag_value.strip())
    dataset = full_view._dataset
    return {
        "counts": fosel.count_members(members),
        "tags": (
            sorted(_tag_values(dataset, full_view, [], {}, target))
            if include_values
            else []
        ),
        "labels": label_count,
        "applied": _applied_tags(
            dataset, full_view, full_view, [], {}, target
        ),
        "targets": label_count,
    }


def _tag_values(dataset, full_view, full, targets, target):
    """Lists tag values relevant to the scope, after any change was applied."""
    if target == "labels":
        _, tag_aggs = fostag.build_label_tag_aggregations(full_view)
        histograms = dataset.aggregate(tag_aggs) if tag_aggs else []
        values = {
            value
            for histogram in histograms
            for value in histogram
            if value is not None
        }
    else:
        values = _member_tag_values(dataset, bool(full), bool(targets))
    return values


def _member_tag_values(dataset, whole, segments):
    values = set(dataset.distinct("tags")) if whole else set()
    if segments:
        values.update(fot.count_temporal_tags(dataset))
    return values
