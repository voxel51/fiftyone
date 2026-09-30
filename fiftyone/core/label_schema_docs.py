"""
Named label-schema documents: storage, CRUD and tier resolution.

A label schema document is a self-contained, named schema for a
dataset. It is workflow-neutral: the Schema Manager authors documents,
the Explore "schema lens" and the App server's field-visibility
enforcement (``fiftyone.server.field_visibility``) read them, and
annotation workflow stages only reference one by id
(``stage.config.label_schema``). The ``@voxel51/label-schemas`` plugin
exposes the CRUD below as operators.

Each document is stored as two SEPARATE halves (kept separable on
purpose — ``visibility`` can later lift into shared, named policy docs
without a migration of ``label_schema``)::

    {
        "_id": str, "dataset_id": ObjectId, "name": str,
        "description": str, "created_by": str,
        "created_at": int, "updated_at": int, "version": int,

        # The annotation CONTENT: today's ``dataset.label_schema`` entry
        # shape, verbatim per field — byte-compatible with the dataset's
        # own stored schemas so copies/fallbacks are pure synthesis.
        "label_schema": {
            "<field_path>": {type, component, classes, attributes[],
                             read_only, bbox, label, ...},
        },

        # The VISIBILITY policy: structured, no dotted keys.
        "visibility": {
            "default": "explore" | "hidden",     # unlisted fields
            "fields": {
                "<field_path>": {
                    "tier": "annotate" | "explore" | "hidden",
                    # omitted attribute => "annotate"
                    "attributes": {"<attr>": "annotate"|"explore"|"hidden"},
                },
            },
        },
    }

Storage is the ``label_schemas`` collection (:data:`COLLECTION`),
scoped by ``dataset_id``. Every store call takes the scope explicitly
(``dataset_id=``) or derives it from a loaded dataset (``ctx=``: any
object whose ``dataset`` is a :class:`fiftyone.core.dataset.Dataset`,
such as an operator's execution context).

Resolution rules (see docs/label_schema_stage_visibility_design.md):
an explicit ``tier`` wins; ``label_schema`` membership defaults a field
to ``annotate``; ``annotate`` without content degrades to ``explore``;
``hidden`` (and a ``hidden`` default expanded over the dataset universe)
feeds the silent field-exclusion channel. Attribute tiers mask
attributes at resolution; ``bbox``/``label`` content knobs stamp the
geometry/class-input locks the App already enforces.

Docs stored in the earlier prototype shape (``content`` + a flat dotted
``visibility`` map) are converted on read; writes always produce the
current shape.

The dataset DEFAULT schema is not a document: :func:`synthesize_default`
builds it from the dataset's own stored schemas (content fields
annotatable, everything else explore) and it is never persisted.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

import copy
import time
import uuid
from typing import Any, Iterable, Mapping, Optional, Sequence

import pymongo
from bson import ObjectId

#: Mongo collection holding the documents (dataset-scoped by ``dataset_id``).
COLLECTION = "label_schemas"

FIELD_TIERS = ("annotate", "explore", "hidden")
ATTR_TIERS = ("annotate", "explore", "hidden")
DEFAULT_TIERS = ("explore", "hidden")

#: Required/default sample and frame fields a schema can NEVER hide.
#: The exclusion stage rides with ``_allow_missing`` (which skips
#: ``ExcludeFields.validate``), and stripping e.g. ``filepath`` from
#: sample docs crashes the server's sample serialization outright.
#: Nested metadata children stay excludable (tolerated downstream).
PROTECTED_PATHS = frozenset(
    {
        "id",
        "filepath",
        "tags",
        "metadata",
        "created_at",
        "last_modified_at",
        "frames",
        "frames.id",
        "frames.frame_number",
        "frames.created_at",
        "frames.last_modified_at",
    }
)

#: Label attributes a schema can never hide: identity (``id``), tagging
#: (``tags``), instance linking (``index``) and the geometry the
#: renderer needs. A stored ``hidden`` tier on one of these normalizes
#: to ``annotate``.
PROTECTED_ATTRIBUTES = frozenset(
    {"id", "tags", "index", "mask", "mask_path", "points", "bounding_box"}
)

#: Label-list db keys per content type: hidden ATTRIBUTE values are
#: excluded from sample payloads at ``<field>.<list_key>.<attr>`` for
#: list types and ``<field>.<attr>`` for singular types.
LABEL_LIST_KEYS = {
    "detections": "detections",
    "polylines": "polylines",
    "keypoints": "keypoints",
    "classifications": "classifications",
    "temporaldetections": "detections",
}

INDEXES = [
    pymongo.IndexModel(
        [("dataset_id", 1), ("_id", 1)],
        name="dataset_id_1__id_1",
        unique=True,
    ),
    pymongo.IndexModel(
        [("dataset_id", 1), ("name", 1)],
        name="dataset_id_1_name_1",
        unique=True,
    ),
]


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------


def _db():
    """The database holding :data:`COLLECTION` (unit tests swap this)."""
    import fiftyone.core.odm as foo  # pylint: disable=import-outside-toplevel

    return foo.get_db_conn()


def _index_needs_rebuild(existing: Mapping, desired: Mapping) -> bool:
    """True when an existing index's spec diverges from the desired one
    (key order, ``unique``): ``create_indexes`` never alters an index in
    place, so a same-named index with stale options would persist."""
    if list(existing.get("key", {}).items()) != list(
        desired.get("key", {}).items()
    ):
        return True
    return bool(existing.get("unique", False)) != bool(
        desired.get("unique", False)
    )


def _ensure_indexes(coll, indexes: Sequence[pymongo.IndexModel]) -> None:
    existing = {idx["name"]: idx for idx in coll.list_indexes()}
    to_create = []
    for model in indexes:
        spec = model.document
        current = existing.get(spec.get("name"))
        if current is None:
            to_create.append(model)
        elif _index_needs_rebuild(current, spec):
            coll.drop_index(spec["name"])
            to_create.append(model)
    if to_create:
        coll.create_indexes(to_create)


# Databases whose indexes this process has already verified. Index
# verification is a ``list_indexes`` round-trip; doing it once per
# database rather than on every read keeps the sidebar's listing cheap.
_INDEXED_DBS: set = set()


def _coll():
    db = _db()
    coll = db[COLLECTION]
    key = (id(getattr(db, "client", None)), getattr(db, "name", None))
    if key not in _INDEXED_DBS:
        _ensure_indexes(coll, INDEXES)
        _INDEXED_DBS.add(key)
    return coll


def resolve_dataset_id(*, ctx=None, dataset_id=None) -> ObjectId:
    """The dataset ObjectId that scopes a call: ``dataset_id`` when
    given, else the id of ``ctx.dataset``."""
    if dataset_id is not None:
        if isinstance(dataset_id, ObjectId):
            return dataset_id
        return ObjectId(str(dataset_id))
    dataset = getattr(ctx, "dataset", None) if ctx is not None else None
    doc = getattr(dataset, "_doc", None)
    did = getattr(doc, "id", None)
    if did is not None:
        return did
    raise ValueError("dataset_id or ctx with a loaded dataset is required")


def _scope(*, ctx=None, dataset_id=None) -> ObjectId:
    return resolve_dataset_id(ctx=ctx, dataset_id=dataset_id)


def _now_ms() -> int:
    return int(time.time() * 1000)


# ---------------------------------------------------------------------------
# Dataset-derived inputs
# ---------------------------------------------------------------------------


def _stored_label_schemas(dataset) -> dict:
    """The dataset's stored label schemas, best-effort ``{}`` on failure."""
    doc = getattr(dataset, "_doc", None)
    if doc is None:
        return {}
    try:
        return doc.all_stored_label_schemas() or {}
    except Exception:  # pylint: disable=broad-except
        return {}


