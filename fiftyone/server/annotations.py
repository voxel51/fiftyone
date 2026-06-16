"""
Optimistic-concurrency MongoDB writes for annotation edits.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|

Each write is guarded by a precondition on the value the editor last saw, so a
stale or concurrent edit fails its gate rather than overwriting another's work.
"""

import datetime
import logging
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId
from starlette.exceptions import HTTPException

from fiftyone.core.odm import deserialize_value

logger = logging.getLogger(__name__)


def is_label(value: Any) -> bool:
    return isinstance(value, dict) and "_cls" in value


def _label_to_mongo(value: dict) -> dict:
    try:
        return deserialize_value(value).to_mongo()
    except Exception as err:  # pylint: disable=broad-except
        # Bad client label data is the usual cause (a 400), but the broad
        # catch could also mask an internal bug — surface it rather than
        # silently folding everything into a client error.
        logger.warning("Failed to deserialize label", exc_info=True)
        raise HTTPException(
            status_code=400, detail=f"Could not deserialize label: {err}"
        ) from err


def _gatable(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, (dict, bytes, bytearray)):
        return False
    if isinstance(value, (list, tuple)):
        return all(_gatable(v) for v in value)
    return True


def _gate(value: Any) -> Any:
    # match missing or null
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


def _array_label_filter(
    lookup_path: str,
    label_oid: Optional[ObjectId],
    gates: Dict[str, Any],
    doc_filter: Dict[str, Any],
) -> Dict[str, Any]:
    """Matches one list element by identity (``_id``) plus its gated scalars."""
    return {
        **doc_filter,
        lookup_path: {"$elemMatch": {"_id": label_oid, **gates}},
    }


def _flat_label_filter(
    lookup_path: str,
    bson: dict,
    gates: Dict[str, Any],
    doc_filter: Dict[str, Any],
) -> Dict[str, Any]:
    """Matches a flattened single label by identity (when the value carries an
    ``_id``, so a replacement label with equal scalars but a new ``_id`` isn't
    mistaken for ours) plus its gated scalars, each addressed by dotted path."""
    filter_doc = {**doc_filter}
    if "_id" in bson:
        filter_doc[f"{lookup_path}._id"] = bson["_id"]
    filter_doc.update(
        {f"{lookup_path}.{field}": value for field, value in gates.items()}
    )
    return filter_doc


def build_label_update(
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
    # Naive UTC to match how fiftyone stamps ``last_modified_at`` (see
    # ``Document._update``); a tz-aware value breaks naive/aware comparisons.
    now = datetime.datetime.utcnow()

    if new is None:
        # Gate on the scalars the editor saw so a stale delete can't erase a
        # label another editor just changed.
        old_bson = _label_to_mongo(old) if old is not None else {}
        gates = _scalar_gates(old_bson)
        if array:
            filter_doc = _array_label_filter(
                lookup_path, label_oid, gates, doc_filter
            )
            update_doc = {
                "$pull": {lookup_path: {"_id": label_oid}},
                "$set": {"last_modified_at": now},
            }
        else:
            filter_doc = _flat_label_filter(
                lookup_path, old_bson, gates, doc_filter
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

    # Gate only on the fields this edit touches, on the values the editor saw.
    gates = {
        field: _gate(old_bson.get(field))
        for field in list(set_fields) + unset_fields
        if _gatable(old_bson.get(field))
    }
    if array:
        filter_doc = _array_label_filter(
            lookup_path, label_oid, gates, doc_filter
        )
    else:
        filter_doc = _flat_label_filter(
            lookup_path, old_bson, gates, doc_filter
        )

    prefix = f"{lookup_path}.$." if array else f"{lookup_path}."
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
        return _array_label_filter(lookup_path, label_oid, gates, doc_filter)
    return _flat_label_filter(lookup_path, new_bson, gates, doc_filter)


def _build_primitive_update(
    field_path: str,
    old: Any,
    new: Any,
    *,
    doc_filter: Dict[str, Any],
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    # Naive UTC; see ``build_label_update``.
    now = datetime.datetime.utcnow()
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


def build_write(
    lookup_path: str,
    label_oid: Optional[ObjectId],
    old: Any,
    new: Any,
    doc_filter: Dict[str, Any],
) -> Tuple[Dict[str, Any], Dict[str, Any], Optional[Dict[str, Any]]]:
    """(filter, update, applied_filter) for one gated field edit — a label
    list element, a flat label, or a primitive."""
    if label_oid is not None:
        filter_doc, update_doc = build_label_update(
            lookup_path, label_oid, old, new, array=True, doc_filter=doc_filter
        )
        applied_filter = _build_label_applied_filter(
            lookup_path, label_oid, new, array=True, doc_filter=doc_filter
        )
    elif is_label(new) or is_label(old):
        filter_doc, update_doc = build_label_update(
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
