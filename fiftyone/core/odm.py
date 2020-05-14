"""

"""
# pragma pylint: disable=redefined-builtin
# pragma pylint: disable=unused-wildcard-import
# pragma pylint: disable=wildcard-import
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals
from builtins import *
from future.utils import iteritems, itervalues

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

from collections import OrderedDict
import json
import os
import six
import warnings

# pylint: disable=wildcard-import,unused-wildcard-import
from mongoengine import *
from mongoengine.fields import BaseField

import fiftyone.core.field as fof


_DEFAULT_DATABASE = "fiftyone"


_db = connect(_DEFAULT_DATABASE)


def drop_database():
    """Drops the database."""
    _db.drop_database(_DEFAULT_DATABASE)


class ODMDocument(Document, fof.SerializableDocumentMixin):
    """

    ODMDocument.id implementation details:

        - the ID of a document is automatically populated when it is added
          to the database

        - the ID is of a document is ``None`` if it has not been added to
          the database

        - the ID is a 12 byte value consisting of the concatentation of the
          following:

            - a 4 byte timestamp representing the document's commit time,
              measured in seconds since epoch

            - a 5 byte random value

            - a 3 byte incrementing counter, initialized to a random value
    """

    meta = {"abstract": True}

    def __str__(self):
        return str(
            json.dumps(
                self.to_dict(extended=True),
                separators=(",", ": "),
                ensure_ascii=False,
                indent=4,
            )
        )

    @property
    def ingest_time(self):
        """The time the document was added to the database, or ``None`` if it
        has not been added to the database.
        """
        return self.id.generation_time if self._in_db else None

    @property
    def _in_db(self):
        """Whether the underlying :class:`fiftyone.core.odm.ODMDocument` has
        been inserted into the database.
        """
        return hasattr(self, "id") and self.id is not None


class ODMSample(ODMDocument):
    """Abstract ODMSample class that all
    :class:`fiftyone.core.dataset.Dataset._Doc` classes inherit from.
    Instances of the subclasses are samples. I.e.:

        sample = dataset._Doc(...)

    Samples store all information associated with a particular piece of data in
    a dataset, including basic metadata about the data, one or more sets of
    labels (ground truth, user-provided, or FiftyOne-generated), and additional
    features associated with subsets of the data and/or label sets.
    """

    meta = {"abstract": True}

    # the path to the data on disk
    filepath = StringField(unique=True)
    # the set of tags associated with the sample
    tags = ListField(StringField())
    # metadata about the sample media
    metadata = EmbeddedDocumentField(fof.Metadata, null=True)

    @classmethod
    def get_fields(cls, field_type=None):
        """Gets a dictionary of all document fields on elements of this
        collection.

        Args:
            field_type (None): the subclass of ``BaseField`` for primitives
                or ``EmbeddedDocument`` for ``EmbeddedDocumentField``s to
                filter by


        Returns:
             a dictionary of (field name: field type) per field that is a
             subclass of ``field_type``
        """
        if field_type is None:
            field_type = BaseField

        if not issubclass(field_type, BaseField) and not issubclass(
            field_type, EmbeddedDocument
        ):
            raise ValueError(
                "field_type must be subclass of %s or %s" % BaseField,
                EmbeddedDocument,
            )

        d = OrderedDict()

        for field_name in cls._fields_ordered:
            field = cls._fields[field_name]
            if issubclass(field_type, BaseField):
                if isinstance(field, field_type):
                    d[field_name] = field
            elif isinstance(field, EmbeddedDocumentField):
                if issubclass(field.document_type, field_type):
                    d[field_name] = field

        return d

    @property
    def dataset_name(self):
        """The name of the dataset to which this sample belongs, or ``None`` if
        it has not been added to a dataset.
        """
        # @todo(Tyler) maybe get rid of this?
        raise NotImplementedError("TODO")

    @property
    def filename(self):
        """The name of the raw data file on disk."""
        return os.path.basename(self.filepath)

    def __setattr__(self, name, value):
        # all attrs starting with "_" or that exist and are not fields are
        # deferred to super
        if name.startswith("_") or (
            hasattr(self, name) and name not in self._fields
        ):
            return super(ODMSample, self).__setattr__(name, value)

        cls = self.__class__

        if hasattr(cls, name):
            if value is not None:
                getattr(cls, name).validate(value)

            result = super(ODMSample, self).__setattr__(name, value)
            if (
                name not in ["_cls", "id"]
                and isinstance(getattr(cls, name), BaseField)
                and self._in_db
            ):
                # autosave the change to existing attrs
                self.save()
            return result

        warnings.warn(
            "Fiftyone doesn't allow fields to be "
            "created via a new attribute name",
            stacklevel=2,
        )
        return super(ODMSample, self).__setattr__(name, value)

    def __getitem__(self, key):
        if isinstance(key, six.string_types) and hasattr(self, key):
            return self.__getattribute__(key)
        return super(ODMSample, self).__getitem__(key)

    def __setitem__(self, key, value):
        if key.startswith("_"):
            raise KeyError(
                "Invalid key: '%s'. Key cannot start with '_'" % key
            )

        if hasattr(self, key) and key not in self._fields:
            raise KeyError("Cannot set reserve word '%s'" % key)

        if key not in self._fields:
            if isinstance(value, EmbeddedDocument):
                self.add_field(
                    key, EmbeddedDocumentField, embedded_doc_type=type(value)
                )
            elif isinstance(value, bool):
                self.add_field(key, BooleanField)
            elif isinstance(value, six.integer_types):
                self.add_field(key, IntField)
            elif isinstance(value, six.string_types):
                self.add_field(key, StringField)
            elif isinstance(value, list) or isinstance(value, tuple):
                # @todo(Tyler) set the subfield of ListField and
                #   ensure all elements are of this type
                self.add_field(key, ListField)
            elif isinstance(value, dict):
                self.add_field(key, DictField)
            else:
                raise TypeError(
                    "Invalid type: '%s' could not be cast to Field"
                    % type(value)
                )

        return self.__setattr__(key, value)

    @classmethod
    def add_field(
        cls, field_name, field_type, embedded_doc_type=None, subfield=None
    ):
        """Add a new field to the dataset

        Args:
            field_name: the string name of the field to add
            field_type: the type (subclass of BaseField) of the field to create
            embedded_doc_type (None): the EmbeddedDocument type, used if
                    field_type=EmbeddedDocumentField
                ignored otherwise
            subfield (None): the optional contained field for lists and dicts, if provided

        """
        if field_name in cls._fields:
            raise ValueError("Field '%s' already exists" % field_name)

        if not issubclass(field_type, BaseField):
            raise ValueError(
                "Invalid field type '%s' is not a subclass of '%s'"
                % (field_type, BaseField)
            )

        kwargs = {"db_field": field_name}

        if issubclass(field_type, EmbeddedDocumentField):
            kwargs.update(
                {"document_type": embedded_doc_type, "null": True,}
            )
        elif any(issubclass(field_type, ft) for ft in [ListField, DictField]):
            if subfield is not None:
                kwargs["field"] = subfield

        # Mimicking setting a DynamicField from this code:
        #   https://github.com/MongoEngine/mongoengine/blob/3db9d58dac138dd0e838c524f616ebe3d23db2ff/mongoengine/base/document.py#L170
        field = field_type(**kwargs)
        field.name = field_name
        cls._fields[field_name] = field
        cls._fields_ordered += (field_name,)
        setattr(cls, field_name, field)
