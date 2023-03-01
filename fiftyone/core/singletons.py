"""
FiftyOne singleton implementations.

| Copyright 2017-2023, Voxel51, Inc.
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
        instance = cls._instances.pop(name, None)

        if (
            _create
            or instance is None
            or instance.deleted
            or instance.name is None
        ):
            instance = cls.__new__(cls)
            instance.__init__(name=name, _create=_create, *args, **kwargs)
            name = instance.name  # `__init__` may have changed `name`
        else:
            instance._update_last_loaded_at()

        cls._instances[name] = instance

        return instance


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

    def _reload_instance(cls, obj):
        """Reloads the backing document for the given instance (or view), if a
        reference exists to it.

        Args:
            obj: a :class:`Document` or :class:`DocumentView`
        """
        raise NotImplementedError("subclass must implement _reload_instance()")


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

    def _reload_instance(cls, obj):
        # pylint: disable=no-value-for-parameter
        cls._reload_doc(obj._doc.collection_name, obj.id)

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

    def _reload_doc(cls, collection_name, sample_id, hard=False):
        """Reloads the backing document for the given sample if it is
        in-memory.
        """
        if collection_name not in cls._instances:
            return

        sample = cls._instances[collection_name].get(sample_id, None)
        if sample is not None:
            sample.reload(hard=hard)

    def _reload_docs(cls, collection_name, sample_ids=None, hard=False):
        """Reloads the backing documents for in-memory samples in the
        collection.

        If ``sample_ids`` are provided, only those samples are reloaded.
        """
        if collection_name not in cls._instances:
            return

        samples = cls._instances[collection_name]

        if sample_ids is not None:
            sample_ids = set(sample_ids)
            for sample in samples.values():
                if sample.id in sample_ids:
                    sample.reload(hard=hard)
        else:
            for sample in samples.values():
                sample.reload(hard=hard)

    def _sync_docs(cls, collection_name, sample_ids, hard=False):
        """Syncs the backing documents for all in-memory samples in the
        collection according to the following rules:

        -   Documents whose IDs are in ``sample_ids`` are reloaded
        -   Documents whose IDs are not in ``sample_ids`` are reset
        """
        if collection_name not in cls._instances:
            return

        samples = cls._instances[collection_name]

        sample_ids = set(sample_ids)
        reset_ids = set()
        for sample in samples.values():
            if sample.id in sample_ids:
                sample.reload(hard=hard)
            else:
                reset_ids.add(sample.id)
                sample._reset_backing_doc()

        for sample_id in reset_ids:
            samples.pop(sample_id, None)

    def _reset_docs(cls, collection_name, sample_ids=None):
        """Resets the backing documents for in-memory samples in the
        collection.

        Reset samples will no longer belong to their parent dataset.

        If ``sample_ids`` are provided, only those samples are reset.
        """
        if collection_name not in cls._instances:
            return

        if sample_ids is not None:
            samples = cls._instances[collection_name]
            for sample_id in sample_ids:
                sample = samples.pop(sample_id, None)
                if sample is not None:
                    sample._reset_backing_doc()
        else:
            samples = cls._instances.pop(collection_name)
            for sample in samples.values():
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
        cls._instances[obj._doc.collection_name][obj.sample_id][
            obj.frame_number
        ] = obj

    def _get_instance(cls, doc):
        try:
            return cls._instances[doc.collection_name][str(doc._sample_id)][
                doc.frame_number
            ]
        except KeyError:
            return None

    def _reload_instance(cls, obj):
        # pylint: disable=no-value-for-parameter
        cls._reload_doc(
            obj._doc.collection_name, obj.sample_id, obj.frame_number
        )

    def _get_instances(cls, collection_name, sample_id):
        """Returns a frame number -> Frame dict containing all in-memory frame
        instances for the specified sample.
        """
        return dict(cls._instances.get(collection_name, {}).get(sample_id, {}))

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

    def _reload_doc(cls, collection_name, sample_id, frame_number, hard=False):
        """Reloads the backing document for the given frame if it is in-memory."""
        if collection_name not in cls._instances:
            return

        frames = cls._instances[collection_name].get(sample_id, {})
        frame = frames.get(frame_number, None)
        if frame is not None:
            frame.reload(hard=hard)

    def _sync_docs_for_sample(
        cls, collection_name, sample_id, frame_numbers, hard=False
    ):
        """Syncs the backing documents for all in-memory frames attached to the
        specified sample according to the following rules:

        -   Frames whose frame numbers are in ``frame_numbers`` are reloaded
        -   Frames whose frame numbers are not in ``frame_numbers`` are reset
        """
        if collection_name not in cls._instances:
            return

        samples = cls._instances[collection_name]
        frames = samples.get(sample_id, {})

        if not frames:
            return

        if callable(frame_numbers):
            frame_numbers = frame_numbers()

        frame_numbers = set(frame_numbers)
        reset_fns = set()

        for frame_number, frame in frames.items():
            if frame_number in frame_numbers:
                frame.reload(hard=hard)
            else:
                reset_fns.add(frame_number)
                frame._reset_backing_doc()

        for frame_number in reset_fns:
            frames.pop(frame_number)

    def _sync_docs(cls, collection_name, sample_ids, hard=False):
        """Syncs the backing documents for all in-memory frames according to
        the following rules:

        -   Frames attached to samples whose IDs are in ``sample_ids`` are
            reloaded
        -   Frames attached to samples whose IDs are not in ``sample_ids`` are
            reset
        """
        if collection_name not in cls._instances:
            return

        samples = cls._instances[collection_name]

        sample_ids = set(sample_ids)
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
            frames = samples.pop(sample_id)

    def _reload_docs(cls, collection_name, sample_ids=None, hard=False):
        """Reloads the backing documents for in-memory frames in the
        collection.

        If ``sample_ids`` are provided, only frames attached to samples with
        these IDs are reloaded.
        """
        if collection_name not in cls._instances:
            return

        samples = cls._instances[collection_name]

        if sample_ids is not None:
            sample_ids = set(sample_ids)
            for sample_id in sample_ids:
                frames = samples.get(sample_id, {})
                for frame in frames.values():
                    frame.reload(hard=hard)
        else:
            for frames in samples.values():
                for frame in frames.values():
                    frame.reload(hard=hard)

    def _reset_docs(cls, collection_name, sample_ids=None):
        """Resets the backing documents for in-memory frames in the collection.

        If ``sample_ids`` are provided, only frames attached to samples with
        the given sample IDs are reset.
        """
        if collection_name not in cls._instances:
            return

        if sample_ids is not None:
            samples = cls._instances[collection_name]
            for sample_id in sample_ids:
                frames = samples.pop(sample_id, {})
                for frame in frames.values():
                    frame._reset_backing_doc()
        else:
            samples = cls._instances.pop(collection_name)
            for frames in samples.values():
                for frame in frames.values():
                    frame._reset_backing_doc()

    def _reset_docs_for_sample(
        cls, collection_name, sample_id, frame_numbers, keep=False
    ):
        """Resets the backing documents for all in-memory frames with the given
        frame numbers attached to the specified sample.

        When ``keep=True``, all frames whose frame numbers are **not** in
        ``frame_numbers`` are reset instead.
        """
        if collection_name not in cls._instances:
            return

        samples = cls._instances[collection_name]
        frames = samples.get(sample_id, {})

        if not frames:
            return

        if callable(frame_numbers):
            frame_numbers = frame_numbers()

        frame_numbers = set(frame_numbers)
        reset_fns = set()

        if keep:
            for frame_number, frame in frames.items():
                if frame_number not in frame_numbers:
                    reset_fns.add(frame_number)
                    frame._reset_backing_doc()
        else:
            for frame_number, frame in frames.items():
                if frame_number in frame_numbers:
                    reset_fns.add(frame_number)
                    frame._reset_backing_doc()

        for frame_number in reset_fns:
            frames.pop(frame_number)

    def _reset_docs_by_frame_id(cls, collection_name, frame_ids, keep=False):
        """Resets the backing documents for all in-memory frames with the given
        frame IDs.

        When ``keep=True``, all frames whose IDs are **not** in ``frame_ids``
        are reset instead.
        """
        if collection_name not in cls._instances:
            return

        samples = cls._instances[collection_name]

        frame_ids = set(frame_ids)
        reset = []

        if keep:
            for sample_id, frames in samples.items():
                for fn, frame in frames.items():
                    if frame.id not in frame_ids:
                        frame._reset_backing_doc()
                        reset.append((sample_id, fn))
        else:
            for sample_id, frames in samples.items():
                for fn, frame in frames.items():
                    if frame.id in frame_ids:
                        frame._reset_backing_doc()
                        reset.append((sample_id, fn))

        for sample_id, fn in reset:
            samples[sample_id].pop(fn)
