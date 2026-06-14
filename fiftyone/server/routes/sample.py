"""
FiftyOne Server sample endpoints.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|

Annotation saves are a batch of gated field updates applied directly to Mongo
(no sample is ever loaded), each carrying its target, the previous value to
gate on, and the new value to write. A failed precondition returns ``409``
with the document's current state so the client can reconcile.
"""

import datetime
import logging
from collections import defaultdict
from dataclasses import dataclass
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


# ---------------------------------------------------------------------------
# Value coercion and gating
# ---------------------------------------------------------------------------


def _now() -> datetime.datetime:
    # Naive UTC to match how fiftyone stamps ``last_modified_at``; a tz-aware
    # value breaks naive/aware comparisons in code that reads the field.
    return datetime.datetime.utcnow()


def _object_id(value: Any) -> ObjectId:
    # ``ObjectId(None)`` silently GENERATES a new id; reject it explicitly so
    # a missing id can never be coerced into a valid-looking filter.
    if value is None:
        raise HTTPException(status_code=400, detail="Invalid id 'None'")
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


def _scalar_gates(bson_doc: dict) -> Dict[str, Any]:
    return {
        field: _gate(value)
        for field, value in bson_doc.items()
        if field != "_id" and _gatable(value)
    }


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


# ---------------------------------------------------------------------------
# Gated write construction
# ---------------------------------------------------------------------------


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
        gates = _scalar_gates(old_bson)
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
        filter_doc = {
            **doc_filter,
            lookup_path: {"$elemMatch": {"_id": label_oid, **gates}},
        }
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


def _build_write(
    lookup_path: str,
    label_oid: Optional[ObjectId],
    old: Any,
    new: Any,
    doc_filter: Dict[str, Any],
) -> Tuple[Dict[str, Any], Dict[str, Any], Optional[Dict[str, Any]]]:
    """(filter, update, applied_filter) for one gated field write — a label
    list element, a flat label, or a primitive."""
    if label_oid is not None:
        filter_doc, update_doc = _build_label_update(
            lookup_path, label_oid, old, new, array=True, doc_filter=doc_filter
        )
        applied_filter = _build_label_applied_filter(
            lookup_path, label_oid, new, array=True, doc_filter=doc_filter
        )
    elif _is_label(new) or _is_label(old):
        filter_doc, update_doc = _build_label_update(
            lookup_path, None, old, new, array=False, doc_filter=doc_filter
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

    return filter_doc, update_doc, applied_filter


# ---------------------------------------------------------------------------
# Planning and application
# ---------------------------------------------------------------------------


@dataclass
class _UpdatePlan:
    """One gated write, planned against its target collection."""

    collection: Any
    collection_name: str
    doc_id: str
    doc_filter: Dict[str, Any]
    lookup_path: Optional[str] = None
    filter_doc: Optional[Dict[str, Any]] = None
    update_doc: Optional[Dict[str, Any]] = None
    applied_filter: Optional[Dict[str, Any]] = None
    delete_document: bool = False
    # (path, bytes) of an edited mask destined for disk rather than the
    # document — masks live on disk or in the database, never both
    mask_write: Optional[Tuple[str, Any]] = None

    def to_bulk_op(self):
        if self.delete_document:
            return DeleteOne(self.doc_filter)
        return UpdateOne(self.filter_doc, self.update_doc)

    def already_holds(self) -> bool:
        """Whether the post-state already holds — an idempotent retry (e.g. a
        committed write whose response was lost) is success, not a conflict."""
        if self.applied_filter is None:
            return False
        return (
            self.collection.find_one(self.applied_filter, {"_id": 1})
            is not None
        )

    def current_document(self) -> Any:
        """The full conflicting document (``None`` if it is gone), so the
        client can reconcile every concurrent edit in one round trip."""
        return self.collection.find_one(self.doc_filter)


# Label-list container types; a generated field of any other label type is a
# flattened single label (the document IS the label)
_LIST_LABEL_TYPES = frozenset(
    f"{cls.__module__}.{cls.__name__}"
    # pylint: disable-next=protected-access
    for cls in fol._LABEL_LIST_FIELDS
)

# Mirrors ``Dataset._is_generated`` (fiftyone/core/dataset.py), the canonical
# markers of ephemeral generated datasets — properties cannot be imported
# without loading a dataset
_GENERATED_COLLECTION_PREFIXES = ("patches.", "frames.", "clips.")


def _is_generated_collection(name: str) -> bool:
    return name.startswith(_GENERATED_COLLECTION_PREFIXES)


def _required(update: dict, key: str) -> Any:
    value = update.get(key)
    if value is None:
        raise HTTPException(
            status_code=400, detail=f"Update is missing '{key}'"
        )
    return value


def _allowed_collections(db, path_params: dict) -> set:
    """The route dataset's collections (samples + frames), resolved from its
    dataset document. Resolving (rather than constructing names from the id)
    keeps one naming authority and works for any dataset, including a
    generated dataset loaded directly."""
    dataset_id = path_params.get("dataset_id")
    doc = db["datasets"].find_one(
        {"_id": _object_id(dataset_id)},
        {"sample_collection_name": 1, "frame_collection_name": 1},
    )
    if not doc or not doc.get("sample_collection_name"):
        raise HTTPException(
            status_code=404, detail=f"Dataset '{dataset_id}' not found"
        )
    return {
        name
        for name in (
            doc.get("sample_collection_name"),
            doc.get("frame_collection_name"),
        )
        if name
    }


def _extract_mask_write(new: Any) -> Tuple[Any, Optional[Tuple[str, Any]]]:
    """Splits an edited ``mask`` destined for disk out of a new label value.

    A mask lives on disk or in the database, never both: when the detection
    has a ``mask_path``, its edited bytes are written to that file and
    stripped from the document write.
    """
    if not (
        _is_label(new)
        and new.get("mask") is not None
        and isinstance(new.get("mask_path"), str)
        and new["mask_path"]
    ):
        return new, None

    stripped = {key: value for key, value in new.items() if key != "mask"}
    return stripped, (new["mask_path"], new["mask"])


def _write_mask_file(path: str, mask: Any) -> None:
    try:
        if isinstance(mask, str):
            array = fou.deserialize_numpy_array(mask, ascii=True)
        else:
            array = fou.deserialize_numpy_array(bytes(mask))
        # pylint: disable-next=protected-access
        fol._write_mask(array, path)
    except Exception as err:  # pylint: disable=broad-except
        logger.exception("Failed to write mask to %s", path)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to write mask to '{path}': {err}",
        ) from err


