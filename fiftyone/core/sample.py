"""
Dataset samples.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

from fiftyone.core.document import Document, DocumentView
import fiftyone.core.frame as fofr
import fiftyone.core.frame_utils as fofu
import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.media as fomm
import fiftyone.core.odm as foo
from fiftyone.core.singletons import SampleSingleton


def get_default_sample_fields(include_private=False, include_id=False):
    """Returns the default fields present on all samples.

    Args:
        include_private (False): whether to include fields that start with
            ``_``
        include_id (False): whether to include ID fields

    Returns:
        a tuple of field names
    """
    return foo.get_default_fields(
        foo.DatasetSampleDocument,
        include_private=include_private,
        include_id=include_id,
    )


class _SampleMixin(object):
    def __getattr__(self, name):
        if name == "frames" and self.media_type == fomm.VIDEO:
            return self._frames

        return super().__getattr__(name)

    def __setattr__(self, name, value):
        if name == "frames" and self.media_type == fomm.VIDEO:
            self.set_field("frames", value)
            return

        self._secure_media(name, value)
        super().__setattr__(name, value)

    def __getitem__(self, field_name):
        if self.media_type == fomm.VIDEO and fofu.is_frame_number(field_name):
            return self.frames[field_name]

        return super().__getitem__(field_name)

    def __setitem__(self, field_name, value):
        if self.media_type == fomm.VIDEO and fofu.is_frame_number(field_name):
            self.frames[field_name] = value
            return

        self._secure_media(field_name, value)
        super().__setitem__(field_name, value)

    def __iter__(self):
        if self.media_type == fomm.VIDEO:
            return iter(self._frames)

        raise AttributeError("Image samples are not iterable")

    @property
    def filename(self):
        """The basename of the media's filepath."""
        return os.path.basename(self.filepath)

    @property
    def media_type(self):
        """The media type of the sample."""
        return self._media_type

    def get_field(self, field_name):
        if field_name == "frames" and self.media_type == fomm.VIDEO:
            return self._frames

        return super().get_field(field_name)

    def set_field(self, field_name, value, create=True):
        if field_name == "frames" and self.media_type == fomm.VIDEO:
            self.frames.clear()
            self.frames.update(value)
            return

        super().set_field(field_name, value, create=create)

    def clear_field(self, field_name):
        if field_name == "frames" and self.media_type == fomm.VIDEO:
            self.frames.clear()
            return

        super().clear_field(field_name)

    def compute_metadata(self, skip_failures=False):
        """Populates the ``metadata`` field of the sample.

        Args:
            skip_failures (False): whether to gracefully continue without
                raising an error if metadata cannot be computed
        """
        fom.compute_sample_metadata(self, skip_failures=skip_failures)

    def add_labels(
        self, labels, label_field, confidence_thresh=None, expand_schema=True
    ):
        """Adds the given labels to the sample.

        The provided ``labels`` can be any of the following:

        -   A :class:`fiftyone.core.labels.Label` instance, in which case the
            labels are directly saved in the specified ``label_field``

        -   A dict mapping keys to :class:`fiftyone.core.labels.Label`
            instances. In this case, the labels are added as follows::

                for key, value in labels.items():
                    sample[label_field + "_" + key] = value

        -   A dict mapping frame numbers to :class:`fiftyone.core.labels.Label`
            instances. In this case, the provided labels are interpreted as
            frame-level labels that should be added as follows::

                sample.frames.merge(
                    {
                        frame_number: {label_field: label}
                        for frame_number, label in labels.items()
                    }
                )

        -   A dict mapping frame numbers to dicts mapping keys to
            :class:`fiftyone.core.labels.Label` instances. In this case, the
            provided labels are interpreted as frame-level labels that should
            be added as follows::

                sample.frames.merge(
                    {
                        frame_number: {
                            label_field + "_" + name: label
                            for name, label in frame_dict.items()
                        }
                        for frame_number, frame_dict in labels.items()
                    }
                )

        Args:
            labels: a :class:`fiftyone.core.labels.Label` or dict of labels per
                the description above
            label_field: the sample field or prefix in which to save the labels
            confidence_thresh (None): an optional confidence threshold to apply
                to any applicable labels before saving them
            expand_schema (True): whether to dynamically add new fields
                encountered to the dataset schema. If False, an error is raised
                if any fields are not in the dataset schema
        """
        if label_field:
            label_key = lambda k: label_field + "_" + k
        else:
            label_key = lambda k: k

        if confidence_thresh is not None:
            labels = _apply_confidence_thresh(labels, confidence_thresh)

        if _is_frames_dict(labels):
            if self.media_type != fomm.VIDEO:
                raise ValueError(
                    "Cannot add frame labels to non-video samples"
                )

            if isinstance(next(iter(labels.values())), dict):
                # Multiple frame-level fields
                self.frames.merge(
                    {
                        frame_number: {
                            label_key(fname): flabel
                            for fname, flabel in frame_dict.items()
                        }
                        for frame_number, frame_dict in labels.items()
                    },
                    expand_schema=expand_schema,
                )
            else:
                # Single frame-level field
                self.frames.merge(
                    {
                        frame_number: {label_field: label}
                        for frame_number, label in labels.items()
                    },
                    expand_schema=expand_schema,
                )

        elif isinstance(labels, dict):
            # Multiple sample-level fields
            self.update_fields(
                {label_key(k): v for k, v in labels.items()},
                expand_schema=expand_schema,
            )
        elif labels is not None:
            # Single sample-level field
            self.set_field(label_field, labels, create=expand_schema)

        self.save()

    def merge(
        self,
        sample,
        omit_fields=None,
        omit_frame_fields=None,
        omit_none_fields=True,
        overwrite=True,
        expand_schema=True,
    ):
        """Merges the fields of the sample into this sample.

        Args:
            sample: a :class:`fiftyone.core.sample.Sample`
            omit_fields (None): an optional list of fields to omit
            omit_frame_fields (None): an optional lits of frame fields to omit
            omit_none_fields (True): whether to omit ``None``-valued fields of
                the provided sample
            overwrite (True): whether to overwrite existing fields. Note that
                existing fields whose values are ``None`` are always
                overwritten
            expand_schema (True): whether to dynamically add new fields
                encountered to the dataset schema. If False, an error is raised
                if any fields are not in the dataset schema
        """
        if sample.media_type != self.media_type:
            raise ValueError(
                "Cannot merge sample with media type '%s' into sample with "
                "media type '%s'" % (sample.media_type, self.media_type)
            )

        super().merge(
            sample,
            omit_fields=omit_fields,
            omit_none_fields=omit_none_fields,
            overwrite=overwrite,
            expand_schema=expand_schema,
        )

        if self.media_type == fomm.VIDEO:
            self.frames.merge(
                sample.frames,
                omit_fields=omit_frame_fields,
                omit_none_fields=omit_none_fields,
                overwrite=overwrite,
                expand_schema=expand_schema,
            )

    def to_dict(self, include_frames=False):
        """Serializes the sample to a JSON dictionary.

        Sample IDs and private fields are excluded in this representation.

        Args:
            include_frames (False): whether to include the frame labels for
                video samples

        Returns:
            a JSON dict
        """
        d = super().to_dict()

        if self.media_type == fomm.VIDEO:
            if include_frames:
                d["frames"] = self.frames._to_frames_dict()
            else:
                d.pop("frames", None)

        return d

    def _secure_media(self, field_name, value):
        if field_name != "filepath":
            return

        value = os.path.abspath(os.path.expanduser(value))

        new_media_type = fomm.get_media_type(value)
        if self.media_type != new_media_type:
            raise fomm.MediaTypeError(
                "A sample's 'filepath' can be changed, but its media type "
                "cannot; current '%s', new '%s'"
                % (self.media_type, new_media_type)
            )


