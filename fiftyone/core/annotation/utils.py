"""
Annotation label schema generation

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone.core.annotation.constants as foac
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol


def get_all_supported_fields(collection, flatten=False):
    fields = collection.get_field_schema()
    media_type = collection.media_type

    result = set()
    for field_name, field in fields.items():

        if _is_supported_field(field, media_type):
            result.add(field_name)
            continue

        if field.document_type in foac.SUPPORTED_DOC_TYPES:
            result.add(field_name)
            continue

        if field.document_type in foac.SUPPORTED_LABEL_TYPES:
            result.add(field_name)
            continue

        if (
            media_type in foac.SUPPORTED_LABEL_TYPES_BY_MEDIA_TYPE
            and field.document_type
            in foac.SUPPORTED_LABEL_TYPES_BY_MEDIA_TYPE[media_type]
        ):
            result.add(field_name)
            continue

    if flatten:
        result = flatten_fields(collection, result)

    return sorted(result)


def flatten_fields(collection, fields):
    """Flatten"""
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

        for subfield in field.fields:
            if not _is_supported_field(subfield, collection.media_type):
                continue

            flattened_fields.append(f"{field_name}.{subfield.name}")

    return sorted(set(flattened_fields))


def _is_supported_field(field, media_type, app_annotation_support=False):
    if _is_supported_primitive(field):
        return True

    if not isinstance(field, fof.EmbeddedDocumentField):
        return False

    if app_annotation_support:

        if field.document_type in foac.SUPPORTED_LABEL_TYPES:
            return True

        if (
            field.document_type
            in foac.SUPPORTED_LABEL_TYPES_BY_MEDIA_TYPE[media_type]
        ):
            return True

        return False

    if (
        issubclass(field.document_type, fol.Label)
        and field.document_type not in foac.UNSUPPORTED_LABEL_TYPES
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
