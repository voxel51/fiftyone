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

  * Writes to a generated (patches/clips) collection are **best-effort**: it is
    an ephemeral view that regenerates from the source, so a stale write there
    is skipped rather than failing the request. The permanent source write is
    authoritative.
  * Multiple permanent writes in one batch are prevalidated so a stale one
    can't half-apply — FiftyOne's MongoDB may be standalone, so transactions
    are not assumed.
  * :class:`CommitMask` is deliberately separate: it is the only path that
    loads a sample and calls ``sample.save()``, for a server-side file write
    the gated path can't express.
"""

import datetime
import logging
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId
from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request

from fiftyone.core.odm.database import get_db_conn
from fiftyone.server import decorators, utils
from fiftyone.server.utils.datasets import (
    get_dataset,
    get_sample_from_dataset,
)
from fiftyone.server.utils.json.encoder import JSONResponse

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Gated field-update save path
# ---------------------------------------------------------------------------


def _now() -> datetime.datetime:
    # Naive UTC, matching how fiftyone stamps ``last_modified_at`` everywhere
    # (``datetime.utcnow``). A tz-aware value would read back inconsistently and
    # break naive/aware datetime comparisons in code that reads the field.
    return datetime.datetime.utcnow()


def _object_id(value: Any) -> ObjectId:
    """Coerces a hex string (or an already-decoded ObjectId) to an ObjectId."""
    try:
        return ObjectId(value)
    except Exception as err:  # pylint: disable=broad-except
        raise HTTPException(
            status_code=400, detail=f"Invalid id '{value}'"
        ) from err


def _is_label(value: Any) -> bool:
    """A value is a label iff it is an embedded document carrying ``_cls``."""
    return isinstance(value, dict) and "_cls" in value


def _label_to_mongo(value: dict) -> dict:
    """Coerces a label dict to its stored BSON form, with no DB access.

    Round-trips through the label class so masks (base64 -> ``Binary``),
    datetimes, ObjectIds, etc. are stored exactly as fiftyone would persist
    them. Pure CPU — never touches the database.
    """
    try:
        return utils.json.deserialize(value).to_mongo()
    except Exception as err:  # pylint: disable=broad-except
        raise HTTPException(
            status_code=400, detail=f"Could not deserialize label: {err}"
        ) from err


def _gatable(value: Any) -> bool:
    """Whether ``value`` is safe to use as an equality precondition.

    Scalars (and arrays of scalars) match reliably by value regardless of field
    order. Embedded documents are order-sensitive and binary blobs (mask data)
    may not re-serialize byte-for-byte, so for those we gate on element/document
    identity only.
    """
    if value is None:
        return True
    if isinstance(value, (dict, bytes, bytearray)):
        return False
    if isinstance(value, (list, tuple)):
        return all(_gatable(v) for v in value)
    return True


def _gate(value: Any) -> Any:
    # ``None`` means the field was absent or null in the document.
    return {"$in": [None]} if value is None else value


def _changed_label_fields(
    old_bson: dict, new_bson: dict
) -> Tuple[Dict[str, Any], List[str]]:
    """Returns ``(set_fields, unset_fields)`` for a label modification.

    ``set_fields`` maps a changed field name to its new (coerced) value;
    ``unset_fields`` lists fields removed entirely. ``_id`` is never touched.
    """
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

    ``array`` selects between a label inside a list field (matched by
    ``$elemMatch`` + positional ``$``) and a flattened single label (matched
    directly by path).
    """
    now = _now()

    # ---- remove ----
    if new is None:
        # Gate the delete on the label still holding the scalar values the
        # editor saw, so a stale delete can't erase a label another editor just
        # changed (it returns 409 and the client reconciles instead).
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
            # Bind to the label's identity so a replacement document with the
            # same scalar values but a new _id isn't mistaken for ours.
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

    # ---- add ----
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
            # Only create when the field is still absent/null, so a stale
            # create can't clobber a value another editor inserted.
            filter_doc = {**doc_filter, lookup_path: {"$in": [None]}}
            update_doc = {
                "$set": {lookup_path: new_bson, "last_modified_at": now}
            }
        return filter_doc, update_doc

    # ---- modify the fields that changed ----
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
        # Bind to the label's identity (see remove branch).
        if "_id" in old_bson:
            filter_doc[f"{lookup_path}._id"] = old_bson["_id"]
        filter_doc.update({f"{lookup_path}.{f}": v for f, v in gates.items()})

    set_doc = {f"{prefix}{f}": v for f, v in set_fields.items()}
    set_doc["last_modified_at"] = now
    update_doc: Dict[str, Any] = {"$set": set_doc}
    if unset_fields:
        update_doc["$unset"] = {f"{prefix}{f}": "" for f in unset_fields}

    return filter_doc, update_doc