class Sample(_SampleMixin, Document, metaclass=SampleSingleton):
    """A sample in a :class:`fiftyone.core.dataset.Dataset`.

    Samples store all information associated with a particular piece of data in
    a dataset, including basic metadata about the data, one or more sets of
    labels (ground truth, user-provided, or FiftyOne-generated), and additional
    features associated with subsets of the data and/or label sets.

    .. note::

        :class:`Sample` instances that are **in datasets** are singletons,
        i.e.,  ``dataset[sample_id]`` will always return the same
        :class:`Sample` instance.

    Args:
        filepath: the path to the data on disk. The path is converted to an
            absolute path (if necessary) via
            ``os.path.abspath(os.path.expanduser(filepath))``
        tags (None): a list of tags for the sample
        metadata (None): a :class:`fiftyone.core.metadata.Metadata` instance
        **kwargs: additional fields to dynamically set on the sample
    """

    _NO_DATASET_DOC_CLS = foo.NoDatasetSampleDocument

    def __init__(self, filepath, tags=None, metadata=None, **kwargs):
        super().__init__(
            filepath=filepath, tags=tags, metadata=metadata, **kwargs
        )

        if self.media_type == fomm.VIDEO:
            self._frames = fofr.Frames(self)
        else:
            self._frames = None

    def __repr__(self):
        kwargs = {}
        if self.media_type == fomm.VIDEO:
            kwargs["frames"] = self._frames

        return self._doc.fancy_repr(
            class_name=self.__class__.__name__, **kwargs
        )

    def _reload_backing_doc(self):
        if not self._in_db:
            return

        d = self._dataset._sample_collection.find_one({"_id": self._id})
        self._doc = self._dataset._sample_dict_to_doc(d)

    def copy(self):
        """Returns a deep copy of the sample that has not been added to the
        database.

        Returns:
            a :class:`Sample`
        """
        sample = super().copy()

        if self.media_type == fomm.VIDEO:
            sample.frames.update({k: v.copy() for k, v in self.frames.items()})

        return sample

    def reload(self, hard=False):
        """Reloads the sample from the database.

        Args:
            hard (False): whether to reload the sample's schema in addition to
                its field values. This is necessary if new fields may have been
                added to the dataset schema
        """
        if self.media_type == fomm.VIDEO:
            self.frames.reload(hard=hard)

        super().reload(hard=hard)

    def save(self):
        """Saves the contents of the sample to the database."""
        if self.media_type == fomm.VIDEO:
            self.frames.save()

        super().save()

    @classmethod
    def from_frame(cls, frame, filepath):
        """Creates an image :class:`Sample` from the given
        :class:`fiftyone.core.frame.Frame`.

        Args:
            frame: a :class:`fiftyone.core.frame.Frame`
            filepath: the path to the corresponding image frame on disk

        Returns:
            a :class:`Sample`
        """
        return cls(filepath=filepath, **{k: v for k, v in frame.iter_fields()})

    @classmethod
    def from_doc(cls, doc, dataset=None):
        """Creates a :class:`Sample` backed by the given document.

        Args:
            doc: a :class:`fiftyone.core.odm.SampleDocument`
            dataset (None): the :class:`fiftyone.core.dataset.Dataset` that
                the sample belongs to

        Returns:
            a :class:`Sample`
        """
        sample = super().from_doc(doc, dataset=dataset)

        if sample.media_type == fomm.VIDEO:
            sample._frames = fofr.Frames(sample)

        return sample


