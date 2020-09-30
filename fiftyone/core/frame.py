"""
Video sample frames.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import weakref

from fiftyone.core._sample import _Sample
import fiftyone.core.frame_utils as fofu

from fiftyone.core.odm.frame import (
    NoDatasetFrameSampleDocument,
    DatasetFrameSampleDocument,
)


class Frames(object):

    _doc = None

    def serve(self, sample):
        self._sample = sample
        return self

    def __repr__(self):
        return "<%s %d>" % (
            self.__class__.__name__,
            len(self._sample._doc.to_dict()["frames"]),
        )

    def __iter__(self):
        self._iter = self._sample._doc.frames.__iter__()
        return self

    def __next__(self):
        return int(next(self._iter))

    def __getitem__(self, key):
        if fofu.is_frame_number(key):
            try:
                key = str(key)
                self._sample._doc.frames[key]
            except KeyError:
                self._sample._doc.frames[key] = Frame(frame_number=key)
            frame = self._sample._doc.frames[key]
            if not isinstance(frame, Frame):
                frame = Frame.from_doc(frame, dataset=self._sample._dataset)
            return frame

    def __setitem__(self, key, value):
        if fofu.is_frame_number(key):
            self._sample._doc.frames[str(key)] = value

    def _get_field_cls(self):
        return self._sample._doc.frames.__class__


class Frame(_Sample):
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

    def to_mongo(self, value):
        raise ValueError("Eeee")

    @classmethod
    def from_doc(cls, doc, dataset=None):
        """Creates an instance of the :class:`Sample` class backed by the given
        document.

        Args:
            doc: a :class:`fiftyone.core.odm.SampleDocument`
            dataset: the :class:`fiftyone.core.dataset.Dataset` that the sample
                belongs to

        Returns:
            a :class:`Sample`
        """
        from fiftyone.core.odm import NoDatasetFrameSampleDocument

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
