"""
Frozen, additive episode and segment subsets.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import copy
from datetime import datetime, timezone
import hashlib
import json
import re

from bson import ObjectId
from pymongo.errors import DuplicateKeyError

import fiftyone.core.odm as foo
import fiftyone.core.selection as fosel


def create_subset(dataset, name, description=None):
    """Creates a named subset without copying any media or annotations."""
    if not isinstance(name, str) or not name.strip() or len(name) > 200:
        raise ValueError("A subset name must contain 1–200 characters")
    if description is not None and (
        not isinstance(description, str) or len(description) > 1000
    ):
        raise ValueError(
            "A subset description must be text of at most 1000 characters"
        )
    doc = {
        "_dataset_id": dataset._doc.id,
        "name": name.strip(),
        "description": (description or "").strip() or None,
        "created_at": datetime.now(timezone.utc),
    }
    doc["_id"] = _collection("subsets").insert_one(doc).inserted_id
    return _summary(dataset, doc)


def list_subsets(dataset):
    """Lists only the current dataset's subsets, including empty subsets."""
    return browse_subsets(dataset)["subsets"]


def browse_subsets(dataset, search=None, skip=0, limit=None):
    """Pages the current dataset's subsets, optionally matching a search.

    Names and descriptions match case-insensitively. The result carries the
    page, how many subsets match, and how many the dataset has in all, so a
    picker knows whether search is worth offering.
    """
    collection = _collection("subsets")
    base = {"_dataset_id": dataset._doc.id}
    query = dict(base)
    if search and search.strip():
        pattern = {"$regex": re.escape(search.strip()), "$options": "i"}
        query["$or"] = [{"name": pattern}, {"description": pattern}]
    cursor = collection.find(query).sort("created_at", 1).skip(max(0, skip))
    if limit is not None:
        cursor = cursor.limit(max(1, limit))
    return {
        "subsets": [_summary(dataset, doc) for doc in cursor],
        "total": collection.count_documents(query),
        "count": collection.count_documents(base),
    }


def subset_summary(dataset, subset_id):
    """One dataset-scoped subset with its live counts."""
    return _summary(dataset, get_subset(dataset, subset_id))


def get_subset(dataset, subset_id):
    """Returns a dataset-scoped subset or raises rather than broadening scope."""
    doc = _collection("subsets").find_one(
        {"_id": ObjectId(subset_id), "_dataset_id": dataset._doc.id}
    )
    if doc is None:
        raise ValueError("This subset is not available in the current dataset")
    return doc


def delete_subset(dataset, subset_id):
    """Deletes a subset and its frozen records; media and annotations stay."""
    subset_id = str(get_subset(dataset, subset_id)["_id"])
    query = {"_dataset_id": dataset._doc.id, "subset_id": subset_id}
    operations = _collection("subset_operations")
    keys = [doc["_id"] for doc in operations.find(query, {"_id": 1})]
    if keys:
        _collection("subset_candidates").delete_many(
            {"operation_id": {"$in": keys}}
        )
        operations.delete_many({"_id": {"$in": keys}})
    _collection("subset_members").delete_many(query)
    _collection("subsets").delete_one(
        {"_id": ObjectId(subset_id), "_dataset_id": dataset._doc.id}
    )
    return {"id": subset_id}


def subset_members(dataset, subset_id, scope=None):
    """Reads frozen membership; deleted parent references remain stored."""
    subset_id = str(get_subset(dataset, subset_id)["_id"])
    query = {"_dataset_id": dataset._doc.id, "subset_id": subset_id}
    if scope is not None:
        if scope not in ("episodes", "segments"):
            raise ValueError("Choose whole episodes or saved segments")
        query["member.kind"] = "episode" if scope == "episodes" else "segment"
    return [_member(doc) for doc in _collection("subset_members").find(query)]


def prepare_add(dataset, subset_id, operation_id, members):
    """Freezes an add operation and previews its current membership changes.

    Candidates are separate records, so a large scope does not become a single
    Mongo document. A partially prepared operation cannot be applied. Repeating
    preparation with the same ID requires exactly the same normalized payload.
    """
    subset_id = str(get_subset(dataset, subset_id)["_id"])
    if not isinstance(operation_id, str) or not 1 <= len(operation_id) <= 128:
        raise ValueError("An add requires an operation ID")
    members = fosel.normalize_members(members)
    digest = _digest(sorted(members, key=fosel.member_key))
    key = _digest([str(dataset._doc.id), operation_id])
    operations = _collection("subset_operations")
    _insert_once(
        operations,
        {
            "_id": key,
            "_dataset_id": dataset._doc.id,
            "subset_id": subset_id,
            "digest": digest,
            "state": "preparing",
            "captured_at": datetime.now(timezone.utc),
            "count": len(members),
        },
    )
    operation = operations.find_one({"_id": key})
    if operation["digest"] != digest or operation["subset_id"] != subset_id:
        raise ValueError(
            "This operation ID already captures a different scope"
        )
    candidates = _collection("subset_candidates")
    for member in members:
        _insert_once(
            candidates,
            {
                "_id": _digest([key, fosel.member_key(member)]),
                "_dataset_id": dataset._doc.id,
                "operation_id": key,
                "member": member,
            },
        )
    if candidates.count_documents({"operation_id": key}) != len(members):
        raise ValueError(
            "The captured operation is incomplete; retry preparation"
        )
    operations.update_one(
        {"_id": key, "state": "preparing"}, {"$set": {"state": "ready"}}
    )
    return {
        "operationId": operation_id,
        "subsetId": subset_id,
        "counts": _counts(dataset, members),
        **_preview(dataset, subset_id, members),
    }


