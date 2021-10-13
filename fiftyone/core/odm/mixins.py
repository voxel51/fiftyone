"""
Mixins and helpers for dataset backing documents.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import OrderedDict
from datetime import date, datetime
import json
import logging
import numbers
import six

from bson import json_util
from bson.binary import Binary
import numpy as np

import fiftyone as fo
import fiftyone.core.fields as fof
import fiftyone.core.utils as fou

from .database import get_db_conn
from .dataset import create_field, SampleFieldDocument
from .document import Document, BaseEmbeddedDocument

fod = fou.lazy_import("fiftyone.core.dataset")


logger = logging.getLogger(__name__)


def get_default_fields(cls, include_private=False, use_db_fields=False):
    """Gets the default fields present on all instances of the given
    :class:`DatasetMixin` class.

    Args:
        cls: the :class:`DatasetMixin` class
        include_private (False): whether to include fields starting with ``_``
        use_db_fields (False): whether to return database fields rather than
            user-facing fields, when applicable

    Returns:
        a tuple of field names
    """
    return cls._get_fields_ordered(
        include_private=include_private, use_db_fields=use_db_fields
    )


def validate_fields_match(
    field_name, field_or_kwargs, existing_field_or_kwargs
):
    """Validates that a given field or field description matches the type of
    the existing field.

    Args:
        field_name: the name of the field
        field_or_kwargs: a :class:`fiftyone.core.fields.Field` instance or a
            dict of keyword arguments describing it
        existing_field_or_kwargs: a :class:`fiftyone.core.fields.Field` instance or
            dict of keyword arguments defining the reference field type

    Raises:
        ValueError: if the proposed field does not match the reference field
    """
    if isinstance(field_or_kwargs, dict):
        field = create_field(field_name, **field_or_kwargs)
    else:
        field = field_or_kwargs

    if isinstance(existing_field_or_kwargs, dict):
        existing_field = create_field(field_name, **existing_field_or_kwargs)
    else:
        existing_field = existing_field_or_kwargs

    if type(field) is not type(existing_field):
        raise ValueError(
            "Field '%s' type %s does not match existing field "
            "type %s" % (field_name, field, existing_field)
        )

    if isinstance(field, fof.EmbeddedDocumentField):
        if not issubclass(field.document_type, existing_field.document_type):
            raise ValueError(
                "Embedded document field '%s' type %s does not match existing "
                "field type %s"
                % (
                    field_name,
                    field.document_type,
                    existing_field.document_type,
                )
            )

    if isinstance(field, (fof.ListField, fof.DictField)):
        if existing_field.field is not None and not isinstance(
            field.field, type(existing_field.field)
        ):
            raise ValueError(
                "%s '%s' type %s does not match existing "
                "field type %s"
                % (
                    field.__class__.__name__,
                    field_name,
                    field.field,
                    existing_field.field,
                )
            )


def get_field_kwargs(field):
    """Constructs the field keyword arguments dictionary for the given
    :class:`fiftyone.core.fields.Field` instance.

    Args:
        field: a :class:`fiftyone.core.fields.Field`

    Returns:
        a field specification dict
    """
    ftype = type(field)
    kwargs = {"ftype": ftype}

    if issubclass(ftype, fof.EmbeddedDocumentField):
        kwargs["embedded_doc_type"] = field.document_type

    if issubclass(ftype, (fof.ListField, fof.DictField)):
        kwargs["subfield"] = field.field

    return kwargs


def get_implied_field_kwargs(value):
    """Infers the field keyword arguments dictionary for a field that can hold
    values of the given type.

    Args:
        value: a value

    Returns:
        a field specification dict
    """
    if isinstance(value, BaseEmbeddedDocument):
        return {
            "ftype": fof.EmbeddedDocumentField,
            "embedded_doc_type": type(value),
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


def _get_list_value_type(value):
    if isinstance(value, bool):
        return fof.BooleanField

    if isinstance(value, six.integer_types):
        return fof.IntField

    if isinstance(value, numbers.Number):
        return fof.FloatField

    if isinstance(value, six.string_types):
        return fof.StringField

    if isinstance(value, datetime):
        return fof.DateTimeField

    if isinstance(value, date):
        return fof.DateField

    return None


class DatasetMixin(object):
    """Mixin interface for :class:`fiftyone.core.odm.document.Document`
    subclasses that are backed by a dataset.
    """

    # Subtypes must declare this
    _is_frames_doc = None

    def __setattr__(self, name, value):
        if name in self._fields and value is not None:
            self._fields[name].validate(value)

        super().__setattr__(name, value)

    @property
    def collection_name(self):
        return self.__class__.__name__

    @property
    def field_names(self):
        return self._get_fields_ordered(include_private=False)

    @classmethod
    def _doc_name(cls):
        return "Frame" if cls._is_frames_doc else "Sample"

    @classmethod
    def _fields_attr(cls):
        return "frame_fields" if cls._is_frames_doc else "sample_fields"

    @classmethod
    def _dataset_doc(cls):
        collection_name = cls.__name__
        return fod._get_dataset_doc(collection_name, frames=cls._is_frames_doc)

    def _get_field_names(self, include_private=False):
        return self._get_fields_ordered(include_private=include_private)

    @classmethod
    def get_field_schema(
        cls, ftype=None, embedded_doc_type=None, include_private=False
    ):
        """Returns a schema dictionary describing the fields of this document.

        If the document belongs to a dataset, the schema will apply to all
        documents in the collection.

        Args:
            ftype (None): an optional field type to which to restrict the
                returned schema. Must be a subclass of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): an optional embedded document type to
                which to restrict the returned schema. Must be a subclass of
                :class:`fiftyone.core.odm.BaseEmbeddedDocument`
            include_private (False): whether to include fields that start with
                ``_`` in the returned schema

        Returns:
             a dictionary mapping field names to field types
        """
        if ftype is None:
            ftype = fof.Field

        if not issubclass(ftype, fof.Field):
            raise ValueError(
                "Field type %s must be subclass of %s" % (ftype, fof.Field)
            )

        if embedded_doc_type is not None and not issubclass(
            ftype, fof.EmbeddedDocumentField
        ):
            raise ValueError(
                "embedded_doc_type should only be specified if ftype is a"
                " subclass of %s" % fof.EmbeddedDocumentField
            )

        d = OrderedDict()
        field_names = cls._get_fields_ordered(include_private=include_private)
        for field_name in field_names:
            # pylint: disable=no-member
            field = cls._fields[field_name]
            if not isinstance(field, ftype):
                continue

            if embedded_doc_type is not None and not issubclass(
                field.document_type, embedded_doc_type
            ):
                continue

            d[field_name] = field

        return d

    @classmethod
    def merge_field_schema(cls, schema, expand_schema=True):
        """Merges the field schema into this document.

        Args:
            schema: a dictionary mapping field names to
                :class:`fiftyone.core.fields.Field` instances
            expand_schema (True): whether to add new fields to the schema

        Raises:
            ValueError: if a field in the schema is not compliant with an
                existing field of the same name or a new field is found but
                ``expand_schema == False``
        """
        _schema = cls._fields

        add_fields = []
        for field_name, field in schema.items():
            if field_name == "id":
                continue

            if field_name in _schema:
                validate_fields_match(field_name, field, _schema[field_name])
            else:
                add_fields.append(field_name)

        if not expand_schema and add_fields:
            raise ValueError(
                "%s fields %s do not exist" % (cls._doc_name(), add_fields)
            )

        for field_name in add_fields:
            field = schema[field_name]
            cls._add_field_schema(field_name, **get_field_kwargs(field))

    def has_field(self, field_name):
        # pylint: disable=no-member
        return field_name in self._fields

    def get_field(self, field_name):
        if not self.has_field(field_name):
            raise AttributeError(
                "%s has no field '%s'" % (self._doc_name(), field_name)
            )

        return getattr(self, field_name)

    @classmethod
    def add_field(
        cls, field_name, ftype, embedded_doc_type=None, subfield=None, **kwargs
    ):
        """Adds a new field to the document.

        Args:
            field_name: the field name
            ftype: the field type to create. Must be a subclass of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): the
                :class:`fiftyone.core.odm.BaseEmbeddedDocument` type of the
                field. Only applicable when ``ftype`` is
                :class:`fiftyone.core.fields.EmbeddedDocumentField`
            subfield (None): the :class:`fiftyone.core.fields.Field` type of
                the contained field. Only applicable when ``ftype`` is
                :class:`fiftyone.core.fields.ListField` or
                :class:`fiftyone.core.fields.DictField`
        """
        cls._add_field_schema(
            field_name,
            ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
            **kwargs,
        )

    @classmethod
    def add_implied_field(cls, field_name, value):
        """Adds the field to the document, inferring the field type from the
        provided value.

        Args:
            field_name: the field name
            value: the field value
        """
        # pylint: disable=no-member
        if field_name in cls._fields:
            raise ValueError(
                "%s field '%s' already exists" % (cls._doc_name(), field_name)
            )

        cls.add_field(field_name, **get_implied_field_kwargs(value))

    def set_field(self, field_name, value, create=False):
        if field_name.startswith("_"):
            raise ValueError(
                "Invalid field name '%s'. Field names cannot start with '_'"
                % field_name
            )

        if hasattr(self, field_name) and not self.has_field(field_name):
            raise ValueError("Cannot use reserved keyword '%s'" % field_name)

        if not self.has_field(field_name):
            if create:
                self.add_implied_field(field_name, value)
            else:
                raise ValueError(
                    "%s has no field '%s'" % (self._doc_name(), field_name)
                )

        self.__setattr__(field_name, value)

    def clear_field(self, field_name):
        self.set_field(field_name, None)

    @classmethod
    def _rename_fields(cls, field_names, new_field_names):
        """Renames the fields of the documents in this collection.

        Args:
            field_names: an iterable of field names
            new_field_names: an iterable of new field names
        """
        default_fields = get_default_fields(
            cls.__bases__[0], include_private=True
        )
        for field_name in field_names:
            if field_name in default_fields:
                raise ValueError(
                    "Cannot rename default %s field '%s'"
                    % (cls._doc_name(), field_name)
                )

            # pylint: disable=no-member
            if field_name not in cls._fields:
                raise AttributeError(
                    "%s field '%s' does not exist"
                    % (cls._doc_name(), field_name)
                )

        if not field_names:
            return

        for field_name, new_field_name in zip(field_names, new_field_names):
            cls._rename_field_schema(field_name, new_field_name)

        cls._rename_fields_simple(field_names, new_field_names)

    @classmethod
    def _rename_embedded_fields(
        cls, field_names, new_field_names, sample_collection
    ):
        """Renames the embedded field of the documents in this collection.

        Args:
            field_names: an iterable of "embedded.field.names"
            new_field_names: an iterable of "new.embedded.field.names"
            sample_collection: the
                :class:`fiftyone.core.samples.SampleCollection` being operated
                upon
        """
        if not field_names:
            return

        cls._rename_fields_collection(
            field_names, new_field_names, sample_collection
        )

    @classmethod
    def _clone_fields(
        cls, field_names, new_field_names, sample_collection=None
    ):
        """Clones the field(s) of the documents in this collection.

        Args:
            field_names: an iterable of field names
            new_field_names: an iterable of new field names
            sample_collection (None): the
                :class:`fiftyone.core.samples.SampleCollection` being operated
                upon
        """
        if not field_names:
            return

        for field_name in field_names:
            # pylint: disable=no-member
            if field_name not in cls._fields:
                raise AttributeError(
                    "%s field '%s' does not exist"
                    % (cls._doc_name(), field_name)
                )

        for field_name, new_field_name in zip(field_names, new_field_names):
            cls._clone_field_schema(field_name, new_field_name)

        if sample_collection is None:
            cls._clone_fields_simple(field_names, new_field_names)
        else:
            cls._clone_fields_collection(
                field_names, new_field_names, sample_collection
            )

    @classmethod
    def _clone_embedded_fields(
        cls, field_names, new_field_names, sample_collection
    ):
        """Clones the embedded field(s) of the documents in this collection.

        Args:
            field_names: an iterable of "embedded.field.names"
            new_field_names: an iterable of "new.embedded.field.names"
            sample_collection: the
                :class:`fiftyone.core.samples.SampleCollection` being operated
                upon
        """
        if not field_names:
            return

        cls._clone_fields_collection(
            field_names, new_field_names, sample_collection
        )

    @classmethod
    def _clear_fields(cls, field_names, sample_collection=None):
        """Clears the field(s) of the documents in this collection.

        Args:
            field_names: an iterable of field names
            sample_collection (None): the
                :class:`fiftyone.core.samples.SampleCollection` being operated
                upon
        """
        if not field_names:
            return

        if sample_collection is None:
            cls._clear_fields_simple(field_names)
        else:
            cls._clear_fields_collection(field_names, sample_collection)

    @classmethod
    def _clear_embedded_fields(cls, field_names, sample_collection):
        """Clears the embedded field(s) on the documents in this collection.

        Args:
            field_names: an iterable of "embedded.field.names"
            sample_collection: the
                :class:`fiftyone.core.samples.SampleCollection` being operated
                upon
        """
        if not field_names:
            return

        cls._clear_fields_collection(field_names, sample_collection)

    @classmethod
    def _delete_fields(cls, field_names, error_level=0):
        """Deletes the field(s) from the documents in this collection.

        Args:
            field_names: an iterable of field names
            error_level (0): the error level to use. Valid values are:

            -   0: raise error if a field cannot be deleted
            -   1: log warning if a field cannot be deleted
            -   2: ignore fields that cannot be deleted
        """
        default_fields = get_default_fields(
            cls.__bases__[0], include_private=True
        )

        _field_names = []
        for field_name in field_names:
            # pylint: disable=no-member
            if field_name in default_fields:
                fou.handle_error(
                    ValueError(
                        "Cannot delete default field '%s'" % field_name
                    ),
                    error_level,
                )
            elif field_name not in cls._fields:
                fou.handle_error(
                    AttributeError("Field '%s' does not exist" % field_name),
                    error_level,
                )
            else:
                _field_names.append(field_name)

        if not _field_names:
            return

        for field_name in _field_names:
            cls._delete_field_schema(field_name)

        cls._delete_fields_simple(_field_names)

    @classmethod
    def _delete_embedded_fields(cls, field_names):
        """Deletes the embedded field(s) from the documents in this collection.

        Args:
            field_names: an iterable of "embedded.field.names"
        """
        if not field_names:
            return

        cls._delete_fields_simple(field_names)

    @classmethod
    def _rename_fields_simple(cls, field_names, new_field_names):
        rename_expr = {k: v for k, v in zip(field_names, new_field_names)}

        collection_name = cls.__name__
        collection = get_db_conn()[collection_name]
        collection.update_many({}, {"$rename": rename_expr})

    @classmethod
    def _rename_fields_collection(
        cls, field_names, new_field_names, sample_collection
    ):
        from fiftyone import ViewField as F

        if cls._is_frames_doc:
            prefix = sample_collection._FRAMES_PREFIX
            field_names = [prefix + f for f in field_names]
            new_field_names = [prefix + f for f in new_field_names]

        field_roots = set()
        view = sample_collection.view()
        for field_name, new_field_name in zip(field_names, new_field_names):
            field_roots.add(field_name.split(".", 1)[0])
            field_roots.add(new_field_name.split(".", 1)[0])

            new_base = new_field_name.rsplit(".", 1)[0]
            if "." in field_name:
                base, leaf = field_name.rsplit(".", 1)
            else:
                base, leaf = field_name, ""

            expr = F(leaf) if new_base == base else F("$" + field_name)
            view = view.set_field(new_field_name, expr)

        view = view.mongo([{"$unset": field_names}])

        view.save(list(field_roots))

    @classmethod
    def _clone_fields_simple(cls, field_names, new_field_names):
        set_expr = {v: "$" + k for k, v in zip(field_names, new_field_names)}

        collection_name = cls.__name__
        collection = get_db_conn()[collection_name]
        collection.update_many({}, [{"$set": set_expr}])

    @classmethod
    def _clone_fields_collection(
        cls, field_names, new_field_names, sample_collection
    ):
        from fiftyone import ViewField as F

        if cls._is_frames_doc:
            prefix = sample_collection._FRAMES_PREFIX
            field_names = [prefix + f for f in field_names]
            new_field_names = [prefix + f for f in new_field_names]

        new_field_roots = set()
        view = sample_collection.view()
        for field_name, new_field_name in zip(field_names, new_field_names):
            new_field_roots.add(new_field_name.split(".", 1)[0])

            new_base = new_field_name.rsplit(".", 1)[0]
            if "." in field_name:
                base, leaf = field_name.rsplit(".", 1)
            else:
                base, leaf = field_name, ""

            expr = F(leaf) if new_base == base else F("$" + field_name)
            view = view.set_field(new_field_name, expr)

        #
        # Ideally only the embedded field would be merged in, but the `$merge`
        # operator will always overwrite top-level fields of each document, so
        # we limit the damage by projecting onto the modified fields
        #
        view.save(list(new_field_roots))

    @classmethod
    def _clear_fields_simple(cls, field_names):
        collection_name = cls.__name__
        collection = get_db_conn()[collection_name]
        collection.update_many({}, {"$set": {k: None for k in field_names}})

    @classmethod
    def _clear_fields_collection(cls, field_names, sample_collection):
        field_roots = set()
        view = sample_collection.view()
        for field_name in field_names:
            field_roots.add(field_name.split(".", 1)[0])
            view = view.set_field(field_name, None)

        #
        # Ideally only the embedded field would be merged in, but the `$merge`
        # operator will always overwrite top-level fields of each document, so
        # we limit the damage by projecting onto the modified fields
        #
        view.save(list(field_roots))

    @classmethod
    def _delete_fields_simple(cls, field_names):
        collection_name = cls.__name__
        collection = get_db_conn()[collection_name]
        collection.update_many({}, [{"$unset": field_names}])

    @classmethod
    def _declare_field(cls, field_or_doc):
        if isinstance(field_or_doc, SampleFieldDocument):
            field = field_or_doc.to_field()
        else:
            field = field_or_doc

        cls._fields[field.name] = field
        cls._fields_ordered += (field.name,)
        setattr(cls, field.name, field)

    @classmethod
    def _add_field_schema(
        cls,
        field_name,
        ftype,
        embedded_doc_type=None,
        subfield=None,
        **kwargs,
    ):
        # pylint: disable=no-member
        if field_name in cls._fields:
            raise ValueError(
                "%s field '%s' already exists" % (cls._doc_name(), field_name)
            )

        field = create_field(
            field_name,
            ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
            **kwargs,
        )

        cls._declare_field(field)

        dataset_doc = cls._dataset_doc()
        sample_field = SampleFieldDocument.from_field(field)

        dataset_doc[cls._fields_attr()].append(sample_field)
        dataset_doc.save()

    @classmethod
    def _rename_field_schema(cls, field_name, new_field_name):
        # pylint: disable=no-member
        field = cls._fields.pop(field_name)

        field.db_field = new_field_name
        field.name = new_field_name

        cls._fields[new_field_name] = field

        cls._fields_ordered = tuple(
            (fn if fn != field_name else new_field_name)
            for fn in cls._fields_ordered
        )
        delattr(cls, field_name)

        try:
            if issubclass(cls, Document):
                setattr(cls, new_field_name, field)
        except TypeError:
            pass

        dataset_doc = cls._dataset_doc()
        fields = getattr(dataset_doc, cls._fields_attr())

        for f in fields:
            if f.name == field_name:
                f.name = new_field_name
                f.db_field = new_field_name

        dataset_doc.save()

    @classmethod
    def _clone_field_schema(cls, field_name, new_field_name):
        # pylint: disable=no-member
        field = cls._fields[field_name]
        cls._add_field_schema(new_field_name, **get_field_kwargs(field))

    @classmethod
    def _delete_field_schema(cls, field_name):
        # pylint: disable=no-member
        del cls._fields[field_name]
        cls._fields_ordered = tuple(
            fn for fn in cls._fields_ordered if fn != field_name
        )
        delattr(cls, field_name)

        dataset_doc = cls._dataset_doc()

        fields = getattr(dataset_doc, cls._fields_attr())

        # This is intentionally implemented without creating a new list, since
        # clips datasets directly use their source dataset's frame fields
        for idx, f in enumerate(fields):
            if f.name == field_name:
                del fields[idx]
                break

        dataset_doc.save()

    def _update(self, object_id, update_doc, filtered_fields=None, **kwargs):
        """Updates an existing document.

        Helper method; should only be used inside
        :meth:`DatasetSampleDocument.save`.
        """
        updated_existing = True

        collection = self._get_collection()

        select_dict = {"_id": object_id}

        extra_updates = self._extract_extra_updates(
            update_doc, filtered_fields
        )

        if update_doc:
            result = collection.update_one(
                select_dict, update_doc, upsert=True
            ).raw_result
            if result is not None:
                updated_existing = result.get("updatedExisting")

        for update, element_id in extra_updates:
            result = collection.update_one(
                select_dict,
                update,
                array_filters=[{"element._id": element_id}],
                upsert=True,
            ).raw_result

            if result is not None:
                updated_existing = updated_existing and result.get(
                    "updatedExisting"
                )

        return updated_existing

    def _extract_extra_updates(self, update_doc, filtered_fields):
        """Extracts updates for filtered list fields that need to be updated
        by ID, not relative position (index).
        """
        extra_updates = []

        #
        # Check for illegal modifications
        # Match the list, or an indexed item in the list, but not a field
        # of an indexed item of the list:
        #   my_detections.detections          <- MATCH
        #   my_detections.detections.1        <- MATCH
        #   my_detections.detections.1.label  <- NO MATCH
        #
        if filtered_fields:
            for d in update_doc.values():
                for k in d.keys():
                    for ff in filtered_fields:
                        if k.startswith(ff) and not k[len(ff) :].lstrip(
                            "."
                        ).count("."):
                            raise ValueError(
                                "Modifying root of filtered list field '%s' "
                                "is not allowed" % k
                            )

        if filtered_fields and "$set" in update_doc:
            d = update_doc["$set"]
            del_keys = []

            for k, v in d.items():
                filtered_field = None
                for ff in filtered_fields:
                    if k.startswith(ff):
                        filtered_field = ff
                        break

                if filtered_field:
                    element_id, el_filter = self._parse_id_and_array_filter(
                        k, filtered_field
                    )
                    extra_updates.append(
                        ({"$set": {el_filter: v}}, element_id)
                    )

                    del_keys.append(k)

            for k in del_keys:
                del d[k]

            if not update_doc["$set"]:
                del update_doc["$set"]

        return extra_updates

    def _parse_id_and_array_filter(self, list_element_field, filtered_field):
        """Converts the ``list_element_field`` and ``filtered_field`` to an
        element object ID and array filter.

        Example::

            Input:
                list_element_field = "test_dets.detections.1.label"
                filtered_field = "test_dets.detections"

            Output:
                ObjectId("5f2062bf27c024654f5286a0")
                "test_dets.detections.$[element].label"
        """
        el = self
        for field_name in filtered_field.split("."):
            el = el[field_name]

        el_fields = (
            list_element_field[len(filtered_field) :].lstrip(".").split(".")
        )
        idx = int(el_fields.pop(0))

        el = el[idx]
        el_filter = ".".join([filtered_field, "$[element]"] + el_fields)

        return el._id, el_filter

    @classmethod
    def _get_fields_ordered(cls, include_private=False, use_db_fields=False):
        fields = cls._fields_ordered

        if not include_private:
            fields = tuple(f for f in fields if not f.startswith("_"))

        if use_db_fields:
            return tuple(cls._fields[f].db_field for f in fields)

        return fields


class NoDatasetMixin(object):
    """Mixin for :class:`fiftyone.core.odm.document.SerializableDocument`
    subtypes that are not backed by a dataset.
    """

    # Subtypes must declare this
    _is_frames_doc = None

    def __getattr__(self, name):
        try:
            return super().__getattr__(name)
        except AttributeError:
            pass

        try:
            return self._data[name]
        except KeyError as e:
            raise AttributeError(e.args[0])

    def __setattr__(self, name, value):
        if name.startswith("_"):
            super().__setattr__(name, value)
        else:
            self._data[name] = value

    def _get_field_names(self, include_private=False):
        if include_private:
            return tuple(self._data.keys())

        return tuple(f for f in self._data.keys() if not f.startswith("_"))

    def _get_repr_fields(self):
        return self.field_names

    @classmethod
    def _doc_name(cls):
        return "Frame" if cls._is_frames_doc else "Sample"

    @property
    def field_names(self):
        return self._get_field_names(include_private=False)

    @property
    def collection_name(self):
        return None

    @property
    def in_db(self):
        return False

    @staticmethod
    def _get_default(field):
        if field.null:
            return None

        if field.default is not None:
            value = field.default

            if callable(value):
                value = value()

            if isinstance(value, list) and value.__class__ != list:
                value = list(value)
            elif isinstance(value, tuple) and value.__class__ != tuple:
                value = tuple(value)
            elif isinstance(value, dict) and value.__class__ != dict:
                value = dict(value)

            return value

        raise ValueError("Field '%s' has no default" % field)

    def has_field(self, field_name):
        try:
            return field_name in self._data
        except AttributeError:
            # If `_data` is not initialized
            return False

    def get_field(self, field_name):
        if not self.has_field(field_name):
            raise AttributeError(
                "%s has no field '%s'" % (self._doc_name(), field_name)
            )

        return getattr(self, field_name)

    def set_field(self, field_name, value, create=False):
        if field_name.startswith("_"):
            raise ValueError(
                "Invalid field name: '%s'. Field names cannot start with '_'"
                % field_name
            )

        if hasattr(self, field_name) and not self.has_field(field_name):
            raise ValueError("Cannot use reserved keyword '%s'" % field_name)

        if not self.has_field(field_name):
            if create:
                # dummy value so that it is identified by __setattr__
                self._data[field_name] = None
            else:
                raise ValueError(
                    "%s has no field '%s'" % (self._doc_name(), field_name)
                )

        self.__setattr__(field_name, value)

    def clear_field(self, field_name):
        if field_name in self.default_fields:
            default_value = self._get_default(self.default_fields[field_name])
            self.set_field(field_name, default_value)
            return

        if field_name not in self._data:
            raise ValueError(
                "%s has no field '%s'" % (self._doc_name(), field_name)
            )

        self._data.pop(field_name)

    def to_dict(self, extended=False):
        d = {}
        for k, v in self._data.items():
            # @todo `use_db_field` hack
            if k == "id":
                k = "_id"

            d[k] = _serialize_value(v, extended=extended)

        return d

    @classmethod
    def from_dict(cls, d, extended=False):
        return cls(**{k: _deserialize_value(v) for k, v in d.items()})

    def save(self):
        pass

    def reload(self):
        pass

    def delete(self):
        pass


def _serialize_value(value, extended=False):
    if hasattr(value, "to_dict"):
        # EmbeddedDocumentField
        return value.to_dict(extended=extended)

    if type(value) is date:
        # DateField
        return datetime(value.year, value.month, value.day)

    if isinstance(value, np.ndarray):
        # VectorField/ArrayField
        binary = fou.serialize_numpy_array(value)
        if not extended:
            return binary

        # @todo improve this
        return json.loads(json_util.dumps(Binary(binary)))

    if isinstance(value, (list, tuple)):
        return [_serialize_value(v, extended=extended) for v in value]

    if isinstance(value, dict):
        return {
            k: _serialize_value(v, extended=extended) for k, v in value.items()
        }

    return value


def _deserialize_value(value):
    if isinstance(value, dict):
        if "_cls" in value:
            # Serialized embedded document
            _cls = getattr(fo, value["_cls"])
            return _cls.from_dict(value)

        if "$binary" in value:
            # Serialized array in extended format
            binary = json_util.loads(json.dumps(value))
            return fou.deserialize_numpy_array(binary)

        return value

    if isinstance(value, six.binary_type):
        # Serialized array in non-extended format
        return fou.deserialize_numpy_array(value)

    return value
