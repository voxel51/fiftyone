"""
Video frames.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from copy import deepcopy
import weakref

from pymongo import ReplaceOne, UpdateOne

from fiftyone.core.document import Document
import fiftyone.core.frame_utils as fofu
import fiftyone.core.odm as foo
import fiftyone.core.utils as fou


def get_default_frame_fields(include_private=False, include_id=False):
    """Returns the default fields present on all frames.

    Args:
        include_private (False): whether to include fields that start with
            ``_``
        include_id (False): whether to include ID fields

    Returns:
        a tuple of field names
    """
    return foo.get_default_fields(
        foo.DatasetFrameSampleDocument,
        include_private=include_private,
        include_id=include_id,
    )


#
# This class is instantiated automatically and depends on an owning
# :class:`fiftyone.core.sample.Sample`. Not for independent use or direct
# assignment to :class:`fiftyone.core.sample.Sample`s.
#
class Frames(object):
    """An ordered dictionary of labels for the frames of a
    :class:`fiftyone.core.sample.Sample`.

    The frame labels are stored in :class:`Frame` instances.

    :class:`Frames` instances behave like ``defaultdict(Frame)`` instances; an
    empty :class:`Frame` instance is returned when accessing a new frame
    number.

    Args:
        sample (None): the :class:`fiftyone.core.sample.Sample` to which the
            frames are attached
    """

    def __init__(self, sample=None):
        self._sample = sample
        self._iter = None
        self._iter_frame = None
        self._replacements = {}

    def __str__(self):
        return "<%s: %s>" % (self.__class__.__name__, fou.pformat(dict(self)))

    def __repr__(self):
        return "<%s: %s>" % (self.__class__.__name__, len(self))

    def __bool__(self):
        return len(self) > 0

    def __len__(self):
        if not self._in_db:
            return len(self._replacements)

        self._save_replacements()
        return self._frames_view.count("frames")

    @property
    def _view(self):
        return getattr(self._sample, "_view", None)

    @property
    def _frames_view(self):
        view = self._view or self._sample._dataset
        return view.select(self._sample.id)

    @property
    def _in_db(self):
        return self._sample._in_db

    @property
    def _frame_collection(self):
        return self._sample._dataset._frame_collection

    def _get_field_cls(self):
        return self._sample._doc.frames.__class__

    def __iter__(self):
        self._iter = self.keys()
        return self

    def __next__(self):
        try:
            return next(self._iter)
        except StopIteration:
            self._iter = None
            self._iter_frame = None
            raise

    def __contains__(self, frame_number):
        if frame_number in self._replacements:
            return True

        if not self._in_db:
            return False

        if self._view is None:
            return (
                self._frame_collection.find_one(
                    {
                        "_sample_id": self._sample._id,
                        "frame_number": frame_number,
                    }
                )
                is not None
            )

        pipeline = self._frames_view._pipeline(frames_only=True) + [
            {
                "$group": {
                    "_id": None,
                    "frame_numbers": {"$addToSet": "$frame_number"},
                }
            }
        ]

        try:
            d = next(self._sample._dataset._aggregate(pipeline))
            return frame_number in d["frame_numbers"]
        except:
            return False

    def __getitem__(self, frame_number):
        fofu.validate_frame_number(frame_number)

        if (
            self._iter is not None
            and frame_number == self._iter_frame.frame_number
        ):
            return self._iter_frame

        if frame_number in self._replacements:
            return self._replacements[frame_number]

        if not self._in_db:
            frame = Frame(frame_number=frame_number)
            self._set_replacement(frame)
            return frame

        if self._view is None:
            query = {
                "_sample_id": self._sample._id,
                "frame_number": frame_number,
            }
            d = self._frame_collection.find_one(query)
            if d is None:
                d = query

            doc = self._sample._dataset._frame_dict_to_doc(d)
            frame = Frame.from_doc(doc, dataset=self._sample._dataset)
            self._set_replacement(frame)
            return frame

        for fn, frame in self.items():
            self._set_replacement(frame)

            if fn == frame_number:
                return frame

            if fn > frame_number:
                break

        doc = self._sample._dataset._frame_dict_to_doc(
            {"_sample_id": self._sample._id, "frame_number": frame_number}
        )
        frame = Frame.from_doc(
            doc, dataset=self._sample._dataset, view=self._view,
        )
        self._set_replacement(frame)
        return frame

    def __setitem__(self, frame_number, frame):
        self.add_frame(frame_number, frame)

    @property
    def field_names(self):
        """An ordered tuple of the names of the fields on the frames."""
        try:
            frame = next(self.values())
            return frame.field_names
        except:
            return ("frame_number",)

    def first(self):
        """Returns the first :class:`Frame` for the sample.

        Returns:
            a :class:`Frame`
        """
        try:
            return next(self.values())
        except StopIteration:
            id_str = " '%s'" % self._sample._id if self._sample._id else ""
            raise ValueError("Sample%s has no frame labels" % id_str)

    def keys(self):
        """Returns an iterator over the frame numbers with labels in the
        sample.

        The frames are traversed in ascending order.

        Returns:
            a generator that emits frame numbers
        """
        for frame in self._iter_frames():
            yield frame.frame_number

    def items(self):
        """Returns an iterator over the frame numberes and :class:`Frame`
        instances for the sample.

        The frames are traversed in ascending order.

        Returns:
            a generator that emits ``(frame_number, Frame)`` tuples
        """
        for frame in self._iter_frames():
            yield frame.frame_number, frame

    def values(self):
        """Returns an iterator over the :class:`Frame` instances for the
        sample.

        The frames are traversed in ascending order.

        Returns:
            a generator that emits :class:`Frame` instances
        """
        for frame in self._iter_frames():
            yield frame

    def add_frame(self, frame_number, frame, expand_schema=True):
        """Adds the frame to this instance.

        If an existing frame with the same frame number exists, it is
        overwritten.

        If the frame instance does not belong to a dataset, it is updated
        in-place to reflect its membership in this dataset. If the frame
        instance belongs to another dataset, it is not modified.

        Args:
            frame_number: the frame number
            frame: a :class:`Frame`
            expand_schema (True): whether to dynamically add new frame fields
                encountered to the dataset schema. If False, an error is raised
                if the frame's schema is not a subset of the dataset schema.
                This flag has no effect if this sample has not been added to a
                dataset
        """
        fofu.validate_frame_number(frame_number)

        if not isinstance(frame, Frame):
            raise ValueError(
                "Expected a %s, but found %s" % (Frame, type(frame))
            )

        if frame._in_db:
            frame = frame.copy()

        frame.frame_number = frame_number

        if self._in_db:
            d = {"_sample_id": self._sample._id, "frame_number": frame_number}
            doc = self._sample._dataset._frame_dict_to_doc(d)
            for field, value in frame.iter_fields():
                doc.set_field(field, value, create=expand_schema)

            frame._set_backing_doc(
                doc, dataset=self._sample._dataset, view=self._view,
            )

        self._set_replacement(frame)

    def update(self, frames, overwrite=True, expand_schema=True):
        """Adds the frame labels to this instance.

        Args:
            frames: can be any of the following

                -   a :class:`Frames` instance
                -   a dictionary mapping frame numbers to :class:`Frame`
                    instances
                -   a dictionary mapping frame numbers to dictionaries mapping
                    label fields to :class:`fiftyone.core.labels.Label`
                    instances

            overwrite (True): whether to overwrite existing frames
            expand_schema (True): whether to dynamically add new frame fields
                encountered to the dataset schema. If False, an error is raised
                if the frame's schema is not a subset of the dataset schema.
                This flag has no effect if this sample has not been added to a
                dataset
        """
        for frame_number, frame in frames.items():
            if overwrite or frame_number not in self:
                if isinstance(frame, dict):
                    frame = Frame(frame_number=frame_number, **frame)

                self.add_frame(
                    frame_number, frame, expand_schema=expand_schema
                )

    def merge(
        self,
        frames,
        omit_fields=None,
        omit_none_fields=True,
        overwrite=True,
        expand_schema=True,
    ):
        """Merges the given frames into this instance.

        Args:
            frames: can be any of the following

                -   a :class:`Frames` instance
                -   a dictionary mapping frame numbers to :class:`Frame`
                    instances
                -   a dictionary mapping frame numbers to dictionaries mapping
                    label fields to :class:`fiftyone.core.labels.Label`
                    instances

            omit_fields (None): an optional list of fields to omit
            omit_none_fields (True): whether to omit ``None``-valued fields of
                the provided frames
            overwrite (True): whether to overwrite existing fields
            expand_schema (True): whether to dynamically add new frame fields
                encountered to the dataset schema. If False, an error is raised
                if the frame's schema is not a subset of the dataset schema.
                This flag has no effect if this sample has not been added to a
                dataset
        """
        for frame_number, frame in frames.items():
            if isinstance(frame, dict):
                frame = Frame(frame_number=frame_number, **frame)

            if frame_number in self:
                self[frame_number].merge(
                    frame,
                    omit_fields=omit_fields,
                    omit_none_fields=omit_none_fields,
                    overwrite=overwrite,
                    create=expand_schema,
                )
            else:
                self.add_frame(
                    frame_number, frame, expand_schema=expand_schema
                )

    def clear(self):
        """Removes all frames from this instance."""
        self._replacements = {}

        if not self._in_db:
            return

        self._frame_collection.delete_many({"_sample_id": self._sample._id})
        self._sample._doc.clear_field("frames")

    def _iter_frames(self):
        if not self._in_db:
            for frame_number in sorted(self._replacements.keys()):
                frame = self._replacements[frame_number]
                self._iter_frame = frame
                yield frame

            return

        repl_fns = set(self._replacements.keys())

        pipeline = self._frames_view._pipeline(frames_only=True) + [
            {"$sort": {"frame_number": 1}}
        ]

        for d in self._sample._dataset._aggregate(pipeline):
            frame_number = d["frame_number"]

            if frame_number in repl_fns:
                frame = self._replacements[frame_number]
            else:
                frame = Frame.from_doc(
                    self._sample._dataset._frame_dict_to_doc(d),
                    dataset=self._sample._dataset,
                    view=self._view,
                )
                self._set_replacement(frame)

            self._iter_frame = frame
            yield frame

    def _set_replacement(self, frame):
        self._replacements[frame.frame_number] = frame

    def _save_replacements(self, insert=False):
        if not self._replacements:
            return

        if insert:
            docs = [
                self._make_dict(frame) for frame in self._replacements.values()
            ]
            self._frame_collection.insert_many(docs)
        elif self._view is None or self._view._contains_all_fields(
            frames=True
        ):
            ops = []
            for frame_number, frame in self._replacements.items():
                ops.append(
                    ReplaceOne(
                        {
                            "frame_number": frame_number,
                            "_sample_id": self._sample._id,
                        },
                        self._make_dict(frame),
                        upsert=True,
                    )
                )

            self._frame_collection.bulk_write(ops, ordered=False)
        else:
            filtered_fields = [
                f[len(self._view._FRAMES_PREFIX) :]
                for f in self._view._get_filtered_fields(frames=True)
            ]

            ops = []
            for frame_number, frame in self._replacements.items():
                doc = self._make_dict(frame)

                for field in filtered_fields:
                    root, leaf = field.split(".", 1)
                    for element in doc.pop(root, {}).get(leaf, []):
                        ops.append(
                            UpdateOne(
                                {
                                    "frame_number": frame_number,
                                    "_sample_id": self._sample._id,
                                    field + "._id": element["_id"],
                                },
                                {"$set": {field + ".$": element}},
                            )
                        )

                ops.append(
                    UpdateOne(
                        {
                            "frame_number": frame_number,
                            "_sample_id": self._sample._id,
                        },
                        {"$set": doc},
                        upsert=True,
                    )
                )

            self._frame_collection.bulk_write(ops, ordered=False)

        self._replacements = {}

    def _make_dict(self, frame):
        d = frame._doc.to_dict()
        d.pop("_id", None)
        d["_sample_id"] = self._sample._id
        return d

    def _to_frames_dict(self):
        return {
            str(frame_number): frame.to_dict()
            for frame_number, frame in self.items()
        }

    def _save(self, insert=False):
        if not self._in_db:
            return

        self._save_replacements(insert=insert)


class Frame(Document):
    """A frame in a video :class:`fiftyone.core.sample.Sample`.

    :class:`Frame` instances can hold any :class:`fiftyone.core.labels.Label`
    or other :class:`fiftyone.core.fields.Field` type that can be assigned
    directly to :class:`fiftyone.core.sample.Sample` instances.

    Args:
        **kwargs: frame fields and values
    """

    # Instance references keyed by [collection_name][sample_id][frame_number]
    _instances = defaultdict(lambda: defaultdict(weakref.WeakValueDictionary))

    _COLL_CLS = foo.DatasetFrameSampleDocument
    _NO_COLL_CLS = foo.NoDatasetFrameSampleDocument

    def __init__(self, **kwargs):
        doc = foo.NoDatasetFrameSampleDocument(**kwargs)
        super().__init__(doc)

    def __str__(self):
        return repr(self)

    def __repr__(self):
        return self._doc.fancy_repr(class_name=self.__class__.__name__)

    def __getitem__(self, field_name):
        try:
            return self.get_field(field_name)
        except AttributeError:
            raise KeyError(
                "%s has no field '%s'" % (self.__class__.__name__, field_name)
            )

    def __setitem__(self, field_name, value):
        self.set_field(field_name, value=value)

    @property
    def _skip_iter_field_names(self):
        return ("frame_number",)

    def _get_field_names(self, include_private=False):
        return self._doc._get_field_names(include_private=include_private)

    def copy(self):
        """Returns a deep copy of the frame that has not been added to the
        database.

        Returns:
            a :class:`Frame`
        """
        kwargs = {k: deepcopy(v) for k, v in self.iter_fields()}
        kwargs["frame_number"] = self.frame_number
        return self.__class__(**kwargs)

    @classmethod
    def from_doc(cls, doc, dataset=None, view=None):
        """Creates an instance of the :class:`Frame` class backed by the given
        document.

        Args:
            doc: a :class:`fiftyone.core.odm.SampleDocument`
            dataset (None): the :class:`fiftyone.core.dataset.Dataset` that the
                frame belongs to
            view (None): the :class:`fiftyone.core.view.DatasetView` that the
                frame belongs to, if any

        Returns:
            a :class:`Frame`
        """
        if isinstance(doc, foo.NoDatasetFrameSampleDocument):
            frame = cls.__new__(cls)
            frame._doc = doc
            frame._dataset = None
            return frame

        frame = None

        if view is None:
            try:
                frame = cls._instances[doc.collection_name][
                    str(doc._sample_id)
                ][doc.frame_number]
            except KeyError:
                pass

        if frame is None:
            frame = cls.__new__(cls)
            frame._doc = None  # prevents recursion
            if dataset is None:
                raise ValueError(
                    "`dataset` arg must be provided if frame is in a dataset"
                )

            frame._set_backing_doc(doc, dataset=dataset, view=view)

        return frame

    def _set_backing_doc(self, doc, dataset=None, view=None, save=False):
        if save and not doc.id:
            doc.save()

        self._doc = doc
        self._dataset = dataset

        if view is None:
            self._instances[doc.collection_name][str(self._sample_id)][
                self.frame_number
            ] = self

    def _reload_backing_doc(self):
        if not self._in_db:
            return

        d = self._dataset._frame_collection.find_one(
            {"_sample_id": self._sample_id, "frame_number": self.frame_number}
        )
        self._doc = self._dataset._frame_dict_to_doc(d)

    @classmethod
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

    @classmethod
    def _clear_fields(cls, collection_name, field_names):
        if collection_name not in cls._instances:
            return

        for frames in cls._instances[collection_name].values():
            for document in frames.values():
                for field_name in field_names:
                    document._doc._data[field_name] = None

    @classmethod
    def _purge_fields(cls, collection_name, field_names):
        if collection_name not in cls._instances:
            return

        for frames in cls._instances[collection_name].values():
            for document in frames.values():
                for field_name in field_names:
                    document._doc._data.pop(field_name, None)

    @classmethod
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

    @classmethod
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
