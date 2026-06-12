"""
FiftyOne Server sample endpoints.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|

Annotation saves are a batch of gated field updates applied directly to Mongo
(no sample is loaded), each carrying its target, the previous value to gate on,
and the new value to write. A failed precondition returns ``409`` with the
document's current state so the client can reconcile.

Non-obvious bits:

  * Updates targeting a generated (patches/clips) dataset are best-effort end
    to end — planning failures, stale gates, and database errors are logged
    and skipped, never failing the request. Only permanent (source) failures
    reach the client.
  * Permanent writes are applied independently — a stale gate on one update is
    a conflict for that update only, never for the rest of the batch.
  * The batch is one unordered ``bulk_write`` per target collection; no update
    is ever issued twice. Per-update diagnosis is read-only and runs only when
    a bulk result cannot confirm every gated update — never in the
    single-writer case.
  * A precondition miss whose post-state already holds is an idempotent retry
    (e.g. the first attempt committed but its response was lost) and counts as
    success, not a conflict.
  * :class:`CommitMask` exists only because a gated update can't express a
    server-side *file* write; its database write is the same gated primitive.
"""

import datetime
import logging
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId
from pymongo import DeleteOne, UpdateOne
from pymongo.errors import PyMongoError
from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
from fiftyone.core.odm.database import get_db_conn
from fiftyone.server import decorators, utils
from fiftyone.server.utils.json.encoder import JSONResponse

logger = logging.getLogger(__name__)


def _now() -> datetime.datetime:
    # Naive UTC to match how fiftyone stamps ``last_modified_at``; a tz-aware
    # value breaks naive/aware comparisons in code that reads the field.
    return datetime.datetime.utcnow()


def _object_id(value: Any) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception as err:  # pylint: disable=broad-except
        raise HTTPException(
            status_code=400, detail=f"Invalid id '{value}'"
        ) from err


def _is_label(value: Any) -> bool:
    return isinstance(value, dict) and "_cls" in value


def _label_to_mongo(value: dict) -> dict:
    """Coerces a label dict to its stored BSON form (pure CPU, no DB access).

    Round-trips through the label class so masks, datetimes, ObjectIds, etc.
    are encoded exactly as fiftyone persists them — required for equality
    gates to match.
    """
    try:
        return utils.json.deserialize(value).to_mongo()
    except Exception as err:  # pylint: disable=broad-except
        raise HTTPException(
            status_code=400, detail=f"Could not deserialize label: {err}"
        ) from err


def _gatable(value: Any) -> bool:
    """Whether ``value`` is safe to use as an equality precondition.

    Embedded documents are field-order-sensitive and binary blobs may not
    re-serialize byte-for-byte, so those gate on identity only.
    """
    if value is None:
        return True
    if isinstance(value, (dict, bytes, bytearray)):
        return False
    if isinstance(value, (list, tuple)):
        return all(_gatable(v) for v in value)
    return True


def _gate(value: Any) -> Any:
    # ``$in: [None]`` matches both an absent field and an explicit null.
    return {"$in": [None]} if value is None else value


def _changed_label_fields(
    old_bson: dict, new_bson: dict
) -> Tuple[Dict[str, Any], List[str]]:
    """Returns ``(set_fields, unset_fields)`` for a label modification;
    ``_id`` is never touched."""
    set_fields: Dict[str, Any] = {}
    unset_fields: List[str] = []
    for field in set(old_bson) | set(new_bson):
        if field == "_id":
            continue
        old_val = old_bson.get(field)
        new_val = new_bson.get(field)
        if old_val == new_val:
            continue
        if field in new_bson:
            set_fields[field] = new_val
        else:
            unset_fields.append(field)
    return set_fields, unset_fields


