"""
Saved episode and segment subsets.

Membership is frozen, while samples and annotations remain live. Removing a
sample retains its saved references. Subsets are scoped to their owning dataset;
clones and snapshots do not inherit them. Converted subsets retain their source
identities independently of generated collections. Anonymous clip bounds are
frozen; annotation clips stay live.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
from contextlib import contextmanager
import copy
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from itertools import islice
import hashlib
import json
import re
from uuid import uuid4

from bson import BSON, ObjectId
from pymongo import InsertOne, ReplaceOne, UpdateOne
from pymongo.errors import BulkWriteError, DuplicateKeyError

import fiftyone.core.labels as fol
import fiftyone.core.odm as foo
import fiftyone.core.selection as fosel
import fiftyone.core.selection_refs as fosr
import fiftyone.core.stages as fost
import fiftyone.core.view as fov
import fiftyone.core.selection_context as fosc

_BATCH_SIZE = 1000
_OPERATION_TTL = timedelta(days=7)
_APPLY_LEASE = timedelta(minutes=5)
_JOURNAL_BYTES = 8 * 1024 * 1024


def create_subset(
    dataset, name, description=None, view=None, preferred_group_slice=None
):
    """Creates a named subset without copying any media or annotations."""
    fosc.check_access(dataset, "edit")
    if not isinstance(name, str) or not name.strip() or len(name) > 200:
        raise ValueError("A subset name must contain 1–200 characters")
    if description is not None and (
        not isinstance(description, str) or len(description) > 1000
    ):
        raise ValueError(
            "A subset description must be text of at most 1000 characters"
        )
    doc = {
        "_id": ObjectId(),
        "_dataset_id": dataset._doc.id,
        "name": name.strip(),
        "description": (description or "").strip() or None,
        "created_at": datetime.now(timezone.utc),
        "created_by": fosc.get_actor(),
        "member_count": 0,
        "member_counts": {"fullEpisodes": 0, "segments": 0},
        "member_version": 0,
    }
    prefix, _ = split_subset_view(view)
    if preferred_group_slice is not None and not prefix:
        if not isinstance(preferred_group_slice, str) or (
            preferred_group_slice not in (dataset.group_media_types or {})
        ):
            raise ValueError("The preferred slice must belong to this dataset")
        doc["preferred_group_slice"] = preferred_group_slice
    if prefix:
        converted = fov.DatasetView._build(dataset, prefix)
        domain = _reference_domain(dataset, prefix)
        if domain and domain[0] == "clip-range":
            # Reconstruct anonymous clips from frozen bounds, never by
            # re-evaluating the expression that happened to discover them.
            doc["view"] = [
                fost.ToClips(
                    [], config={"_subset_id": str(doc["_id"])}
                )._serialize()
            ]
        elif domain and domain[0] == "frame":
            doc["view"] = [
                fost.ToFrames(
                    config={
                        "sample_frames": "dynamic",
                        "_subset_id": str(doc["_id"]),
                    }
                )._serialize()
            ]
        else:
            doc["view"] = converted._serialize()
        doc["view_key"] = subset_view_key(prefix, dataset)
    doc["_id"] = _collection("subsets").insert_one(doc).inserted_id
    return _summary(doc)


def list_subsets(dataset):
    """Lists only the current dataset's subsets, including empty subsets."""
    return browse_subsets(dataset)["subsets"]


def browse_subsets(
    dataset, search=None, skip=0, limit=None, counts=False, view=None
):
    """Pages the current dataset's subsets, optionally matching a search.

    Names and descriptions match case-insensitively. The result carries the
    page, how many subsets match, and how many the dataset has in all, so a
    picker knows whether search is worth offering. Supplying ``view`` limits
    results to compatible subsets; an empty view selects sample subsets.
    Omitting it lists every subset in the dataset.
    """
    collection = _collection("subsets")
    base, query = _subset_queries(dataset, search, view)
    cursor = _subset_cursor(collection, query, skip, limit)
    subsets = []
    for doc in cursor:
        summary = _summary(doc)
        if counts:
            summary["counts"] = subset_counts(dataset, summary["id"])
        subsets.append(summary)
    return {
        "subsets": subsets,
        "total": collection.count_documents(query),
        "count": collection.count_documents(base),
    }


async def async_browse_subsets(
    dataset, search=None, skip=0, limit=None, view=None
):
    """Pages saved subset metadata asynchronously, without live recounts."""
    collection = foo.get_async_db_conn()["subsets"]
    base, query = _subset_queries(dataset, search, view)
    cursor = _subset_cursor(collection, query, skip, limit)
    docs, total, count = await asyncio.gather(
        cursor.to_list(length=None),
        collection.count_documents(query),
        collection.count_documents(base),
    )
    return {
        "subsets": [_summary(doc) for doc in docs],
        "total": total,
        "count": count,
    }


def _subset_queries(dataset, search, view):
    base = {"_dataset_id": dataset._doc.id}
    if view is not None:
        base["view_key"] = subset_view_key(view, dataset)
    query = dict(base)
    if search and search.strip():
        pattern = {"$regex": re.escape(search.strip()), "$options": "i"}
        query["$or"] = [{"name": pattern}, {"description": pattern}]
    return base, query


def _subset_cursor(collection, query, skip, limit):
    cursor = (
        collection.find(query, {"member_pending": 0})
        .sort([("created_at", 1), ("_id", 1)])
        .skip(max(0, skip))
    )
    if limit is not None:
        cursor = cursor.limit(max(1, limit))
    return cursor


def subset_summary(dataset, subset_id, counts=False):
    """One subset's saved counts, optionally resolving live availability."""
    summary = _summary(get_subset(dataset, subset_id))
    if counts:
        summary["counts"] = subset_counts(dataset, subset_id)
    return summary


async def async_subset_summary(dataset, subset_id):
    """Reads saved metadata in one async lookup, without resolving members."""
    doc = await foo.get_async_db_conn()["subsets"].find_one(
        {"_id": ObjectId(subset_id), "_dataset_id": dataset._doc.id},
        {"member_pending": 0},
    )
    if doc is None:
        raise ValueError("This subset is not available in the current dataset")
    return _summary(doc)


def get_subset(dataset, subset_id):
    """Returns a dataset-scoped subset or raises rather than broadening scope."""
    doc = _collection("subsets").find_one(
        {"_id": ObjectId(subset_id), "_dataset_id": dataset._doc.id}
    )
    if doc is None:
        raise ValueError("This subset is not available in the current dataset")
    return doc


