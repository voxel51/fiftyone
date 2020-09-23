"""
FiftyOne dataset schema.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import OrderedDict
from functools import wraps
import numbers

from mongoengine.errors import InvalidQueryError, FieldDoesNotExist
import numpy as np
import six

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.odm as foo
import fiftyone.core.odm.document as food
import fiftyone.core.odm.sample as foos


def no_delete_default_field(func):
    """Wrapper for :func:`SampleDocument.delete_field` that prevents deleting
    default fields of :class:`SampleDocument`.

    This is a decorator because the subclasses implement this as either an
    instance or class method.
    """

    @wraps(func)
    def wrapper(cls_or_self, field_name, *args, **kwargs):
        # pylint: disable=no-member
        if field_name in DatasetSchema.default_sample_fields():
            raise ValueError("Cannot delete default field '%s'" % field_name)

        return func(cls_or_self, field_name, *args, **kwargs)

    return wrapper


class DatasetSchema(object):
    """A schema for a :class:`fiftyone.core.dataset.Dataset`.

    DatasetSchemas keep track of the fields on a given dataset.

    Args:
        sample_doc_cls: the subclass of
            :class:`fiftyone.core.odm.sample.DatasetSampleDocument` backing
            the dataset
    """

    # pylint: disable=no-member
    default_fields = foos.DatasetSampleDocument._fields

    def __init__(self, sample_doc_cls):
        self._sample_doc_cls = sample_doc_cls

    @staticmethod
    def default_sample_fields(include_private=False, include_id=False):
        """The default fields present on all :class:`SampleDocument` objects.

        Args:
            include_private (False): whether to include fields that start with `_`
            include_id (False): whether to include the ``id`` field

        Returns:
            a tuple of field names
        """
        fields = foos.DatasetSampleDocument._get_fields_ordered(
            include_private=include_private
        )
        if include_id:
            fields = ("id",) + fields

        return fields

    @property
    def sample_collection_name(self):
        return self._sample_doc_cls._meta["collection"]

    @property
    def fields(self):
        return self._sample_doc_cls._fields

    @property
    def fields_ordered(self):
        return self._sample_doc_cls._fields_ordered

    @property
    def field_names(self):
        return tuple(
            f
            for f in self._get_fields_ordered(include_private=False)
            if f != "id"
        )

    def get_field_schema(
        self, ftype=None, embedded_doc_type=None, include_private=False
    ):
        """Returns a schema dictionary describing the fields of this dataset.

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
        field_names = self._get_fields_ordered(include_private=include_private)
        for field_name in field_names:
            # pylint: disable=no-member
            field = self._sample_doc_cls._fields[field_name]
            if not isinstance(self._sample_doc_cls._fields[field_name], ftype):
                continue

            if embedded_doc_type and not issubclass(
                field.document_type, embedded_doc_type
            ):
                continue

            d[field_name] = field

        return d

    def add_field(
        self,
        mtype,
        field_name,
        ftype,
        embedded_doc_type=None,
        subfield=None,
        save=True,
    ):
        """Adds a new field to the sample.

        Args:
            mtype: the media typ
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
        # pylint: disable=no-member
        # Additional arg `save` is to prevent saving the fields when reloading
        # a dataset from the database.

        if field_name in self.fields:
            raise ValueError("Field '%s' already exists" % field_name)

        _validate_field_against_mtype(mtype, ftype, embedded_doc_type)

        field = _create_field(
            field_name,
            ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
        )

        self.fields[field_name] = field
        self._sample_doc_cls._fields_ordered += (field_name,)

        # Only set the attribute if it is a class
        setattr(self._sample_doc_cls, field_name, field)

        if save:
            # Update dataset meta class
            field = self.fields[field_name]
            sample_field = foo.SampleFieldDocument.from_field(field)
            dataset_doc = self._get_dataset_doc()
            dataset_doc.sample_fields.append(sample_field)
            dataset_doc.save()

    def add_implied_field(self, mtype, field_name, value):
        """Adds the field to the sample, inferring the field type from the
        provided value.

        Args:
            mtype: the media type
            field_name: the field name
            value: the field value
        """
        if field_name in self.fields:
            raise ValueError("Field '%s' already exists" % field_name)

        self.add_field(mtype, field_name, **_get_implied_field_kwargs(value))

    @no_delete_default_field
    def delete_field(self, field_name):
        """Deletes the field from the sample.

        If the sample is in a dataset, the field will be removed from all
        samples in the dataset.

        Args:
            field_name: the field name

        Raises:
            AttributeError: if the field does not exist
        """
        # pylint: disable=no-member
        try:
            # Delete from all samples
            self._sample_doc_cls.objects.update(
                **{"unset__%s" % field_name: None}
            )
        except InvalidQueryError:
            raise AttributeError("Sample has no field '%s'" % field_name)

        # Remove from dataset
        del self.fields[field_name]
        self._sample_doc_cls._fields_ordered = tuple(
            fn for fn in self.fields_ordered if fn != field_name
        )
        delattr(self._sample_doc_cls, field_name)

        # Update dataset meta class
        dataset_doc = self._get_dataset_doc()
        dataset_doc.sample_fields = [
            sf for sf in dataset_doc.sample_fields if sf.name != field_name
        ]
        dataset_doc.save()

    def drop_collection(self, *args, **kwargs):
        return self._sample_doc_cls.drop_collection(*args, **kwargs)

    def get_field_default(self, field_name):
        """Returns the default value of a field.

        Args:
            field_name: the name of the field

        Returns:
            the field's default value

        Raises:
            AttributeError: if the field does not exist
            ValueError: if the field has no default
        """
        try:
            field = self.fields[field_name]
        except KeyError:
            raise AttributeError(
                "%s doesn't have a field '%s'"
                % (type(self).__name__, field_name)
            )
        return field.get_default()

    def validate(self, sample):
        """Validates the contents of the sample against this schema.

        Raises:
            ``mongoengine.FieldDoesNotExist``
            ``mongoengine.ValidationError``
        """
        fields = self.get_field_schema(include_private=True)

        non_existest_fields = {
            fn for fn in sample.field_names if fn not in fields
        }

        if self._get_dataset_doc().mtype != sample.mtype:
            raise MediaTypeError("Dataset mtype and sample mtype do not match")

        if non_existest_fields:
            msg = "The fields %s do not exist on the dataset '%s'" % (
                non_existest_fields,
                self._get_dataset_doc().name,
            )
            raise FieldDoesNotExist(msg)

        for field_name, value in sample.iter_fields():
            field = fields[field_name]
            if value is None and field.null:
                continue

            field.validate(value)

    def _get_fields_ordered(self, include_private=False):
        if include_private:
            return self.fields_ordered
        return tuple(f for f in self.fields_ordered if not f.startswith("_"))

    def _get_dataset_doc(self):
        return foo.DatasetDocument.objects.get(
            sample_collection_name=self.sample_collection_name
        )


def _get_implied_field_kwargs(value):
    if isinstance(value, fol.VideoLabels):
        return {
            "ftype": fof.VideoLabelsField,
        }

    if isinstance(value, food.BaseEmbeddedDocument):
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


def _create_field(field_name, ftype, embedded_doc_type=None, subfield=None):

    if not issubclass(ftype, fof.Field):
        raise ValueError(
            "Invalid field type '%s'; must be a subclass of '%s'"
            % (ftype, fof.Field)
        )

    kwargs = {"db_field": field_name}

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


def _validate_field_against_mtype(mtype, ftype, embedded_doc_type=None):
    is_image_field = is_video_field = False

    if issubclass(ftype, fof.ImageLabelsField):
        is_image_field = True

    if embedded_doc_type is not None and issubclass(
        embedded_doc_type, fol.ImageLabel
    ):
        image_field = True

    if issubclass(ftype, fof.VideoLabelsField):
        is_video_field = True

    if is_image_field and mtype != "image":
        raise MediaTypeError("Cannot add image based field")
    elif is_video_field and mtype != "video":
        raise MediaTypeError("Cannot add video based field")


class MediaTypeError(TypeError):

    pass
