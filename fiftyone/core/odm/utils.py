"""
Utilities for documents.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from datetime import date, datetime
import numbers
import six

from bson.objectid import ObjectId
import numpy as np

import fiftyone.core.fields as fof
import fiftyone.core.utils as fou

foed = fou.lazy_import("fiftyone.core.odm.embedded_document")


def get_field_kwargs(field):
    """Constructs the field keyword arguments dictionary for the given
    :class:`fiftyone.core.fields.Field` instance.

    Args:
        field: a :class:`fiftyone.core.fields.Field`
        custom (True): include custom fields

    Returns:
        a field specification dict
    """
    kwargs = {"ftype": type(field), "fields": []}

    if isinstance(field, (fof.ListField, fof.DictField)):
        field = field.field
        if field is not None:
            kwargs["subfield"] = type(field)

    if isinstance(field, fof.EmbeddedDocumentField):
        kwargs["embedded_doc_type"] = field.document_type
        for f in getattr(field, "fields", []):
            fkwargs = get_field_kwargs(f)
            fkwargs["name"] = f.name
            kwargs["fields"].append(fkwargs)

    return kwargs


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
            "fields": [
                dict(
                    name=name,
                    **_merge_field_kwargs(
                        [
                            get_implied_field_kwargs(value[name]),
                            get_field_kwargs(value.get_field_def(name)),
                        ]
                    )
                )
                for name in value._fields_ordered
                if getattr(value, name, None) is not None
                and not name.startswith("_")
            ],
        }

    if isinstance(value, bool):
        return {"ftype": fof.BooleanField}

    if isinstance(value, numbers.Integral):
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

                data = defaultdict(list)

                for v in value:
                    for n in v.get_field_schema():
                        vv = getattr(v, n, None)
                        if vv is not None:
                            data[n].append(get_implied_field_kwargs(vv))

                kwargs["fields"] = [
                    dict(name=n, **_merge_field_kwargs(l))
                    for n, l in data.items()
                ]

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


def _get_list_value_type(value):
    if isinstance(value, bool):
        return fof.BooleanField

    if isinstance(value, numbers.Integral):
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


def _merge_field_kwargs(fields_list):
    kwargs = {}
    for field_kwargs in fields_list:
        ftype = kwargs.get("ftype", field_kwargs["ftype"])
        if ftype != field_kwargs["ftype"]:
            raise TypeError("Cannot merge")
        kwargs["ftype"] = ftype

        if issubclass(ftype, fof.ListField):
            subfield = kwargs.get(
                "subfield", field_kwargs.get("subfield", None)
            )
            proposed_subfield = field_kwargs.get("subfield", None)
            if (
                subfield
                and proposed_subfield
                and subfield != proposed_subfield
            ):
                raise TypeError("Cannot merge")

            kwargs["subfield"] = subfield

            if subfield == fof.EmbeddedDocumentField:
                ftype = subfield

        if ftype == fof.EmbeddedDocumentField:
            document_type = kwargs.get(
                "embedded_doc_type",
                field_kwargs.get("embedded_doc_type", None),
            )
            if (
                document_type
                and document_type != field_kwargs["embedded_doc_type"]
            ):
                raise TypeError("Cannot merge")

            kwargs["embedded_doc_type"] = document_type
            data = {f["name"]: f for f in field_kwargs.get("fields", [])}

            for f in kwargs.get("fields", []):
                if f["name"] in data:
                    data[f["name"]] = _merge_field_kwargs([data[f["name"]], f])
                else:
                    data[f["name"]] = f

            kwargs["fields"] = []
            for name, v in data.items():
                v["name"] = name
                kwargs["fields"].append(v)

    return kwargs