class SampleView(_SampleMixin, DocumentView):
    """A view into a :class:`Sample` in a dataset.

    Like :class:`Sample` instances, the fields of a :class:`SampleView`
    instance can be modified, new fields can be created, and any changes can be
    saved to the database.

    :class:`SampleView` instances differ from :class:`Sample` instances in the
    following ways:

    -   A sample view may contain only a subset of the fields of its source
        sample, either by selecting and/or excluding specific fields
    -   A sample view may contain array fields or embedded array fields that
        have been filtered, thus containing only a subset of the array elements
        from the source sample
    -   Excluded fields of a sample view may not be accessed or modified

    .. note::

        :meth:`SampleView.save` will not delete any excluded fields or filtered
        array elements from the source sample.

    Sample views should never be created manually; they are generated when
    accessing the samples in a :class:`fiftyone.core.view.DatasetView`.

    Args:
        doc: a :class:`fiftyone.core.odm.mixins.DatasetSampleDocument`
        view: the :class:`fiftyone.core.view.DatasetView` that the sample
            belongs to
        selected_fields (None): a set of field names that this sample view is
            restricted to, if any
        excluded_fields (None): a set of field names that are excluded from
            this sample view, if any
        filtered_fields (None): a set of field names of list fields that are
            filtered in this sample view, if any
    """

    _DOCUMENT_CLS = Sample

    def __init__(
        self,
        doc,
        view,
        selected_fields=None,
        excluded_fields=None,
        filtered_fields=None,
    ):
        super().__init__(
            doc,
            view,
            selected_fields=selected_fields,
            excluded_fields=excluded_fields,
            filtered_fields=filtered_fields,
        )

        if self.media_type == fomm.VIDEO:
            self._frames = fofr.FramesView(self)
        else:
            self._frames = None

    def __repr__(self):
        if self._selected_fields is not None:
            select_fields = ("id", "media_type") + tuple(self._selected_fields)
        else:
            select_fields = None

        kwargs = {}
        if self.media_type == fomm.VIDEO:
            kwargs["frames"] = self._frames

        return self._doc.fancy_repr(
            class_name=self.__class__.__name__,
            select_fields=select_fields,
            exclude_fields=self._excluded_fields,
            **kwargs,
        )

    def to_dict(self, include_frames=False):
        """Serializes the sample view to a JSON dictionary.

        The sample ID and private fields are excluded in this representation.

        Args:
            include_frames (False): whether to include the frame labels for
                video samples

        Returns:
            a JSON dict
        """
        d = super().to_dict(include_frames=include_frames)

        if self.selected_field_names or self.excluded_field_names:
            d = {k: v for k, v in d.items() if k in self.field_names}

        return d

    def save(self):
        """Saves the contents of this sample view to the database."""
        if self.media_type == fomm.VIDEO:
            try:
                self.frames.save()
            except AttributeError:
                # frames is not selected, so we don't need to save it
                pass

        super().save()


def _apply_confidence_thresh(label, confidence_thresh):
    if _is_frames_dict(label):
        label = {
            frame_number: _apply_confidence_thresh(
                frame_dict, confidence_thresh
            )
            for frame_number, frame_dict in label.items()
        }
    elif isinstance(label, dict):
        label = {
            k: _apply_confidence_thresh(v, confidence_thresh)
            for k, v in label.items()
        }
    elif isinstance(label, fol._LABEL_LIST_FIELDS):
        labels = [
            l
            for l in getattr(label, label._LABEL_LIST_FIELD)
            if l.confidence is not None and l.confidence >= confidence_thresh
        ]
        setattr(label, label._LABEL_LIST_FIELD, labels)
    elif isinstance(label, fol._SINGLE_LABEL_FIELDS) and hasattr(
        label, "confidence"
    ):
        if label.confidence is None or label.confidence < confidence_thresh:
            label = None

    return label


def _is_frames_dict(label):
    return (
        label
        and isinstance(label, dict)
        and fofu.is_frame_number(next(iter(label.keys())))
    )