def member_count(dataset, subset_id):
    """Reads the saved entity count with one subset document lookup.

    Each whole entity or segment counts once, including unavailable references.
    This does not resolve parents or apply view filters.
    """
    doc = _collection("subsets").find_one(
        {"_id": ObjectId(subset_id), "_dataset_id": dataset._doc.id},
        {"member_count": 1, "_dataset_id": 1},
    )
    if doc is None:
        raise ValueError("This subset is not available in the current dataset")
    return doc["member_count"]


def split_subset_view(stages):
    """Separates an entity conversion from stages applied within its subset."""
    end = 0
    for index, stage in enumerate(stages or []):
        name = stage["_cls"].rsplit(".", 1)[-1]
        if name in {
            "ToPatches",
            "ToEvaluationPatches",
            "ToFrames",
            "ToClips",
            "ToTrajectories",
        }:
            end = index + 1
    return (stages or [])[:end], (stages or [])[end:]


def _reference_domain(dataset, prefix):
    if not prefix:
        return None
    stage = prefix[-1]
    name = stage["_cls"].rsplit(".", 1)[-1]
    kwargs = dict(stage.get("kwargs") or [])
    if name == "ToFrames":
        return ["frame"]
    if name == "ToTrajectories":
        return ["trajectory", kwargs["field"]]
    if name == "ToClips":
        field = kwargs["field_or_expr"]
        if (kwargs.get("config") or {}).get("trajectories"):
            return ["trajectory", field]
        if isinstance(field, str):
            schema = dataset.get_field(field)
            if getattr(schema, "document_type", None) in (
                fol.TemporalDetection,
                fol.TemporalDetections,
            ):
                return ["clip-label", field]
        return ["clip-range"]
    return None


def subset_view_key(stages, dataset):
    """Identifies compatible entities independently of materialization."""
    prefix, _ = split_subset_view(stages)
    if not prefix:
        return None
    domain = _reference_domain(dataset, prefix)
    if domain:
        return _digest(domain)
    return _digest(
        [
            {
                "_cls": stage["_cls"],
                "kwargs": [
                    [key, value]
                    for key, value in stage.get("kwargs", [])
                    if key != "_state"
                ],
            }
            for stage in prefix
        ]
    )


def subset_base_view(dataset, subset_id, stages=None):
    """Loads the subset's element domain and keeps later filters separate."""
    doc = get_subset(dataset, subset_id)
    _flush_membership(foo.get_db_conn(), doc)
    prefix, rest = split_subset_view(stages)
    if stages is not None and subset_view_key(prefix, dataset) != doc.get(
        "view_key"
    ):
        raise ValueError("Open this subset in its matching entity view")
    domain = _reference_domain(dataset, doc.get("view"))
    if domain and domain[0] in ("frame", "clip-range"):
        prefix = doc["view"]
    else:
        prefix = prefix or doc.get("view")
    view = (
        fov.DatasetView._build(dataset, prefix) if prefix else dataset.view()
    )
    if prefix and view._serialize() != doc.get("view"):
        # Refresh the collection hint after reopening a generated view.
        _collection("subsets").update_one(
            {"_id": doc["_id"]}, {"$set": {"view": view._serialize()}}
        )
    return view, rest


def _membership_domain(dataset, subset_id):
    doc = get_subset(dataset, subset_id)
    domain = _reference_domain(dataset, doc.get("view"))
    if domain:
        return fosr.SourceReferenceDomain(dataset, *domain)
    return subset_base_view(dataset, subset_id)[0]


def load_materialized_view(source, subset_id, stage, reload=False):
    """Shares one generated frame/range view for a subset membership version.

    Grid and modal requests must resolve to the same frame IDs. Publishing the
    cache with a compare-and-set lets concurrent requests share a winner on
    standalone Mongo, without holding a lock while generating a collection.
    """
    import fiftyone.core.clips as focl
    import fiftyone.core.dataset as fod
    import fiftyone.core.video as fovi

    dataset = source._root_dataset
    videos = (
        dataset.select_group_slices(media_type="video")
        if dataset.media_type == "group"
        else dataset
    )
    kind = "frame" if isinstance(stage, fost.ToFrames) else "clip-range"
    while True:
        doc = get_subset(dataset, subset_id)
        if _reference_domain(dataset, doc.get("view")) != [kind]:
            raise ValueError("Open this subset in its matching entity view")
        _flush_membership(foo.get_db_conn(), doc)
        version = doc["member_version"]
        previous = doc.get("materialization")
        generated = None
        if previous and previous["version"] == version and not reload:
            try:
                generated = fod.load_dataset(previous["name"], reload=True)
                if generated._doc.id != previous.get("dataset_id"):
                    generated = None
            except fod.DatasetNotFoundError:
                pass
        if generated is None:
            if kind == "frame":
                generated = fovi.make_frames_dataset(
                    videos,
                    sample_frames="dynamic",
                    _generated=True,
                    _subset_id=subset_id,
                )
            else:
                generated = focl.make_clips_dataset(
                    videos, [], _generated=True, _subset_id=subset_id
                )
            caches = _collection("subset_materializations")
            caches.insert_one(
                {
                    "_id": generated._doc.id,
                    "_dataset_id": dataset._doc.id,
                    "subset_id": subset_id,
                    "name": generated.name,
                }
            )
            published = _collection("subsets").update_one(
                {
                    "_id": doc["_id"],
                    "_dataset_id": dataset._doc.id,
                    "member_version": version,
                    "materialization": previous,
                },
                {
                    "$set": {
                        "materialization": {
                            "version": version,
                            "name": generated.name,
                            "dataset_id": generated._doc.id,
                        }
                    }
                },
            )
            if not published.matched_count:
                generated_id = generated._doc.id
                generated._delete()
                caches.delete_one({"_id": generated_id})
                reload = False
                continue
            # Earlier published views may still serve in-flight requests.
            # Retain them until the owner is deleted or normal SDK cleanup;
            # only an unpublished losing cache is safe to delete immediately.
        stage._state = {"name": generated.name, "subset_version": version}
        if kind == "frame":
            return fovi.FramesView(videos, stage, generated)
        return focl.ClipsView(videos, stage, generated)


def write_clips_dataset(dataset, subset_id, clips_dataset):
    """Materializes saved anonymous clips using exact inclusive supports.

    The join starts at saved membership and streams through Mongo, so neither
    the view definition nor Python memory grows with the number of clips.
    """
    pipeline = _source_members_pipeline(dataset, subset_id, "clip-range")
    pipeline.extend(
        [
            {
                "$project": {
                    "_id": {"$toObjectId": {"$substrBytes": ["$_id", 0, 24]}},
                    "_sample_id": "$source_id",
                    "support": "$member.reference.support",
                    **{
                        field: "$source." + field
                        for field in (
                            "_media_type",
                            "filepath",
                            "metadata",
                            "tags",
                            "created_at",
                            "last_modified_at",
                        )
                    },
                    "_dataset_id": {"$literal": clips_dataset._doc.id},
                    "_rand": {"$rand": {}},
                }
            },
            {"$out": clips_dataset._sample_collection_name},
        ]
    )
    list(_collection("subset_members").aggregate(pipeline, allowDiskUse=True))