def _plan_update(db, update: dict, allowed: set) -> _UpdatePlan:
    """Validates one update and plans its gated write (no writes).

    Raises:
        HTTPException: the payload is malformed or its ``collection`` is not
            one of the route dataset's own (writes are bound to the route)
    """
    if not isinstance(update, dict):
        raise HTTPException(
            status_code=400, detail="Each update must be an object"
        )

    collection_name = str(_required(update, "collection"))
    # A body must not be able to redirect a write to another dataset.
    # Generated (patches) collections are never client-addressable; their
    # writes are derived in :func:`_plan_generated_sync`.
    if collection_name not in allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Update targets disallowed collection '{collection_name}'",
        )

    doc_id = _required(update, "id")
    lookup_path = str(_required(update, "lookupPath"))
    if "previousValue" not in update or "newValue" not in update:
        raise HTTPException(
            status_code=400,
            detail="Update must include 'previousValue' and 'newValue'",
        )

    label_id = update.get("labelId")
    new, mask_write = _extract_mask_write(update["newValue"])
    doc_filter = {"_id": _object_id(doc_id)}
    filter_doc, update_doc, applied_filter = _build_write(
        lookup_path,
        _object_id(label_id) if label_id is not None else None,
        update["previousValue"],
        new,
        doc_filter,
    )
    return _UpdatePlan(
        collection=db[collection_name],
        collection_name=collection_name,
        doc_id=str(doc_id),
        doc_filter=doc_filter,
        lookup_path=lookup_path,
        filter_doc=filter_doc,
        update_doc=update_doc,
        applied_filter=applied_filter,
        mask_write=mask_write,
    )