def _build_label_update(
    lookup_path: str,
    label_oid: Optional[ObjectId],
    old: Optional[dict],
    new: Optional[dict],
    *,
    array: bool,
    doc_filter: Dict[str, Any],
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Builds the (filter, update) for an add/remove/modify of one label.

    ``array`` selects between a label inside a list field (``$elemMatch`` +
    positional ``$``) and a flattened single label (matched by path).
    """
    now = _now()

    if new is None:
        # Gate on the scalars the editor saw so a stale delete can't erase a
        # label another editor just changed.
        old_bson = _label_to_mongo(old) if old is not None else {}
        gates = {
            field: _gate(value)
            for field, value in old_bson.items()
            if field != "_id" and _gatable(value)
        }
        if array:
            filter_doc = {
                **doc_filter,
                lookup_path: {"$elemMatch": {"_id": label_oid, **gates}},
            }
            update_doc = {
                "$pull": {lookup_path: {"_id": label_oid}},
                "$set": {"last_modified_at": now},
            }
        else:
            filter_doc = {**doc_filter}
            # Bind to identity so a replacement label with equal scalars but a
            # new _id isn't mistaken for ours.
            if "_id" in old_bson:
                filter_doc[f"{lookup_path}._id"] = old_bson["_id"]
            filter_doc.update(
                {f"{lookup_path}.{f}": v for f, v in gates.items()}
            )
            update_doc = {
                "$unset": {lookup_path: ""},
                "$set": {"last_modified_at": now},
            }
        return filter_doc, update_doc

    new_bson = _label_to_mongo(new)

    if old is None:
        if array:
            filter_doc = {
                **doc_filter,
                f"{lookup_path}._id": {"$ne": label_oid},
            }
            update_doc = {
                "$push": {lookup_path: new_bson},
                "$set": {"last_modified_at": now},
            }
        else:
            # Create only while still absent/null so a stale create can't
            # clobber a value another editor inserted.
            filter_doc = {**doc_filter, lookup_path: {"$in": [None]}}
            update_doc = {
                "$set": {lookup_path: new_bson, "last_modified_at": now}
            }
        return filter_doc, update_doc

    old_bson = _label_to_mongo(old)
    set_fields, unset_fields = _changed_label_fields(old_bson, new_bson)

    prefix = f"{lookup_path}.$." if array else f"{lookup_path}."
    gates = {
        field: _gate(old_bson.get(field))
        for field in list(set_fields) + unset_fields
        if _gatable(old_bson.get(field))
    }

    if array:
        elem_match = {"_id": label_oid, **gates}
        filter_doc = {**doc_filter, lookup_path: {"$elemMatch": elem_match}}
    else:
        filter_doc = {**doc_filter}
        if "_id" in old_bson:
            filter_doc[f"{lookup_path}._id"] = old_bson["_id"]
        filter_doc.update({f"{lookup_path}.{f}": v for f, v in gates.items()})

    set_doc = {f"{prefix}{f}": v for f, v in set_fields.items()}
    set_doc["last_modified_at"] = now
    update_doc: Dict[str, Any] = {"$set": set_doc}
    if unset_fields:
        update_doc["$unset"] = {f"{prefix}{f}": "" for f in unset_fields}

    return filter_doc, update_doc


def _scalar_gates(bson_doc: dict) -> Dict[str, Any]:
    return {
        field: _gate(value)
        for field, value in bson_doc.items()
        if field != "_id" and _gatable(value)
    }


def _build_label_applied_filter(
    lookup_path: str,
    label_oid: Optional[ObjectId],
    new: Optional[dict],
    *,
    array: bool,
    doc_filter: Dict[str, Any],
) -> Dict[str, Any]:
    """A filter matching the document iff the label update already holds —
    judged on identity plus gatable (scalar) fields of the new value."""
    if new is None:
        if array:
            return {**doc_filter, f"{lookup_path}._id": {"$ne": label_oid}}
        return {**doc_filter, lookup_path: {"$in": [None]}}

    new_bson = _label_to_mongo(new)
    gates = _scalar_gates(new_bson)

    if array:
        return {
            **doc_filter,
            lookup_path: {"$elemMatch": {"_id": label_oid, **gates}},
        }

    filter_doc = {**doc_filter}
    if "_id" in new_bson:
        filter_doc[f"{lookup_path}._id"] = new_bson["_id"]
    filter_doc.update({f"{lookup_path}.{f}": v for f, v in gates.items()})
    return filter_doc


def _build_primitive_applied_filter(
    field_path: str,
    new: Any,
    *,
    doc_filter: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """A filter matching iff the primitive update already holds, or ``None``
    when the new value is not reliably comparable (non-scalar)."""
    if new is None:
        return {**doc_filter, field_path: {"$in": [None]}}
    if _gatable(new):
        return {**doc_filter, field_path: new}
    return None


def _build_primitive_update(
    field_path: str,
    old: Any,
    new: Any,
    *,
    doc_filter: Dict[str, Any],
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    now = _now()
    filter_doc = dict(doc_filter)
    if _gatable(old):
        filter_doc[field_path] = _gate(old)

    if new is None:
        update_doc = {
            "$unset": {field_path: ""},
            "$set": {"last_modified_at": now},
        }
    else:
        update_doc = {"$set": {field_path: new, "last_modified_at": now}}

    return filter_doc, update_doc


def _resolve_collection(db, update: dict) -> str:
    """Resolves the target collection name for an update.

    A generated (patches) write carries the dataset's ``datasetName`` instead
    of a concrete ``collection`` because the client has no dataset id for it.
    """
    collection_name = update.get("collection")
    if isinstance(collection_name, str) and collection_name:
        return collection_name

    dataset_name = update.get("datasetName")
    if isinstance(dataset_name, str) and dataset_name:
        doc = db["datasets"].find_one(
            {"name": dataset_name}, {"sample_collection_name": 1}
        )
        if not doc or not doc.get("sample_collection_name"):
            raise HTTPException(
                status_code=404, detail=f"Dataset '{dataset_name}' not found"
            )
        return doc["sample_collection_name"]

    raise HTTPException(
        status_code=400,
        detail="Update is missing 'collection' or 'datasetName'",
    )


# Collections produced by generated views (patches/clips/frame-patches)
_GENERATED_PREFIXES = ("patches.", "clips.")


def _allowed_collections(path_params: dict) -> set:
    """The route dataset's own collections — names are deterministic, so no
    database lookup is needed."""
    dataset_id = path_params.get("dataset_id")
    if not dataset_id:
        raise HTTPException(status_code=400, detail="Missing dataset id")
    return {f"samples.{dataset_id}", f"frames.{dataset_id}"}


def _plan_update(db, update: dict, allowed: set) -> dict:
    """Resolves and builds one update *without writing*.

    Raises:
        HTTPException: the payload is malformed or its target collection is
            outside ``allowed`` (bound to the route's dataset)
    """
    if not isinstance(update, dict):
        raise HTTPException(
            status_code=400, detail="Each update must be an object"
        )

    collection_name = _resolve_collection(db, update)
    # A body must not be able to redirect a write to another dataset: an
    # explicit collection must be the route's own, and a datasetName target
    # may only resolve to a generated collection.
    if update.get("collection"):
        target_allowed = collection_name in allowed
    else:
        target_allowed = collection_name.startswith(_GENERATED_PREFIXES)
    if not target_allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Update targets disallowed collection '{collection_name}'",
        )

    doc_id = update.get("id")
    if doc_id is None:
        raise HTTPException(status_code=400, detail="Update is missing 'id'")
    doc_filter = {"_id": _object_id(doc_id)}

    plan = {
        "collection": db[collection_name],
        "collection_name": collection_name,
        "doc_id": doc_id,
        "doc_filter": doc_filter,
        "lookup_path": None,
    }

    # A document delete carries no precondition of its own; the gated source
    # update in the same batch guards it against staleness.
    if update.get("op") == "deleteDocument":
        plan["delete_document"] = True
        return plan

    plan["delete_document"] = False

    lookup_path = update.get("lookupPath")
    if not isinstance(lookup_path, str) or not lookup_path:
        raise HTTPException(
            status_code=400, detail="Update is missing 'lookupPath'"
        )

    if "previousValue" not in update or "newValue" not in update:
        raise HTTPException(
            status_code=400,
            detail="Update must include 'previousValue' and 'newValue'",
        )
    old = update["previousValue"]
    new = update["newValue"]

    label_id = update.get("labelId")
    if label_id is not None:
        label_oid = _object_id(label_id)
        filter_doc, update_doc = _build_label_update(
            lookup_path,
            label_oid,
            old,
            new,
            array=True,
            doc_filter=doc_filter,
        )
        applied_filter = _build_label_applied_filter(
            lookup_path, label_oid, new, array=True, doc_filter=doc_filter
        )
    elif _is_label(new) or _is_label(old):
        filter_doc, update_doc = _build_label_update(
            lookup_path,
            None,
            old,
            new,
            array=False,
            doc_filter=doc_filter,
        )
        applied_filter = _build_label_applied_filter(
            lookup_path, None, new, array=False, doc_filter=doc_filter
        )
    else:
        filter_doc, update_doc = _build_primitive_update(
            lookup_path, old, new, doc_filter=doc_filter
        )
        applied_filter = _build_primitive_applied_filter(
            lookup_path, new, doc_filter=doc_filter
        )

    plan["filter"] = filter_doc
    plan["update"] = update_doc
    plan["lookup_path"] = lookup_path
    plan["applied_filter"] = applied_filter
    return plan


def _current_document(plan: dict) -> Any:
    """The current state of the field this plan gated on (``None`` if the
    document is gone), projected so the client can rebase without pulling the
    entire — often large — document."""
    lookup_path = plan.get("lookup_path")
    if not lookup_path:
        return plan["collection"].find_one(plan["doc_filter"])
    top_field = lookup_path.split(".", 1)[0]
    return plan["collection"].find_one(
        plan["doc_filter"], {top_field: 1, "last_modified_at": 1}
    )


def _is_generated_collection(name: str) -> bool:
    return name.startswith(_GENERATED_PREFIXES)


def _plan_op(plan: dict):
    if plan["delete_document"]:
        return DeleteOne(plan["doc_filter"])
    return UpdateOne(plan["filter"], plan["update"])


def _is_generated_target(update: Any) -> bool:
    """Whether an update addresses a generated (patches/clips) dataset,
    judged from the payload alone — answerable even when planning failed."""
    return (
        isinstance(update, dict)
        and not update.get("collection")
        and bool(update.get("datasetName"))
    )


def _apply_plans_bulk(
    indexed_plans: List[Tuple[int, dict]],
    best_effort: bool = False,
) -> List[Tuple[int, dict]]:
    """Applies plans with one unordered ``bulk_write`` per target collection
    — the only write pass; no update is ever issued twice.

    A gated miss is not a write error, so the bulk result only exposes the
    aggregate matched count per collection. A short count returns that
    group's gated updates for read-only diagnosis; deletes carry no gate and
    are never implicated.

    Args:
        indexed_plans: ``(index, plan)`` pairs to apply
        best_effort: swallow database write errors (generated targets must
            never fail the request)

    Returns:
        the ``(index, plan)`` pairs whose application is unconfirmed
    """
    groups: Dict[str, List[Tuple[int, dict]]] = {}
    for index, plan in indexed_plans:
        groups.setdefault(plan["collection_name"], []).append((index, plan))

    suspect: List[Tuple[int, dict]] = []
    for items in groups.values():
        gated = [(i, p) for i, p in items if not p["delete_document"]]
        collection = items[0][1]["collection"]
        try:
            result = collection.bulk_write(
                [_plan_op(plan) for _, plan in items], ordered=False
            )
        except PyMongoError:
            if not best_effort:
                raise
            logger.warning(
                "Best-effort bulk write failed; %d update(s) skipped",
                len(items),
                exc_info=True,
            )
            suspect.extend(gated)
            continue
        if result.matched_count < len(gated):
            suspect.extend(gated)
    return suspect


def _already_applied(plan: dict) -> bool:
    """Whether the document already holds this plan's post-state — an
    idempotent retry (e.g. a committed write whose response was lost) is a
    success, not a conflict."""
    applied_filter = plan.get("applied_filter")
    if applied_filter is None:
        return False
    return plan["collection"].find_one(applied_filter, {"_id": 1}) is not None


class SampleFields(HTTPEndpoint):
    """Applies a batch of gated annotation field updates.

    Permanent (source) writes are authoritative: applied independently, their
    gate misses conflict (409) and their errors are the only ones returned to
    the client. Updates targeting a generated (patches/clips) dataset are
    best-effort end to end — the view is ephemeral and regenerates from the
    source.
    """

    @decorators.route
    async def patch(self, request: Request, data: Any) -> JSONResponse:
        """Applies a batch of gated field updates.

        Args:
            request: Starlette request; ``dataset_id`` in the path bounds which
                collections the batch may touch
            data: a list of updates, or ``{"updates": [...]}``

        Returns:
            ``200 {"updated": n}`` if every *permanent* write was applied (or
            already held); otherwise ``409 {"conflicts": [{"index", "value"},
            ...]}`` listing only the rejected updates, where ``value`` is the
            conflicting document's current state (projected to the gated
            field) so the client can rebase those deltas and retry. Updates
            not listed in ``conflicts`` were applied.
        """
        updates = data.get("updates") if isinstance(data, dict) else data
        if not isinstance(updates, list):
            raise HTTPException(
                status_code=400, detail="Expected a list of updates"
            )

        db = get_db_conn()
        allowed = _allowed_collections(request.path_params)

        # A generated target that can't be planned (e.g. its dataset was
        # deleted) is skipped rather than failing the request — otherwise the
        # authoritative source write in the same batch would be lost with it.
        permanent: List[Tuple[int, dict]] = []
        generated: List[Tuple[int, dict]] = []
        for index, update in enumerate(updates):
            try:
                plan = _plan_update(db, update, allowed)
            except HTTPException as err:
                if _is_generated_target(update):
                    logger.info(
                        "Skipping generated-view update %d (cannot plan): %s",
                        index,
                        err.detail,
                    )
                    continue
                raise
            if _is_generated_collection(plan["collection_name"]):
                generated.append((index, plan))
            else:
                permanent.append((index, plan))

        conflicts = []
        for index, plan in _apply_plans_bulk(permanent):
            # Read-only diagnosis. An update that applied but was changed
            # again by a concurrent writer before this read lands as a
            # conflict too — reconciled identically by the client.
            if _already_applied(plan):
                logger.info(
                    "Annotation update applied/held (confirmed by read): "
                    "collection=%s id=%s lookupPath=%s",
                    plan["collection_name"],
                    plan["doc_id"],
                    plan["lookup_path"],
                )
                continue

            logger.warning(
                "Annotation save REJECTED (precondition mismatch): "
                "collection=%s id=%s lookupPath=%s",
                plan["collection_name"],
                plan["doc_id"],
                plan["lookup_path"],
            )
            conflicts.append(
                {"index": index, "value": _current_document(plan)}
            )

        # Runs even when some permanent writes conflicted — the applied ones
        # still want their generated view in sync.
        unconfirmed = _apply_plans_bulk(generated, best_effort=True)
        if unconfirmed:
            logger.info(
                "Generated-view sync unconfirmed for %d update(s) "
                "(precondition mismatch)",
                len(unconfirmed),
            )

        if conflicts:
            return JSONResponse({"conflicts": conflicts}, status_code=409)

        applied = len(permanent) + len(generated)
        logger.debug("Annotation batch applied: %d updates", applied)
        return JSONResponse({"updated": applied})


class CommitMask(HTTPEndpoint):
    """Commits an in-database mask back to its on-disk ``mask_path``.

    This route exists only because a gated field update cannot express a
    server-side *file* write; its database write is the same gated primitive
    as every other save, and no sample is ever loaded.
    """

    @decorators.route
    async def post(self, request: Request, data: dict) -> JSONResponse:
        """Write a Detection's in-database mask to its ``mask_path`` on disk.

        After a successful write the in-database mask is cleared and
        ``mask_path`` is preserved.

        Args:
            request: Starlette request with ``dataset_id`` and ``sample_id`` in
                path params
            data: ``{"field": "ground_truth", "detection_id": "abc123"}``

        Returns:
            ``{"committed": true, "mask_path": "..."}`` on success
        """
        dataset_id = request.path_params["dataset_id"]
        sample_id = request.path_params["sample_id"]

        field = data.get("field")
        detection_id = data.get("detection_id")
        if not field or not detection_id:
            raise HTTPException(
                status_code=400,
                detail="Both 'field' and 'detection_id' are required",
            )

        # An unparsable detection id reads as "not found" (404, after the
        # field checks) rather than 400, like any other unknown id.
        try:
            det_oid = ObjectId(detection_id)
        except Exception:  # pylint: disable=broad-except
            det_oid = ObjectId()

        lookup_path = f"{field}.detections"
        collection = get_db_conn()[f"samples.{dataset_id}"]

        # The matched element plus the field's _cls is enough to distinguish
        # every error case below without fetching the sample.
        doc = collection.find_one(
            {"_id": _object_id(sample_id)},
            {
                lookup_path: {"$elemMatch": {"_id": det_oid}},
                f"{field}._cls": 1,
            },
        )
        if doc is None:
            raise HTTPException(status_code=404, detail="Sample not found")

        missing = object()
        value: Any = doc
        for part in field.split("."):
            if not isinstance(value, dict) or part not in value:
                value = missing
                break
            value = value[part]

        if value is missing:
            raise HTTPException(
                status_code=404, detail=f"Field '{field}' not found on sample"
            )
        if value is None:
            raise HTTPException(
                status_code=404, detail=f"Field '{field}' is empty on sample"
            )
        if not isinstance(value, dict) or value.get("_cls") != "Detections":
            raise HTTPException(
                status_code=400,
                detail=f"Field '{field}' is not a Detections field",
            )

        detection = next(
            (
                d
                for d in value.get("detections") or []
                if isinstance(d, dict) and d.get("_id") == det_oid
            ),
            None,
        )
        if detection is None:
            raise HTTPException(
                status_code=404,
                detail=f"Detection '{detection_id}' not found in '{field}'",
            )

        mask_path = detection.get("mask_path")
        if mask_path is None:
            raise HTTPException(
                status_code=400,
                detail="Detection has no mask_path — nothing to commit",
            )

        mask_bytes = detection.get("mask")
        if mask_bytes is None:
            raise HTTPException(
                status_code=400,
                detail="Detection has no in-database mask to commit",
            )

        try:
            # pylint: disable-next=protected-access
            fol._write_mask(
                fou.deserialize_numpy_array(bytes(mask_bytes)), mask_path
            )
        except Exception as err:  # pylint: disable=broad-except
            logger.exception("Failed to commit mask to %s", mask_path)
            raise HTTPException(
                status_code=500,
                detail=f"Failed to write mask to '{mask_path}': {err}",
            ) from err

        # Gating the unset on the exact bytes just exported preserves a mask
        # repainted while the file was being written.
        result = collection.update_one(
            {
                "_id": _object_id(sample_id),
                lookup_path: {
                    "$elemMatch": {"_id": det_oid, "mask": mask_bytes}
                },
            },
            {
                "$unset": {f"{lookup_path}.$.mask": ""},
                "$set": {"last_modified_at": _now()},
            },
        )
        if result.matched_count == 0:
            logger.info(
                "Mask for detection %s changed during commit; in-database "
                "mask preserved",
                detection_id,
            )

        logger.info(
            "Committed mask for detection %s to %s", detection_id, mask_path
        )

        return JSONResponse({"committed": True, "mask_path": mask_path})


SampleRoutes = [
    ("/dataset/{dataset_id}/sample/{sample_id}/fields", SampleFields),
    (
        "/dataset/{dataset_id}/sample/{sample_id}/commit-mask",
        CommitMask,
    ),
]