def write_frames_dataset(dataset, subset_id, frames_dataset):
    """Materializes only saved positions, including frames without native docs."""
    pipeline = _source_members_pipeline(dataset, subset_id, "frame")
    pipeline.extend(
        [
            {
                "$lookup": {
                    "from": dataset._frame_collection_name,
                    "let": {
                        "source": "$source_id",
                        "number": "$member.reference.frameNumber",
                    },
                    "pipeline": [
                        {
                            "$match": {
                                "$expr": {
                                    "$and": [
                                        {"$eq": ["$_sample_id", "$$source"]},
                                        {"$eq": ["$frame_number", "$$number"]},
                                    ]
                                }
                            }
                        }
                    ],
                    "as": "frame",
                }
            },
            {
                "$unwind": {
                    "path": "$frame",
                    "preserveNullAndEmptyArrays": True,
                }
            },
            {
                "$replaceRoot": {
                    "newRoot": {
                        "$mergeObjects": [
                            {
                                "metadata": None,
                                "tags": "$source.tags",
                                "created_at": "$source.created_at",
                                "last_modified_at": "$source.last_modified_at",
                            },
                            "$frame",
                            {
                                "_id": {
                                    "$ifNull": [
                                        "$frame._id",
                                        {
                                            "$toObjectId": {
                                                "$substrBytes": ["$_id", 0, 24]
                                            }
                                        },
                                    ]
                                },
                                "_dataset_id": {
                                    "$literal": frames_dataset._doc.id
                                },
                                "_sample_id": "$source_id",
                                "frame_number": "$member.reference.frameNumber",
                                "_media_type": "image",
                                "filepath": "$source.filepath",
                                "_rand": {"$rand": {}},
                            },
                        ]
                    }
                }
            },
            {"$out": frames_dataset._sample_collection_name},
        ]
    )
    list(_collection("subset_members").aggregate(pipeline, allowDiskUse=True))


def _source_members_pipeline(dataset, subset_id, kind):
    doc = get_subset(dataset, subset_id)
    if _reference_domain(dataset, doc.get("view")) != [kind]:
        raise ValueError("Open this subset in its matching entity view")
    query = member_query(dataset, subset_id, "episodes")
    return [
        {"$match": query},
        {"$set": {"source_id": {"$toObjectId": "$member.reference.sampleId"}}},
        {
            "$lookup": {
                "from": dataset._dataset._sample_collection_name,
                "localField": "source_id",
                "foreignField": "_id",
                "as": "source",
            }
        },
        {"$unwind": "$source"},
    ]


def delete_subset(dataset, subset_id):
    """Deletes a subset and its frozen records; media and annotations stay."""
    fosc.check_access(dataset, "edit")
    subset_id = str(get_subset(dataset, subset_id)["_id"])
    query = {"_dataset_id": dataset._doc.id, "subset_id": subset_id}
    # Remove the owner first: an in-flight add checks it again before completion.
    _collection("subsets").delete_one(
        {"_id": ObjectId(subset_id), "_dataset_id": dataset._doc.id}
    )
    # Candidates created before subset_id was stored need their operation IDs.
    for batch in _batches(
        _collection("subset_operations").find(query, {"_id": 1})
    ):
        _collection("subset_candidates").delete_many(
            {"operation_id": {"$in": [d["_id"] for d in batch]}}
        )
    for name in ("subset_candidates", "subset_operations", "subset_members"):
        _collection(name).delete_many(query)
    _delete_materializations(query)
    return {"id": subset_id}


def _delete_materializations(query):
    import fiftyone.core.dataset as fod

    caches = foo.get_db_conn()["subset_materializations"]
    for cache in caches.find(query).batch_size(_BATCH_SIZE):
        try:
            generated = fod.load_dataset(cache["name"])
        except fod.DatasetNotFoundError:
            pass
        else:
            # A name may have been reused after normal temporary-dataset
            # cleanup. The original dataset ID is the ownership evidence.
            if generated._doc.id == cache["_id"]:
                generated._delete()
        caches.delete_one({"_id": cache["_id"]})


def subset_members(dataset, subset_id, scope=None):
    """Reads frozen membership; deleted parent references remain stored."""
    doc = get_subset(dataset, subset_id)
    _flush_membership(foo.get_db_conn(), doc)
    subset_id = str(doc["_id"])
    query = {
        "_dataset_id": dataset._doc.id,
        "subset_id": subset_id,
        "_deleted": {"$ne": True},
    }
    if scope is not None:
        if scope not in ("episodes", "segments"):
            raise ValueError("Choose whole episodes or saved segments")
        query["member.kind"] = "episode" if scope == "episodes" else "segment"
    return [_member(doc) for doc in _collection("subset_members").find(query)]


def remove_members(dataset, subset_id, members, counts=True):
    """Removes exact member references from a subset, leaving samples intact.

    Whole episodes and segments have separate identities. Removing an episode
    does not remove its saved segments, and provenance does not affect which
    segment is removed. Repeating a removal leaves absent members unchanged.

    Args:
        dataset: the owning :class:`fiftyone.core.dataset.Dataset`
        subset_id: the subset ID
        members: the episode and segment references to remove

    Returns:
        a dict with the subset ID, removed count, and remaining member counts
    """
    fosc.check_access(dataset, "edit")
    subset_id = str(get_subset(dataset, subset_id)["_id"])
    members = fosel.normalize_members(members)
    identities = [_membership_id(dataset, subset_id, m) for m in members]
    removed = 0
    for batch in _batches(identities):
        removed += _change_members(
            foo.get_db_conn(), dataset._doc.id, subset_id, removals=batch
        )
    _touch(dataset, subset_id)
    return {
        "subsetId": subset_id,
        "removed": removed,
        "counts": subset_counts(dataset, subset_id) if counts else None,
    }