def snapshot_content(dataset) -> dict:
    """Today's stored per-field label schemas, copied verbatim.

    The seed for "New schema from dataset fields": every stored field
    schema becomes doc content (= annotate tier by membership).
    Best-effort ``{}`` on any failure.
    """
    stored = _stored_label_schemas(dataset)
    return copy.deepcopy(
        {k: v for k, v in stored.items() if isinstance(v, Mapping)}
    )


def schema_universe(dataset) -> tuple:
    """The dataset's top-level field paths (sample fields, plus
    ``frames.``-prefixed frame fields for video), minus protected
    paths — what a ``hidden`` visibility default expands over.

    The universe must be the dataset's ACTUAL fields: stored
    label-schema entries only exist for fields someone configured for
    annotation, so expanding over them silently missed every other
    field (a default-hidden schema left ``segmentations`` et al fully
    visible on datasets with no stored schemas). Stored entries remain
    the fallback when the field schema is unavailable. Protected paths
    never enter (a born-hidden schema once excluded ``filepath`` via a
    stale stored entry and crashed sample serialization); any failure
    yields an empty universe, which only narrows wildcard expansion.
    """
    paths: list = []
    try:
        paths.extend(dataset.get_field_schema().keys())
    except Exception:  # pylint: disable=broad-except
        pass
    if paths:
        try:
            if getattr(dataset, "media_type", None) == "video":
                paths.extend(
                    f"frames.{name}"
                    for name in dataset.get_frame_field_schema() or {}
                )
        except Exception:  # pylint: disable=broad-except
            pass
    else:
        stored = _stored_label_schemas(dataset)
        paths = [k for k, v in stored.items() if isinstance(v, Mapping)]
    return tuple(dict.fromkeys(p for p in paths if p not in PROTECTED_PATHS))


