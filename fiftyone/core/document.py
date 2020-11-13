"""
Base class for objects that are backed by database documents.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy

import eta.core.serial as etas


class Document(object):
    """Base class for objects that are associated with
    :class:`fiftyone.core.dataset.Dataset` instances and are backed by
    documents in database collections.

    Args:
        dataset (None): the :class:`fiftyone.core.dataset.Dataset` to which the
            document belongs
    """

    def __init__(self, dataset=None):
        self._dataset = dataset

    def __dir__(self):
        return super().__dir__() + list(self.field_names)

    def __getattr__(self, name):
        try:
            return super().__getattribute__(name)
        except AttributeError:
            if name != "_doc":
                return self._doc.get_field(name)
            else:
                raise

    def __setattr__(self, name, value):
        if name.startswith("_") or (
            hasattr(self, name) and not self._doc.has_field(name)
        ):
            super().__setattr__(name, value)
        else:
            try:
                self._secure_media(name, value)
            except AttributeError:
                pass

            self._doc.__setattr__(name, value)

    def __delattr__(self, name):
        try:
            self.__delitem__(name)
        except KeyError:
            super().__delattr__(name)

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
        """Whether the underlying :class:`fiftyone.core.odm.Document` has
        been inserted into the database.
        """
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

    def get_field(self, field_name):
        """Gets the value of a field of the document.

        Args:
            field_name: the field name

        Returns:
            the field value

        Raises:
            AttributeError: if the field does not exist
        """
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

    def update_fields(self, fields_dict, create=True):
        """Sets the dictionary of fields on the document.

        Args:
            fields_dict: a dict mapping field names to values
            create (True): whether to create fields if they do not exist
        """
        for field_name, value in fields_dict.items():
            self.set_field(field_name, value, create=create)

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

    def merge(self, document, overwrite=True):
        """Merges the fields of the document into this document.

        ``None``-valued fields are always omitted.

        Args:
            document: a :class:`Document` of the same type
            overwrite (True): whether to overwrite existing fields. Note that
                existing fields whose values are ``None`` are always
                overwritten
        """
        existing_field_names = self.field_names
        for field_name, value in document.iter_fields():
            if value is None:
                continue

            if (
                not overwrite
                and (field_name in existing_field_names)
                and (self[field_name] is not None)
            ):
                continue

            self.set_field(field_name, value)

    def copy(self):
        """Returns a deep copy of the document that has not been added to the
        database.

        Returns:
            a :class:`Document`
        """
        kwargs = {k: deepcopy(v) for k, v in self.iter_fields()}
        return self.__class__(**kwargs)

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

    def reload(self):
        """Reloads the document from the database."""
        self._doc.reload()

    def _delete(self):
        """Deletes the document from the database."""
        self._doc.delete()

    @classmethod
    def from_dict(cls, d):
        """Loads the document from a JSON dictionary.

        The returned document will not belong to a dataset.

        Returns:
            a :class:`Document`
        """
        doc = cls._NO_COLL_CLS.from_dict(d, extended=True)
        return cls.from_doc(doc)

    @classmethod
    def from_json(cls, s):
        """Loads the document from a JSON string.

        Args:
            s: the JSON string

        Returns:
            a :class:`Document`
        """
        doc = cls._NO_COLL_CL.from_json(s)
        return cls.from_doc(doc)

    @classmethod
    def _rename_field(cls, collection_name, field_name, new_field_name):
        """Renames any field values for in-memory document instances that
        belong to the specified collection.

        Args:
            collection_name: the name of the MongoDB collection
            field_name: the name of the field to rename
            new_field_name: the new field name
        """
        for document in cls._instances[collection_name].values():
            data = document._doc._data
            data[new_field_name] = data.pop(field_name, None)

    @classmethod
    def _purge_field(cls, collection_name, field_name):
        """Removes values for the given field from all in-memory document
        instances that belong to the specified collection.

        Args:
            collection_name: the name of the MongoDB collection
            field_name: the name of the field to purge
        """
        for document in cls._instances[collection_name].values():
            document._doc._data.pop(field_name, None)

    @classmethod
    def _reload_docs(cls, collection_name):
        """Reloads the backing documents for all in-memory document instances
        that belong to the specified collection.

        Args:
            collection_name: the name of the MongoDB collection
        """
        for document in cls._instances[collection_name].values():
            document.reload()

    def _set_backing_doc(self, doc, dataset=None):
        """Sets the backing doc for the document.

        Args:
            doc: a :class:`fiftyone.core.odm.SampleDocument`
            dataset (None): the :class:`fiftyone.core.dataset.Dataset` to which
                the document belongs, if any
        """
        # Ensure the doc is saved to the database
        if not doc.id:
            doc.save()

        self._doc = doc

        # Save weak reference
        dataset_instances = self._instances[doc.collection_name]
        if self.id not in dataset_instances:
            dataset_instances[self.id] = self

        self._dataset = dataset

    @classmethod
    def _reset_backing_docs(cls, collection_name, doc_ids):
        """Resets the document(s) backing documents.

        Args:
            collection_name: the name of the MongoDB collection
            doc_ids: a list of document IDs
        """
        dataset_instances = cls._instances[collection_name]
        for doc_id in doc_ids:
            document = dataset_instances.pop(doc_id, None)
            if document is not None:
                document._reset_backing_doc()

    @classmethod
    def _reset_all_backing_docs(cls, collection_name):
        """Resets the backing documents for all documents in the collection.

        Args:
            collection_name: the name of the MongoDB collection
        """
        if collection_name not in cls._instances:
            return

        dataset_instances = cls._instances.pop(collection_name)
        for document in dataset_instances.values():
            document._reset_backing_doc()

    def _reset_backing_doc(self):
        self._doc = self.copy()._doc
        self._dataset = None