def prepare_add(
    dataset,
    subset_id,
    operation_id,
    members,
    snapshot=None,
    progress=None,
    preview=True,
):
    """Freezes a validated add and previews changes in bounded batches.

    ``snapshot`` is server-owned metadata for a normalized member iterator.
    Explicit members are validated against source samples or existing saved
    identities, so a deleted parent can be carried forward without admitting
    arbitrary foreign or generated IDs. Retry receipts expire after seven days.
    """
    fosc.check_access(dataset, "edit")
    subset_id = str(get_subset(dataset, subset_id)["_id"])
    if not isinstance(operation_id, str) or not 1 <= len(operation_id) <= 128:
        raise ValueError("An add requires an operation ID")
    if snapshot is None:
        members = fosel.normalize_members(members)
        digest = _members_digest(members)
        count = len(members)
    else:
        digest = _digest(["snapshot", str(snapshot["_id"])])
        count = snapshot["count"]
    key = _digest([str(dataset._doc.id), operation_id])
    operations = _collection("subset_operations")
    now = datetime.now(timezone.utc)
    expires = now + _OPERATION_TTL
    _insert_once(
        operations,
        {
            "_id": key,
            "_dataset_id": dataset._doc.id,
            "subset_id": subset_id,
            "digest": digest,
            "state": "preparing",
            "captured_at": now,
            "expires_at": expires,
            "count": count,
        },
    )
    operation = operations.find_one({"_id": key})
    _check_operation(operation)
    if operation["digest"] != digest or operation["subset_id"] != subset_id:
        raise ValueError(
            "This operation ID already captures a different scope"
        )
    if operation["state"] == "complete":
        return operation["result"]
    if operation["state"] == "applying":
        raise ValueError(
            "This operation is already being applied; retry shortly"
        )
    candidates = _collection("subset_candidates")
    done = 0
    validation_view = _membership_domain(dataset, subset_id)
    for batch in _batches(members):
        if progress:
            progress("preparing", done, count)
        validate_members(validation_view, batch, subset_id=subset_id)
        _insert_batch(
            candidates,
            [
                {
                    "_id": _digest([key, fosel.member_key(member)]),
                    "_dataset_id": dataset._doc.id,
                    "subset_id": subset_id,
                    "operation_id": key,
                    "member": member,
                    "expires_at": operation["expires_at"],
                }
                for member in batch
            ],
        )
        done += len(batch)
    if candidates.count_documents({"operation_id": key}) != count:
        raise ValueError(
            "The captured operation is incomplete; retry preparation"
        )
    operations.update_one(
        {"_id": key, "state": "preparing"}, {"$set": {"state": "ready"}}
    )
    if snapshot is not None:
        operations.update_one(
            {"_id": key}, {"$set": {"counts": snapshot["counts"]}}
        )
    if progress:
        progress("preparing", count, count)
    # A background save needs no duplicate preview pass over its candidates.
    if not preview:
        return {"operationId": operation_id, "subsetId": subset_id}
    return _operation_result(dataset, operation_id, operation)


def _members_digest(members):
    # A generated row ID is a rendering handle, not part of a captured entity.
    return _digest(
        [
            {
                key: value
                for key, value in member.items()
                if key != "episodeId" or "reference" not in member
            }
            for member in sorted(members, key=fosel.member_key)
        ]
    )


def is_add_prepared(
    dataset, subset_id, operation_id, members=None, snapshot_id=None
):
    """Whether a retry can reuse stored candidates after its snapshot expires."""
    key = _digest([str(dataset._doc.id), operation_id])
    operation = _collection("subset_operations").find_one({"_id": key})
    if operation is None:
        return False
    _check_operation(operation)
    if operation["subset_id"] != subset_id:
        raise ValueError("This operation belongs to another subset")
    digest = (
        _digest(["snapshot", str(ObjectId(snapshot_id))])
        if snapshot_id
        else _members_digest(fosel.normalize_members(members or []))
    )
    if operation["digest"] != digest:
        raise ValueError(
            "This operation ID already captures a different scope"
        )
    return operation["state"] in {"ready", "applying", "complete"}


def apply_add(dataset, operation_id, progress=None):
    """Applies frozen candidates with idempotent, bounded bulk writes.

    Membership and provenance retain their first adding operation. A concurrent
    removal is allowed to win; it must not turn receipt counting into an error.
    Completed operations keep their result but release their candidate payload.
    """
    fosc.check_access(dataset, "edit")
    key = _digest([str(dataset._doc.id), operation_id])
    operations = _collection("subset_operations")
    operation = operations.find_one({"_id": key})
    _check_operation(operation)
    if operation["state"] == "preparing":
        raise ValueError(
            "Prepare the complete captured operation before adding"
        )
    subset_id = operation["subset_id"]
    get_subset(dataset, subset_id)
    if operation["state"] == "complete":
        return operation["result"]
    with _applying_operation(operations, key) as renew:
        return _apply_members(
            dataset, operation_id, operation, renew, progress
        )


def _apply_members(dataset, operation_id, operation, renew, progress):
    key = operation["_id"]
    subset_id = operation["subset_id"]
    operations = _collection("subset_operations")
    candidates = _collection("subset_candidates")
    if candidates.count_documents({"operation_id": key}) != operation["count"]:
        raise ValueError("This capture is incomplete; prepare a new operation")
    collection = _collection("subset_members")
    result = {
        "operationId": operation_id,
        "subsetId": subset_id,
        "added": 0,
        "duplicates": 0,
        "provenanceUpdated": 0,
    }
    counts = operation.get("counts") or collection_counts(
        dataset,
        "subset_candidates",
        {"operation_id": key},
        target=_membership_domain(dataset, subset_id),
    )
    done = 0
    _touch(dataset, subset_id)
    for batch in _batches(
        candidates.find({"operation_id": key}).batch_size(_BATCH_SIZE)
    ):
        renew()
        if progress:
            progress("applying", done, operation["count"], result)
        docs = []
        evidence = []
        for candidate in batch:
            member = copy.deepcopy(candidate["member"])
            identity = _membership_id(dataset, subset_id, member)
            sources = (
                member["range"].pop("provenance", [])
                if member["kind"] == "segment"
                else []
            )
            docs.append(
                {
                    "_id": identity,
                    "_dataset_id": dataset._doc.id,
                    "subset_id": subset_id,
                    "member": member,
                    "added_by": key,
                    "evidence": {},
                }
            )
            for source in sources:
                path = "evidence." + _digest(source)
                evidence.append(
                    UpdateOne(
                        {"_id": identity, path: {"$exists": False}},
                        {"$set": {path: {"value": source, "added_by": key}}},
                    )
                )
        _insert_batch(collection, docs)
        for updates in _batches(evidence):
            collection.bulk_write(updates, ordered=False)
        for stored in collection.find(
            {
                "_id": {"$in": [d["_id"] for d in docs]},
                "_deleted": {"$ne": True},
            }
        ):
            if stored["added_by"] == key:
                result["added"] += 1
            else:
                result["duplicates"] += 1
                result["provenanceUpdated"] += any(
                    item["added_by"] == key
                    for item in stored["evidence"].values()
                )
        done += len(batch)
        if progress:
            progress("applying", done, operation["count"], result)
        # A deletion that raced this batch must not leave orphan membership.
        if (
            _collection("subsets").find_one(
                {"_id": ObjectId(subset_id)}, {"_id": 1}
            )
            is None
        ):
            collection.delete_many(
                {"_dataset_id": dataset._doc.id, "subset_id": subset_id}
            )
            raise ValueError("This subset was deleted while adding members")
    result["counts"] = counts
    renew()
    operations.update_one(
        {"_id": key}, {"$set": {"state": "complete", "result": result}}
    )
    candidates.delete_many({"operation_id": key})
    _touch(dataset, subset_id)
    return result


