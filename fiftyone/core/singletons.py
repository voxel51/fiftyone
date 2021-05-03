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
    """Singleton metaclass interface for
    :class:`fiftyone.core.document.Document` subclasses.

    The methods declared by this interface are used by the
    :class:`fiftyone.core.document.Document` class to manage all instances
    of a class that implements this type.
    """

    def _register_instance(cls, obj):
        """Registers the given instance in the weakref dictionary.

        Args:
            obj: a :class:`Document`
        """
        raise NotImplementedError(
            "subclass must implement _register_instance()"
        )

    def _get_instance(cls, doc):
        """Retrieves the :class:`fiftyone.core.document.Document` instance for
        the given document, if one exists.

        Args:
            doc: a :class:`fiftyone.core.odm.document.Document`

        Returns:
            a :class:`fiftyone.core.document.Document` instance, or None
        """
        raise NotImplementedError("subclass must implement _get_instance()")


class SampleSingleton(DocumentSingleton):
    """Singleton metaclass for :class:`fiftyone.core.sample.Sample`.

    This metaclass maintains a weakref dictionary of all in-memory
    :class:`fiftyone.core.sample.Sample` instances keyed by
    ``[collection name][sample ID]``.
    """

    def __new__(metacls, *args, **kwargs):
        cls = super().__new__(metacls, *args, **kwargs)

        # Instances are keyed by [collection name][sample ID]
        cls._instances = defaultdict(weakref.WeakValueDictionary)

        return cls

    def _register_instance(cls, obj):
        cls._instances[obj._doc.collection_name][obj.id] = obj

    def _get_instance(cls, doc):
        try:
            return cls._instances[doc.collection_name][str(doc.id)]
        except KeyError:
            return None

    def _rename_fields(cls, collection_name, field_names, new_field_names):
        """Renames the field on all in-memory samples in the collection."""
        if collection_name not in cls._instances:
            return

        for sample in cls._instances[collection_name].values():
            data = sample._doc._data
            for field_name, new_field_name in zip(
                field_names, new_field_names
            ):
                data[new_field_name] = data.pop(field_name, None)

    def _clear_fields(cls, collection_name, field_names):
        """Clears the values for the given fields (i.e., sets them to None)
        on all in-memory samples in the collection.
        """
        if collection_name not in cls._instances:
            return

        for sample in cls._instances[collection_name].values():
            for field_name in field_names:
                sample._doc._data[field_name] = None

    def _purge_fields(cls, collection_name, field_names):
        """Removes the fields from all in-memory samples in the collection."""
        if collection_name not in cls._instances:
            return

        for sample in cls._instances[collection_name].values():
            for field_name in field_names:
                sample._doc._data.pop(field_name, None)

    def _reload_doc(cls, collection_name, doc_id, hard=False):
        """Reloads the backing document for the specified sample if it exists
        in memory.
        """
        if collection_name not in cls._instances:
            return

        sample = cls._instances[collection_name].get(doc_id, None)
        if sample is not None:
            sample.reload(hard=hard)

    def _reload_docs(cls, collection_name, doc_ids=None, hard=False):
        """Reloads the backing documents for all in-memory samples in the
        collection.

        If no ``doc_ids`` are provided, all in-memory sample documents are
        reloaded.

        If ``doc_ids`` are provided, these are assumed to enumerate the samples
        that are still in the collection. Their backing documents will be
        reloaded and any samples whose IDs are not in this set will be reset.
        """
        if collection_name not in cls._instances:
            return

        samples = cls._instances[collection_name]

        # Reload all docs
        if doc_ids is None:
            for sample in samples.values():
                sample.reload(hard=hard)

        # Reload docs with `doc_ids`, reset others
        if doc_ids is not None:
            reset_ids = set()
            for sample in samples.values():
                if sample.id in doc_ids:
                    sample.reload(hard=hard)
                else:
                    reset_ids.add(sample.id)
                    sample._reset_backing_doc()

            for doc_id in reset_ids:
                samples.pop(doc_id, None)

    def _reset_docs(cls, collection_name, doc_ids=None):
        """Resets the backing documents for in-memory samples in the
        collection.

        Reset samples will no longer belong to their parent dataset.
        """
        if collection_name not in cls._instances:
            return

        # Reset all docs
        if doc_ids is None:
            samples = cls._instances.pop(collection_name)
            for sample in samples.values():
                sample._reset_backing_doc()

        # Reset docs with `doc_ids`
        if doc_ids is not None:
            samples = cls._instances[collection_name]

            for doc_id in doc_ids:
                sample = samples.pop(doc_id, None)
                if sample is not None:
                    sample._reset_backing_doc()