# ---------------------------------------------------------------------------
# Visibility normalization (+ legacy-shape conversion)
# ---------------------------------------------------------------------------


def is_legacy_visibility(raw: Mapping) -> bool:
    """Whether a stored visibility block is the prototype's flat map
    (``{"*": tier, "field": tier, "field.attr": tier}``)."""
    if "fields" in raw or "default" in raw:
        return False
    return any(isinstance(v, str) for v in raw.values())


def legacy_is_attr_path(path: str) -> bool:
    """Whether a legacy flat-map key names an attribute (``field.attr``)
    rather than a field (``frames.field`` is a field)."""
    return "." in path and not (
        path.startswith("frames.") and path.count(".") == 1
    )


def convert_legacy_visibility(flat: Mapping) -> dict:
    """The structured form of a legacy flat visibility map."""
    out: dict = {"fields": {}}
    for path, value in flat.items():
        if not isinstance(path, str) or not isinstance(value, str):
            continue
        if path == "*":
            if value in DEFAULT_TIERS:
                out["default"] = value
            continue
        if legacy_is_attr_path(path):
            field, attr = path.rsplit(".", 1)
            if value in ("editable", "read_only"):
                value = "annotate"
            if value in ATTR_TIERS:
                entry = out["fields"].setdefault(field, {})
                entry.setdefault("attributes", {})[attr] = value
        elif value in FIELD_TIERS:
            out["fields"].setdefault(path, {})["tier"] = value
    return out


def normalize_visibility(raw: Any) -> dict:
    """Validated copy of a structured visibility block; invalid entries
    dropped. Legacy flat maps (``"*"`` wildcard + dotted attr keys) are
    converted first."""
    if not isinstance(raw, Mapping):
        return {"fields": {}}
    if is_legacy_visibility(raw):
        raw = convert_legacy_visibility(raw)

    out: dict = {"fields": {}}
    default = raw.get("default")
    if default in DEFAULT_TIERS:
        out["default"] = default

    fields = raw.get("fields")
    if not isinstance(fields, Mapping):
        return out
    for path, entry in fields.items():
        if not isinstance(path, str) or not path:
            continue
        if not isinstance(entry, Mapping):
            continue
        clean: dict = {}
        tier = entry.get("tier")
        if tier in FIELD_TIERS:
            clean["tier"] = tier
        attrs = entry.get("attributes")
        if isinstance(attrs, Mapping):
            clean_attrs = {}
            for name, atier in attrs.items():
                if not isinstance(name, str) or not name:
                    continue
                if atier == "editable":  # legacy spelling
                    atier = "annotate"
                if atier == "hidden" and name in PROTECTED_ATTRIBUTES:
                    atier = "annotate"
                if atier in ATTR_TIERS:
                    clean_attrs[name] = atier
            if clean_attrs:
                clean["attributes"] = clean_attrs
        if clean:
            out["fields"][path] = clean
    return out


def _to_current_shape(stored: Optional[dict]) -> Optional[dict]:
    """Converts a stored doc (legacy or current) to the current shape.
    Reads convert on the fly; writes always store the current shape, so
    conversion is only a compatibility window, not a sync."""
    if not stored:
        return stored
    doc = dict(stored)
    if "label_schema" not in doc:
        doc["label_schema"] = dict(doc.pop("content", None) or {})
    else:
        doc.pop("content", None)
        doc["label_schema"] = dict(doc.get("label_schema") or {})
    vis = doc.get("visibility")
    if isinstance(vis, Mapping) and is_legacy_visibility(vis):
        converted = convert_legacy_visibility(vis)
        # Legacy "read_only" attr entries carried an input lock;
        # preserve it on the content attribute object. Deep-copy first:
        # store reads may share nested dicts with the backing document.
        doc["label_schema"] = copy.deepcopy(doc["label_schema"])
        for path, value in vis.items():
            if value == "read_only" and legacy_is_attr_path(path):
                field, attr = path.rsplit(".", 1)
                entry = doc["label_schema"].get(field)
                attrs = (
                    entry.get("attributes")
                    if isinstance(entry, Mapping)
                    else None
                )
                if isinstance(attrs, list):
                    for a in attrs:
                        if isinstance(a, dict) and a.get("name") == attr:
                            a["read_only"] = True
        doc["visibility"] = converted
    else:
        doc["visibility"] = normalize_visibility(vis)
    return doc