@contextmanager
def _applying_operation(operations, key):
    """Serializes one operation's retries while allowing unrelated adds."""
    now = datetime.now(timezone.utc)
    owner = str(uuid4())
    claimed = operations.update_one(
        {
            "_id": key,
            "$or": [
                {"state": "ready"},
                {"state": "applying", "lease_expires_at": {"$lte": now}},
            ],
        },
        {
            "$set": {
                "state": "applying",
                "owner": owner,
                "lease_expires_at": now + _APPLY_LEASE,
            }
        },
    )
    if not claimed.modified_count:
        raise ValueError(
            "This operation is already being applied; retry shortly"
        )

    def renew():
        result = operations.update_one(
            {"_id": key, "state": "applying", "owner": owner},
            {
                "$set": {
                    "lease_expires_at": datetime.now(timezone.utc)
                    + _APPLY_LEASE
                }
            },
        )
        if not result.matched_count:
            raise ValueError("This operation is no longer active; retry")

    try:
        yield renew
    finally:
        # A failed batch is retryable immediately; a crashed process has a lease.
        operations.update_one(
            {"_id": key, "state": "applying", "owner": owner},
            {
                "$set": {"state": "ready"},
                "$unset": {"owner": "", "lease_expires_at": ""},
            },
        )


def _operation_result(dataset, operation_id, operation):
    key = operation["_id"]
    target = _membership_domain(dataset, operation["subset_id"])
    result = {
        "operationId": operation_id,
        "subsetId": operation["subset_id"],
        "counts": collection_counts(
            dataset,
            "subset_candidates",
            {"operation_id": key},
            target=target,
        ),
        "added": 0,
        "duplicates": 0,
        "provenanceUpdated": 0,
    }
    collection = _collection("subset_members")
    for batch in _batches(
        _collection("subset_candidates")
        .find({"operation_id": key})
        .batch_size(_BATCH_SIZE)
    ):
        members = {
            _membership_id(dataset, operation["subset_id"], d["member"]): d[
                "member"
            ]
            for d in batch
        }
        stored = {
            d["_id"]: d
            for d in collection.find(
                {"_id": {"$in": list(members)}, "_deleted": {"$ne": True}}
            )
        }
        result["added"] += len(members) - len(stored)
        result["duplicates"] += len(stored)
        for identity, doc in stored.items():
            member = members[identity]
            if member["kind"] == "segment":
                result["provenanceUpdated"] += any(
                    _digest(p) not in doc["evidence"]
                    for p in member["range"]["provenance"]
                )
    return result


def validate_members(dataset, members, subset_id=None):
    """Accepts source parents and exact saved references to deleted parents."""
    view = dataset
    references = fosr.reference_fields(view)
    ids = {m["episodeId"] for m in members}
    if isinstance(view, fosr.SourceReferenceDomain):
        dataset = view.source
        converted = True
    else:
        target = dataset._dataset
        dataset = dataset._root_dataset
        converted = target is not dataset
    if converted and any(m["kind"] != "episode" for m in members):
        raise ValueError("Converted subsets contain whole entities")
    if references is not None:
        remaining = _missing_references(view, members)
    elif any(m.get("reference") is not None for m in members):
        raise ValueError(
            "Source references require their matching entity view"
        )
    else:
        present = {
            str(d["_id"])
            for d in target._sample_collection.find(
                {"_id": {"$in": [ObjectId(i) for i in ids]}}, {"_id": 1}
            )
        }
        remaining = {
            fosel.member_key(m)
            for m in members
            if m["episodeId"] not in present
        }
    if not remaining:
        return
    context_key = (
        get_subset(dataset, subset_id).get("view_key") if subset_id else None
    )
    compatible = []
    for doc in _collection("subsets").find(
        {"_dataset_id": dataset._doc.id, "view_key": context_key}
    ):
        _flush_membership(foo.get_db_conn(), doc)
        compatible.append(str(doc["_id"]))
    cursor = (
        _collection("subset_members")
        .find(
            {
                "_dataset_id": dataset._doc.id,
                "subset_id": {"$in": compatible},
                "$or": [
                    (
                        {"member.reference": m["reference"]}
                        if m.get("reference") is not None
                        else {"member.episodeId": m["episodeId"]}
                    )
                    for m in members
                    if fosel.member_key(m) in remaining
                ],
            },
            {"member": 1},
        )
        .batch_size(_BATCH_SIZE)
    )
    try:
        for doc in cursor:
            remaining.discard(fosel.member_key(doc["member"]))
            if not remaining:
                break
    finally:
        cursor.close()
    if remaining:
        raise ValueError(
            "Subset members must belong to this dataset's source samples"
        )


def _missing_references(view, members):
    for member in members:
        reference = member.get("reference")
        if reference is None:
            raise ValueError("Frames and clips require source references")
        fosr.row_query(view, reference)
    source = (
        view.source
        if isinstance(view, fosr.SourceReferenceDomain)
        else view._root_dataset
    )
    # Validate coordinates against the source, even when the generated cache
    # predates a newly added video or still contains a deleted annotation.
    present = set()
    for batch in _batches(members):
        source_ids = {ObjectId(m["reference"]["sampleId"]) for m in batch}
        pipeline = [
            {"$match": {"_id": {"$in": list(source_ids)}}},
            # Seed one bounded batch, rather than filtering the entire batch
            # again for every source video. The lookup validates each member.
            {"$limit": 1},
            {"$project": {"members": {"$literal": batch}}},
            {"$unwind": "$members"},
            fosr.source_lookup(view, "$members.reference"),
            {"$match": {"_fo_parent.0": {"$exists": True}}},
            {"$replaceRoot": {"newRoot": "$members"}},
        ]
        present.update(
            fosel.member_key(m)
            for m in source._sample_collection.aggregate(pipeline)
        )
    return {fosel.member_key(m) for m in members} - present


def _check_operation(operation):
    if operation is None:
        raise ValueError(
            "Prepare the complete captured operation before adding"
        )
    expires = operation.get("expires_at")
    if expires is not None and expires.replace(
        tzinfo=timezone.utc
    ) <= datetime.now(timezone.utc):
        raise ValueError("This operation expired; prepare a new operation")