class FrameSingleton(DocumentSingleton):
    """Singleton metaclass for :class:`fiftyone.core.frame.Frame`.

    This metaclass maintains a weakref dictionary of all in-memory
    :class:`fiftyone.core.frame.Frame` instances keyed by
    ``[collection name][sample ID][frame number]``.
    """

    def __new__(metacls, *args, **kwargs):
        cls = super().__new__(metacls, *args, **kwargs)

        # Instances are keyed by [collection name][sample ID][frame number]
        cls._instances = defaultdict(
            lambda: defaultdict(weakref.WeakValueDictionary)
        )

        return cls

    def _register_instance(cls, obj):
        cls._instances[obj._doc.collection_name][str(obj._sample_id)][
            obj.frame_number
        ] = obj

    def _get_instance(cls, doc):
        try:
            return cls._instances[doc.collection_name][str(doc._sample_id)][
                doc.frame_number
            ]
        except KeyError:
            return None

    def _rename_fields(cls, collection_name, field_names, new_field_names):
        """Renames the field on all in-memory frames in the collection."""
        if collection_name not in cls._instances:
            return

        for frames in cls._instances[collection_name].values():
            for frame in frames.values():
                data = frame._doc._data
                for field_name, new_field_name in zip(
                    field_names, new_field_names
                ):
                    data[new_field_name] = data.pop(field_name, None)

    def _clear_fields(cls, collection_name, field_names):
        """Clears the values for the given fields (i.e., sets them to None)
        on all in-memory frames in the collection.
        """
        if collection_name not in cls._instances:
            return

        for frames in cls._instances[collection_name].values():
            for frame in frames.values():
                for field_name in field_names:
                    frame._doc._data[field_name] = None

    def _purge_fields(cls, collection_name, field_names):
        """Removes the fields from all in-memory frames in the collection."""
        if collection_name not in cls._instances:
            return

        for frames in cls._instances[collection_name].values():
            for frame in frames.values():
                for field_name in field_names:
                    frame._doc._data.pop(field_name, None)

    # @todo all `doc_id` references are broken; this class uses frame numbers!
    def _reload_docs_for_sample(
        cls,
        collection_name,
        sample_id,
        doc_id=None,
        frame_numbers=None,
        hard=False,
    ):
        """Reloads the backing documents for the frames attached to a sample.

        If a ``doc_id`` is provided, only that frame document is reloaded.

        If ``frame_numbers`` are provided, these are assumed to enumerate the
        frames that are still in the collection. Their backing documents will
        be reloaded and any frames whose frame numbers are not in this set will
        be reset.

        Otherwise, all in-memory frame documents for the sample are reloaded.
        """
        if collection_name not in cls._instances:
            return

        samples = cls._instances[collection_name]
        frames = samples.get(sample_id, {})

        # Reload all docs
        if doc_id is None and frame_numbers is None:
            for frame in frames.values():
                frame.reload(hard=hard)

        # Reload specific doc
        if doc_id is not None:
            frame = frames.get(doc_id, None)
            if frame is not None:
                frame.reload(hard=hard)

        # Reload docs with `frame_numbers`, reset others
        if frame_numbers is not None:
            reset_fns = set()
            for frame_number, frame in frames.items():
                if frame_number in frame_numbers:
                    frame.reload(hard=hard)
                else:
                    reset_fns.add(frame_number)
                    frame._reset_backing_doc()

            for frame_number in reset_fns:
                frames.pop(frame_number, None)

    def _reload_docs(
        cls, collection_name, doc_ids=None, sample_ids=None, hard=False
    ):
        """Reloads the backing documents for in-memory frames in the
        collection.

        If ``doc_ids`` are provided, these are assumed to enumerate the frames
        that are still in the collection. Their backing documents will
        be reloaded and any frames whose IDs are not in this set will be reset.

        If ``sample_ids`` are provided, these are assumed to enumerate the
        samples that are still in the collection. Their backing documents will
        be reloaded and any frames attached to samples whose IDs are not in
        this set will be reset.

        Otherwise, all in-memory frame documents are reloaded.
        """
        if collection_name not in cls._instances:
            return

        samples = cls._instances[collection_name]

        # Reload all docs
        if doc_ids is None and sample_ids is None:
            for frames in samples.values():
                for frame in frames.values():
                    frame.reload(hard=hard)

        # Reload docs for samples with `sample_ids`, reset others
        if sample_ids is not None:
            reset_ids = set()
            for sample_id, frames in samples.items():
                if sample_id in sample_ids:
                    for frame in frames.values():
                        frame.reload(hard=hard)
                else:
                    reset_ids.add(sample_id)
                    for frame in frames.values():
                        frame._reset_backing_doc()

            for sample_id in reset_ids:
                samples.pop(sample_id, None)

        # Reload docs with `doc_ids`, reset others
        if doc_ids is not None:
            for frames in samples.values():
                reset_ids = set()
                for frame in frames.values():
                    if frame.id in doc_ids:
                        frame.reload(hard=hard)
                    else:
                        reset_ids.add(frame.id)
                        frame._reset_backing_doc()

                for doc_id in reset_ids:
                    frames.pop(doc_id, None)

    def _reset_docs(cls, collection_name, doc_ids=None, sample_ids=None):
        """Resets the backing documents for in-memory frames in the collection.

        Reset frames will no longer belong to their parent dataset.
        """
        if collection_name not in cls._instances:
            return

        # Reset all docs
        if doc_ids is None and sample_ids is None:
            samples = cls._instances.pop(collection_name)
            for frames in samples.values():
                for frame in frames.values():
                    frame._reset_backing_doc()

        # Reset docs for samples with `sample_ids`
        if sample_ids is not None:
            samples = cls._instances[collection_name]
            for sample_id in sample_ids:
                frames = samples.pop(sample_id, None)
                if frames is not None:
                    for frame in frames.values():
                        frame._reset_backing_doc()

        # Reset docs with `doc_ids`
        if doc_ids is not None:
            samples = cls._instances[collection_name]
            for frames in samples.values():
                for doc_id in doc_ids:
                    frame = frames.pop(doc_id, None)
                    if frame is not None:
                        frame._reset_backing_doc()
