"""
Video frames.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import weakref


from pymongo import ReplaceOne


import fiftyone.core.frame_utils as fofu
from fiftyone.core._sample import _Sample

from fiftyone.core.odm.frame import (
    NoDatasetFrameSampleDocument,
    DatasetFrameSampleDocument,
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
        self._iter_doc = None
        self._replacements = {}

    def __repr__(self):
        num_frames = len(self)
        plural = "s" if num_frames != 1 else ""
        return "{ <%d frame%s> }" % (num_frames, plural)

    def __len__(self):
        return self._sample._doc.frames["frame_count"]

    def _set_replacement(self, doc):
        self._replacements[doc.get_field("frame_number")] = doc

    def _save_replacements(self):
        first_frame = self._replacements.get(1, None)
        if len(self._replacements):
            self._frame_collection.bulk_write(
                [
                    ReplaceOne(
                        self._make_filter(frame_number, doc),
                        self._make_dict,
                        upsert=True,
                    )
                    for frame_number, doc in self._replacements.items()
                ]
            )
            self._replacements = {}
        return first_frame

    def _make_filter(self, frame_number, doc):
        doc.set_field("sample_id", self._sample.id)
        return {
            "frame_number": doc.get_field("frame_number"),
            "sample_id": self._sample.id,
        }

    def _make_dict(self, doc):
        d = doc.to_dict(extended=False)
        d.pop("_id", None)
        d["sample_id"] = self._sample.id
        return d

    def __iter__(self):
        self._iter = self.keys()
        return self

    def __next__(self):
        try:
            next(self._iter)
        except StopIteration:
            self._iter = None
            self._iter_doc = None
            raise

    def __getitem__(self, key):
        fofu.validate_frame_number(key)

        dataset = None
        doc = None
        d = None
        default_d = {"sample_id": self._sample.id, "frame_number": key}
        if self._iter is not None and key == self._iter_doc.get_field(
            "frame_number"
        ):
            doc = self._iter_doc
        elif key in self._replacements:
            doc = self._replacements[key]
        elif self._sample._in_db:
            d = self._frame_collection.find_one(default_d)
            if d is None:
                d = default_d
                self._sample._doc.frames["frame_count"] += 1
            doc = self._sample._dataset._frame_dict_to_doc(d)
            self._set_replacement(doc)
            dataset = self._sample._dataset
        else:
            doc = NoDatasetFrameSampleDocument(**default_d)
            self._set_replacement(doc)
            self._sample._doc.frames["frame_count"] += 1

        return Frame.from_doc(doc, dataset=dataset)

    def __setitem__(self, key, frame):
        fofu.validate_frame_number(key)

        if not isinstance(frame, Frame):
            raise ValueError("Value must be a %s" % Frame.__name__)

        doc = frame._doc
        doc.set_field("frame_number", key)
        doc.set_field("sample_id", self._sample.id)

        if not self._sample._in_db and key not in self._replacements:
            self._sample._doc.frames["frame_count"] += 1
        elif self._sample._in_db:
            if self._iter is not None or key != self._iter_doc.get_field(
                "frame_number"
            ):
                find_d = {"sample_id": self._sample.id, "frame_number": key}
                exists = self._frame_collection.find(find_d)
                if exists is None:
                    self._sample._doc.frames["frame_count"] += 1

        self._set_replacement(doc)

    def keys(self):
        """Returns an iterator over the frame numbers with labels in the
        sample.

        The frames are traversed in ascending order.

        Returns:
            a generator that emits frame numbers
        """
        for doc in self._iter_docs():
            yield doc.frame_number

    def items(self):
        """Returns an iterator over the frame numberes and :class:`Frame`
        instances for the sample.

        The frames are traversed in ascending order.

        Returns:
            a generator that emits ``(frame_number, Frame)`` tuples
        """
        for doc in self._iter_docs():
            yield doc.frame_number, Frame.from_doc(
                doc, dataset=self._sample._dataset
            )

    def values(self):
        """Returns an iterator over the :class:`Frame` instances for the
        sample.

        The frames are traversed in ascending order.

        Returns:
            a generator that emits :class:`Frame` instances
        """
        dataset = self._sample._dataset if self._sample._in_db else None
        for doc in self._iter_docs():
            yield Frame.from_doc(doc, dataset=self._sample._dataset)

    def update(self, d):
        """Adds the frame labels from the given dictionary to this instance.

        Existing frames are overwritten.

        Args:
            d: a dictionary mapping frame numbers to :class:`Frame` instances
        """
        for frame_number, frame in d.items():
            self[frame_number] = frame

    @property
    def _first_frame(self):
        first_frame = self._replacements.get(1, None)
        if first_frame is None and self._sample._in_db:
            first_frame = self._sample._doc.frames["first_frame"]
        return first_frame

    def to_mongo_dict(self):
        first_frame = self._first_frame
        return {
            "frame_count": self._sample._doc.frames["frame_count"],
            "first_frame": self._first_frame,
        }

    @property
    def _frame_collection(self):
        return self._sample._dataset._frame_collection

    def _iter_docs(self):
        if self._sample._in_db:
            repl_fns = sorted(self._replacements.keys())
            repl_fn = repl_fns[0] if len(repl_fns) else None
            for d in self._frame_collection.find(
                {"sample_id": self._sample.id}
            ):
                if repl_fn is not None and d["frame_number"] >= repl_fn:
                    self._iter_doc = self._replacements[repl_fn]
                    repl_fn += 1
                else:
                    self._iter_doc = self._sample._dataset._frame_dict_to_doc(
                        d
                    )
                yield self._iter_doc
        else:
            for frame_number in sorted(self._replacements.keys()):
                self._iter_doc = self._replacements[frame_number]
                yield self._iter_doc

    def _get_field_cls(self):
        return self._sample._doc.frames.__class__

    def _save(self):
        if not self._sample._in_db:
            raise fofu.FrameError(
                "Sample does not have a dataset, Frames cannot be saved"
            )
        first_frame = self._save_replacements()
        if first_frame is not None:
            first_frame.pop("sample_id", None)
            from fiftyone.core.labels import Label

            self._sample._doc.frames["first_frame"] = Label(**first_frame)

    def _serve(self, sample):
        self._sample = sample
        return self


class Frame(_Sample):
    """A frame in a video :class:`fiftyone.core.sample.Sample`.

    :class:`Frame` instances can hold any :class:`fiftyone.core.label.Label`
    or other :class:`fiftyone.core.fields.Field` type that can be assigned
    directly to :class:`fiftyone.core.sample.Sample` instances.
    """

    # Instance references keyed by [collection_name][sample_id]
    _instances = defaultdict(lambda: defaultdict(weakref.WeakValueDictionary))

    _COLL_CLS = DatasetFrameSampleDocument
    _NO_COLL_CLS = NoDatasetFrameSampleDocument

    def __init__(self, **kwargs):
        self._doc = NoDatasetFrameSampleDocument(**kwargs)
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

    @classmethod
    def from_doc(cls, doc, dataset=None):
        """Creates an instance of the :class:`Frame` class backed by the given
        document.

        Args:
            doc: a :class:`fiftyone.core.odm.SampleDocument`
            dataset (None): the :class:`fiftyone.core.dataset.Dataset` that the
                frame belongs to

        Returns:
            a :class:`Frame`
        """
        if isinstance(doc, NoDatasetFrameSampleDocument):
            sample = cls.__new__(cls)
            sample._dataset = None
            sample._doc = doc
            return sample

        try:
            # Get instance if exists
            sample = cls._instances[doc.collection_name][str(doc.sample_id)][
                doc.frame_number
            ]
        except KeyError:
            sample = cls.__new__(cls)
            sample._doc = None  # set to prevent RecursionError
            if dataset is None:
                raise ValueError(
                    "`dataset` arg must be provided if frame is in a dataset"
                )
            sample._set_backing_doc(doc, dataset=dataset)

        return sample

    @classmethod
    def _save_dataset_samples(cls, collection_name):
        """Saves all changes to in-memory sample instances that belong to the
        specified collection.

        Args:
            collection_name: the name of the MongoDB collection
        """
        for sample_frames in cls._instances[collection_name].values():
            for frame in sample_frames.values():
                frame.save()

    @classmethod
    def _reload_dataset_sample(cls, collection_name, sample_id):
        pass

    @classmethod
    def _reload_dataset_samples(cls, collection_name):
        pass

    @classmethod
    def _rename_field(cls, collection_name, field_name, new_field_name):
        pass

    @classmethod
    def _purge_field(cls, collection_name, field_name):
        pass

    def _set_backing_doc(self, doc, dataset=None):
        """Sets the backing doc for the sample.

        Args:
            doc: a :class:`fiftyone.core.odm.SampleDocument`
            dataset (None): the :class:`fiftyone.core.dataset.Dataset` to which
                the sample belongs, if any
        """
        self._doc = doc

        # Save weak reference
        dataset_instances = self._instances[doc.collection_name]
        if self.frame_number not in dataset_instances[self.sample_id]:
            dataset_instances[self.sample_id][self.frame_number] = self

        self._dataset = dataset

    @classmethod
    def _reset_backing_docs(cls, collection_name, sample_ids):
        pass

    @classmethod
    def _reset_all_backing_docs(cls, collection_name):
        pass