def _touch(dataset, subset_id):
    _collection("subsets").update_one(
        {"_id": ObjectId(subset_id), "_dataset_id": dataset._doc.id},
        {
            "$set": {
                "last_modified_at": datetime.now(timezone.utc),
                "last_modified_by": fosc.get_actor(),
            }
        },
    )


def _batches(values):
    iterator = iter(values)
    while batch := list(islice(iterator, _BATCH_SIZE)):
        yield batch


def _insert_batch(collection, docs):
    if collection.name == "subset_members":
        for batch in _journal_batches(docs):
            _change_members(
                collection.database,
                batch[0]["_dataset_id"],
                batch[0]["subset_id"],
                additions=batch,
            )
        return
    _write_batch(collection, [InsertOne(doc) for doc in docs])


def _write_batch(collection, writes):
    try:
        collection.bulk_write(writes, ordered=False)
    except BulkWriteError as error:
        details = error.details
        if details.get("writeConcernErrors") or any(
            e["code"] != 11000 for e in details.get("writeErrors", [])
        ):
            raise


def _journal_batches(docs):
    # Leave room for the rest of the subset document under Mongo's 16MB limit.
    batch = []
    size = 0
    for doc in docs:
        doc_size = len(BSON.encode(doc)) + 128
        if doc_size > _JOURNAL_BYTES:
            raise ValueError("This subset member exceeds the journal limit")
        if batch and size + doc_size > _JOURNAL_BYTES:
            yield batch
            batch = []
            size = 0
        batch.append(doc)
        size += doc_size
    if batch:
        yield batch


def _change_members(db, dataset_id, subset_id, additions=None, removals=None):
    """Commits a bounded membership change and its counts in one document.

    The subset's journal is authoritative until its member index is flushed.
    Publishing the journal and totals is the commit point, even if the caller
    loses the response. Any reader of membership or subsequent writer can
    finish the idempotent projection. Metadata/count reads need only the subset
    document. No transactions or process-local locks are required.
    """
    query = {"_id": ObjectId(subset_id), "_dataset_id": dataset_id}
    additions = {d["_id"]: d for d in additions or []}
    identities = list(additions) if additions else list(removals or [])
    while True:
        doc = db.subsets.find_one(query)
        if doc is None:
            raise ValueError(
                "This subset is not available in the current dataset"
            )
        if doc.get("member_pending"):
            _flush_membership(db, doc)
            continue
        version = doc["member_version"] + 1
        stored = {
            d["_id"]: d
            for d in db.subset_members.find(
                {"_id": {"$in": identities}, "_deleted": {"$ne": True}}
            )
        }
        counts = dict(doc["member_counts"])
        changes = []
        for identity in identities:
            previous = stored.get(identity)
            if additions:
                if previous is not None:
                    continue
                change = dict(additions[identity])
                kind = change["member"]["kind"]
                delta = 1
            else:
                if previous is None:
                    continue
                kind = previous["member"]["kind"]
                delta = -1
                # Keep a compact fence: a delayed old helper must never revive
                # a member after a newer removal has already completed.
                change = {
                    "_id": identity,
                    "_dataset_id": dataset_id,
                    "subset_id": subset_id,
                    "_deleted": True,
                }
            counts[
                "fullEpisodes" if kind == "episode" else "segments"
            ] += delta
            change["_member_version"] = version
            changes.append(change)

        # Even a no-op checks the version: the index read above may have raced
        # another commit. Retrying against the new version resolves that race.
        fields = {
            "member_version": version if changes else doc["member_version"],
            "member_count": sum(counts.values()),
            "member_counts": counts,
        }
        if changes:
            fields["member_pending"] = {"version": version, "members": changes}
        result = db.subsets.update_one(
            {
                **query,
                "member_version": doc["member_version"],
                "member_pending": {"$exists": False},
            },
            {"$set": fields},
        )
        if not result.matched_count:
            continue
        _flush_membership(db, {**doc, **fields})
        return len(changes)


def _flush_membership(db, doc):
    pending = doc.get("member_pending")
    if not pending:
        return
    version = pending["version"]
    _write_batch(
        db.subset_members,
        [
            ReplaceOne(
                {
                    "_id": member["_id"],
                    "_member_version": {"$lt": version},
                },
                member,
                upsert=True,
            )
            for member in pending["members"]
        ],
    )
    # Duplicate _ids mean another helper already applied this or a newer
    # version. Only this journal may be cleared, never a newer writer's.
    result = db.subsets.update_one(
        {"_id": doc["_id"], "member_pending.version": version},
        {"$unset": {"member_pending": ""}},
    )
    if (
        not result.matched_count
        and db.subsets.find_one({"_id": doc["_id"]}, {"_id": 1}) is None
    ):
        db.subset_members.delete_many(
            {"_dataset_id": doc["_dataset_id"], "subset_id": str(doc["_id"])}
        )
        raise ValueError("This subset was deleted while changing members")


def _summary(doc):
    """Formats saved metadata without I/O, shared by sync and async reads."""
    return {
        "id": str(doc["_id"]),
        "name": doc["name"],
        "description": doc.get("description"),
        "view": doc.get("view"),
        "preferredGroupSlice": doc.get("preferred_group_slice"),
        "memberCount": doc["member_count"],
        "memberCounts": doc["member_counts"],
        "counts": None,
        "kinds": _member_kinds(doc),
    }


def _member_kinds(doc):
    return [
        kind
        for kind, field in (
            ("episode", "fullEpisodes"),
            ("segment", "segments"),
        )
        if doc["member_counts"][field]
    ]


def _member(doc):
    member = copy.deepcopy(doc["member"])
    if member["kind"] == "segment":
        member["range"]["provenance"] = [
            item["value"] for item in doc["evidence"].values()
        ]
    return member


def _membership_id(dataset, subset_id, member):
    return _digest([str(dataset._doc.id), subset_id, fosel.member_key(member)])


