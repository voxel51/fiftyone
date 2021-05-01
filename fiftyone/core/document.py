"""
Base class for objects that are backed by database documents.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from functools import wraps
import inspect

import eta.core.serial as etas

from fiftyone.core.singletons import DocumentSingleton


# @todo not yet used
def no_views(func):
    @wraps(func)
    def wrapper(self_or_cls, *args, **kwargs):
        if self_or_cls._IS_VIEW:
            cls = (
                self_or_cls
                if inspect.isclass(self_or_cls)
                else self_or_cls.__class__
            )
            raise ValueError(
                "The %s() method cannot be invoked; the %s class is a view"
                % (func.__name__, cls.__name__)
            )

        return func(self_or_cls, *args, **kwargs)

    return wrapper


class Document(object):
    """Base class for objects that are associated with
    :class:`fiftyone.core.dataset.Dataset` instances and are backed by
    documents in database collections.

    Args:
        doc: the backing :class:`fiftyone.core.odm.document.Document`
        dataset (None): the :class:`fiftyone.core.dataset.Dataset` to which the
            document belongs
    """

    _NO_DATASET_DOC_CLS = None

    def __init__(self, doc, dataset=None):
        self._doc = doc
        self._dataset = dataset

    def __str__(self):
        return repr(self)

    def __repr__(self):
        return self._doc.fancy_repr(class_name=self.__class__.__name__)

    def __dir__(self):
        return super().__dir__() + list(self.field_names)

    def __getattr__(self, name):
        try:
            return super().__getattribute__(name)
        except AttributeError:
            return self._doc.get_field(name)

    def __setattr__(self, name, value):
        if name.startswith("_") or (
            hasattr(self, name) and not self._doc.has_field(name)
        ):
            super().__setattr__(name, value)
        else:
            self._doc.__setattr__(name, value)

    def __delattr__(self, name):
        try:
            self.__delitem__(name)
        except KeyError:
            super().__delattr__(name)

    def __getitem__(self, field_name):
        try:
            return self.get_field(field_name)
        except AttributeError:
            raise KeyError(
                "%s has no field '%s'" % (self.__class__.__name__, field_name)
            )

    def __setitem__(self, field_name, value):
        self.set_field(field_name, value=value)

    def __delitem__(self, field_name):
        try:
            self.clear_field(field_name)
        except ValueError as e:
            raise KeyError(e.args[0])

    def __copy__(self):
        return self.copy()

    def __eq__(self, other):
        if not isinstance(other, self.__class__):
            return False

        return self._doc == other._doc

    @property
    def id(self):
        """The ID of the document, or ``None`` if it has not been added to the
        database.
        """
        return str(self._doc.id) if self._in_db else None

    @property
    def _id(self):
        """The ObjectId of the document, or ``None`` if it has not been added
        to the database.
        """
        return self._doc.id if self._in_db else None

    @property
    def ingest_time(self):
        """The time the document was added to the database, or ``None`` if it
        has not been added to the database.
        """
        return self._doc.ingest_time

    @property
    def in_dataset(self):
        """Whether the document has been added to a dataset."""
        return self.dataset is not None

    @property
    def dataset(self):
        """The dataset to which this document belongs, or ``None`` if it has
        not been added to a dataset.
        """
        return self._dataset

    @property
    def field_names(self):
        """An ordered tuple of the names of the fields of this document."""
        return self._doc.field_names

    @property
    def _in_db(self):
        """Whether the document has been inserted into the database."""
        return self._doc.in_db

    @property
    def _skip_iter_field_names(self):
        """A tuple of names of fields to skip when :meth:`iter_fields` is
        called.
        """
        return tuple()

    def _get_field_names(self, include_private=False):
        """Returns an ordered tuple of field names of this document.

        Args:
            include_private (False): whether to include private fields

        Returns:
            a tuple of field names
        """
        return self._doc._get_field_names(include_private=include_private)

    def has_field(self, field_name):
        """Determines whether the document has the given field.

        Args:
            field_name: the field name

        Returns:
            True/False
        """
        return self._doc.has_field(field_name)

    def get_field(self, field_name):
        """Gets the value of a field of the document.

        Args:
            field_name: the field name

        Returns:
            the field value

        Raises:
            AttributeError: if the field does not exist
        """
        if field_name == "id":
            return self.id

        return self._doc.get_field(field_name)

    def set_field(self, field_name, value, create=True):
        """Sets the value of a field of the document.

        Args:
            field_name: the field name
            value: the field value
            create (True): whether to create the field if it does not exist

        Raises:
            ValueError: if ``field_name`` is not an allowed field name or does
                not exist and ``create == False``
        """
        if field_name.startswith("_"):
            raise ValueError(
                "Invalid field name: '%s'. Field names cannot start with '_'"
                % field_name
            )

        self._doc.set_field(field_name, value, create=create)

    def update_fields(self, fields_dict, expand_schema=True):
        """Sets the dictionary of fields on the document.

        Args:
            fields_dict: a dict mapping field names to values
            expand_schema (True): whether to dynamically add new fields
                encountered to the document schema. If False, an error is
                raised if any fields are not in the document schema
        """
        for field_name, value in fields_dict.items():
            self.set_field(field_name, value, create=expand_schema)

    def clear_field(self, field_name):
        """Clears the value of a field of the document.

        Args:
            field_name: the name of the field to clear

        Raises:
            ValueError: if the field does not exist
        """
        self._doc.clear_field(field_name)

    def iter_fields(self):
        """Returns an iterator over the ``(name, value)`` pairs of the fields
        of the document.

        Private fields are omitted.

        Returns:
            an iterator that emits ``(name, value)`` tuples
        """
        field_names = tuple(
            f for f in self.field_names if f not in self._skip_iter_field_names
        )
        for field_name in field_names:
            yield field_name, self.get_field(field_name)

    def merge(
        self,
        document,
        omit_fields=None,
        omit_none_fields=True,
        overwrite=True,
        expand_schema=True,
    ):
        """Merges the fields of the document into this document.

        Args:
            document: a :class:`Document` of the same type
            omit_fields (None): an optional list of fields to omit
            omit_none_fields (True): whether to omit ``None``-valued fields of
                the provided document
            overwrite (True): whether to overwrite existing fields. Note that
                existing fields whose values are ``None`` are always
                overwritten
            expand_schema (True): whether to dynamically add new fields
                encountered to the document schema. If False, an error is
                raised if any fields are not in the document schema
        """
        if omit_fields is not None:
            omit_fields = set(omit_fields)
        else:
            omit_fields = set()

        existing_field_names = self.field_names

        for field_name, value in document.iter_fields():
            if field_name in omit_fields:
                continue

            if omit_none_fields and value is None:
                continue

            if (
                not overwrite
                and (field_name in existing_field_names)
                and (self[field_name] is not None)
            ):
                continue

            self.set_field(field_name, value, create=expand_schema)

    def copy(self):
        """Returns a deep copy of the document that has not been added to the
        database.

        Returns:
            a :class:`Document`
        """
        return self.__class__(self._doc.copy(), dataset=self._dataset)

    def to_dict(self):
        """Serializes the document to a JSON dictionary.

        Sample IDs and private fields are excluded in this representation.

        Returns:
            a JSON dict
        """
        d = self._doc.to_dict(extended=True)
        return {k: v for k, v in d.items() if not k.startswith("_")}

    def to_json(self, pretty_print=False):
        """Serializes the document to a JSON string.

        Sample IDs and private fields are excluded in this representation.

        Args:
            pretty_print (False): whether to render the JSON in human readable
                format with newlines and indentations

        Returns:
            a JSON string
        """
        return etas.json_to_str(self.to_dict(), pretty_print=pretty_print)

    def to_mongo_dict(self):
        """Serializes the document to a BSON dictionary equivalent to the
        representation that would be stored in the database.

        Returns:
            a BSON dict
        """
        return self._doc.to_dict(extended=False)

    def save(self):
        """Saves the document to the database."""
        self._doc.save()

    def reload(self, hard=False):
        """Reloads the document from the database."""
        if hard:
            self._reload_backing_doc()
        else:
            # We can only reload fields that are in our schema
            self._doc.reload(*list(self._doc))

    @classmethod
    def from_doc(cls, doc, dataset=None):
        """Creates a :class:`Document` backed by the given database document.

        Args:
            doc: a :class:`fiftyone.core.odm.document.Document`
            dataset (None): the :class:`fiftyone.core.dataset.Dataset` that
                the document belongs to, if any

        Returns:
            a :class:`Document`
        """
        if isinstance(doc, cls._NO_DATASET_DOC_CLS):
            document = cls.__new__(cls)
            document._doc = doc
            document._dataset = None
            return document

        if issubclass(type(cls), DocumentSingleton):
            document = cls._get_instance(doc)
            if document is not None:
                return document

        if dataset is None:
            raise ValueError(
                "`dataset` argument must be provided for documents in "
                "datasets"
            )

        document = cls.__new__(cls)
        document._doc = None  # prevents recursion
        document._set_backing_doc(doc, dataset=dataset)

        return document

    @classmethod
    def from_dict(cls, d):
        """Loads the document from a JSON dictionary.

        The returned document will not belong to a dataset.

        Returns:
            a :class:`Document`
        """
        doc = cls._NO_DATASET_DOC_CLS.from_dict(d, extended=True)
        return cls.from_doc(doc)

    @classmethod
    def from_json(cls, s):
        """Loads the document from a JSON string.

        The returned document will not belong to a dataset.

        Args:
            s: the JSON string

        Returns:
            a :class:`Document`
        """
        doc = cls._NO_DATASET_DOC_CLS.from_json(s)
        return cls.from_doc(doc)

    def _set_backing_doc(self, doc, dataset=None):
        """Sets the backing doc for the document.

        Args:
            doc: a :class:`fiftyone.core.odm.document.Document`
            dataset (None): the :class:`fiftyone.core.dataset.Dataset` to which
                the document belongs, if any
        """
        if not doc.id:
            doc.save()

        self._doc = doc
        self._dataset = dataset

        cls = self.__class__
        if issubclass(type(cls), DocumentSingleton):
            cls._register_instance(self)

    def _reset_backing_doc(self):
        """Resets the backing doc for the document.

        The document will no longer belong to a dataset.
        """
        self._doc = self.copy()._doc
        self._dataset = None

    def _reload_backing_doc(self):
        """Reloads the backing doc from the database, if possible.

        Subclasses should implement this method if they support hot reloading.
        """
        pass

    def _delete(self):
        """Deletes the document from the database."""
        self._doc.delete()