def _public(doc: Optional[dict]) -> Optional[dict]:
    if not doc:
        return None
    out = _to_current_shape(doc)
    out["id"] = out.pop("_id")
    out.pop("dataset_id", None)
    return out


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


def create(
    *,
    name: str,
    description: str = "",
    label_schema: Optional[Mapping] = None,
    content: Optional[Mapping] = None,  # legacy alias
    visibility: Optional[Mapping] = None,
    created_by: str = "",
    ctx=None,
    dataset_id=None,
) -> dict:
    """Creates a schema doc; raises ``ValueError`` on duplicate name."""
    name = (name or "").strip()
    if not name:
        raise ValueError("Schema name is required")
    now = _now_ms()
    doc = {
        "_id": uuid.uuid4().hex,
        "dataset_id": _scope(ctx=ctx, dataset_id=dataset_id),
        "name": name,
        "description": description or "",
        "created_by": created_by or "",
        "created_at": now,
        "updated_at": now,
        "version": 1,
        "label_schema": dict(
            label_schema if label_schema is not None else (content or {})
        ),
        "visibility": normalize_visibility(visibility),
    }
    coll = _coll()
    # Explicit uniqueness check ahead of the (dataset_id, name) index so
    # the caller gets a message, not a DuplicateKeyError.
    if coll.find_one({"dataset_id": doc["dataset_id"], "name": name}):
        raise ValueError(
            f"A schema named {name!r} already exists on this dataset"
        )
    try:
        coll.insert_one(doc)
    except pymongo.errors.DuplicateKeyError:
        # The pre-check and the insert are not atomic; the unique
        # (dataset_id, name) index is the last word.
        raise ValueError(
            f"A schema named {name!r} already exists on this dataset"
        )
    return _public(doc)


def list_(*, ctx=None, dataset_id=None) -> list[dict]:
    """``[{id, name, description, updated_at, version}]`` for the dataset."""
    rows = _coll().find({"dataset_id": _scope(ctx=ctx, dataset_id=dataset_id)})
    rows = sorted(rows, key=lambda d: d.get("name", ""))
    return [
        {
            "id": d["_id"],
            "name": d.get("name", ""),
            "description": d.get("description", ""),
            "updated_at": d.get("updated_at", 0),
            "version": d.get("version", 1),
        }
        for d in rows
    ]


def get(doc_id: str, *, ctx=None, dataset_id=None) -> Optional[dict]:
    """The full public doc (``label_schema`` + ``visibility``), or ``None``."""
    doc = _coll().find_one(
        {
            "dataset_id": _scope(ctx=ctx, dataset_id=dataset_id),
            "_id": doc_id,
        }
    )
    return _public(doc)


def update(
    doc_id: str,
    *,
    name: Optional[str] = None,
    description: Optional[str] = None,
    label_schema: Optional[Mapping] = None,
    content: Optional[Mapping] = None,  # legacy alias
    visibility: Optional[Mapping] = None,
    ctx=None,
    dataset_id=None,
) -> Optional[dict]:
    """Partial update; returns the updated public doc or ``None``."""
    updates: dict = {"updated_at": _now_ms()}
    if name is not None and name.strip():
        updates["name"] = name.strip()
    if description is not None:
        updates["description"] = description
    if label_schema is not None:
        updates["label_schema"] = dict(label_schema)
    elif content is not None:
        updates["label_schema"] = dict(content)
    if visibility is not None:
        updates["visibility"] = normalize_visibility(visibility)
    query = {
        "dataset_id": _scope(ctx=ctx, dataset_id=dataset_id),
        "_id": doc_id,
    }
    coll = _coll()
    new_name = updates.get("name")
    if new_name is not None:
        clash = coll.find_one(
            {"dataset_id": query["dataset_id"], "name": new_name}
        )
        if clash and clash.get("_id") != doc_id:
            raise ValueError(f"A schema named {new_name!r} already exists")
    if "label_schema" in updates:
        # Retire the legacy key so converted docs don't carry both.
        change = {
            "$set": updates,
            "$unset": {"content": ""},
            "$inc": {"version": 1},
        }
    else:
        change = {"$set": updates, "$inc": {"version": 1}}
    try:
        coll.update_one(query, change)
    except pymongo.errors.DuplicateKeyError:
        # The name pre-check and the write are not atomic; the unique
        # (dataset_id, name) index is the last word.
        raise ValueError(f"A schema named {new_name!r} already exists")
    return _public(coll.find_one(query))