def _plan_generated_sync(
    db, update: dict, lookup_path: str
) -> List[_UpdatePlan]:
    """Plans the best-effort sync of the generated (patches/clips) copy for a
    source-addressed update carrying ``generatedDatasetName``/
    ``generatedSampleId`` hints.

    Generated datasets are a server-side concept: the client sends one update
    per edit and the server keeps the ephemeral view in sync. The generated
    field's shape — flat label (``to_patches``) vs label list (evaluation
    patches) — comes from the generated dataset's schema, read in the same
    lookup that resolves its collection.

    Best-effort end to end: any failure (unknown dataset, invalid ids, a hint
    resolving to a non-generated collection) skips the sync, never the
    request.
    """
    name = update.get("generatedDatasetName")
    if not isinstance(name, str) or not name:
        return []

    # Malformed payloads fail loudly at planning time (nothing has been
    # written yet); only world-state conditions below are best-effort.
    gen_oid = _object_id(update.get("generatedSampleId"))

    dataset = db["datasets"].find_one(
        {"name": name}, {"sample_collection_name": 1, "sample_fields": 1}
    )
    collection_name = (dataset or {}).get("sample_collection_name")
    if not collection_name:
        logger.info(
            "Generated-view sync skipped (dataset '%s' not found)", name
        )
        return []
    # A hint must never redirect a write to a permanent collection.
    if not _is_generated_collection(collection_name):
        logger.warning(
            "Generated-view sync skipped (collection '%s' is not generated)",
            collection_name,
        )
        return []

    old = update["previousValue"]
    # The generated copy never stores a disk-destined mask either; the file
    # write happens exactly once, via the source plan.
    new, _ = _extract_mask_write(update["newValue"])
    label_id = update.get("labelId")
    doc_filter = {"_id": gen_oid}
    plan = _UpdatePlan(
        collection=db[collection_name],
        collection_name=collection_name,
        doc_id=str(gen_oid),
        doc_filter=doc_filter,
        lookup_path=lookup_path,
    )

    # Flat label / primitive field: the generated copy has the same shape.
    if label_id is None:
        plan.filter_doc, plan.update_doc, _ = _build_write(
            lookup_path, None, old, new, doc_filter
        )
        return [plan]

    # Generated datasets flatten field paths to the base field name.
    label_oid = _object_id(label_id)
    gen_field = lookup_path.split(".")[0]
    embedded_type = next(
        (
            f.get("embedded_doc_type")
            for f in (dataset.get("sample_fields") or [])
            if f.get("name") == gen_field
        ),
        None,
    )

    if embedded_type in _LIST_LABEL_TYPES:
        # Label list (evaluation patches): mirror the source update.
        plan.lookup_path = f"{gen_field}.{lookup_path.rsplit('.', 1)[-1]}"
        plan.filter_doc, plan.update_doc = _build_label_update(
            plan.lookup_path,
            label_oid,
            old,
            new,
            array=True,
            doc_filter=doc_filter,
        )
        return [plan]

    if new is None:
        # The flat (to_patches) document IS the label: deleting the label
        # deletes the document, gated on identity.
        plan.delete_document = True
        plan.doc_filter = {**doc_filter, f"{gen_field}._id": label_oid}
        return [plan]

    plan.lookup_path = gen_field
    plan.filter_doc, plan.update_doc = _build_label_update(
        gen_field, None, old, new, array=False, doc_filter=doc_filter
    )
    return [plan]


def _apply_bulk(
    indexed_plans: List[Tuple[int, _UpdatePlan]],
    best_effort: bool = False,
) -> List[Tuple[int, _UpdatePlan]]:
    """Applies plans with one unordered ``bulk_write`` per target collection
    — the only write pass; no update is ever issued twice.

    A gated miss is not a write error, so the bulk result only exposes the
    aggregate matched count per collection. A short count returns that
    group's gated plans for read-only diagnosis; document deletes carry no
    gate and are never implicated.

    Args:
        indexed_plans: ``(index, plan)`` pairs to apply
        best_effort: swallow database write errors (generated-view syncs must
            never fail the request)

    Returns:
        the ``(index, plan)`` pairs whose application is unconfirmed
    """
    groups: Dict[str, List[Tuple[int, _UpdatePlan]]] = defaultdict(list)
    for index, plan in indexed_plans:
        groups[plan.collection_name].append((index, plan))

    unconfirmed: List[Tuple[int, _UpdatePlan]] = []
    for items in groups.values():
        gated = [(i, p) for i, p in items if not p.delete_document]
        try:
            result = items[0][1].collection.bulk_write(
                [plan.to_bulk_op() for _, plan in items], ordered=False
            )
        except PyMongoError:
            if not best_effort:
                raise
            logger.warning(
                "Best-effort bulk write failed; %d update(s) skipped",
                len(items),
                exc_info=True,
            )
            continue
        if result.matched_count < len(gated):
            unconfirmed.extend(gated)
    return unconfirmed


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


