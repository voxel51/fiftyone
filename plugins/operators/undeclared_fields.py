"""
Builtin operators.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from datetime import datetime

import fiftyone.core.fields as fof
import fiftyone.core.odm.utils as foou
import fiftyone.operators as foo
import fiftyone.operators.types as types

_FRAMES_PREFIX = "frames."

# BSON types of the same Python type, so declaring one field covers both
_EQUIVALENT_TYPES = {"long": "int"}

# Ints and doubles mixed in one field fit a float field
_NUMERIC_TYPES = {"int", "double"}

# The largest integer that a float holds exactly
_MAX_EXACT_INT = 2**53


def find_undeclared_fields(dataset):
    """Finds the values stored on the dataset's samples and frames under
    fields that its schema does not declare.

    A sample or frame that stores such a value cannot be loaded, so it
    cannot be saved either. Values like this are typically left behind
    when a field is removed from the schema while documents still store
    it, for example by a run that is deleted while it is writing.
    Undeclared attributes of labels are not reported: labels accept them.

    This reads every sample (and frame) of the dataset.

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`

    Returns:
        a dict mapping each undeclared field (frame fields prefixed with
        ``"frames."``) to a dict with the ``count`` of documents that store
        it and the sorted BSON ``types`` of its stored values
    """
    dataset.reload()

    found = _scan(
        dataset._sample_collection,
        _declared_names(dataset.get_field_schema(include_private=True)),
    )

    if dataset._has_frame_fields():
        frames = _scan(
            dataset._frame_collection,
            _declared_names(
                dataset.get_frame_field_schema(include_private=True)
            ),
        )
        found.update({_FRAMES_PREFIX + k: v for k, v in frames.items()})

    return found


def remove_undeclared_fields(dataset, fields):
    """Removes the stored values of the given undeclared fields, and marks
    the samples and frames that stored them as modified.

    A field that the schema declares when this runs is never touched, so a
    field declared since it was found keeps its values.

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`
        fields: the undeclared fields, as returned by
            :func:`find_undeclared_fields`

    Returns:
        the list of fields whose values were removed
    """
    dataset.reload()

    now = datetime.utcnow()
    removed = []
    for coll, schema, names, prefix in _targets(dataset, fields):
        declared = set(_declared_names(schema))
        names = [n for n in names if _is_top_level(n) and n not in declared]
        if not names:
            continue

        coll.update_many(
            {"$or": [{n: {"$exists": True}} for n in names]},
            [{"$unset": names}, {"$set": {"last_modified_at": now}}],
        )
        removed.extend(prefix + n for n in names)

    return removed


def declare_undeclared_fields(dataset, fields):
    """Adds the given undeclared fields to the dataset's schema, with the
    type of their stored values.

    The field must hold every stored value, so a field whose values have
    more than one type is skipped, except ints mixed with floats, which are
    declared as a float field when the ints fit one exactly. So is a field
    whose values are documents of different kinds, or whose name cannot be a
    field name. A list field whose elements have different types is declared
    as an untyped list.

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`
        fields: the undeclared fields, as returned by
            :func:`find_undeclared_fields`

    Returns:
        a tuple of

        -   the list of fields that were declared
        -   a dict mapping the fields that were skipped to the reason
    """
    dataset.reload()

    declared = []
    skipped = {}
    for coll, schema, names, prefix in _targets(dataset, fields):
        existing = set(_declared_names(schema))
        add_field = (
            dataset.add_frame_field if prefix else dataset.add_sample_field
        )

        for name in names:
            path = prefix + name
            if not _is_top_level(name):
                skipped[path] = "not a top-level field"
                continue

            if name in existing:
                skipped[path] = "already declared"
                continue

            try:
                foou.validate_field_name(
                    name,
                    media_type=dataset.media_type,
                    is_frame_field=bool(prefix),
                )
            except ValueError as e:
                skipped[path] = "it is not a valid field name (%s)" % e
                continue

            value_types = _value_types(coll, name)
            if not value_types:
                skipped[path] = "it stores only null values"
                continue

            if len(value_types) > 1 and value_types != _NUMERIC_TYPES:
                skipped[path] = "its values have different types (%s)" % (
                    ", ".join(sorted(value_types))
                )
                continue

            try:
                kwargs, reason = _field_kwargs(coll, name, value_types)
                if reason:
                    skipped[path] = reason
                    continue

                add_field(name, **kwargs)
            except Exception as e:
                skipped[path] = "it could not be declared (%s)" % e
                continue

            declared.append(path)

    return declared, skipped


def _field_kwargs(coll, name, value_types):
    """The keyword arguments of a field that holds every value stored under
    ``name``, or why no field does.

    Every stored value is checked, not just one: ints mixed with floats must
    fit a float exactly, documents must be of one kind, and the elements of
    lists must share a type (a list whose elements do not is declared
    untyped).
    """
    if value_types == _NUMERIC_TYPES:
        if _max_abs_int(coll, name) > _MAX_EXACT_INT:
            return None, (
                "its values mix floats with integers too large to store "
                "as floats"
            )
        return {"ftype": fof.FloatField}, None

    if value_types == {"object"}:
        kinds = _document_kinds(coll, name)
        if len(kinds) > 1:
            return None, "its values are different kinds of documents (%s)" % (
                ", ".join(sorted(k or "dict" for k in kinds))
            )

    query = {name: {"$exists": True, "$ne": None}}
    if value_types == {"array"}:
        element_types, kinds = _element_types(coll, name)
        if element_types == _NUMERIC_TYPES:
            if _max_abs_int(coll, name, unwind=True) > _MAX_EXACT_INT:
                return {"ftype": fof.ListField}, None
            return {"ftype": fof.ListField, "subfield": fof.FloatField}, None

        if len(element_types) != 1 or len(kinds) > 1:
            # Elements of different types, or no elements at all
            return {"ftype": fof.ListField}, None

        query = {name: {"$type": "array", "$ne": []}}

    doc = coll.find_one(query, {name: 1})
    kwargs = foou.get_implied_field_kwargs(foou.deserialize_value(doc[name]))

    if kwargs.get("ftype") is fof.ObjectIdField:
        # Field creation stores an ObjectId field under `_<name>` by default,
        # but these values are stored under `name`
        kwargs["db_field"] = name

    return kwargs, None


def _document_kinds(coll, name):
    pipeline = [
        {"$match": {name: {"$type": "object"}}},
        {"$group": {"_id": "$%s._cls" % name}},
    ]
    return {d["_id"] for d in coll.aggregate(pipeline, allowDiskUse=True)}


def _element_types(coll, name):
    pipeline = [
        {"$match": {name: {"$type": "array"}}},
        {"$unwind": "$" + name},
        {
            "$group": {
                "_id": {
                    "type": {"$type": "$" + name},
                    "kind": "$%s._cls" % name,
                }
            }
        },
    ]
    element_types = set()
    kinds = set()
    for d in coll.aggregate(pipeline, allowDiskUse=True):
        element_type = _EQUIVALENT_TYPES.get(
            d["_id"]["type"], d["_id"]["type"]
        )
        element_types.add(element_type)
        if element_type == "object":
            kinds.add(d["_id"].get("kind"))

    element_types.discard("null")
    return element_types, kinds


def _max_abs_int(coll, name, unwind=False):
    pipeline = [{"$match": {name: {"$exists": True}}}]
    if unwind:
        pipeline.append({"$unwind": "$" + name})

    pipeline += [
        {"$match": {name: {"$type": ["int", "long"]}}},
        {"$group": {"_id": None, "max": {"$max": {"$abs": "$" + name}}}},
    ]
    results = list(coll.aggregate(pipeline, allowDiskUse=True))
    return results[0]["max"] if results else 0


def _declared_names(schema):
    return [field.db_field or name for name, field in schema.items()]


def _is_top_level(name):
    return bool(name) and "." not in name and not name.startswith("$")


def _scan(coll, declared):
    pipeline = [
        {
            "$project": {
                "_id": False,
                "undeclared": {
                    "$filter": {
                        "input": {"$objectToArray": "$$ROOT"},
                        "cond": {"$not": [{"$in": ["$$this.k", declared]}]},
                    }
                },
            }
        },
        {"$unwind": "$undeclared"},
        {
            "$group": {
                "_id": {
                    "name": "$undeclared.k",
                    "type": {"$type": "$undeclared.v"},
                },
                "count": {"$sum": 1},
            }
        },
    ]

    found = {}
    for d in coll.aggregate(pipeline, allowDiskUse=True):
        entry = found.setdefault(d["_id"]["name"], {"count": 0, "types": []})
        entry["count"] += d["count"]
        entry["types"].append(d["_id"]["type"])

    for entry in found.values():
        entry["types"].sort()

    return found


def _targets(dataset, fields):
    sample_names = []
    frame_names = []
    for field in fields or []:
        if field.startswith(_FRAMES_PREFIX):
            frame_names.append(field[len(_FRAMES_PREFIX) :])
        else:
            sample_names.append(field)

    targets = []
    if sample_names:
        targets.append(
            (
                dataset._sample_collection,
                dataset.get_field_schema(include_private=True),
                sample_names,
                "",
            )
        )

    if frame_names and dataset._has_frame_fields():
        targets.append(
            (
                dataset._frame_collection,
                dataset.get_frame_field_schema(include_private=True),
                frame_names,
                _FRAMES_PREFIX,
            )
        )

    return targets


def _value_types(coll, name):
    pipeline = [
        {"$match": {name: {"$exists": True}}},
        {"$group": {"_id": {"$type": "$" + name}}},
    ]
    value_types = {
        _EQUIVALENT_TYPES.get(d["_id"], d["_id"])
        for d in coll.aggregate(pipeline, allowDiskUse=True)
    }
    value_types.discard("null")
    return value_types


# The last scan's results live in the dataset's execution store, so that
# opening the form never scans: only the Scan action, which by default runs
# as a delegated operation, does
_STORE_NAME = "clean_up_undeclared_fields"
_SCAN_KEY = "last_scan"


def _last_scan(ctx):
    try:
        return ctx.store(_STORE_NAME).get(_SCAN_KEY)
    except Exception:
        return None


def _save_scan(ctx, found):
    scan = {
        "scanned_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        # a list, not a dict: frame fields' names contain dots
        "fields": [
            {"field": field, "count": entry["count"], "types": entry["types"]}
            for field, entry in sorted(found.items())
        ],
    }
    ctx.store(_STORE_NAME).set(_SCAN_KEY, scan)
    return scan


def _forget_fields(ctx, fields):
    scan = _last_scan(ctx)
    if not scan or not fields:
        return

    fields = set(fields)
    scan["fields"] = [e for e in scan["fields"] if e["field"] not in fields]
    ctx.store(_STORE_NAME).set(_SCAN_KEY, scan)


def _stored_on(entry):
    unit = "frame" if entry["field"].startswith(_FRAMES_PREFIX) else "sample"
    count = entry["count"]
    return "%d %s%s" % (count, unit, "" if count == 1 else "s")


class CleanUpUndeclaredFields(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="clean_up_undeclared_fields",
            label="Clean up undeclared fields",
            dynamic=True,
            allow_delegated_execution=True,
            allow_immediate_execution=True,
            default_choice_to_delegated=True,
            risk_level=types.RiskLevel.HIGH,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        scan = _last_scan(ctx)
        found = scan["fields"] if scan else []

        if scan is None:
            inputs.str(
                "scan_status",
                label=(
                    "This dataset has not been scanned yet. Values stored "
                    "under fields its schema does not declare stop the "
                    "samples and frames that store them from being loaded "
                    "or saved; scan to find them."
                ),
                view=types.Notice(),
            )
        elif not found:
            inputs.str(
                "scan_status",
                label=(
                    "The last scan (%s) found no values stored under "
                    "undeclared fields." % scan["scanned_at"]
                ),
                view=types.Notice(),
            )
        else:
            rows = [
                "| Field | Stored on | Value types |",
                "| --- | --- | --- |",
            ]
            for entry in found:
                rows.append(
                    "| `%s` | %s | %s |"
                    % (
                        entry["field"],
                        _stored_on(entry),
                        ", ".join(entry["types"]),
                    )
                )

            inputs.str(
                "summary",
                label=(
                    "The last scan (%s) found values stored under fields "
                    "the dataset's schema does not declare. Samples and "
                    "frames that store them cannot be loaded or saved."
                    % scan["scanned_at"]
                ),
                default="\n".join(rows),
                view=types.MarkdownView(read_only=True),
            )

        action_choices = types.RadioGroup()
        action_choices.add_choice(
            "scan",
            label="Scan the dataset",
            description=(
                "Finds the values stored under undeclared fields. Reads "
                "every sample and frame, so on a large dataset it can take "
                "a while"
            ),
        )
        if found:
            action_choices.add_choice(
                "remove",
                label="Remove the stored values",
                description="Deletes the values. This cannot be undone",
            )
            action_choices.add_choice(
                "declare",
                label="Add the fields to the schema",
                description=(
                    "Keeps the values and declares each field with their "
                    "type. Fields whose values have different types are "
                    "skipped"
                ),
            )

        inputs.enum(
            "action",
            action_choices.values(),
            label="Action",
            default="scan",
            required=True,
            view=action_choices,
        )

        action = ctx.params.get("action", None) or "scan"
        if action in ("remove", "declare") and found:
            field_choices = types.AutocompleteView(allow_duplicates=False)
            for entry in found:
                field_choices.add_choice(entry["field"], label=entry["field"])

            inputs.list(
                "fields",
                types.String(),
                label="Fields",
                description=(
                    "The undeclared fields to clean up. Each is checked "
                    "against the current schema first"
                ),
                default=[entry["field"] for entry in found],
                required=True,
                view=field_choices,
            )

        return types.Property(
            inputs, view=types.View(label="Clean up undeclared fields")
        )

    def execute(self, ctx):
        action = ctx.params.get("action", None) or "scan"

        if action == "scan":
            scan = _save_scan(ctx, find_undeclared_fields(ctx.dataset))
            return {
                "found": [
                    "%s (%s; %s)"
                    % (e["field"], _stored_on(e), ", ".join(e["types"]))
                    for e in scan["fields"]
                ]
            }

        fields = ctx.params.get("fields", None) or []
        if action == "declare":
            declared, skipped = declare_undeclared_fields(ctx.dataset, fields)
            _forget_fields(ctx, declared)
            result = {"declared": declared, "skipped": skipped}
        else:
            removed = remove_undeclared_fields(ctx.dataset, fields)
            _forget_fields(ctx, removed)
            result = {"removed": removed}

        ctx.trigger("reload_dataset")

        return result

    def resolve_output(self, ctx):
        outputs = types.Object()

        action = ctx.params.get("action", None) or "scan"
        if action == "scan":
            outputs.list("found", types.String(), label="Undeclared fields")
        elif action == "declare":
            outputs.list("declared", types.String(), label="Declared")
            outputs.obj("skipped", label="Skipped", view=types.KeyValueView())
        else:
            outputs.list("removed", types.String(), label="Removed")

        return types.Property(
            outputs, view=types.View(label="Clean up undeclared fields")
        )
