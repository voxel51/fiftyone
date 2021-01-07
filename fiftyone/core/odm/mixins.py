"""
Mixins and helpers for sample backing documents.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import OrderedDict
from functools import wraps
import json
import numbers
import six

from bson import json_util
from bson.binary import Binary
import numpy as np

import fiftyone as fo
from .database import get_db_conn
from .dataset import SampleFieldDocument, DatasetDocument
from .document import Document, BaseEmbeddedDocument, SampleDocument
import fiftyone.core.fields as fof
import fiftyone.core.utils as fou


def default_sample_fields(cls, include_private=False, include_id=False):
    """Returns the default fields present on all instances of the given
    :class:`SampleDocument` class.

    Args:
        cls: the :class:`SampleDocument` class
        include_private (False): whether to include fields that start with `_`
        include_id (False): whether to include the ``id`` field

    Returns:
        a tuple of field names
    """
    fields = cls._get_fields_ordered(include_private=include_private)
    if include_id:
        fields = ("id",) + fields

    return fields


def no_rename_default_field(func):
    """Wrapper for :func:`SampleDocument.rename_field` that prevents renaming
    default fields of :class:`SampleDocument`.

    This is a decorator because the subclasses implement this as either an
    instance or class method.
    """

    @wraps(func)
    def wrapper(cls_or_self, field_name, *args, **kwargs):
        # pylint: disable=no-member
        if field_name in default_sample_fields(
            cls_or_self.__bases__[0], include_private=True, include_id=True
        ):
            raise ValueError("Cannot rename default field '%s'" % field_name)

        return func(cls_or_self, field_name, *args, **kwargs)

    return wrapper


def no_delete_default_field(func):
    """Wrapper for :func:`SampleDocument.delete_field` that prevents deleting
    default fields of :class:`SampleDocument`.

    This is a decorator because the subclasses implement this as either an
    instance or class method.
    """

    @wraps(func)
    def wrapper(cls_or_self, field_name, *args, **kwargs):
        # pylint: disable=no-member
        if field_name in default_sample_fields(
            cls_or_self.__bases__[0], include_private=True, include_id=True
        ):
            raise ValueError("Cannot delete default field '%s'" % field_name)

        return func(cls_or_self, field_name, *args, **kwargs)

    return wrapper


class DatasetMixin(object):
    """Mixin for concrete :class:`fiftyone.core.odm.document.SampleDocument`
    subtypes that are backed by a dataset.
    """

    def __setattr__(self, name, value):
        # pylint: disable=no-member
        has_field = self.has_field(name)

        if name.startswith("_") or (hasattr(self, name) and not has_field):
            super().__setattr__(name, value)
            return

        if not has_field:
            raise ValueError(
                "Adding sample fields using the `sample.field = value` syntax "
                "is not allowed; use `sample['field'] = value` instead"
            )

        if value is not None:
            self._fields[name].validate(value)

        super().__setattr__(name, value)

    @property
    def collection_name(self):
        return self.__class__.__name__

    @property
    def field_names(self):
        return self._get_fields_ordered(include_private=False)

    def _get_field_names(self, include_private=False):
        return self._get_fields_ordered(include_private=include_private)

    @classmethod
    def _sample_collection_name(cls):
        return cls.__name__

    @classmethod
    def _dataset_doc_fields_col(cls):
        return "sample_fields"

    @classmethod
    def _frame_collection_name(cls):
        return "frames." + cls.__name__

    @classmethod
    def get_field_schema(
        cls, ftype=None, embedded_doc_type=None, include_private=False
    ):
        """Returns a schema dictionary describing the fields of this sample.

        If the sample belongs to a dataset, the schema will apply to all
        samples in the dataset.

        Args:
            ftype (None): an optional field type to which to restrict the
                returned schema. Must be a subclass of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): an optional embedded document type to
                which to restrict the returned schema. Must be a subclass of
                :class:`fiftyone.core.odm.BaseEmbeddedDocument`
            include_private (False): whether to include fields that start with
                `_` in the returned schema

        Returns:
             a dictionary mapping field names to field types
        """
        if ftype is None:
            ftype = fof.Field

        if not issubclass(ftype, fof.Field):
            raise ValueError(
                "Field type %s must be subclass of %s" % (ftype, fof.Field)
            )

        if embedded_doc_type and not issubclass(
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
            if not isinstance(cls._fields[field_name], ftype):
                continue

            if embedded_doc_type and not issubclass(
                field.document_type, embedded_doc_type
            ):
                continue

            d[field_name] = field

        return d

    @classmethod
    def merge_field_schema(cls, schema):
        """Merges the field schema into the sample.

        Args:
            schema: a dictionary mapping field names to field types

        Raises:
            ValueError: if a field in the schema is not compliant with an
                existing field of the same name
        """
        _schema = cls.get_field_schema()

        add_fields = []
        for field_name, field in schema.items():
            if field_name in _schema:
                validate_fields_match(field_name, field, _schema[field_name])
            else:
                add_fields.append(field_name)

        for field_name in add_fields:
            field = schema[field_name]
            cls._add_field_schema(
                field_name, save=True, **get_field_kwargs(field)
            )

    def has_field(self, field_name):
        # pylint: disable=no-member
        return field_name in self._fields

    def get_field(self, field_name):
        if not self.has_field(field_name):
            raise AttributeError("Sample has no field '%s'" % field_name)

        return getattr(self, field_name)

    @classmethod
    def add_field(
        cls,
        field_name,
        ftype,
        embedded_doc_type=None,
        subfield=None,
        save=True,
        **kwargs
    ):
        """Adds a new field to the sample.

        Args:
            field_name: the field name
            ftype: the field type to create. Must be a subclass of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): the
                :class:`fiftyone.core.odm.BaseEmbeddedDocument` type of the
                field. Used only when ``ftype`` is an embedded
                :class:`fiftyone.core.fields.EmbeddedDocumentField`
            subfield (None): the type of the contained field. Used only when
                ``ftype`` is a :class:`fiftyone.core.fields.ListField` or
                :class:`fiftyone.core.fields.DictField`
        """
        # Additional arg `save` is to prevent saving the fields when reloading
        # a dataset from the database.
        cls._add_field_schema(
            field_name,
            ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
            save=save,
            **kwargs
        )

    @classmethod
    def add_implied_field(cls, field_name, value, **kwargs):
        """Adds the field to the sample, inferring the field type from the
        provided value.

        Args:
            field_name: the field name
            value: the field value
        """
        # pylint: disable=no-member
        if field_name in cls._fields:
            raise ValueError("Field '%s' already exists" % field_name)

        cls.add_field(field_name, **get_implied_field_kwargs(value, **kwargs))

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
                self.add_implied_field(field_name, value)
            else:
                msg = "Sample does not have field '%s'." % field_name
                if value is not None:
                    msg += " Use `create=True` to create a new field"

                raise ValueError(msg)

        self.__setattr__(field_name, value)

    def clear_field(self, field_name):
        self.set_field(field_name, None, create=False)

    @classmethod
    @no_rename_default_field
    def _rename_field(cls, field_name, new_field_name, is_frame_field=False):
        """Renames the field of the sample(s).

        If the sample is in a dataset, the field will be renamed on all samples
        in the dataset.

        Args:
            field_name: the field name
            new_field_name: the new field name
            is_frame_field (False): whether this is a frame-level field
        """
        cls._rename_field_schema(field_name, new_field_name, is_frame_field)
        cls._rename_field_docs(field_name, new_field_name)

    @classmethod
    def _rename_embedded_field(cls, field_name, new_field_name):
        """Renames the embedded field of the sample(s).

        If the sample is in a dataset, the embedded field will be renamed on
        all samples in the dataset.

        Args:
            field_name: the "embedded.field.name"
            new_field_name: the "new.embedded.field.name"
        """
        cls._rename_field_docs(field_name, new_field_name)

    @classmethod
    def _clone_field(cls, field_name, new_field_name, pipeline=None):
        """Clones the field of the sample(s).

        If the sample is in a dataset, the field will be cloned on all samples
        in the dataset.

        Args:
            field_name: the field name
            new_field_name: the new field name
            pipeline (None): an optional MongoDB aggregation pipeline defining
                a view into the samples to clone
        """
        cls._clone_field_schema(field_name, new_field_name)

        if pipeline is not None:
            cls._clone_field_docs_pipeline(
                field_name, new_field_name, pipeline
            )
        else:
            cls._clone_field_docs(field_name, new_field_name)

    @classmethod
    def _clone_embedded_field(cls, field_name, new_field_name, pipeline=None):
        """Clones the embedded field of the sample(s).

        If the sample is in a dataset, the embedded field will be cloned on
        all samples in the dataset.

        Args:
            field_name: the "embedded.field.name"
            new_field_name: the "new.embedded.field.name"
            pipeline (None): an optional MongoDB aggregation pipeline defining
                a view into the samples to clone
        """
        if pipeline is not None:
            cls._clone_embedded_field_docs_pipeline(
                field_name, new_field_name, pipeline
            )
        else:
            cls._clone_field_docs(field_name, new_field_name)

    @classmethod
    def _clear_field(cls, field_name, pipeline=None):
        """Clears the field on the sample(s).

        If the sample is in a dataset, the field will be cleared on all samples
        in the dataset.

        Args:
            field_name: the field name
            pipeline (None): an optional MongoDB aggregation pipeline defining
                a view into the samples to clear
        """
        if pipeline is not None:
            cls._clear_field_docs_pipeline(field_name, pipeline)
        else:
            cls._clear_field_docs(field_name)

    @classmethod
    def _clear_embedded_field(cls, field_name, pipeline=None):
        """Clears the embedded field on the sample(s).

        If the sample is in a dataset, the embedded field will be cleared on
        all samples in the dataset.

        Args:
            field_name: the "embedded.field.name"
            pipeline (None): an optional MongoDB aggregation pipeline defining
                a view into the samples to clear
        """
        if pipeline is not None:
            cls._clear_embedded_field_docs_pipeline(field_name, pipeline)
        else:
            cls._clear_field_docs(field_name)

    @classmethod
    @no_delete_default_field
    def _delete_field(cls, field_name, is_frame_field=False):
        """Deletes the field from the sample(s).

        If the sample is in a dataset, the field will be removed from all
        samples in the dataset.

        Args:
            field_name: the field name
            is_frame_field (False): whether this is a frame-level field
        """
        cls._delete_field_schema(field_name, is_frame_field)
        cls._delete_field_docs(field_name)

    @classmethod
    def _delete_embedded_field(cls, field_name):
        """Deletes the embedded field from the sample(s).

        If the sample is in a dataset, the embedded field will be removed from
        all samples in the dataset.

        Args:
            field_name: the "embedded.field.name"
        """
        cls._delete_field_docs(field_name)

    @classmethod
    def _rename_field_docs(cls, field_name, new_field_name):
        collection_name = cls.__name__
        collection = get_db_conn()[collection_name]
        collection.update_many({}, {"$rename": {field_name: new_field_name}})

    @classmethod
    def _clone_field_docs(cls, field_name, new_field_name):
        collection_name = cls.__name__
        collection = get_db_conn()[collection_name]

        #
        # Note: this will not do the right thing if `field_name` is an embedded
        # field of an array. In that case, we'd actually need to do something
        # like https://stackoverflow.com/q/60362503
        #
        collection.update_many(
            {}, [{"$set": {new_field_name: "$" + field_name}}]
        )

    @classmethod
    def _clone_field_docs_pipeline(cls, field_name, new_field_name, pipeline):
        collection_name = cls.__name__
        collection = get_db_conn()[collection_name]
        collection.aggregate(
            pipeline
            + [
                {"$project": {new_field_name: "$" + field_name}},
                {"$merge": collection_name},  # requires mongodb>=4.4
            ]
        )

    @classmethod
    def _clone_embedded_field_docs_pipeline(
        cls, field_name, new_field_name, pipeline
    ):
        collection_name = cls.__name__
        collection = get_db_conn()[collection_name]

        # Ideally only the embedded field would be merged in, but the `$merge`
        # operator will always overwrite top-level fields of each sample, so we
        # limit the damage by projecting onto the base field
        base_field = new_field_name.split(".", 1)[0]

        collection.aggregate(
            pipeline
            + [
                {"$set": {new_field_name: "$" + field_name}},
                {"$project": {base_field: True}},
                {"$merge": collection_name},  # requires mongodb>=4.4
            ]
        )

    @classmethod
    def _clear_field_docs(cls, field_name):
        collection_name = cls.__name__
        collection = get_db_conn()[collection_name]
        collection.update_many({}, {"$set": {field_name: None}})

    @classmethod
    def _clear_field_docs_pipeline(cls, field_name, pipeline):
        collection_name = cls.__name__
        collection = get_db_conn()[collection_name]
        collection.aggregate(
            pipeline
            + [
                {"$project": {field_name: True}},
                {"$set": {field_name: None}},
                {"$merge": collection_name},  # requires mongodb>=4.4
            ]
        )

    @classmethod
    def _clear_embedded_field_docs_pipeline(cls, field_name, pipeline):
        collection_name = cls.__name__
        collection = get_db_conn()[collection_name]

        # Ideally only the embedded field would be merged in, but the `$merge`
        # operator will always overwrite top-level fields of each sample, so we
        # limit the damage by projecting onto the base field
        base_field = field_name.split(".", 1)[0]

        collection.aggregate(
            pipeline
            + [
                {"$project": {base_field: True}},
                {"$set": {field_name: None}},
                {"$merge": collection_name},  # requires mongodb>=4.4
            ]
        )

    @classmethod
    def _delete_field_docs(cls, field_name):
        collection_name = cls.__name__
        collection = get_db_conn()[collection_name]
        collection.update_many({}, [{"$unset": field_name}])

    @classmethod
    def _add_field_schema(
        cls,
        field_name,
        ftype,
        embedded_doc_type=None,
        subfield=None,
        save=True,
        **kwargs
    ):
        # pylint: disable=no-member
        if field_name in cls._fields:
            raise ValueError("Field '%s' already exists" % field_name)

        field = _create_field(
            field_name,
            ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
            kwargs=kwargs,
        )

        cls._fields[field_name] = field
        cls._fields_ordered += (field_name,)
        try:
            if issubclass(cls, SampleDocument):
                # Only set the attribute if it is a class
                setattr(cls, field_name, field)
        except TypeError:
            # Instance, not class, so do not `setattr`
            pass

        if save:
            dataset_doc = DatasetDocument.objects.get(
                sample_collection_name=cls._sample_collection_name()
            )

            field = cls._fields[field_name]
            sample_field = SampleFieldDocument.from_field(field)
            dataset_doc[cls._dataset_doc_fields_col()].append(sample_field)
            dataset_doc.save()

    @classmethod
    def _rename_field_schema(cls, field_name, new_field_name, is_frame_field):
        # pylint: disable=no-member
        if field_name not in cls._fields:
            raise AttributeError("Field '%s' does not exist" % field_name)

        # pylint: disable=no-member
        field = cls._fields[field_name]
        field = _rename_field(field, new_field_name)
        cls._fields[new_field_name] = field
        del cls._fields[field_name]
        cls._fields_ordered = tuple(
            (fn if fn != field_name else new_field_name)
            for fn in cls._fields_ordered
        )
        delattr(cls, field_name)
        try:
            if issubclass(cls, Document):
                # Only set the attribute if it is a class
                setattr(cls, new_field_name, field)
        except TypeError:
            # Instance, not class, so do not `setattr`
            pass

        if is_frame_field:
            # @todo this hack assumes that
            # frames_collection_name = "frames." + sample_collection_name
            sample_collection_name = cls.__name__[7:]
            dataset_doc = DatasetDocument.objects.get(
                sample_collection_name=sample_collection_name
            )
            for f in dataset_doc.frame_fields:
                if f.name == field_name:
                    f.name = new_field_name

            dataset_doc.save()
        else:
            dataset_doc = DatasetDocument.objects.get(
                sample_collection_name=cls.__name__
            )
            for f in dataset_doc.sample_fields:
                if f.name == field_name:
                    f.name = new_field_name

            dataset_doc.save()

    @classmethod
    def _clone_field_schema(cls, field_name, new_field_name):
        # pylint: disable=no-member
        if field_name not in cls._fields:
            raise AttributeError("Field '%s' does not exist" % field_name)

        # pylint: disable=no-member
        field = cls._fields[field_name]
        cls._add_field_schema(
            new_field_name, save=True, **get_field_kwargs(field)
        )

    @classmethod
    def _delete_field_schema(cls, field_name, is_frame_field):
        # pylint: disable=no-member
        if field_name not in cls._fields:
            raise AttributeError("Field '%s' does not exist" % field_name)

        # pylint: disable=no-member
        del cls._fields[field_name]
        cls._fields_ordered = tuple(
            fn for fn in cls._fields_ordered if fn != field_name
        )
        delattr(cls, field_name)

        if is_frame_field:
            # @todo this hack assumes that
            # frames_collection_name = "frames." + sample_collection_name
            sample_collection_name = cls.__name__[7:]
            dataset_doc = DatasetDocument.objects.get(
                sample_collection_name=sample_collection_name
            )
            dataset_doc.frame_fields = [
                f for f in dataset_doc.frame_fields if f.name != field_name
            ]
            dataset_doc.save()
        else:
            dataset_doc = DatasetDocument.objects.get(
                sample_collection_name=cls.__name__
            )
            dataset_doc.sample_fields = [
                f for f in dataset_doc.sample_fields if f.name != field_name
            ]
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
                        if k.startswith(ff) and not k.lstrip(ff).count("."):
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
                ObjectID("5f2062bf27c024654f5286a0")
                "test_dets.detections.$[element].label"
        """
        el = self
        for field_name in filtered_field.split("."):
            el = el[field_name]

        el_fields = list_element_field.lstrip(filtered_field).split(".")
        idx = int(el_fields.pop(0))

        el = el[idx]
        el_filter = ".".join([filtered_field, "$[element]"] + el_fields)

        return el._id, el_filter

    @classmethod
    def _get_fields_ordered(cls, include_private=False):
        if include_private:
            return tuple(f for f in cls._fields_ordered if f != "id")

        return tuple(
            f
            for f in cls._fields_ordered
            if f != "id" and not f.startswith("_")
        )