def propagate_field(
    path: str,
    entry: Optional[Mapping] = None,
    source_doc_id: Optional[str] = None,
    *,
    ctx=None,
    dataset_id=None,
) -> int:
    """Propagates a newly created dataset field across every custom
    schema of the dataset: the schema it was created in (``source_doc_id``)
    receives ``entry`` as annotate-tier content; every OTHER schema gets
    an explicit ``hidden`` tier for it. Schemas that already model the
    field (content or an explicit tier) are left untouched. The dataset
    default (the dataset's own stored schemas) is written by the field
    creation itself, not here. Returns the number of docs updated."""
    path = (path or "").strip()
    if not path:
        raise ValueError("path is required")
    scope = _scope(ctx=ctx, dataset_id=dataset_id)
    coll = _coll()
    now = _now_ms()
    updated = 0
    for stored in coll.find({"dataset_id": scope}):
        current = _to_current_shape(dict(stored)) or {}
        label_schema = dict(current.get("label_schema") or {})
        visibility = dict(current.get("visibility") or {"fields": {}})
        fields = dict(visibility.get("fields") or {})
        if path in label_schema or path in fields:
            continue
        if stored.get("_id") == source_doc_id:
            if not isinstance(entry, Mapping):
                continue
            label_schema[path] = dict(entry)
        else:
            fields[path] = {"tier": "hidden"}
        visibility["fields"] = fields
        coll.update_one(
            {"dataset_id": scope, "_id": stored["_id"]},
            {
                "$set": {
                    "label_schema": label_schema,
                    "visibility": normalize_visibility(visibility),
                    "updated_at": now,
                },
                "$unset": {"content": ""},
                "$inc": {"version": 1},
            },
        )
        updated += 1
    return updated


def delete(doc_id: str, *, ctx=None, dataset_id=None) -> bool:
    """Deletes a doc; ``True`` when a document was removed."""
    result = _coll().delete_one(
        {
            "dataset_id": _scope(ctx=ctx, dataset_id=dataset_id),
            "_id": doc_id,
        }
    )
    deleted = getattr(result, "deleted_count", None)
    if deleted is None:
        return bool(result)
    return deleted > 0


# ---------------------------------------------------------------------------
# Resolution: doc → the ready-to-render payload
# ---------------------------------------------------------------------------


def _field_tier(
    vis_fields: Mapping, default_tier: str, label_schema: Mapping, path: str
) -> str:
    entry = vis_fields.get(path)
    tier = entry.get("tier") if isinstance(entry, Mapping) else None
    if tier == "hidden":
        return "hidden"
    # Scanned (content-bearing) fields are annotate+explore — there is
    # no "explore only" state for a set-up field (an explicit
    # ``explore`` tier on one is a legacy demotion, read as annotate).
    # Unscanned fields are explore-only unless the default hides them.
    if path in label_schema:
        return "annotate"
    # An explicit non-hidden tier on an unscanned field still means
    # "visible" (annotate cannot render without content).
    if tier in FIELD_TIERS:
        return "explore"
    return default_tier


def _masked_attributes(entry: Mapping, attr_tiers: Mapping) -> list:
    """Attribute tiers mirror field tiers: ``annotate`` renders an
    input; ``explore``/``hidden`` drop it from the annotate envelope
    (explore keeps values visible in Explore; hidden also strips the
    values from payloads)."""
    attributes = entry.get("attributes")
    if not isinstance(attributes, list):
        return []
    out = []
    for attr in attributes:
        if not isinstance(attr, Mapping):
            continue
        name = attr.get("name")
        tier = (
            attr_tiers.get(name, "annotate")
            if isinstance(name, str) and name
            else "annotate"
        )
        if name in PROTECTED_ATTRIBUTES:
            tier = "annotate"
        if tier in ("hidden", "explore"):
            continue
        out.append(dict(attr))
    return out


