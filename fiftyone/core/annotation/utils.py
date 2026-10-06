"""
Annotation utils

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging

import fiftyone.core.annotation.constants as foac
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom

logger = logging.getLogger(__name__)


def ensure_collection_is_supported(sample_collection):
    """Ensure a :class:`fiftyone.core.collections.SampleCollection` is
    supported by the App for annotation.

        Args:
            sample_collection: a
                :class:`fiftyone.core.collections.SampleCollection`
    """
    if sample_collection.media_type not in foac.SUPPORTED_MEDIA_TYPES:
        raise ValueError(
            f"{sample_collection.media_type} media is not supported yet"
        )


def get_supported_app_annotation_fields(sample_collection):
    """Gets the supported App annotation fields for a
    :class:`fiftyone.core.collections.SampleCollection`.

    Currently supported media types for the collection are ``image`` and
    ``3d``. See :attr:`fiftyone.core.collections.SampleCollection.media_type`

    All supported primitive and ``embedded.document`` primitives are supported
    as documented in :func:`generate_label_schemas`

    The below :class:`fiftyone.core.labels.Label` types are also resolved.

    Supported ``image`` :class:`fiftyone.core.labels.Label` types are:
        -   ``classification``:
            :class:`fiftyone.core.labels.Classification`
        -   ``classifications``:
            :class:`fiftyone.core.labels.Classifications`
        -   ``detection``: :class:`fiftyone.core.labels.Detection`
        -   ``detections``: :class:`fiftyone.core.labels.Detections`

    Supported ``3d`` label types are:
        -   ``classification``:
            :class:`fiftyone.core.labels.Classification`
        -   ``classifications``:
            :class:`fiftyone.core.labels.Classifications`
        -   ``polyline``: :class:`fiftyone.core.labels.Polyline`
        -   ``polylines``: :class:`fiftyone.core.labels.Polylines`

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`

    Returns:
        a list of supported fields
    """
    ensure_collection_is_supported(sample_collection)
    return list_valid_annotation_fields(
        sample_collection, require_app_support=True, flatten=True
    )


def list_valid_annotation_fields(
    sample_collection,
    require_app_support=False,
    flatten=False,
    include_frames=False,
):
    """Lists all valid annotation fields for a
    :class:`fiftyone.core.collections.SampleCollection`.

    A field may be valid, but not yet supported by the App for human
    annotation.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        require_app_support (False): whether to only include fields supported
            by the App for annotation
        flatten (False): whether to flatten embedded documents with
            ``dot.notation``
        include_frames (False): whether to also include valid per-frame label
            fields, keyed by their ``frames.<field>`` path

    Returns:
        a sorted list of valid annotation field names
    """
    # On video, spatial labels belong to frames — a sample-level
    # detections/polylines field isn't annotatable, so drop it from the
    # sample-level scan (frame-level spatial labels are added below).
    exclude_sample_spatial = sample_collection.media_type == fom.VIDEO

    result = _valid_annotation_fields(
        sample_collection,
        sample_collection.get_field_schema(),
        require_app_support,
        exclude_spatial_labels=exclude_sample_spatial,
    )

    if include_frames and sample_collection._has_frame_fields():
        frame_fields = _valid_annotation_fields(
            sample_collection,
            sample_collection.get_frame_field_schema(),
            require_app_support,
        )
        result |= {f"frames.{field_name}" for field_name in frame_fields}

    if flatten:
        result = flatten_fields(sample_collection, result, require_app_support)

    return sorted(result)


def backfill_instances_from_index(sample_collection, fields=None):
    """Populates the ``instance`` attribute from a legacy ``index`` attribute
    for any of the given track label fields that have ``index`` values but no
    ``instance`` values yet.

    Lets datasets whose tracks are defined by ``index`` (rather than
    ``instance``) be recognized as tracks during a scan. Fields that already
    have any ``instance`` values are left untouched, so existing tracks are
    never clobbered and the operation is idempotent.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        fields (None): a field name or iterable of field names to process. By
            default, all valid annotation fields are processed, matching the
            all-fields scan in :func:`generate_label_schemas`
    """
    if fields is None:
        fields = list_valid_annotation_fields(
            sample_collection, include_frames=True
        )
    elif isinstance(fields, str):
        fields = [fields]

    for field in fields:
        _maybe_backfill_field_instances(sample_collection, field)


def _maybe_backfill_field_instances(sample_collection, field):
    # imported lazily — `fiftyone.utils.labels` pulls in heavy deps we don't
    # want at annotation-module import time
    import fiftyone.utils.labels as foul

    label_field = sample_collection.get_field(field)
    if not isinstance(label_field, fof.EmbeddedDocumentField):
        return

    if not issubclass(label_field.document_type, foac.TRACK_LABEL_TYPES):
        return

    root, _ = sample_collection._get_label_field_root(field)
    instance_path = f"{root}.instance"
    index_path = f"{root}.index"

    # `instance` is a dynamic attribute (absent from the declared schema), so
    # count the data directly rather than checking the schema

    # don't clobber a field that already has tracks
    if sample_collection.count(instance_path) > 0:
        return

    # nothing to backfill from
    if sample_collection.count(index_path) == 0:
        return

    foul.index_to_instance(sample_collection, field)


def _valid_annotation_fields(
    collection, schema, require_app_support, exclude_spatial_labels=False
):
    result = set()
    for field_name, field in schema.items():

        if _is_supported_primitive(field):
            result.add(field_name)
            continue

        if not isinstance(field, fof.EmbeddedDocumentField):
            continue

        if field.document_type in foac.SUPPORTED_DOC_TYPES:
            result.add(field_name)
            continue

        if exclude_spatial_labels and issubclass(
            field.document_type, foac.SPATIAL_LABEL_TYPES
        ):
            continue

        if _is_supported_label(collection, field, require_app_support):
            result.add(field_name)

    return result


def flatten_fields(collection, fields, require_app_support=False):
    """Flattens embedded document fields into dot-separated paths.

    Args:
        collection: the sample collection
        fields: iterable of field names to flatten
        require_app_support (False): whether to only include fields supported
            by the App for annotation

    Returns:
        sorted list of flattened field names
    """
    flattened_fields = []
    for field_name in fields:
        field = collection.get_field(field_name)

        if field is None:
            raise ValueError(f"field '{field_name}' does not exist")

        if not isinstance(field, fof.EmbeddedDocumentField):
            flattened_fields.append(field_name)
            continue

        if issubclass(field.document_type, fol.Label):
            flattened_fields.append(field_name)
            continue

        for subfield in field.fields:
            if _is_supported_primitive(subfield) or _is_supported_label(
                collection, subfield, require_app_support
            ):
                flattened_fields.append(f"{field_name}.{subfield.name}")

    return sorted(set(flattened_fields))


def get_type(field):
    """Get the ``type`` of a field for a label schema

    Args:
        field: the field instance

    Returns:
        a label schema ``type``
    """
    is_list = isinstance(field, fof.ListField)
    if is_list:
        field = field.field

    field_type = (
        fol.Label
        if isinstance(field, fof.EmbeddedDocumentField)
        and issubclass(field.document_type, fol.Label)
        else type(field)
    )

    _types = (
        foac.FIELD_TYPE_TO_TYPES[fof.ListField]
        if is_list
        else foac.FIELD_TYPE_TO_TYPES
    )

    if field_type not in _types:
        raise ValueError(f"field '{field}' is not supported")

    return _types[field_type]


def _is_supported_label(collection, field, require_app_support):
    media_type = collection.media_type

    if not require_app_support:
        return field.document_type not in foac.UNSUPPORTED_LABEL_TYPES

    if field.document_type in foac.SUPPORTED_LABEL_TYPES:
        return True

    def _is_label_supported_for_media_type(mt):
        return (
            mt in foac.SUPPORTED_LABEL_TYPES_BY_MEDIA_TYPE
            and field.document_type
            in foac.SUPPORTED_LABEL_TYPES_BY_MEDIA_TYPE[mt]
        )

    if media_type == fom.GROUP:
        group_media_types = collection.group_media_types
        if group_media_types:
            return any(
                _is_label_supported_for_media_type(mt)
                for mt in group_media_types.values()
            )
    elif _is_label_supported_for_media_type(media_type):
        return True

    return False


def _is_supported_primitive(field):
    if isinstance(field, foac.SUPPORTED_PRIMITIVES):
        return True

    if isinstance(field, fof.ListField):
        if isinstance(field.field, foac.SUPPORTED_LISTS_OF_PRIMITIVES):
            return True

    return False


def list_undeclared_label_schema_attributes(sample_collection, label_schemas):
    """Lists the label attributes that the given label schemas define but
    the dataset's field schema has not declared.

    Only the dataset's field schema is read; no samples are scanned.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        label_schemas: a dict mapping field paths to label schemas

    Returns:
        a dict mapping field paths to lists of undeclared attribute names
    """
    dataset = sample_collection._dataset
    undeclared = {}
    for path, base, attributes in _iter_schema_attributes(
        dataset, label_schemas
    ):
        names = [
            attr[foac.NAME]
            for attr in attributes
            if dataset.get_field("%s.%s" % (base, attr[foac.NAME])) is None
        ]
        if names:
            undeclared[path] = names

    return undeclared


def declare_label_schema_attributes(sample_collection, label_schemas):
    """Declares on the dataset's field schema the label attributes that the
    given label schemas define but the dataset has not declared.

    A label schema may define attributes that the dataset's field schema
    does not know about (``allow_new_attrs``), and annotating them stores
    values without declaring the fields. Everything in the App that reads
    the field schema, such as the sidebar, its filters and aggregations,
    then never sees those attributes. Declaring them fixes that.

    Attributes that already hold values are declared with the type of their
    values; attributes whose values have mixed types are skipped, with a
    warning, as :meth:`fiftyone.core.dataset.Dataset.add_dynamic_sample_fields`
    does. Attributes without values are declared with their label schema
    type.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        label_schemas: a dict mapping field paths to label schemas

    Returns:
        the list of paths that were declared
    """
    dataset = sample_collection._dataset
    frames_prefix = dataset._FRAMES_PREFIX
    declared = []

    for path, base, attributes in _iter_schema_attributes(
        dataset, label_schemas
    ):
        missing = [
            attr
            for attr in attributes
            if dataset.get_field("%s.%s" % (base, attr[foac.NAME])) is None
        ]
        if not missing:
            continue

        is_frame_field = path.startswith(frames_prefix)
        if is_frame_field:
            rel_path = path[len(frames_prefix) :]
            rel_base = base[len(frames_prefix) :]
            get_dynamic = dataset.get_dynamic_frame_field_schema
            add_field = dataset.add_frame_field
            add_dynamic = dataset.add_dynamic_frame_fields
        else:
            rel_path = path
            rel_base = base
            get_dynamic = dataset.get_dynamic_field_schema
            add_field = dataset.add_sample_field
            add_dynamic = dataset.add_dynamic_sample_fields

        list_key = base[len(path) + 1 :] or None
        names = [attr[foac.NAME] for attr in missing]

        # One pass over the field reads just the missing attributes' value
        # types. Past a handful of attributes, the full dynamic schema scan
        # of the field is as fast, so it is used directly
        if len(names) <= _MAX_TARGETED_ATTRIBUTES:
            picks = {
                name: _pick_attribute_field(*types)
                for name, types in _scan_attribute_types(
                    dataset, path, list_key, names
                ).items()
            }
        else:
            picks = {name: _FALLBACK for name in names}

        if _FALLBACK in picks.values():
            dynamic = get_dynamic(fields=rel_path) or {}
            for name, pick in picks.items():
                if pick is _FALLBACK:
                    picks[name] = _field_from_dynamic(
                        dynamic.get("%s.%s" % (rel_base, name))
                    )

        from_values = {}
        for attr in missing:
            name = attr[foac.NAME]
            attr_path = "%s.%s" % (rel_base, name)
            pick = picks[name]
            if pick is _MIXED:
                logger.warning(
                    "Skipping label schema attribute '%s.%s': its values "
                    "have mixed types",
                    base,
                    name,
                )
                continue

            if pick is None:
                attr_type = attr[foac.TYPE]
                ftype = foac.TYPE_TO_FIELD[attr_type]
                if attr_type in (
                    foac.FLOAT_LIST,
                    foac.INT_LIST,
                    foac.STR_LIST,
                ):
                    add_field(attr_path, fof.ListField, subfield=ftype)
                else:
                    add_field(attr_path, ftype)

                declared.append("%s.%s" % (base, name))
                continue

            from_values[attr_path] = pick

        if from_values:
            add_dynamic(fields=from_values)
            declared.extend(
                frames_prefix + p if is_frame_field else p for p in from_values
            )

    return declared


#: The number of missing attributes of one field up to which a targeted scan
#: of their values is faster than the full dynamic schema scan of the field
_MAX_TARGETED_ATTRIBUTES = 8

#: Value types that need the full dynamic schema scan (embedded documents,
#: lists of documents or lists)
_FALLBACK = "fallback"

#: Values of mixed types, which are not declared
_MIXED = "mixed"

_SCALAR_FIELDS = {
    "string": fof.StringField,
    "bool": fof.BooleanField,
    "date": fof.DateTimeField,
    "objectId": fof.ObjectIdField,
}
_INT_TYPES = {"int", "long"}
_FLOAT_TYPES = {"double", "decimal"}
_NO_VALUE_TYPES = {"null", "missing"}


def _iter_schema_attributes(dataset, label_schemas):
    """Yields ``(path, path of its label list or label, attributes)`` for
    the label fields of ``label_schemas`` whose attributes have a known
    type."""
    for path, label_schema in (label_schemas or {}).items():
        if not isinstance(label_schema, dict):
            continue

        attributes = [
            attr
            for attr in label_schema.get(foac.ATTRIBUTES) or []
            if isinstance(attr, dict)
            and attr.get(foac.NAME)
            and attr.get(foac.TYPE) in foac.TYPE_TO_FIELD
        ]
        if not attributes:
            continue

        field = dataset.get_field(path)
        if not isinstance(field, fof.EmbeddedDocumentField) or not issubclass(
            field.document_type, fol.Label
        ):
            continue

        list_field = getattr(field.document_type, "_LABEL_LIST_FIELD", None)
        base = "%s.%s" % (path, list_field) if list_field else path
        yield path, base, attributes


def _scan_attribute_types(dataset, path, list_key, names):
    """Returns ``{name: (value types, array element types)}`` for the given
    attributes of the label field ``path``, as BSON type names, in one
    aggregation. ObjectId values are stored under ``_<name>``, so that key
    is read too."""
    frames_prefix = dataset._FRAMES_PREFIX
    if path.startswith(frames_prefix):
        coll = dataset._frame_collection
        path = path[len(frames_prefix) :]
    else:
        coll = dataset._sample_collection

    root = "$" + path + ("." + list_key if list_key else "")
    pipeline = [{"$project": {"d": root}}]
    if list_key:
        pipeline.append({"$unwind": "$d"})

    group = {"_id": None}
    for i, name in enumerate(names):
        value = "$d." + name
        group["t%d" % i] = {"$addToSet": {"$type": value}}
        group["e%d" % i] = {
            "$addToSet": {
                "$cond": [
                    {"$isArray": value},
                    {
                        "$map": {
                            "input": value,
                            "as": "v",
                            "in": {"$type": "$$v"},
                        }
                    },
                    [],
                ]
            }
        }
        group["o%d" % i] = {"$addToSet": {"$type": "$d._" + name}}

    pipeline.append({"$group": group})
    results = list(coll.aggregate(pipeline, allowDiskUse=True))
    result = results[0] if results else {}

    types = {}
    for i, name in enumerate(names):
        value_types = set(result.get("t%d" % i, [])) - _NO_VALUE_TYPES
        value_types |= set(result.get("o%d" % i, [])) & {"objectId"}
        elem_types = {
            t for types_ in result.get("e%d" % i, []) for t in types_
        } - _NO_VALUE_TYPES
        types[name] = (value_types, elem_types)

    return types


def _pick_attribute_field(value_types, elem_types):
    """Returns the field to declare for an attribute's value types:
    ``None`` when it has no values, :data:`_MIXED` for mixed types, or
    :data:`_FALLBACK` when the full dynamic schema scan must decide."""
    if not value_types:
        return None

    if value_types == {"array"}:
        if not elem_types:
            # only empty lists: no element type to declare
            return _MIXED

        field = _scalar_field(elem_types)
        if field is _FALLBACK or field is _MIXED:
            return field

        return fof.ListField(field=field)

    if "array" in value_types or "object" in value_types:
        return _MIXED if len(value_types) > 1 else _FALLBACK

    return _scalar_field(value_types)


def _scalar_field(types):
    if types <= _INT_TYPES:
        return fof.IntField()

    if types <= _INT_TYPES | _FLOAT_TYPES:
        # ints and floats together are declared as floats
        return fof.FloatField()

    known = set(_SCALAR_FIELDS) | _INT_TYPES | _FLOAT_TYPES
    if not types <= known:
        return _FALLBACK

    if len(types) > 1:
        return _MIXED

    (bson_type,) = types
    return _SCALAR_FIELDS[bson_type]()


def _field_from_dynamic(field):
    """The field to declare from a full dynamic schema scan result."""
    if field is None:
        return None

    # mixed types are reported as a list of fields, also as a list field's
    # element type
    if not isinstance(field, fof.Field):
        return _MIXED

    if isinstance(field, fof.ListField) and isinstance(
        field.field, (list, tuple)
    ):
        return _MIXED

    return field
