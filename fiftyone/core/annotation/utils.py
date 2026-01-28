"""
Annotation utils

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

    Returns:
        a sorted list of valid annotation field names
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


# =============================================================================
# New Attribute Field Helpers
# =============================================================================


def _validate_attribute_entry(attr_name, attr_schema, type_to_ftype):
    """Validate a single attribute entry.

    Args:
        attr_name: the attribute name
        attr_schema: the attribute schema dict
        type_to_ftype: mapping of type strings to field types

    Raises:
        TypeError: if attr_schema is not a dict
        ValueError: if attr_name or attr_type is invalid
    """
    if not isinstance(attr_name, str):
        raise ValueError(
            f"Attribute name must be a string, got {type(attr_name).__name__}"
        )

    if not isinstance(attr_schema, dict):
        raise TypeError(
            f"Attribute schema for '{attr_name}' must be a dict, "
            f"got {type(attr_schema).__name__}"
        )

    attr_type = attr_schema.get("type", "str")
    if not isinstance(attr_type, str):
        raise ValueError(
            f"Attribute type for '{attr_name}' must be a string, "
            f"got {type(attr_type).__name__}"
        )

    if attr_type not in type_to_ftype:
        raise ValueError(
            f"Unknown attribute type '{attr_type}' for attribute '{attr_name}'"
        )


def _validate_attribute_values(attr_name, attr_type, attr_schema):
    """Validate values for components that require them.

    Args:
        attr_name: the attribute name
        attr_type: the attribute type string
        attr_schema: the attribute schema dict

    Raises:
        ValueError: if values are missing, not a list, or have invalid types
    """
    component = attr_schema.get("component")
    is_list_type = attr_type.startswith("list<")

    if component not in foac.VALUES_COMPONENTS and not is_list_type:
        return

    values = attr_schema.get("values")

    if values is None or values == []:
        raise ValueError(
            f"Values for attribute '{attr_name}' must be a non-empty list "
            f"for value-driven components"
        )

    if not isinstance(values, list):
        raise ValueError(
            f"Values for attribute '{attr_name}' must be a list, "
            f"got {type(values).__name__}"
        )


def _get_attribute_base_path(dataset, field):
    """Get the base path for adding attributes to a label field.

    Args:
        dataset: the dataset
        field: the label field name

    Returns:
        the base path string, or None if the field is not a valid label field
    """
    label_field = dataset.get_field(field)
    if label_field is None:
        return None

    # Handle list fields (e.g., Detections which wraps Detection)
    if isinstance(label_field, fof.ListField):
        label_field = label_field.field

    if not isinstance(label_field, fof.EmbeddedDocumentField):
        return None

    # For label list types (e.g., Detections), attributes are on inner objects
    if issubclass(label_field.document_type, fol._HasLabelList):
        list_field = label_field.document_type._LABEL_LIST_FIELD
        return f"{field}.{list_field}"

    return field


def _add_attribute_field(dataset, attr_path, attr_type, type_to_ftype):
    """Add a single attribute field to the dataset.

    Args:
        dataset: the dataset
        attr_path: the full path for the attribute
        attr_type: the attribute type string
        type_to_ftype: mapping of type strings to field types
    """
    # Skip if field already exists
    if dataset.get_field(attr_path) is not None:
        return

    if attr_type.startswith("list<"):
        subfield = type_to_ftype[attr_type]()
        dataset.add_sample_field(attr_path, fof.ListField, subfield=subfield)
    else:
        ftype = type_to_ftype[attr_type]
        dataset.add_sample_field(attr_path, ftype)


def add_new_attributes(dataset, field, new_attributes) -> None:
    """Add new attribute fields to the dataset schema.

    Args:
        dataset: the dataset
        field: the label field name (e.g., "ground_truth")
        new_attributes: dict mapping attribute names to their schema info
            e.g., {"sensor": {"type": "radio", "values": ["a", "b"]}}

    Raises:
        TypeError: if new_attributes or attr_schema is not a dict
        ValueError: if attr_name is not a string, attr_type is invalid,
            or required values are missing/malformed
    """
    if not isinstance(new_attributes, dict):
        raise TypeError(
            f"new_attributes must be a dict, got {type(new_attributes).__name__}"
        )

    type_to_ftype = foac.TYPES_TO_FIELD_TYPE

    # Validate all attributes up-front
    for attr_name, attr_schema in new_attributes.items():
        _validate_attribute_entry(attr_name, attr_schema, type_to_ftype)
        attr_type = attr_schema.get("type", "str")
        _validate_attribute_values(attr_name, attr_type, attr_schema)

    # Get the base path for attributes
    base_path = _get_attribute_base_path(dataset, field)
    if base_path is None:
        return

    # Add each attribute field
    for attr_name, attr_schema in new_attributes.items():
        attr_type = attr_schema.get("type", "str")
        attr_path = f"{base_path}.{attr_name}"
        _add_attribute_field(dataset, attr_path, attr_type, type_to_ftype)