class SampleFields(HTTPEndpoint):
    """Applies a batch of gated annotation field updates.

    Every update addresses the permanent source sample, whose writes are
    authoritative: applied independently, their gate misses conflict (409)
    and their errors are the only ones returned to the client. Generated
    (patches/clips) copies are synced server-side from each update's hints,
    best-effort end to end — the view is ephemeral and regenerates from the
    source.
    """

    @decorators.route
    async def patch(self, request: Request, data: Any) -> JSONResponse:
        """Applies a batch of gated field updates.

        Args:
            request: Starlette request; ``dataset_id`` in the path bounds
                which collections the batch may touch
            data: a list of updates, or ``{"updates": [...]}``

        Returns:
            ``200 {"updated": n}`` if every source write was applied (or
            already held); otherwise ``409 {"conflicts": [{"index", "value"},
            ...]}`` listing only the rejected updates, where ``value`` is the
            conflicting document's full current state so the client can
            rebase those deltas and retry. Updates not listed in
            ``conflicts`` were applied.
        """
        updates = data.get("updates") if isinstance(data, dict) else data
        if not isinstance(updates, list):
            raise HTTPException(
                status_code=400, detail="Expected a list of updates"
            )

        db = get_db_conn()
        allowed = _allowed_collections(db, request.path_params)

        logger.debug(
            "Applying %d field update(s) to sample %s",
            len(updates),
            request.path_params.get("sample_id"),
        )

        source: List[Tuple[int, _UpdatePlan]] = []
        generated: List[Tuple[int, _UpdatePlan]] = []
        for index, update in enumerate(updates):
            plan = _plan_update(db, update, allowed)
            source.append((index, plan))
            for sync in _plan_generated_sync(db, update, plan.lookup_path):
                generated.append((index, sync))

        # Masks destined for disk are written before any database write — a
        # failure aborts the request while nothing has been applied.
        for _index, plan in source:
            if plan.mask_write is not None:
                _write_mask_file(*plan.mask_write)

        conflicts = []
        for index, plan in _apply_bulk(source):
            # Read-only diagnosis: the update either applied in the bulk
            # pass / already held (lost-response retry), or missed its gate.
            # An update changed *again* by a concurrent writer before this
            # read lands as a conflict too and reconciles identically.
            if plan.already_holds():
                logger.info(
                    "Annotation update applied/held (confirmed by read): "
                    "collection=%s id=%s lookupPath=%s",
                    plan.collection_name,
                    plan.doc_id,
                    plan.lookup_path,
                )
                continue

            logger.warning(
                "Annotation save REJECTED (precondition mismatch): "
                "collection=%s id=%s lookupPath=%s",
                plan.collection_name,
                plan.doc_id,
                plan.lookup_path,
            )
            conflicts.append(
                {"index": index, "value": plan.current_document()}
            )

        # Runs even when some source writes conflicted — the applied ones
        # still want their generated copies in sync.
        unconfirmed = _apply_bulk(generated, best_effort=True)
        if unconfirmed:
            logger.info(
                "Generated-view sync unconfirmed for %d update(s) "
                "(precondition mismatch)",
                len(unconfirmed),
            )

        if conflicts:
            logger.info(
                "Annotation save for sample %s: %d of %d update(s) conflicted",
                request.path_params.get("sample_id"),
                len(conflicts),
                len(source),
            )
            return JSONResponse({"conflicts": conflicts}, status_code=409)

        logger.info(
            "Annotation save for sample %s: %d update(s) applied",
            request.path_params.get("sample_id"),
            len(source),
        )
        return JSONResponse({"updated": len(source)})


SampleRoutes = [
    ("/dataset/{dataset_id}/sample/{sample_id}/fields", SampleFields),
]