def resolve(doc: Mapping, universe: Iterable[str]) -> dict:
    """Resolves a schema doc into the render payload.

    Returns ``{id, name, label_schemas, active, excluded_paths,
    excluded_attr_paths, excluded_attr_db_paths}`` where
    ``label_schemas`` is the ``get_label_schemas``-envelope meta map the
    Annotate sidebar renders from, ``active`` is the annotate-tier field
    list, and the ``excluded_*`` lists feed the silent Explore exclusion
    channels. ``universe`` (the dataset's field paths) expands a
    ``hidden`` default.
    """
    doc = _to_current_shape(dict(doc))
    label_schema = doc.get("label_schema") or {}
    visibility = doc.get("visibility") or {}
    vis_fields = visibility.get("fields") or {}
    default_tier = visibility.get("default", "explore")

    field_paths = set(label_schema) | set(vis_fields)

    label_schemas: dict = {}
    active: list = []
    excluded: set = set()
    excluded_attrs: set = set()
    excluded_attr_db_paths: set = set()

    # Hidden ATTRIBUTES of visible fields are stripped from the Explore
    # sidebar too (nested rows/filters/counts) — collected regardless of
    # the field's own tier (an explore-tier field can hide attributes).
    for path in sorted(field_paths):
        tier = _field_tier(vis_fields, default_tier, label_schema, path)
        if tier == "hidden" and path in PROTECTED_PATHS:
            # Required fields degrade to explore rather than excluding.
            tier = "explore"
        vis_entry = vis_fields.get(path)
        if tier != "hidden" and isinstance(vis_entry, Mapping):
            attrs = vis_entry.get("attributes")
            if isinstance(attrs, Mapping):
                hidden_names = [
                    name
                    for name, atier in attrs.items()
                    if atier == "hidden"
                    and isinstance(name, str)
                    and name
                    and name not in PROTECTED_ATTRIBUTES
                ]
                excluded_attrs.update(
                    f"{path}.{name}" for name in hidden_names
                )
                # Sample-payload stripping needs the DB path, which
                # includes the label-list key for list types; only
                # possible when the field's content declares a type.
                entry_type = str(
                    (label_schema.get(path) or {}).get("type") or ""
                ).lower()
                if entry_type:
                    list_key = LABEL_LIST_KEYS.get(entry_type)
                    prefix = f"{path}.{list_key}" if list_key else path
                    excluded_attr_db_paths.update(
                        f"{prefix}.{name}" for name in hidden_names
                    )
        if tier == "hidden":
            excluded.add(path)
            continue
        if tier == "explore":
            continue
        entry = copy.deepcopy(label_schema.get(path) or {})
        vis_entry = vis_fields.get(path)
        attr_tiers = (
            vis_entry.get("attributes")
            if isinstance(vis_entry, Mapping)
            else None
        ) or {}
        entry["attributes"] = _masked_attributes(entry, attr_tiers)
        meta = {
            "label_schema": entry,
            "default_label_schema": entry,
            "type": entry.get("type"),
            "read_only": bool(entry.get("read_only")),
            "unsupported": False,
        }
        # The App's shipped lock consumers read these client-stamp keys.
        if entry.get("bbox") == "read_only":
            meta["bbox_read_only"] = True
        if entry.get("label") == "read_only":
            entry["label_read_only"] = True
        label_schemas[path] = meta
        active.append(path)

    if default_tier == "hidden":
        excluded.update(
            p
            for p in universe
            if p not in field_paths and p not in PROTECTED_PATHS
        )

    return {
        "id": doc.get("id") or doc.get("_id"),
        "name": doc.get("name", ""),
        "label_schemas": label_schemas,
        "active": active,
        "excluded_paths": sorted(excluded),
        "excluded_attr_paths": sorted(excluded_attrs),
        "excluded_attr_db_paths": sorted(excluded_attr_db_paths),
    }


def synthesize_default(dataset) -> dict:
    """The virtual "dataset default" doc: the dataset's own stored
    schemas as content (annotate by membership), everything else
    explore. A dataset with no stored schemas yields the empty
    permissive doc. Never persisted — run it through :func:`resolve`
    like any stored doc."""
    return {
        "id": "",
        "name": "",
        "label_schema": snapshot_content(dataset),
        "visibility": {"default": "explore", "fields": {}},
    }