def apply_add(dataset, operation_id):
    """Adds a frozen operation idempotently, preserving all existing members.

    Each membership and provenance entry records its first adding operation.
    These receipts make both partial retries and concurrent adds count correctly
    without requiring Mongo transactions or an in-memory lock.
    """
    key = _digest([str(dataset._doc.id), operation_id])
    operations = _collection("subset_operations")
    operation = operations.find_one({"_id": key})
    if operation is None or operation["state"] == "preparing":
        raise ValueError(
            "Prepare the complete captured operation before adding"
        )
    get_subset(dataset, operation["subset_id"])
    if operation["state"] == "complete":
        return operation["result"]
    collection = _collection("subset_members")
    added = duplicates = provenance_updated = 0
    members = []
    for candidate in _collection("subset_candidates").find(
        {"operation_id": key}
    ):
        member = candidate["member"]
        members.append(member)
        identity = _membership_id(dataset, operation["subset_id"], member)
        base = copy.deepcopy(member)
        evidence = (
            base["range"].pop("provenance", [])
            if base["kind"] == "segment"
            else []
        )
        _insert_once(
            collection,
            {
                "_id": identity,
                "_dataset_id": dataset._doc.id,
                "subset_id": operation["subset_id"],
                "member": base,
                "added_by": key,
                "evidence": {},
            },
        )
        for source in evidence:
            path = "evidence." + _digest(source)
            collection.update_one(
                {"_id": identity, path: {"$exists": False}},
                {"$set": {path: {"value": source, "added_by": key}}},
            )
        stored = collection.find_one({"_id": identity})
        if stored["added_by"] == key:
            added += 1
        else:
            duplicates += 1
            provenance_updated += any(
                item["added_by"] == key for item in stored["evidence"].values()
            )
    result = {
        "operationId": operation_id,
        "subsetId": operation["subset_id"],
        "counts": _counts(dataset, members),
        "added": added,
        "duplicates": duplicates,
        "provenanceUpdated": provenance_updated,
    }
    operations.update_one(
        {"_id": key}, {"$set": {"state": "complete", "result": result}}
    )
    return result


def _preview(dataset, subset_id, members):
    collection = _collection("subset_members")
    added = duplicates = provenance_updated = 0
    for member in members:
        stored = collection.find_one(
            {"_id": _membership_id(dataset, subset_id, member)}
        )
        if stored is None:
            added += 1
        else:
            duplicates += 1
            if member["kind"] == "segment":
                provenance_updated += any(
                    _digest(p) not in stored["evidence"]
                    for p in member["range"]["provenance"]
                )
    return {
        "added": added,
        "duplicates": duplicates,
        "provenanceUpdated": provenance_updated,
    }


def _summary(dataset, doc):
    members = subset_members(dataset, str(doc["_id"]))
    return {
        "id": str(doc["_id"]),
        "name": doc["name"],
        "description": doc.get("description"),
        "counts": _counts(dataset, members),
    }


def _counts(dataset, members):
    ids = {member["episodeId"] for member in members}
    present = set(fosel.select_parents(dataset, ids).values("id"))
    return fosel.count_members(members, ids - present)


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
    collection = foo.get_db_conn()[name]
    # Reads by dataset and operation stay bounded to their own records.
    collection.create_index("_dataset_id")
    if name == "subset_candidates":
        collection.create_index("operation_id")
    elif name == "subset_members":
        collection.create_index([("_dataset_id", 1), ("subset_id", 1)])
    return collection


def delete_for_dataset_id(dataset_id):
    """Deletes subset records only when the owning dataset itself is deleted."""
    db = foo.get_db_conn()
    existing = set(db.list_collection_names())
    for name in (
        "subsets",
        "subset_members",
        "subset_operations",
        "subset_candidates",
    ):
        if name in existing:
            db[name].delete_many({"_dataset_id": dataset_id})
