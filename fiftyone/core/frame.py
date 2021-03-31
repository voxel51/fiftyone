"""
Video frames.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from copy import deepcopy
import weakref

from pymongo import ReplaceOne

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
    """

    def __init__(self):
        self._sample = None
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

    def _set_replacement(self, frame):
        self._replacements[frame.frame_number] = frame

    def _set_replacements(self, frames):
        frame_dict_to_doc = self._sample._dataset._frame_dict_to_doc
        for d in frames:
            if d["frame_number"] in self._replacements:
                continue
            frame = Frame.from_doc(
                frame_dict_to_doc(d),
                dataset=self._sample._dataset,
                view=self._view,
            )
            self._replacements[frame.frame_number] = frame

    def _save_replacements(self, insert=False):
        if not self._replacements:
            return

        if insert:
            self._frame_collection.insert_many(
                [
                    self._make_dict(frame)
                    for frame in self._replacements.values()
                ]
            )
        else:
            self._frame_collection.bulk_write(
                [
                    ReplaceOne(
                        self._make_filter(frame_number, self._sample._id),
                        self._make_dict(frame),
                        upsert=True,
                    )
                    for frame_number, frame in self._replacements.items()
                ],
                ordered=False,
            )

        self._replacements = {}

    def _make_filter(self, frame_number, sample_id):
        return {"frame_number": frame_number, "_sample_id": sample_id}

    def _make_dict(self, frame):
        d = frame._doc.to_dict(extended=False)
        d.pop("_id", None)
        d["_sample_id"] = self._sample._id
        return d

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

        if self._in_db:
            find_d = self._make_filter(frame_number, self._sample._id)
            return self._frame_collection.find_one(find_d) is not None

        return False

    def __getitem__(self, frame_number):
        fofu.validate_frame_number(frame_number)

        frame = None
        d = None
        default_d = {
            "_sample_id": self._sample._id,
            "frame_number": frame_number,
        }
        if (
            self._iter is not None
            and frame_number == self._iter_frame.frame_number
        ):
            frame = self._iter_frame
        elif frame_number in self._replacements:
            frame = self._replacements[frame_number]
        elif self._in_db:
            d = self._frame_collection.find_one(default_d)
            if d is None:
                d = default_d

            frame = Frame.from_doc(
                self._sample._dataset._frame_dict_to_doc(d),
                dataset=self._sample._dataset,
                view=self._view,
            )
            self._set_replacement(frame)
        else:
            frame = Frame.from_doc(
                foo.NoDatasetFrameSampleDocument(**default_d)
            )
            self._set_replacement(frame)

        return frame

    def __setitem__(self, frame_number, frame):
        fofu.validate_frame_number(frame_number)

        if not isinstance(frame, Frame):
            raise ValueError("Value must be a %s" % Frame.__name__)

        doc = frame._doc
        doc.set_field("frame_number", frame_number)
        doc._sample_id = self._sample._id

        if not self._in_db and frame_number not in self._replacements:
            pass
        elif self._in_db:
            if (
                self._iter_frame is not None
                and frame_number != self._iter_frame.frame_number
            ):
                self._frame_collection.find(
                    {
                        "_sample_id": self._sample._id,
                        "frame_number": frame_number,
                    }
                )

        self._set_replacement(frame)

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

    def update(self, frames, overwrite=True):
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
        """
        for frame_number, frame in frames.items():
            if overwrite or frame_number not in self:
                if isinstance(frame, dict):
                    frame = Frame(frame_number=frame_number, **frame)

                self[frame_number] = frame

    def merge(
        self, frames, omit_fields=None, omit_none_fields=True, overwrite=True
    ):
        """Merges the frame labels into this instance.

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
                )
            else:
                self[frame_number] = frame

    def clear(self):
        """Removes all frames from this instance."""
        self._replacements = {}
        if self._in_db:
            self._frame_collection.delete_many(
                {"_sample_id": self._sample._id}
            )
            self._sample._doc.clear_field("frames")

    @property
    def _in_db(self):
        return self._sample._in_db

    @property
    def _frame_collection(self):
        return self._sample._dataset._frame_collection

    def _iter_frames(self):
        if not self._in_db:
            for frame_number in sorted(self._replacements.keys()):
                self._iter_frame = self._replacements[frame_number]
                self._set_replacement(self._iter_frame)
                yield self._iter_frame

            return

        repl_fns = sorted(self._replacements.keys())
        repl_fn = repl_fns[0] if repl_fns else None

        frame_dicts = self._frames_view._aggregate(frames_only=True)
        frame_dicts = sorted(frame_dicts, key=lambda d: d["frame_number"])

        for d in frame_dicts:
            if repl_fn is not None and d["frame_number"] >= repl_fn:
                self._iter_frame = self._replacements[repl_fn]
                repl_fn += 1
            else:
                self._iter_frame = Frame.from_doc(
                    self._sample._dataset._frame_dict_to_doc(d),
                    dataset=self._sample._dataset,
                    view=self._view,
                )

            self._set_replacement(self._iter_frame)
            yield self._iter_frame

    def _to_frames_dict(self):
        return {
            str(frame_number): frame.to_dict()
            for frame_number, frame in self.items()
        }

    def _get_field_cls(self):
        return self._sample._doc.frames.__class__

    def _save(self, insert=False):
        if not self._in_db:
            return

        self._save_replacements(insert)

    def _serve(self, sample):
        self._sample = sample
        return self


class Frame(Document):
    """A frame in a video :class:`fiftyone.core.sample.Sample`.

    :class:`Frame` instances can hold any :class:`fiftyone.core.label.Label`
    or other :class:`fiftyone.core.fields.Field` type that can be assigned
    directly to :class:`fiftyone.core.sample.Sample` instances.
    """

    # Instance references keyed by [collection_name][sample_id][frame_number]
    _instances = defaultdict(lambda: defaultdict(weakref.WeakValueDictionary))

    _COLL_CLS = foo.DatasetFrameSampleDocument
    _NO_COLL_CLS = foo.NoDatasetFrameSampleDocument

    def __init__(self, **kwargs):
        self._doc = foo.NoDatasetFrameSampleDocument(**kwargs)
        super().__init__()

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
            frame._dataset = None
            frame._doc = doc
            return frame

        frame = None
        if view is None:
            try:
                # Get instance if exists
                key = str(doc._sample_id)
                frame = cls._instances[doc.collection_name][key][
                    doc.frame_number
                ]
            except KeyError:
                pass

        if frame is None:
            frame = cls.__new__(cls)
            frame._doc = None  # prevents recursion
            if dataset is None:
                raise ValueError(
                    "`dataset` arg must be provided if frame is in a dataset"
                )

            frame._set_backing_doc(doc, dataset=dataset)

        return frame

    def _set_backing_doc(self, doc, dataset=None):
        if not doc.id:
            doc.save()

        self._doc = doc

        frames = self._instances[doc.collection_name][str(self._sample_id)]
        if self.frame_number not in frames:
            frames[self.frame_number] = self

        self._dataset = dataset

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
    def _reload_docs(cls, collection_name, doc_ids=None, sample_ids=None):
        if collection_name not in cls._instances:
            return

        samples = cls._instances[collection_name]

        # Reload all docs
        if doc_ids is None and sample_ids is None:
            for frames in samples.values():
                for document in frames.values():
                    document.reload()

        # Reload docs for samples with `sample_ids`, reset others
        if sample_ids is not None:
            reset_ids = set()
            for sample_id, frames in samples.items():
                if sample_id in sample_ids:
                    for document in frames.values():
                        document.reload()
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
                        document.reload()
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
