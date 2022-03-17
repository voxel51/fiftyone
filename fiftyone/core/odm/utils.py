"""
Utilities for documents.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import date, datetime
import inspect
import numbers
import six

from bson.objectid import ObjectId
import numpy as np

import fiftyone.core.fields as fof
import fiftyone.core.utils as fou

foed = fou.lazy_import("fiftyone.core.odm.embedded_document")


def create_field(
    name,
    ftype,
    embedded_doc_type=None,
    subfield=None,
    db_field=None,
    fields=None,
    parent=None,
):
    """Creates the :class:`fiftyone.core.fields.Field` instance defined by the
    given specification.

    .. note::

        This method is used exclusively to create user-defined (non-default)
        fields. Any parameters accepted here must be stored on
        :class:`fiftyone.core.odm.dataset.SampleFieldDocument` or else datasets
        will "lose" any additional decorations when they are loaded from the
        database.

    Args:
        name: the field name
        ftype: the field type to create. Must be a subclass of
            :class:`fiftyone.core.fields.Field`
        embedded_doc_type (None): the
            :class:`fiftyone.core.odm.BaseEmbeddedDocument` type of the field.
            Only applicable when ``ftype`` is
            :class:`fiftyone.core.fields.EmbeddedDocumentField`
        subfield (None): the :class:`fiftyone.core.fields.Field` type of the
            contained field. Only applicable when ``ftype`` is
            :class:`fiftyone.core.fields.ListField` or
            :class:`fiftyone.core.fields.DictField`
        db_field (None): the database field to store this field in. By default,
            ``name`` is used
        fields (None): a list of :class:`fiftyone.core.fields.Field` instances
            describing custom embedded fields of the
            :class:`fiftyone.core.fields.EmbeddedDocumentField`. Only when
            ``ftype`` is :class:`fiftyone.core.fields.EmbeddedDocumentField`
        parent (None): a parent

    Returns:
        a :class:`fiftyone.core.fields.Field`
    """
    if not issubclass(ftype, fof.Field):
        raise ValueError(
            "Invalid field type %s; must be a subclass of %s"
            % (ftype, fof.Field)
        )

    if db_field is None:
        db_field = name

    # All user-defined fields are nullable
    kwargs = dict(null=True, db_field=db_field)

    if fields is not None:
        for idx, value in enumerate(fields):
            if isinstance(value, fof.Field):
                continue

            fields[idx] = create_field(name, **value)

    if issubclass(ftype, (fof.ListField, fof.DictField)):
        if subfield is not None:
            if inspect.isclass(subfield):
                if issubclass(subfield, fof.EmbeddedDocumentField):
                    subfield = create_field(
                        name,
                        subfield,
                        embedded_doc_type=embedded_doc_type,
                        fields=fields or [],
                        parent=parent,
                    )
                else:
                    subfield = subfield()

                subfield.name = name

            if not isinstance(subfield, fof.Field):
                raise ValueError(
                    "Invalid subfield type %s; must be a subclass of %s"
                    % (type(subfield), fof.Field)
                )

            kwargs["field"] = subfield

    if issubclass(ftype, fof.EmbeddedDocumentField):
        if not issubclass(embedded_doc_type, foed.BaseEmbeddedDocument):
            raise ValueError(
                "Invalid embedded_doc_type %s; must be a subclass of %s"
                % (embedded_doc_type, foed.BaseEmbeddedDocument)
            )

        kwargs.update(
            {"document_type": embedded_doc_type, "fields": fields or []}
        )

    field = ftype(**kwargs)
    field.name = name

    if parent is not None and isinstance(field, fof.EmbeddedDocumentField):
        field._set_parent(parent)

    if fields:
        parent = field.field if subfield else field
        for child in fields:
            if not isinstance(child, fof.EmbeddedDocumentField):
                continue

            child._set_parent(parent)

    return field


def get_field_kwargs(field):
    """Constructs the field keyword arguments dictionary for the given
    :class:`fiftyone.core.fields.Field` instance.

    Args:
        field: a :class:`fiftyone.core.fields.Field`

    Returns:
        a field specification dict
    """
    kwargs = {"ftype": type(field)}

    if isinstance(field, (fof.ListField, fof.DictField)):
        field = field.field
        kwargs["subfield"] = type(field)

    if isinstance(field, fof.EmbeddedDocumentField):
        kwargs["embedded_doc_type"] = field.document_type
        kwargs["fields"] = [
            get_field_kwargs(field) for field in getattr(field, "fields", [])
        ]

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
            "fields": _get_embedded_document_fields(value),
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
                document_types = {type(v) for v in value}
                if len(document_types) > 1:
                    raise ValueError(
                        "Cannot infer single type for %s with multiple value "
                        "types %s" % (value_type, document_types)
                    )

                kwargs["embedded_doc_type"] = document_types.pop()

                kwargs["fields"] = _merge_implied_field_kwargs(
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


def validate_fields_match(name, field, existing_field):
    """Validates that the types of the given fields match.

    Embedded document fields are not validated, if applicable.

    Args:
        name: the field name
        field: a :class:`fiftyone.core.fields.Field`
        existing_field: the reference :class:`fiftyone.core.fields.Field`

    Raises:
        ValueError: if the fields do not match
    """
    if type(field) is not type(existing_field):
        raise ValueError(
            "Field '%s' type %s does not match existing field type %s"
            % (name, field, existing_field)
        )

    if isinstance(field, fof.EmbeddedDocumentField):
        if not issubclass(field.document_type, existing_field.document_type):
            raise ValueError(
                "Embedded document field '%s' type %s does not match existing "
                "field type %s"
                % (name, field.document_type, existing_field.document_type)
            )

    if isinstance(field, (fof.ListField, fof.DictField)):
        if existing_field.field is not None and not isinstance(
            field.field, type(existing_field.field)
        ):
            raise ValueError(
                "%s '%s' type %s does not match existing field type %s"
                % (
                    field.__class__.__name__,
                    name,
                    field.field,
                    existing_field.field,
                )
            )


def _get_embedded_document_fields(value):
    return [field for name, field in value._fields.items() if name != "_cls"]


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


# @todo this seems broken... `fields` is a list, not a dict
def _merge_implied_field_kwargs(list_of_kwargs):
    fields = {}
    for kwargs in list_of_kwargs:
        for name, field_kwargs in kwargs.get("fields", {}).items():
            if name not in fields:
                fields[name] = field_kwargs
                continue

            ftype = fields[name]

            if ftype != field_kwargs["ftype"]:
                raise TypeError(
                    "Cannot merge fields of types '%s' and '%s'"
                    % (ftype, field_kwargs["ftype"])
                )

            if issubclass(ftype, fof.ListField):
                subfield = fields["subfield"]
                if subfield != field_kwargs["subfield"]:
                    raise TypeError(
                        "Cannot merge subfields of types '%s' and '%s'"
                        % (subfield, field_kwargs["subfield"])
                    )

                if subfield == fof.EmbeddedDocumentField:
                    ftype = subfield

            if ftype == fof.EmbeddedDocumentField:
                document_type = fields[name]["document_type"]
                if document_type != field_kwargs["document_type"]:
                    raise TypeError(
                        "Cannot merge documents of types '%s' and '%s'"
                        % (document_type, field_kwargs["document_type"])
                    )

                fields[name]["fields"] = _merge_implied_field_kwargs(
                    [fields[name]["fields"], field_kwargs["fields"]]
                )

    return [dict(name=name, **kwargs) for name, kwargs in fields.items()]
