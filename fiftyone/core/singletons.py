"""
FiftyOne singleton implementations.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import weakref


class DatasetSingleton(type):
    """Singleton metaclass for :class:`fiftyone.core.dataset.Dataset`.

    Datasets are singletons keyed by the dataset's ``name``.

    Note that new :class:`fiftyone.core.dataset.Dataset` instances are always
    created if the ``_create == True``.
    """

    def __new__(metacls, *args, **kwargs):
        cls = super().__new__(metacls, *args, **kwargs)
        cls._instances = weakref.WeakValueDictionary()
        return cls

    def __call__(cls, name=None, _create=True, *args, **kwargs):
        if (
            _create
            or name not in cls._instances
            or cls._instances[name].deleted
        ):
            instance = cls.__new__(cls)
            instance.__init__(name=name, _create=_create, *args, **kwargs)
            name = instance.name  # `__init__` may have changed `name`
            cls._instances[name] = instance

        return cls._instances[name]


class DocumentSingleton(type):
    """Singleton metaclass for :class:`fiftyone.core.document.Document`
    subclasses.

    This metadata maintains a weakref dictionary of all in-memory instances of
    a class that implements this type, keyed by ``[collection name][doc ID]``.
    """

    def __new__(metacls, *args, **kwargs):
        cls = super().__new__(metacls, *args, **kwargs)

        # Instances are keyed by [collection_name][doc_id]
        cls._instances = defaultdict(weakref.WeakValueDictionary)

        return cls

    def _register_instance(cls, obj):
        """Registers the given instance in the weakref dictionary.

        Args:
            obj: a :class:`Document`
        """
        cls._instances[obj._doc.collection_name][obj.id] = obj

    def _get_instance(cls, doc):
        """Retrieves the :class:`Document` instance for the given document, if
        one exists.

        Args:
            doc: a :class:`fiftyone.core.odm.document.Document`

        Returns:
            a :class:`Document` instance, or None
        """
        try:
            return cls._instances[doc.collection_name][str(doc.id)]
        except KeyError:
            return None

    def _rename_fields(cls, collection_name, field_names, new_field_names):
        """Renames the field on all in-memory documents in the collection.

        Args:
            collection_name: the name of the MongoDB collection
            field_names: an iterable of field names
            new_field_names: an iterable of new field names
        """
        if collection_name not in cls._instances:
            return

        for document in cls._instances[collection_name].values():
            data = document._doc._data
            for field_name, new_field_name in zip(
                field_names, new_field_names
            ):
                data[new_field_name] = data.pop(field_name, None)

    def _clear_fields(cls, collection_name, field_names):
        """Clears the values for the given field(s) (i.e., sets them to None)
        on all in-memory documents in the collection.

        Args:
            collection_name: the name of the MongoDB collection
            field_names: an iterable of field names
        """
        if collection_name not in cls._instances:
            return

        for document in cls._instances[collection_name].values():
            for field_name in field_names:
                document._doc._data[field_name] = None

    def _purge_fields(cls, collection_name, field_names):
        """Removes the field(s) from all in-memory documents in the collection.

        Args:
            collection_name: the name of the MongoDB collection
            field_names: an iterable of field names
        """
        if collection_name not in cls._instances:
            return

        for document in cls._instances[collection_name].values():
            for field_name in field_names:
                document._doc._data.pop(field_name, None)

    def _reload_doc(cls, collection_name, doc_id, hard=False):
        """Reloads the backing document for the specified document if it exists
        in memory.

        Args:
            collection_name: the name of the MongoDB collection
            doc_id: the document ID
        """
        if collection_name not in cls._instances:
            return

        document = cls._instances[collection_name].get(doc_id, None)
        if document is not None:
            document.reload(hard=hard)

    def _reload_docs(cls, collection_name, doc_ids=None, hard=False):
        """Reloads the backing documents for all in-memory documents in the
        collection.

        Documents that are still in the collection will be reloaded, and
        documents that are no longer in the collection will be reset.

        Args:
            collection_name: the name of the MongoDB collection
            doc_ids (None): a list of IDs of documents that are still in the
                collection. If not provided, all documents are assumed to still
                be in the collection
        """
        if collection_name not in cls._instances:
            return

        documents = cls._instances[collection_name]

        # Reload all docs
        if doc_ids is None:
            for document in documents.values():
                document.reload(hard=hard)

        # Reload docs with `doc_ids`, reset others
        if doc_ids is not None:
            reset_ids = set()
            for document in documents.values():
                if document.id in doc_ids:
                    document.reload(hard=hard)
                else:
                    reset_ids.add(document.id)
                    document._reset_backing_doc()

            for doc_id in reset_ids:
                documents.pop(doc_id, None)

    def _reset_docs(cls, collection_name, doc_ids=None):
        """Resets the backing documents for in-memory documents in the
        collection.

        Reset documents will no longer belong to their parent dataset.

        Args:
            collection_name: the name of the MongoDB collection
            doc_ids (None): an optional list of document IDs to reset. By
                default, all documents are reset
        """
        if collection_name not in cls._instances:
            return

        # Reset all docs
        if doc_ids is None:
            documents = cls._instances.pop(collection_name)
            for document in documents.values():
                document._reset_backing_doc()

        # Reset docs with `doc_ids`
        if doc_ids is not None:
            documents = cls._instances[collection_name]

            for doc_id in doc_ids:
                document = documents.pop(doc_id, None)
                if document is not None:
                    document._reset_backing_doc()


class FrameSingleton(type):
    """Singleton metaclass for :class:`fiftyone.core.frame.Frame`.

    This metadata maintains a weakref dictionary of all in-memory
    :class:`fiftyone.core.frame.Frame` instances keyed by
    ``[collection name][sample ID][frame number]``.
    """

    def __new__(metacls, *args, **kwargs):
        cls = super().__new__(metacls, *args, **kwargs)

        # Instances are keyed by [collection_name][sample_id][frame_number]
        cls._instances = defaultdict(
            lambda: defaultdict(weakref.WeakValueDictionary)
        )

        return cls

    def _register_instance(cls, obj):
        """Registers the given instance in the weakref dictionary.

        Args:
            obj: a :class:`fiftyone.core.frame.Frame`
        """
        cls._instances[obj._doc.collection_name][str(obj._sample_id)][
            obj.frame_number
        ] = obj

    def _get_instance(cls, doc):
        """Retrieves the :class:`Frame` instance for the given document, if one
        exists.

        Args:
            doc: a :class:`fiftyone.core.odm.frame.DatasetFrameSampleDocument`

        Returns:
            a :class:`Frame` instance, or None
        """
        try:
            return cls._instances[doc.collection_name][str(doc._sample_id)][
                doc.frame_number
            ]
        except KeyError:
            return None

    def _rename_fields(cls, collection_name, field_names, new_field_names):
        if collection_name not in cls._instances:
            return

        for frames in cls._instances[collection_name].values():
            for document in frames.values():
                data = document._doc._data
                for field_name, new_field_name in zip(
                    field_names, new_field_names
                ):
                    data[new_field_name] = data.pop(field_name, None)

    def _clear_fields(cls, collection_name, field_names):
        if collection_name not in cls._instances:
            return

        for frames in cls._instances[collection_name].values():
            for document in frames.values():
                for field_name in field_names:
                    document._doc._data[field_name] = None

    def _purge_fields(cls, collection_name, field_names):
        if collection_name not in cls._instances:
            return

        for frames in cls._instances[collection_name].values():
            for document in frames.values():
                for field_name in field_names:
                    document._doc._data.pop(field_name, None)

    def _reload_doc(cls, collection_name, doc_id, sample_id=None, hard=False):
        if collection_name not in cls._instances:
            return

        samples = cls._instances[collection_name]

        if sample_id is not None:
            document = samples.get(sample_id, {}).get(doc_id, None)
            if document is not None:
                document.reload(hard=hard)

            return

        for frames in samples.values():
            document = frames.get(doc_id, None)
            if document is not None:
                document.reload(hard=hard)

    def _reload_docs(
        cls, collection_name, doc_ids=None, sample_ids=None, hard=False
    ):
        if collection_name not in cls._instances:
            return

        samples = cls._instances[collection_name]

        # Reload all docs
        if doc_ids is None and sample_ids is None:
            for frames in samples.values():
                for document in frames.values():
                    document.reload(hard=hard)

        # Reload docs for samples with `sample_ids`, reset others
        if sample_ids is not None:
            reset_ids = set()
            for sample_id, frames in samples.items():
                if sample_id in sample_ids:
                    for document in frames.values():
                        document.reload(hard=hard)
                else:
                    reset_ids.add(sample_id)
                    for document in frames.values():
                        document._reset_backing_doc()

            for sample_id in reset_ids:
                samples.pop(sample_id, None)

        # Reload docs with `doc_ids`, reset others
        if doc_ids is not None:
            for frames in samples.values():
                reset_ids = set()
                for document in frames.values():
                    if document.id in doc_ids:
                        document.reload(hard=hard)
                    else:
                        reset_ids.add(document.id)
                        document._reset_backing_doc()

                for doc_id in reset_ids:
                    frames.pop(doc_id, None)

    def _reset_docs(cls, collection_name, doc_ids=None, sample_ids=None):
        if collection_name not in cls._instances:
            return

        # Reset all docs
        if doc_ids is None and sample_ids is None:
            samples = cls._instances.pop(collection_name)
            for frames in samples.values():
                for document in frames.values():
                    document._reset_backing_doc()

        # Reset docs for samples with `sample_ids`
        if sample_ids is not None:
            samples = cls._instances[collection_name]
            for sample_id in sample_ids:
                frames = samples.pop(sample_id, None)
                if frames is not None:
                    for document in frames.values():
                        document._reset_backing_doc()

        # Reset docs with `doc_ids`
        if doc_ids is not None:
            samples = cls._instances[collection_name]
            for frames in samples.values():
                for doc_id in doc_ids:
                    document = frames.pop(doc_id, None)
                    if document is not None:
                        document._reset_backing_doc()