def _build_primitive_update(
    field_path: str,
    old: Any,
    new: Any,
    *,
    doc_filter: Dict[str, Any],
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Builds the (filter, update) for a primitive (non-label) field."""
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

    The common path carries a concrete ``collection`` (e.g.
    ``samples.<datasetId>``) so no lookup is needed. A generated (patches)
    write may instead carry the generated dataset's ``datasetName``; we resolve
    its sample collection from the ``datasets`` collection by name (one indexed
    lookup) since the dataset ``_id`` is not available client-side.
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


# Collections produced by generated views (patches/clips/frame-patches). A
# request may target one in addition to the route dataset's own collections.
_GENERATED_PREFIXES = ("patches.", "clips.")


def _allowed_collections(path_params: dict) -> set:
    """The route dataset's own collections, derived from ``dataset_id`` alone.

    Their names are deterministic, so this needs no database lookup. Generated
    (patches) collections are allowed separately in :func:`_plan_update`.
    """
    dataset_id = path_params.get("dataset_id")
    if not dataset_id:
        raise HTTPException(status_code=400, detail="Missing dataset id")
    return {f"samples.{dataset_id}", f"frames.{dataset_id}"}


def _plan_update(db, update: dict, allowed: set) -> dict:
    """Resolves and builds one update *without writing*.

    Returns a plan dict carrying the target ``collection`` handle, its
    ``collection_name``, the ``doc_id``/``doc_filter``, and either
    ``delete_document`` or a built (``filter``, ``update``) pair.

    Raises:
        HTTPException: the payload is malformed or its target collection is
            outside ``allowed`` (bound to the route's dataset)
    """
    if not isinstance(update, dict):
        raise HTTPException(
            status_code=400, detail="Each update must be an object"
        )

    collection_name = _resolve_collection(db, update)
    # Bind writes to the route's dataset so a body can't redirect one elsewhere:
    # an explicit collection must be the route's own; a datasetName target must
    # resolve to a generated collection.
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

    # Whole-document delete (a patches sample whose label was deleted). No
    # precondition of its own — the gated source update in the same batch
    # guards it against a stale delete.
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
        filter_doc, update_doc = _build_label_update(
            lookup_path,
            _object_id(label_id),
            old,
            new,
            array=True,
            doc_filter=doc_filter,
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
    else:
        filter_doc, update_doc = _build_primitive_update(
            lookup_path, old, new, doc_filter=doc_filter
        )

    plan["filter"] = filter_doc
    plan["update"] = update_doc
    plan["lookup_path"] = lookup_path
    return plan


def _current_document(plan: dict) -> Any:
    """The plan document's full current state (``None`` if it no longer exists),
    returned to the client so it can reconcile every concurrently-changed
    field — not just the one it tried to write."""
    return plan["collection"].find_one(plan["doc_filter"])


def _is_generated_collection(name: str) -> bool:
    return name.startswith(_GENERATED_PREFIXES)


def _apply_plan(plan: dict) -> bool:
    """Applies one plan; returns whether it matched (a delete always does)."""
    if plan["delete_document"]:
        plan["collection"].delete_one(plan["doc_filter"])
        return True
    result = plan["collection"].update_one(plan["filter"], plan["update"])
    return result.matched_count > 0


class SampleFields(HTTPEndpoint):
    """Applies a batch of gated annotation field updates.

    The permanent source collection is authoritative — its gated writes are
    what can conflict (409). Writes to a generated (patches/clips) collection are
    best-effort: it is an ephemeral view that regenerates from the source, so a
    stale write is skipped rather than failing the request. Several permanent
    writes in one batch are prevalidated so a stale one can't half-apply
    (FiftyOne's MongoDB may be standalone — no transactions assumed).
    """

    @decorators.route
    async def patch(self, request: Request, data: Any) -> JSONResponse:
        """Applies a batch of gated field updates.

        Args:
            request: Starlette request; ``dataset_id`` in the path bounds which
                collections the batch may touch
            data: a list of updates, or ``{"updates": [...]}``

        Returns:
            ``200 {"updated": n}`` if every *permanent* write matched; otherwise
            ``409 {"conflicts": [{"index", "value"}, ...]}`` where ``value`` is
            the full current state of the conflicting document, so the client
            can reconcile every concurrently-changed field and retry.
        """
        updates = data.get("updates") if isinstance(data, dict) else data
        if not isinstance(updates, list):
            raise HTTPException(
                status_code=400, detail="Expected a list of updates"
            )

        db = get_db_conn()
        allowed = _allowed_collections(request.path_params)

        # Build every update (validates payload + target); no writes yet.
        plans = [_plan_update(db, update, allowed) for update in updates]

        permanent = [
            (i, p)
            for i, p in enumerate(plans)
            if not _is_generated_collection(p["collection_name"])
        ]
        generated = [
            (i, p)
            for i, p in enumerate(plans)
            if _is_generated_collection(p["collection_name"])
        ]

        # Several permanent writes (a multi-label edit) are prevalidated so a
        # stale one can't half-apply; a lone write is atomic and skips the read.
        if len(permanent) > 1:
            stale = [
                {"index": i, "value": _current_document(p)}
                for i, p in permanent
                if not p["delete_document"]
                and p["collection"].find_one(p["filter"], {"_id": 1}) is None
            ]
            if stale:
                logger.warning(
                    "Annotation batch REJECTED (precondition mismatch): "
                    "%d of %d permanent writes conflicted",
                    len(stale),
                    len(permanent),
                )
                return JSONResponse({"conflicts": stale}, status_code=409)

        # Permanent writes are authoritative — a stale gate is a real conflict.
        conflicts = []
        for index, plan in permanent:
            if not _apply_plan(plan):
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

        if conflicts:
            # Authoritative edit rejected — skip the now-pointless generated sync.
            return JSONResponse({"conflicts": conflicts}, status_code=409)

        # Best-effort: a stale generated-view write is skipped, never failed.
        for _index, plan in generated:
            if not _apply_plan(plan):
                logger.info(
                    "Generated-view sync skipped (precondition mismatch): "
                    "collection=%s id=%s",
                    plan["collection_name"],
                    plan["doc_id"],
                )

        logger.debug("Annotation batch applied: %d updates", len(plans))
        return JSONResponse({"updated": len(plans)})


class CommitMask(HTTPEndpoint):
    """Commits an in-database mask back to its on-disk ``mask_path``.

    This is the one route that loads a sample and calls ``sample.save()`` — it
    performs a server-side file write that the gated field-update path cannot
    express. It is intentionally kept separate from that path.
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

        dataset = get_dataset(dataset_id)
        sample = get_sample_from_dataset(dataset, sample_id)

        try:
            label_field = sample[field]
        except KeyError as err:
            raise HTTPException(
                status_code=404, detail=f"Field '{field}' not found on sample"
            ) from err

        if label_field is None:
            raise HTTPException(
                status_code=404, detail=f"Field '{field}' is empty on sample"
            )

        detections = getattr(label_field, "detections", None)
        if detections is None:
            raise HTTPException(
                status_code=400,
                detail=f"Field '{field}' is not a Detections field",
            )

        detection = next(
            (d for d in detections if str(d.id) == detection_id), None
        )
        if detection is None:
            raise HTTPException(
                status_code=404,
                detail=f"Detection '{detection_id}' not found in '{field}'",
            )

        if detection.mask_path is None:
            raise HTTPException(
                status_code=400,
                detail="Detection has no mask_path — nothing to commit",
            )

        if detection.mask is None:
            raise HTTPException(
                status_code=400,
                detail="Detection has no in-database mask to commit",
            )

        mask_path = detection.mask_path

        try:
            detection.export_mask(mask_path, update=True, overwrite_path=True)
            sample.save()
        except Exception as err:
            logger.exception("Failed to commit mask to %s", mask_path)
            raise HTTPException(
                status_code=500,
                detail=f"Failed to write mask to '{mask_path}': {err}",
            ) from err

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
