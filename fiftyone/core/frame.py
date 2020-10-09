"""
Video frames.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import weakref

from fiftyone.core._sample import _Sample
import fiftyone.core.frame_utils as fofu
import fiftyone.core.utils as fou

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

    def __str__(self):
        return "<%s: %s>" % (self.__class__.__name__, fou.pformat(dict(self)))

    def __repr__(self):
        num_frames = len(self)
        plural = "s" if num_frames != 1 else ""
        return "{ <%d frame%s> }" % (num_frames, plural)

    def __len__(self):
        return len(self._sample._doc.to_dict()["frames"])

    def __iter__(self):
        self._iter = self.keys()
        return self

    def __next__(self):
        return next(self._iter)

    def __contains__(self, frame_number):
        return str(frame_number) in self._sample._doc.frames

    def __getitem__(self, frame_number):
        fofu.validate_frame_number(frame_number)

        key = str(frame_number)

        try:
            doc = self._sample._doc.frames[key]
        except KeyError:
            if self._sample._in_db:
                doc = self._sample._dataset._frame_doc_cls.from_dict(
                    {"frame_number": frame_number}
                )
                doc.save()
            else:
                doc = NoDatasetFrameSampleDocument(frame_number=frame_number)

        frame = Frame.from_doc(doc, dataset=self._sample._dataset)
        self._sample._doc.frames[key] = frame._doc

        return frame

    def __setitem__(self, frame_number, frame):
        fofu.validate_frame_number(frame_number)

        key = str(frame_number)

        if not isinstance(frame, Frame):
            raise ValueError(
                "Value must be a %s; found %s" % (Frame, frame.__class__)
            )

        d = frame.to_dict()
        d.pop("_id", None)
        d["frame_number"] = frame_number

        if self._sample._in_db:
            doc = self._sample._dataset._frame_doc_cls.from_dict(d)
            doc.save()
        else:
            doc = NoDatasetFrameSampleDocument.from_dict(d)

        self._sample._doc.frames[key] = doc

    @property
    def field_names(self):
        """An ordered tuple of the names of the fields on the frames."""
        try:
            frame = next(self.values())
            return frame.field_names
        except:
            return ("frame_number",)

    def keys(self):
        """Returns an iterator over the frame numbers with labels in the
        sample.

        The frames are traversed in ascending order.

        Returns:
            a generator that emits frame numbers
        """
        dataset = self._sample._dataset if self._sample._in_db else None
        for k in sorted(
            map(lambda k: int(k), self._sample._doc.frames.keys())
        ):
            yield int(k)

    def items(self):
        """Returns an iterator over the frame numberes and :class:`Frame`
        instances for the sample.

        The frames are traversed in ascending order.

        Returns:
            a generator that emits ``(frame_number, Frame)`` tuples
        """
        dataset = self._sample._dataset if self._sample._in_db else None
        for k in self.keys():
            yield k, Frame.from_doc(
                self._sample._doc.frames[str(k)], dataset=dataset
            )

    def values(self):
        """Returns an iterator over the :class:`Frame` instances for the
        sample.

        The frames are traversed in ascending order.

        Returns:
            a generator that emits :class:`Frame` instances
        """
        dataset = self._sample._dataset if self._sample._in_db else None
        for k in self.keys():
            yield Frame.from_doc(
                self._sample._doc.frames[str(k)], dataset=dataset
            )

    def update(self, frames, overwrite=True):
        """Adds the frame labels to this instance.

        Args:
            frames: a :class:`Frames` instance or dictionary mapping frame
                numbers to :class:`Frame` instances
            overwrite (True): whether to overwrite existing frames
        """
        for frame_number, frame in frames.items():
            if overwrite or frame_number not in self:
                self[frame_number] = frame

    def merge(self, frames, overwrite=True):
        """Merges the frame labels into this instance.

        Args:
            frames: a :class:`Frames` instance or dictionary mapping frame
                numbers to :class:`Frame` instances
            overwrite (True): whether to overwrite existing fields
        """
        for frame_number, frame in frames.items():
            self[frame_number].merge(frame, overwrite=overwrite)

    def _serve(self, sample):
        self._sample = sample
        return self

    def _get_field_cls(self):
        return self._sample._doc.frames.__class__


class Frame(_Sample):
    """A frame in a video :class:`fiftyone.core.sample.Sample`.

    :class:`Frame` instances can hold any :class:`fiftyone.core.label.Label`
    or other :class:`fiftyone.core.fields.Field` type that can be assigned
    directly to :class:`fiftyone.core.sample.Sample` instances.
    """

    # Instance references keyed by [collection_name][sample_id]
    _instances = defaultdict(weakref.WeakValueDictionary)

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

        if not doc.id:
            raise ValueError("`doc` is not saved to the database.")

        try:
            # Get instance if exists
            sample = cls._instances[doc.collection_name][str(doc.id)]
        except KeyError:
            sample = cls.__new__(cls)
            sample._doc = None  # set to prevent RecursionError
            if dataset is None:
                raise ValueError(
                    "`dataset` arg must be provided if sample is in a dataset"
                )
            sample._set_backing_doc(doc, dataset=dataset)

        return sample