def _digest(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _insert_once(collection, doc):
    try:
        collection.insert_one(doc)
    except DuplicateKeyError:
        pass


def _collection(name):
    db = foo.get_db_conn()
    _ensure_indexes(db.client, db.name, name)
    return db[name]


@lru_cache(maxsize=32)
def _ensure_indexes(client, database, name):
    collection = client[database][name]
    collection.create_index("_dataset_id")
    if name in ("subset_operations", "subset_candidates"):
        collection.create_index("expires_at", expireAfterSeconds=0)
    if name == "subset_candidates":
        collection.create_index("operation_id")
        collection.create_index([("_dataset_id", 1), ("subset_id", 1)])
    elif name == "subset_materializations":
        collection.create_index([("_dataset_id", 1), ("subset_id", 1)])
    elif name == "subset_members":
        collection.create_index(
            [
                ("_dataset_id", 1),
                ("subset_id", 1),
                ("member.kind", 1),
                ("member.episodeId", 1),
            ]
        )
        collection.create_index(
            [
                ("_dataset_id", 1),
                ("subset_id", 1),
                ("member.episodeId", 1),
                ("member.kind", 1),
            ]
        )
        collection.create_index([("_dataset_id", 1), ("member.episodeId", 1)])
        collection.create_index(
            [("_dataset_id", 1), ("subset_id", 1), ("member.reference", 1)]
        )


def delete_for_dataset_id(dataset_id):
    """Deletes subset records only when the owning dataset itself is deleted."""
    db = foo.get_db_conn()
    existing = set(db.list_collection_names())
    if "subset_materializations" in existing:
        _delete_materializations({"_dataset_id": dataset_id})
        db.subset_materializations.delete_one({"_id": dataset_id})
    for name in (
        "subsets",
        "subset_members",
        "subset_operations",
        "subset_candidates",
    ):
        if name in existing:
            db[name].delete_many({"_dataset_id": dataset_id})


def member_query(dataset, subset_id, scope=None):
    """Resolves a dataset-scoped, unambiguous subset membership query."""
    doc = get_subset(dataset, subset_id)
    _flush_membership(foo.get_db_conn(), doc)
    subset_id = str(doc["_id"])
    query = {
        "_dataset_id": dataset._doc.id,
        "subset_id": subset_id,
        # Tombstones have no member. Keeping this predicate on member.kind
        # preserves the covered parent index used when browsing saved ranges.
        "member.kind": {"$in": ["episode", "segment"]},
    }
    if scope is not None:
        if scope not in ("episodes", "segments"):
            raise ValueError("Choose whole episodes or saved segments")
        query["member.kind"] = "episode" if scope == "episodes" else "segment"
    else:
        kinds = _member_kinds(doc)
        if len(kinds) > 1:
            raise ValueError(
                "Choose Whole episodes or Saved segments for this mixed subset"
            )
        if kinds:
            query["member.kind"] = kinds[0]
    return query


def _member_lookup(view, query, existence=False):
    reference = fosr.reference_expression(view)
    variable = (
        {"reference": reference}
        if reference is not None
        else {"episode": {"$toString": "$_id"}}
    )
    condition = (
        {"$eq": ["$member.reference", "$$reference"]}
        if reference is not None
        else {"$eq": ["$member.episodeId", "$$episode"]}
    )
    pipeline = [
        {
            "$match": {
                **query,
                "$expr": condition,
            }
        }
    ]
    if existence:
        pipeline.extend([{"$limit": 1}, {"$project": {"_id": 1}}])
    return {
        "$lookup": {
            "from": "subset_members",
            "let": variable,
            "pipeline": pipeline,
            "as": "_fo_subset_members",
        }
    }


def select_subset(view, subset_id, scope=None, parent_ids=None):
    """Starts at saved membership so sparse subsets do not scan every sample.

    Grouped or already-filtered views keep their input slice/stage semantics via
    an existence join. A base non-grouped view can start from the subset index
    and fetch only its live parents. Later stages still see normal sample docs.
    """
    dataset = view._dataset
    query = member_query(view._root_dataset, subset_id, scope)
    references = fosr.reference_fields(view) is not None
    if parent_ids is not None and not references:
        query["member.episodeId"] = {"$in": parent_ids}
    if dataset.media_type == "group" or view._stages or parent_ids is not None:
        pipeline = [
            _member_lookup(view, query, existence=True),
            {"$match": {"_fo_subset_members.0": {"$exists": True}}},
            {"$unset": "_fo_subset_members"},
        ]
        if parent_ids is not None:
            pipeline.insert(
                0,
                {
                    "$match": {
                        "_id": {"$in": [ObjectId(i) for i in parent_ids]}
                    }
                },
            )
    elif references:
        members = [{"$match": query}]
        lookup = {
            "from": dataset._sample_collection_name,
            "let": {"reference": "$member.reference"},
            "pipeline": [{"$match": {"$expr": fosr.reference_match(view)}}],
            "as": "sample",
        }
        if (
            view._is_clips
            and (view._clips_stage.config or {}).get("_subset_id") == subset_id
        ):
            # Frozen clips have a stable row ID derived from membership.
            # Matching array supports would scan every clip in the video
            # once per member, even with the source sample index.
            members.append(
                {
                    "$set": {
                        "_fo_row_id": {
                            "$toObjectId": {"$substrBytes": ["$_id", 0, 24]}
                        }
                    }
                }
            )
            lookup = {
                "from": dataset._sample_collection_name,
                "localField": "_fo_row_id",
                "foreignField": "_id",
                "as": "sample",
            }
        members.extend(
            [
                {"$lookup": lookup},
                {"$unwind": "$sample"},
                {"$replaceRoot": {"newRoot": "$sample"}},
            ]
        )
        pipeline = [
            {"$match": {"_id": {"$in": []}}},
            {"$unionWith": {"coll": "subset_members", "pipeline": members}},
        ]
    else:
        members = [{"$match": query}, {"$sort": {"member.episodeId": 1}}]
        if query.get("member.kind") == "episode":
            members.append(
                {"$project": {"_id": {"$toObjectId": "$member.episodeId"}}}
            )
        else:
            # The covered parent index supports a distinct scan for ranges.
            members.extend(
                [
                    {"$group": {"_id": "$member.episodeId"}},
                    {"$sort": {"_id": 1}},
                    {"$set": {"_id": {"$toObjectId": "$_id"}}},
                ]
            )
        members.extend(
            [
                {
                    "$lookup": {
                        "from": dataset._sample_collection_name,
                        "localField": "_id",
                        "foreignField": "_id",
                        "as": "sample",
                    }
                },
                {"$unwind": "$sample"},
                {"$replaceRoot": {"newRoot": "$sample"}},
            ]
        )
        pipeline = [
            {"$match": {"_id": {"$in": []}}},
            {"$unionWith": {"coll": "subset_members", "pipeline": members}},
        ]
    if references:
        pipeline.extend(
            [
                fosr.source_lookup(
                    view, fosr.reference_expression(view), "_fo_source"
                ),
                {"$match": {"_fo_source.0": {"$exists": True}}},
                {"$unset": "_fo_source"},
            ]
        )
    # These stages only inspect source identities. Default Mongo stages would
    # attach every video's frames (and every group slice) before filtering.
    return view.mongo(pipeline, _needs_frames=False, _group_slices=[])


def _view_members_pipeline(view, subset_id, scope):
    query = member_query(view._root_dataset, subset_id, scope)
    return [
        _member_lookup(view, query),
        {"$unwind": "$_fo_subset_members"},
        {
            "$set": {
                "_fo_subset_members.member.episodeId": {"$toString": "$_id"}
            }
        },
        {"$replaceRoot": {"newRoot": "$_fo_subset_members"}},
    ]


def iter_parent_members(dataset, subset_id, scope, parent_ids):
    """Streams exact saved references for a bounded set of requested parents."""
    query = member_query(dataset, subset_id, scope)
    query["member.episodeId"] = {"$in": list(parent_ids)}
    for doc in (
        _collection("subset_members").find(query).batch_size(_BATCH_SIZE)
    ):
        yield _member(doc)


def iter_view_members(view, subset_id, scope=None):
    """Streams membership in view order without enumerating parents in Python."""
    for doc in view._aggregate(
        pipeline=_view_members_pipeline(view, subset_id, scope)
    ).batch_size(_BATCH_SIZE):
        yield _member(doc)


def iter_missing_members(dataset, subset_id, scope=None):
    """Streams saved references whose parents have been deleted."""
    query = member_query(dataset, subset_id, scope)
    target = _membership_domain(dataset, subset_id)
    pipeline = [
        {"$match": query},
        *_parent_lookup(target, "$member.episodeId"),
        {"$match": {"_fo_parent.0": {"$exists": False}}},
        {"$sort": {"member.episodeId": 1, "_id": 1}},
    ]
    for doc in _collection("subset_members").aggregate(
        pipeline, allowDiskUse=True, batchSize=_BATCH_SIZE
    ):
        yield _member(doc)


def _parent_lookup(dataset, expression, reference="$member.reference"):
    fields = fosr.reference_fields(dataset)
    if fields is not None:
        return [fosr.source_lookup(dataset, reference)]
    # Equality joins let Mongo use its indexed lookup execution path. The
    # following projection retains only existence, never sample payloads.
    return [
        {"$set": {"_fo_parent_id": {"$toObjectId": expression}}},
        {
            "$lookup": {
                "from": dataset._dataset._sample_collection_name,
                "localField": "_fo_parent_id",
                "foreignField": "_id",
                "as": "_fo_parent",
            }
        },
        {"$set": {"_fo_parent": "$_fo_parent._id"}},
    ]


def _counts_pipeline(dataset, live=False, missing_only=False):
    pipeline = [
        {
            "$group": {
                "_id": "$member.episodeId",
                **(
                    {"reference": {"$first": "$member.reference"}}
                    if fosr.reference_fields(dataset) is not None
                    else {}
                ),
                "fullEpisodes": {
                    "$sum": {
                        "$cond": [{"$eq": ["$member.kind", "episode"]}, 1, 0]
                    }
                },
                "segments": {
                    "$sum": {
                        "$cond": [{"$eq": ["$member.kind", "segment"]}, 1, 0]
                    }
                },
            }
        }
    ]
    if not live:
        pipeline.extend(_parent_lookup(dataset, "$_id", "$reference"))
        if missing_only:
            pipeline.append({"$match": {"_fo_parent.0": {"$exists": False}}})
    pipeline.append(
        {
            "$group": {
                "_id": None,
                "episodes": {"$sum": 1},
                "fullEpisodes": {"$sum": "$fullEpisodes"},
                "segments": {"$sum": "$segments"},
                "segmentEpisodes": {
                    "$sum": {"$cond": [{"$gt": ["$segments", 0]}, 1, 0]}
                },
                "unavailable": {
                    "$sum": (
                        0
                        if live
                        else {
                            "$cond": [
                                {"$eq": [{"$size": "$_fo_parent"}, 0]},
                                {"$add": ["$fullEpisodes", "$segments"]},
                                0,
                            ]
                        }
                    )
                },
            }
        }
    )
    pipeline.append({"$project": {"_id": 0}})
    return pipeline


def _read_counts(cursor):
    return next(
        iter(cursor),
        dict.fromkeys(
            (
                "episodes",
                "fullEpisodes",
                "segments",
                "segmentEpisodes",
                "unavailable",
            ),
            0,
        ),
    )


def collection_counts(dataset, name, query, target=None):
    """Computes live membership counts in Mongo with bounded client memory."""
    return _read_counts(
        _collection(name).aggregate(
            [
                {
                    "$match": {
                        **query,
                        "_dataset_id": dataset._doc.id,
                        "_deleted": {"$ne": True},
                    }
                }
            ]
            + _counts_pipeline(target if target is not None else dataset),
            allowDiskUse=True,
        )
    )


def subset_counts(dataset, subset_id, scope=None):
    """Counts saved members, including missing parents, without loading them."""
    get_subset(dataset, subset_id)
    query = {"subset_id": str(subset_id)}
    if scope is not None:
        query = member_query(dataset, subset_id, scope)
    return collection_counts(
        dataset,
        "subset_members",
        query,
        target=_membership_domain(dataset, subset_id),
    )


def view_counts(view, subset_id, scope=None):
    """Counts only saved members whose live parents match the current view."""
    return _read_counts(
        view._aggregate(
            pipeline=_view_members_pipeline(view, subset_id, scope)
            + _counts_pipeline(view._dataset, live=True)
        )
    )


def missing_counts(dataset, subset_id, scope=None):
    """Counts missing parents and each saved member kind entirely in Mongo."""
    query = member_query(dataset, subset_id, scope)
    target = _membership_domain(dataset, subset_id)
    return _read_counts(
        _collection("subset_members").aggregate(
            [{"$match": query}] + _counts_pipeline(target, missing_only=True),
            allowDiskUse=True,
        )
    )


def missing_member_page(dataset, subset_id, scope=None, skip=0, limit=100):
    """Returns one page of unavailable parents, with their complete ranges."""
    query = member_query(dataset, subset_id, scope)
    target = _membership_domain(dataset, subset_id)
    pipeline = [
        {"$match": query},
        {
            "$group": {
                "_id": "$member.episodeId",
                "reference": {"$first": "$member.reference"},
            }
        },
        *_parent_lookup(target, "$_id", "$reference"),
        {"$match": {"_fo_parent.0": {"$exists": False}}},
        {"$sort": {"_id": 1}},
        {"$skip": max(0, skip)},
        {"$limit": min(max(1, limit), 100)},
    ]
    ids = [
        doc["_id"]
        for doc in _collection("subset_members").aggregate(
            pipeline, allowDiskUse=True
        )
    ]
    return [
        _member(doc)
        for doc in _collection("subset_members")
        .find({**query, "member.episodeId": {"$in": ids}})
        .sort([("member.episodeId", 1), ("_id", 1)])
    ]
