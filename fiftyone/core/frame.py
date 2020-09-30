from collections import defaultdict
import weakref

from fiftyone.core._sample import _Sample
import fiftyone.core.frame_utils as fofu


class Frames(object):

    _doc = None

    def serve(self, sample):
        self._doc = sample._doc
        return self

    def __repr__(self):
        return "<%s %d>" % (
            self.__class__.__name__,
            len(self._doc.to_dict()["frames"]),
        )

    def __iter__(self):
        self._iter = self._doc.frames.__iter__()
        return self

    def __next__(self):
        return int(next(self._iter))

    def __getitem__(self, key):
        if fofu.is_frame_number(key):
            try:
                key = str(key)
                self._doc.frames[key]
            except KeyError:
                self._doc.frames[key] = Frame(frame_number=key)
            return self._doc.frames[key]

    def __setitem__(self, key, value):
        if fofu.is_frame_number(key):
            self._doc.frames[str(key)] = value

    def _get_field_cls(self):
        return self._doc.frames.__class__


class Frame(_Sample):
    # Instance references keyed by [collection_name][sample_id]
    _instances = defaultdict(weakref.WeakValueDictionary)

    def __init__(self, **kwargs):
        from fiftyone.core.odm import NoDatasetFrameSampleDocument

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
