"""
Annotation label schema generation

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone.core.annotation.constants as foac
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol


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

    Currently supported  media types for the collection are ``image`` and
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
    sample_collection, require_app_support=False, flatten=False
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
    """
    fields = sample_collection.get_field_schema()
    media_type = sample_collection.media_type

    result = set()
    for field_name, field in fields.items():

        if _is_supported_primitive(field):
            result.add(field_name)
            continue

        if not isinstance(field, fof.EmbeddedDocumentField):
            continue

        if field.document_type in foac.SUPPORTED_DOC_TYPES:
            result.add(field_name)
            continue

        if _is_supported_label(field, media_type, require_app_support):
            result.add(field_name)

    if flatten:
        result = flatten_fields(sample_collection, result, require_app_support)

    return sorted(result)


def flatten_fields(collection, fields, require_app_support=False):
    """Flattens embedded document fields into dot-separated paths.

    Args:
        collection: the sample collection
        fields: iterable of field names to flatten
        app_support (False): whether to only include fields supported by the
            App for annotation

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
                subfield, collection.media_type, require_app_support
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


def _is_supported_label(field, media_type, require_app_support):
    if not require_app_support:
        return field.document_type not in foac.UNSUPPORTED_LABEL_TYPES

    if field.document_type in foac.SUPPORTED_LABEL_TYPES:
        return True

    if (
        media_type in foac.SUPPORTED_LABEL_TYPES_BY_MEDIA_TYPE
        and field.document_type
        in foac.SUPPORTED_LABEL_TYPES_BY_MEDIA_TYPE[media_type]
    ):
        return True

    return False


def _is_supported_primitive(field):
    if isinstance(field, foac.SUPPORTED_PRIMITIVES):
        return True

    if isinstance(field, fof.ListField):
        if isinstance(field.field, foac.SUPPORTED_LISTS_OF_PRIMITIVES):
            return True

    return False