class NoDatasetMixin(object):
    """Mixin for :class:`fiftyone.core.odm.document.SampleDocument` subtypes
    that are not backed by a dataset.
    """

    def __getattr__(self, name):
        try:
            return self._data[name]
        except Exception:
            pass

        return super().__getattribute__(name)

    def __setattr__(self, name, value):
        if name.startswith("_"):
            super().__setattr__(name, value)
            return

        has_field = self.has_field(name)

        if hasattr(self, name) and not has_field:
            super().__setattr__(name, value)
            return

        if not has_field:
            raise ValueError(
                "Adding sample fields using the `sample.field = value` syntax "
                "is not allowed; use `sample['field'] = value` instead"
            )

        self._data[name] = value

    @property
    def id(self):
        return None

    def _get_field_names(self, include_private=False):
        if include_private:
            return tuple(k for k in self._data.keys() if k != "id")

        return tuple(
            k for k in self._data.keys() if k != "id" and not k.startswith("_")
        )

    def _get_repr_fields(self):
        return ("id",) + self.field_names

    @property
    def field_names(self):
        return self._get_field_names(include_private=False)

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
            raise AttributeError("Sample has no field '%s'" % field_name)

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
                msg = "Sample does not have field '%s'." % field_name
                if value is not None:
                    msg += " Use `create=True` to create a new field"

                raise ValueError(msg)

        self.__setattr__(field_name, value)

    def clear_field(self, field_name):
        if field_name in self.default_fields:
            default_value = self._get_default(self.default_fields[field_name])
            self.set_field(field_name, default_value)
            return

        if field_name not in self._data:
            raise ValueError("Sample has no field '%s'" % field_name)

        self._data.pop(field_name)

    def to_dict(self, extended=False):
        d = {}
        for k, v in self._data.items():
            if hasattr(v, "to_dict"):
                # Embedded document
                d[k] = v.to_dict(extended=extended)
            elif isinstance(v, np.ndarray):
                # Must handle arrays separately, since they are non-primitives
                v_binary = fou.serialize_numpy_array(v)
                if extended:
                    # @todo improve this
                    d[k] = json.loads(json_util.dumps(Binary(v_binary)))
                else:
                    d[k] = v_binary
            else:
                # JSON primitive
                d[k] = v

        return d

    @classmethod
    def from_dict(cls, d, extended=False):
        kwargs = {}
        for k, v in d.items():
            if isinstance(v, dict):
                if "_cls" in v:
                    # Serialized embedded document
                    _cls = getattr(fo, v["_cls"])
                    kwargs[k] = _cls.from_dict(v)
                elif "$binary" in v:
                    # Serialized array in extended format
                    binary = json_util.loads(json.dumps(v))
                    kwargs[k] = fou.deserialize_numpy_array(binary)
                else:
                    kwargs[k] = v
            elif isinstance(v, six.binary_type):
                # Serialized array in non-extended format
                kwargs[k] = fou.deserialize_numpy_array(v)
            else:
                kwargs[k] = v

        return cls(**kwargs)

    def save(self):
        """Saves the sample to the database.

        Because the sample does not belong to a dataset, this method does
        nothing.
        """
        pass

    def reload(self):
        """Reloads the sample from the database.

        Because the sample does not belong to a dataset, this method does
        nothing.
        """
        pass

    def delete(self):
        """Deletes the sample from the database.

        Because the sample does not belong to a dataset, this method does
        nothing.
        """
        pass


