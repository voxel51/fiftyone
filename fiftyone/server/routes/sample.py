"""
FiftyOne Server sample endpoints.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|

Annotation saves go through a single mechanism: a batch of **gated field
updates**. Each update names its target ``collection`` (e.g.
``samples.<dataset._id>``), the document ``id``, a ``lookupPath`` (and
``labelId`` for a label inside a list field), the value the editor started from
(``previousValue``), and the value to write (``newValue``).

The backend performs a direct, atomic ``update_one`` on the named collection:

  * it matches the document/element by identity,
  * it gates on the *scalar fields that actually changed* still holding their
    previous values, and
  * it ``$set``/``$unset``/``$push``/``$pull``s only what changed.

Because the write gates on (and only touches) the changed fields, concurrent
edits to other fields, other labels, or other samples never collide and are
never silently overwritten — a real conflict returns ``409`` and the client
refetches. No dataset or sample is loaded or resolved on this path.

A patches-view edit is still a single client request: its batch simply carries
two updates (the source collection and the materialized patches collection).

The only place that loads a sample and calls ``sample.save()`` is
:class:`CommitMask`, which performs a server-side file write the gated path
cannot express; it is intentionally a separate route.
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
    return datetime.datetime.now(datetime.timezone.utc)


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
        if array:
            filter_doc = {**doc_filter, f"{lookup_path}._id": label_oid}
            update_doc = {
                "$pull": {lookup_path: {"_id": label_oid}},
                "$set": {"last_modified_at": now},
            }
        else:
            filter_doc = dict(doc_filter)
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
            filter_doc = dict(doc_filter)
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
        filter_doc = {
            **doc_filter,
            **{f"{lookup_path}.{f}": v for f, v in gates.items()},
        }

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


def apply_field_update(db, update: dict) -> Tuple[bool, Any]:
    """Applies one gated field update.

    Returns ``(matched, value)``. On success ``matched`` is ``True`` and
    ``value`` is ``None``. On a precondition mismatch ``matched`` is ``False``
    and ``value`` is the *current* value of the touched top-level field, so the
    client can reconcile just that field (no full-sample refetch needed).

    Raises:
        HTTPException: the update payload is malformed
    """
    if not isinstance(update, dict):
        raise HTTPException(
            status_code=400, detail="Each update must be an object"
        )

    collection_name = _resolve_collection(db, update)
    collection = db[collection_name]

    doc_id = update.get("id")
    if doc_id is None:
        raise HTTPException(status_code=400, detail="Update is missing 'id'")
    doc_filter = {"_id": _object_id(doc_id)}

    # Whole-document deletion (e.g. a patches sample whose label was deleted).
    if update.get("op") == "deleteDocument":
        collection.delete_one(doc_filter)
        return True, None

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

    result = collection.update_one(filter_doc, update_doc)
    if result.matched_count == 0:
        # Reconcile by returning the current value of the touched top-level
        # field — a targeted projection read, only on the (rare) conflict path.
        top_field = lookup_path.split(".", 1)[0]
        current = collection.find_one(doc_filter, {top_field: 1})
        value = current.get(top_field) if current else None
        logger.warning(
            "Annotation save REJECTED (precondition mismatch): "
            "collection=%s id=%s lookupPath=%s",
            collection_name,
            doc_id,
            lookup_path,
        )
        return False, value

    logger.debug(
        "Annotation save applied: collection=%s id=%s lookupPath=%s",
        collection_name,
        doc_id,
        lookup_path,
    )
    return True, None


class SampleFields(HTTPEndpoint):
    """Applies a batch of gated annotation field updates.

    A single request may target multiple collections — each update names its
    own ``collection`` (or ``datasetName``) and ``id``. A patches-view edit, for
    example, sends two updates in one batch: the source label (in its list) and
    the materialized patches sample (flat).
    """

    @decorators.route
    async def patch(self, request: Request, data: Any) -> JSONResponse:
        """Applies a batch of gated field updates.

        Args:
            request: Starlette request (path params are contextual only; each
                update carries its own target collection/document)
            data: a list of updates, or ``{"updates": [...]}``

        Returns:
            ``200 {"updated": n}`` if every update matched; otherwise ``409
            {"conflicts": [{"index", "value"}, ...]}`` where ``value`` is the
            current value of the touched top-level field, so the client can
            reconcile just that field and retry.
        """
        updates = data.get("updates") if isinstance(data, dict) else data
        if not isinstance(updates, list):
            raise HTTPException(
                status_code=400, detail="Expected a list of updates"
            )

        db = get_db_conn()
        conflicts = []
        for index, update in enumerate(updates):
            matched, value = apply_field_update(db, update)
            if not matched:
                conflicts.append({"index": index, "value": value})

        if conflicts:
            return JSONResponse({"conflicts": conflicts}, status_code=409)

        return JSONResponse({"updated": len(updates)})


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
