"""
Utilities for documents.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import date, datetime
import numbers
import six

from bson.objectid import ObjectId
import numpy as np

import fiftyone.core.fields as fof
import fiftyone.core.utils as fou

foed = fou.lazy_import("fiftyone.core.odm.embedded_document")


def get_implied_field_kwargs(value):
    """Infers the field keyword arguments dictionary for a field that can hold
    values of the given type.

    Args:
        value: a value

    Returns:
        a field specification dict
    """
    if isinstance(value, foed.BaseEmbeddedDocument):
        return {
            "ftype": fof.EmbeddedDocumentField,
            "embedded_doc_type": type(value),
            "fields": get_embedded_document_fields(value),
        }

    if isinstance(value, bool):
        return {"ftype": fof.BooleanField}

    if isinstance(value, six.integer_types):
        return {"ftype": fof.IntField}

    if isinstance(value, numbers.Number):
        return {"ftype": fof.FloatField}

    if isinstance(value, six.string_types):
        return {"ftype": fof.StringField}

    if isinstance(value, datetime):
        return {"ftype": fof.DateTimeField}

    if isinstance(value, date):
        return {"ftype": fof.DateField}

    if isinstance(value, (list, tuple)):
        kwargs = {"ftype": fof.ListField}

        value_types = set(_get_list_value_type(v) for v in value)

        if value_types == {fof.IntField, fof.FloatField}:
            kwargs["subfield"] = fof.FloatField
        elif len(value_types) == 1:
            value_type = next(iter(value_types))
            if value_type is not None:
                kwargs["subfield"] = value_type

            if value_type == fof.EmbeddedDocumentField:
                document_types = {v.__class__ for v in value}
                if len(document_types) > 1:
                    raise ValueError("Cannot merge types")

                kwargs["embedded_doc_type"] = document_types.pop()

                kwargs["fields"] = _merge_implied_fields(
                    [get_implied_field_kwargs(v) for v in value]
                )

        return kwargs

    if isinstance(value, np.ndarray):
        if value.ndim == 1:
            return {"ftype": fof.VectorField}

        return {"ftype": fof.ArrayField}

    if isinstance(value, dict):
        return {"ftype": fof.DictField}

    if isinstance(value, ObjectId):
        return {"ftype": fof.ObjectIdField}

    raise TypeError(
        "Cannot infer an appropriate field type for value '%s'" % value
    )


def get_embedded_document_fields(value):
    return [field for name, field in value._fields.items() if name != "_cls"]


def _get_list_value_type(value):
    if isinstance(value, bool):
        return fof.BooleanField

    if isinstance(value, six.integer_types):
        return fof.IntField

    if isinstance(value, numbers.Number):
        return fof.FloatField

    if isinstance(value, six.string_types):
        return fof.StringField

    if isinstance(value, ObjectId):
        return fof.ObjectIdField

    if isinstance(value, foed.BaseEmbeddedDocument):
        return fof.EmbeddedDocumentField

    if isinstance(value, datetime):
        return fof.DateTimeField

    if isinstance(value, date):
        return fof.DateField

    return None


def _merge_implied_fields(implied_fields):
    fields = {}
    for kwargs in implied_fields:
        for field, field_kwargs in kwargs.get("fields", {}).items():
            if field not in fields:
                fields[field] = field_kwargs
                continue

            ftype = fields[field]
            if ftype != field_kwargs["ftype"]:
                raise TypeError("Cannot merge")

            if issubclass(ftype, fof.ListField):
                subfield = fields["subfield"]
                if subfield != field_kwargs["subfield"]:
                    raise TypeError("Cannot merge")

                if subfield == fof.EmbeddedDocumentField:
                    ftype = subfield

            if ftype == fof.EmbeddedDocumentField:
                document_type = fields[field]["document_type"]
                if document_type != field_kwargs["document_type"]:
                    raise TypeError("Cannot merge")

                fields[field]["fields"] = _merge_implied_fields(
                    [fields[field]["fields"], field_kwargs["fields"]]
                )

    return [dict(name=name, **kwargs) for name, kwargs in field.items()]