def validate_fields_match(field_name, field, ref_field):
    if type(field) is not type(ref_field):
        raise ValueError(
            "Field '%s' type %s does not match existing field "
            "type %s" % (field_name, field, ref_field)
        )

    if isinstance(field, fof.EmbeddedDocumentField):
        if not issubclass(field.document_type, ref_field.document_type):
            raise ValueError(
                "Embedded document field '%s' type %s does not match existing "
                "field type %s"
                % (field_name, field.document_type, ref_field.document_type)
            )

    if isinstance(field, (fof.ListField, fof.DictField)):
        if (ref_field.field is not None) and not isinstance(
            field.field, type(ref_field.field)
        ):
            raise ValueError(
                "%s '%s' type %s does not match existing "
                "field type %s"
                % (
                    field.__class__.__name__,
                    field_name,
                    field.field,
                    ref_field.field,
                )
            )


def get_field_kwargs(field):
    ftype = type(field)
    kwargs = {"ftype": ftype}

    if issubclass(ftype, fof.EmbeddedDocumentField):
        kwargs["embedded_doc_type"] = field.document_type

    if issubclass(ftype, (fof.ListField, fof.DictField)):
        kwargs["subfield"] = field.field

    return kwargs


def get_implied_field_kwargs(value, **kwargs):
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

    if isinstance(value, (list, tuple)):
        return {"ftype": fof.ListField}

    if isinstance(value, np.ndarray):
        if value.ndim == 1:
            return {"ftype": fof.VectorField}

        return {"ftype": fof.ArrayField}

    if isinstance(value, dict):
        return {"ftype": fof.DictField}

    raise TypeError("Unsupported field value '%s'" % type(value))


def _create_field(
    field_name, ftype, embedded_doc_type=None, subfield=None, kwargs={}
):
    if not issubclass(ftype, fof.Field):
        raise ValueError(
            "Invalid field type '%s'; must be a subclass of '%s'"
            % (ftype, fof.Field)
        )

    kwargs["db_field"] = field_name

    if issubclass(ftype, fof.EmbeddedDocumentField):
        kwargs.update({"document_type": embedded_doc_type})
        kwargs["null"] = True
    elif issubclass(ftype, (fof.ListField, fof.DictField)):
        if subfield is not None:
            kwargs["field"] = subfield
    else:
        kwargs["null"] = True

    field = ftype(**kwargs)
    field.name = field_name

    return field


def _rename_field(field, new_field_name):
    field.db_field = new_field_name
    field.name = new_field_name
    return field
