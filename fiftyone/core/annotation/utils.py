"""
Annotation utils

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone.core.annotation.constants as foac
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom


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


def declare_label_schema_attributes(sample_collection, label_schemas):
    """Declares on the dataset's field schema the label attributes that the
    given label schemas define but the dataset has not declared.

    A label schema may define attributes that the dataset's field schema
    does not know about (``allow_new_attrs``), and annotating them stores
    values without declaring the fields. Everything in the App that reads
    the field schema, such as the sidebar, its filters and aggregations,
    then never sees those attributes. Declaring them fixes that.

    Attributes that already hold values are declared with the type of their
    values (attributes whose values have mixed types are skipped).
    Attributes without values are declared with their label schema type.

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
            dynamic = dataset.get_dynamic_frame_field_schema(fields=rel_path)
            add_field = dataset.add_frame_field
            add_dynamic = dataset.add_dynamic_frame_fields
        else:
            rel_base = base
            dynamic = dataset.get_dynamic_field_schema(fields=path)
            add_field = dataset.add_sample_field
            add_dynamic = dataset.add_dynamic_sample_fields

        dynamic = dynamic or {}
        from_values = {}
        for attr in missing:
            name = attr[foac.NAME]
            rel_path = "%s.%s" % (rel_base, name)
            if rel_path in dynamic:
                # mixed types are reported as a list of fields: skip them
                if isinstance(dynamic[rel_path], fof.Field):
                    from_values[rel_path] = dynamic[rel_path]
                continue

            attr_type = attr[foac.TYPE]
            ftype = foac.TYPE_TO_FIELD[attr_type]
            if attr_type in (foac.FLOAT_LIST, foac.INT_LIST, foac.STR_LIST):
                add_field(rel_path, fof.ListField, subfield=ftype)
            else:
                add_field(rel_path, ftype)

            declared.append("%s.%s" % (base, name))

        if from_values:
            add_dynamic(fields=from_values)
            declared.extend(
                frames_prefix + p if is_frame_field else p for p in from_values
            )

    return declared
