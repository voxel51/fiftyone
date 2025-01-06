"""
Utilities for documents.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import date, datetime
import inspect
import json
import numbers
import sys

from bson import Binary, json_util, ObjectId, SON
import numpy as np
import pytz

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.fields as fof
import fiftyone.core.media as fom
import fiftyone.core.utils as fou

fol = fou.lazy_import("fiftyone.core.labels")
food = fou.lazy_import("fiftyone.core.odm.document")
fooe = fou.lazy_import("fiftyone.core.odm.embedded_document")


def serialize_value(value, extended=False):
    """Serializes the given value.

    Args:
        value: the value
        extended (False): whether to serialize extended JSON constructs such as
            ObjectIDs, Binary, etc. into JSON format

    Returns:
        the serialized value
    """
    if isinstance(value, SON):
        return value

    if hasattr(value, "to_dict") and callable(value.to_dict):
        # EmbeddedDocumentField
        return value.to_dict(extended=extended)

    if isinstance(value, (bool, np.bool_)):
        # BooleanField
        return bool(value)

    if isinstance(value, numbers.Integral):
        # IntField
        return int(value)

    if isinstance(value, numbers.Number):
        # FloatField
        return float(value)

    if isinstance(value, ObjectId) and extended:
        return {"$oid": str(value)}

    if type(value) is date:
        # DateField
        return datetime(value.year, value.month, value.day, tzinfo=pytz.utc)

    if isinstance(value, np.ndarray):
        # VectorField/ArrayField
        binary = Binary(fou.serialize_numpy_array(value))
        if not extended:
            return binary

        # @todo can we optimize this?
        return json.loads(json_util.dumps(binary))

    if isinstance(value, (list, tuple)):
        # ListField
        return [serialize_value(v, extended=extended) for v in value]

    if isinstance(value, dict):
        # DictField
        return {
            k: serialize_value(v, extended=extended) for k, v in value.items()
        }

    return value


def deserialize_value(value):
    """Deserializes the given value.

    Args:
        value: the serialized value

    Returns:
        the value
    """
    if isinstance(value, dict):
        if "_cls" in value:
            # Serialized document
            _cls = _document_registry[value["_cls"]]
            return _cls.from_dict(value)

        if "$binary" in value:
            # Serialized array in extended format
            binary = json_util.loads(json.dumps(value))
            return fou.deserialize_numpy_array(binary)

        if "$oid" in value:
            return ObjectId(value["$oid"])

        return value

    if isinstance(value, bytes):
        # Serialized array in non-extended format
        return fou.deserialize_numpy_array(value)

    return value


def validate_field_name(field_name, media_type=None, is_frame_field=False):
    """Verifies that the given field name is valid.

    Args:
        field_name: the field name
        media_type (None): the media type of the sample, if known
        is_frame_field (False): whether this is a frame-level field

    Raises:
        ValueError: if the field name is invalid
    """
    if not isinstance(field_name, str):
        raise ValueError(
            "Invalid field name '%s'. Field names must be strings; found "
            "%s" % (field_name, type(field_name))
        )

    chunks = field_name.split(".")

    if not all(c for c in chunks):
        raise ValueError(
            "Invalid field name '%s'. Field names cannot be empty" % field_name
        )

    if any(c.startswith("_") for c in chunks):
        raise ValueError(
            "Invalid field name: '%s'. Field names cannot start with '_'"
            % field_name
        )

    if "$" in field_name:
        raise ValueError(
            "Invalid field name: '%s'. Field names cannot contain '$'"
            % field_name
        )

    if (
        media_type == fom.VIDEO
        and not is_frame_field
        and field_name == "frames"
    ):
        raise ValueError(
            "Invalid field name '%s'. 'frames' is a reserved keyword for "
            "video datasets" % field_name
        )

    if (
        media_type == fom.GROUP
        and not is_frame_field
        and field_name == "groups"
    ):
        raise ValueError(
            "Invalid field name '%s'. 'groups' is a reserved keyword for "
            "grouped datasets" % field_name
        )


def create_field(
    name,
    ftype,
    embedded_doc_type=None,
    subfield=None,
    fields=None,
    db_field=None,
    description=None,
    info=None,
    read_only=False,
    created_at=None,
    **kwargs,
):
    """Creates the field defined by the given specification.

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
        fields (None): a list of :class:`fiftyone.core.fields.Field` instances
            defining embedded document attributes. Only applicable when
            ``ftype`` is :class:`fiftyone.core.fields.EmbeddedDocumentField`
        db_field (None): the database field to store this field in. By default,
            ``name`` is used
        description (None): an optional description
        info (None): an optional info dict
        read_only (False): whether the field should be read-only
        created_at (None): the datetime the field was created

    Returns:
        a :class:`fiftyone.core.fields.Field`
    """
    if db_field is None:
        if issubclass(ftype, fof.ObjectIdField) and not name.startswith("_"):
            db_field = "_" + name
        else:
            db_field = name

    field_kwargs = dict(
        null=True,  # all user-defined fields are nullable
        db_field=db_field,
        description=description,
        info=info,
        read_only=read_only,
        created_at=created_at,
    )
    field_kwargs.update(kwargs)

    if fields is not None:
        fields = [
            create_field(**f) if not isinstance(f, fof.Field) else f
            for f in fields
        ]

    if issubclass(ftype, (fof.ListField, fof.DictField)):
        if subfield is not None:
            if inspect.isclass(subfield):
                if issubclass(subfield, fof.EmbeddedDocumentField):
                    subfield = subfield(embedded_doc_type)
                else:
                    subfield = subfield()

            if not isinstance(subfield, fof.Field):
                raise ValueError(
                    "Invalid subfield type %s; must be a subclass of %s"
                    % (type(subfield), fof.Field)
                )

            if (
                isinstance(subfield, fof.EmbeddedDocumentField)
                and fields is not None
            ):
                subfield.fields = fields

            field_kwargs["field"] = subfield
    elif issubclass(ftype, fof.EmbeddedDocumentField):
        if embedded_doc_type is None or not issubclass(
            embedded_doc_type, fooe.BaseEmbeddedDocument
        ):
            raise ValueError(
                "Invalid embedded_doc_type %s; must be a subclass of %s"
                % (embedded_doc_type, fooe.BaseEmbeddedDocument)
            )

        field_kwargs["document_type"] = embedded_doc_type
        field_kwargs["fields"] = fields or []

    field = ftype(**field_kwargs)
    field.name = name

    return field


def create_implied_field(path, value, dynamic=False):
    """Creates the field for the given value.

    Args:
        path: the field name or path
        value: a value
        dynamic (False): whether to declare dynamic embedded document fields

    Returns:
        a :class:`fiftyone.core.fields.Field`
    """
    field_name = path.rsplit(".", 1)[-1]
    kwargs = get_implied_field_kwargs(value, dynamic=dynamic)
    return create_field(field_name, **kwargs)


def get_field_kwargs(field):
    """Constructs the field keyword arguments dictionary for the given field.

    Args:
        field: a :class:`fiftyone.core.fields.Field` or ``str(field)``
            representation of one

    Returns:
        a field specification dict
    """
    if etau.is_str(field):
        return _parse_field_str(field)

    fields = []

    kwargs = {
        "ftype": type(field),
        "fields": fields,
        "db_field": field.db_field,
        "description": field.description,
        "info": field.info,
        "read_only": field.read_only,
        "created_at": field.created_at,
    }

    if isinstance(field, (fof.ListField, fof.DictField)):
        field = field.field
        if field is not None:
            kwargs["subfield"] = type(field)

    if isinstance(field, fof.EmbeddedDocumentField):
        kwargs["embedded_doc_type"] = field.document_type
        for f in field.get_field_schema().values():
            if not f.name.startswith("_"):
                _kwargs = get_field_kwargs(f)
                _kwargs["name"] = f.name
                fields.append(_kwargs)

    return kwargs


def _parse_field_str(field_str):
    # eg: "fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Detections)"
    chunks = field_str.strip().split("(", 1)
    ftype = etau.get_class(chunks[0])
    kwargs = {"ftype": ftype}

    if len(chunks) > 1:
        param = etau.get_class(chunks[1][:-1])  # remove trailing ")"
        if issubclass(ftype, fof.EmbeddedDocumentField):
            kwargs["embedded_doc_type"] = param
        elif issubclass(ftype, (fof.ListField, fof.DictField)):
            kwargs["subfield"] = param
        else:
            raise ValueError("Failed to parse field string '%s'" % field_str)

    return kwargs


def get_implied_field_kwargs(value, dynamic=False):
    """Infers the field keyword arguments dictionary for a field that can hold
    the given value.

    Args:
        value: a value
        dynamic (False): whether to declare dynamic embedded document fields

    Returns:
        a field specification dict
    """
    if isinstance(value, fooe.BaseEmbeddedDocument):
        return {
            "ftype": fof.EmbeddedDocumentField,
            "embedded_doc_type": type(value),
            "fields": _parse_embedded_doc_fields(value, dynamic),
        }

    if isinstance(value, (bool, np.bool_)):
        return {"ftype": fof.BooleanField}

    if isinstance(value, numbers.Integral):
        return {"ftype": fof.IntField}

    if isinstance(value, numbers.Number):
        return {"ftype": fof.FloatField}

    if isinstance(value, str):
        return {"ftype": fof.StringField}

    if isinstance(value, ObjectId):
        return {"ftype": fof.ObjectIdField}

    if isinstance(value, datetime):
        return {"ftype": fof.DateTimeField}

    if isinstance(value, date):
        return {"ftype": fof.DateField}

    if isinstance(value, (list, tuple)):
        kwargs = {"ftype": fof.ListField}

        value_types = set(_get_field_type(v) for v in value)
        value_types.discard(None)

        if value_types == {fof.IntField, fof.FloatField}:
            value_types.discard(fof.IntField)

        if len(value_types) == 1:
            value_type = next(iter(value_types))
            kwargs["subfield"] = value_type

            if value_type == fof.EmbeddedDocumentField:
                document_type = _get_list_subfield_type(value)
                fields = _parse_embedded_doc_list_fields(value, dynamic)
                kwargs["embedded_doc_type"] = document_type
                kwargs["fields"] = fields

        return kwargs

    if isinstance(value, np.ndarray):
        if value.ndim == 1:
            return {"ftype": fof.VectorField}

        return {"ftype": fof.ArrayField}

    if isinstance(value, dict):
        return {"ftype": fof.DictField}

    raise TypeError(
        "Cannot infer an appropriate field type for value '%s'" % value
    )


def _get_field_kwargs(value, field, dynamic):
    kwargs = {
        "ftype": type(field),
        "db_field": field.db_field,
        "description": field.description,
        "info": field.info,
        "read_only": field.read_only,
        "created_at": field.created_at,
    }

    if isinstance(field, (fof.ListField, fof.DictField)):
        field = field.field
        if field is not None:
            kwargs["subfield"] = type(field)
            if isinstance(field, fof.EmbeddedDocumentField):
                fields = _parse_embedded_doc_list_fields(value, dynamic)
                kwargs["embedded_doc_type"] = field.document_type
                kwargs["fields"] = fields
    elif isinstance(field, fof.EmbeddedDocumentField):
        kwargs["embedded_doc_type"] = field.document_type
        kwargs["fields"] = _parse_embedded_doc_fields(value, dynamic)

    return kwargs


def _parse_embedded_doc_fields(doc, dynamic):
    fields = []

    is_label = isinstance(doc, fol.Label)
    for name, field in doc._fields.items():
        # @todo remove once attributes are deprecated
        if is_label and name == "attributes":
            continue

        value = getattr(doc, name, None)
        if value is not None and not name.startswith("_"):
            kwargs = _get_field_kwargs(value, field, dynamic)
            kwargs["name"] = name
            fields.append(kwargs)

    if not dynamic:
        return fields

    for name in doc._dynamic_fields.keys():
        value = getattr(doc, name, None)
        if value is not None and not name.startswith("_"):
            db_field = name if not isinstance(value, ObjectId) else "_" + name

            kwargs = get_implied_field_kwargs(value, dynamic=dynamic)
            kwargs["name"] = name
            kwargs["db_field"] = db_field
            fields.append(kwargs)

    return fields


def _parse_embedded_doc_list_fields(values, dynamic):
    if not values:
        return []

    fields_dict = {}
    for value in values:
        fields = _parse_embedded_doc_fields(value, dynamic)
        _merge_embedded_doc_fields(fields_dict, fields)

    return _finalize_embedded_doc_fields(fields_dict)


def _merge_embedded_doc_fields(fields_dict, fields):
    for field in fields:
        name = field["name"]
        ftype = field["ftype"]
        subfield = field.get("subfield", None)

        if name not in fields_dict:
            fields_dict[name] = field
            if ftype == fof.EmbeddedDocumentField:
                field["fields"] = {f["name"]: f for f in field["fields"]}
        else:
            efield = fields_dict[name]
            etype = efield["ftype"]
            if etype != ftype:
                # @todo could provide an `add_mixed=True` option to declare
                # mixed fields like this as a generic `Field`
                fields_dict[name] = None
            elif etype in (fof.ListField, fof.DictField):
                if "subfield" in efield and efield["subfield"] != subfield:
                    efield["subfield"] = None
                elif subfield is not None:
                    efield["subfield"] = subfield
            elif ftype == fof.EmbeddedDocumentField:
                _merge_embedded_doc_fields(efield["fields"], field["fields"])


def _finalize_embedded_doc_fields(fields_dict):
    fields = []
    for field in fields_dict.values():
        if field is not None:
            fields.append(field)
            if field["ftype"] == fof.EmbeddedDocumentField:
                field["fields"] = _finalize_embedded_doc_fields(
                    field["fields"]
                )

    return fields


def validate_fields_match(name, field, existing_field):
    """Validates that the types of the given fields match.

    Embedded document fields are not validated, if applicable.

    Args:
        name: the field name or ``embedded.field.name``
        field: a :class:`fiftyone.core.fields.Field`
        existing_field: the reference :class:`fiftyone.core.fields.Field`

    Raises:
        ValueError: if the fields do not match
    """
    if not issubclass(type(field), type(existing_field)) and not issubclass(
        type(existing_field), type(field)
    ):
        if isinstance(existing_field, fof.ObjectIdField) and isinstance(
            field, fof.StringField
        ):
            return

        raise ValueError(
            "Field '%s' type %s does not match existing field type %s"
            % (name, field, existing_field)
        )

    if isinstance(field, fof.EmbeddedDocumentField):
        if not issubclass(
            field.document_type, existing_field.document_type
        ) and not issubclass(
            existing_field.document_type, field.document_type
        ):
            raise ValueError(
                "Embedded document field '%s' type %s does not match existing "
                "field type %s"
                % (name, field.document_type, existing_field.document_type)
            )

    if isinstance(field, (fof.ListField, fof.DictField)):
        if (
            field.field is not None
            and existing_field.field is not None
            and not isinstance(field.field, type(existing_field.field))
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


def _get_field_type(value):
    if isinstance(value, (bool, np.bool_)):
        return fof.BooleanField

    if isinstance(value, numbers.Integral):
        return fof.IntField

    if isinstance(value, numbers.Number):
        return fof.FloatField

    if isinstance(value, str):
        return fof.StringField

    if isinstance(value, ObjectId):
        return fof.ObjectIdField

    if isinstance(value, fooe.BaseEmbeddedDocument):
        return fof.EmbeddedDocumentField

    if isinstance(value, datetime):
        return fof.DateTimeField

    if isinstance(value, date):
        return fof.DateField

    return None


def _get_list_subfield_type(values):
    for v in values:
        if v is not None:
            return type(v)

    return None


class DocumentRegistry(object):
    """A registry of
    :class:`fiftyone.core.odm.document.MongoEngineBaseDocument` classes found
    when importing data from the database.
    """

    def __init__(self):
        self._cache = {}

    def __repr__(self):
        return repr(self._cache)

    def __getitem__(self, name):
        # Check cache first
        cls = self._cache.get(name, None)
        if cls is not None:
            return cls

        # Then fiftyone namespace
        try:
            cls = self._get_cls(fo, name)
            self._cache[name] = cls
            return cls
        except AttributeError:
            pass

        # Then full module list
        all_modules = sys.modules.copy().values()
        for module in all_modules:
            try:
                cls = self._get_cls(module, name)
                self._cache[name] = cls
                return cls
            except AttributeError:
                pass

        raise DocumentRegistryError(
            "Could not locate document class '%s'.\n\nIf you are working with "
            "a dataset that uses custom embedded documents, you must add them "
            "to FiftyOne's module path. See "
            "https://docs.voxel51.com/user_guide/using_datasets.html#custom-embedded-documents "
            "for more information" % name
        )

    def _get_cls(self, module, name):
        cls = getattr(module, name)

        try:
            assert issubclass(cls, food.MongoEngineBaseDocument)
        except:
            raise AttributeError

        return cls


class DocumentRegistryError(Exception):
    """Error raised when an unknown document class is encountered."""

    pass


_document_registry = DocumentRegistry()


def load_dataset(id=None, name=None):
    """Loads the dataset from the database by its unique id or name. Throws
    an error if neither id nor name is provided.

    Args:
        id (None): the unique id of the dataset
        name (None): the name of the dataset

    Returns:
        a :class:`fiftyone.core.dataset.Dataset`
    """
    import fiftyone.core.odm as foo
    import fiftyone.core.dataset as fod

    if name:
        return fod.load_dataset(name)

    if not id:
        raise ValueError("Must provide either id or name")

    db = foo.get_db_conn()
    try:
        uid = ObjectId(id)
    except:
        # Although _id is an ObjectId by default, it's possible to set it to
        # something else
        uid = id

    res = db.datasets.find_one({"_id": uid}, {"name": True})
    if not res:
        raise ValueError(f"Dataset with _id={uid} does not exist")
    return fod.load_dataset(res.get("name"))
