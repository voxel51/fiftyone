"""
Dataset samples.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import typing as t

import fiftyone.core.frame_utils as fofu
import fiftyone.core.labels as fol
import fiftyone.core.media as fomm
import fiftyone.core.metadata as fom
from fiftyone.core.data import Document, field


class Sample(Document):

    __fiftyone_indexes__ = ("filepath",)

    filepath: str = field(required=True)
    metadata: fom.Metadata
    tags: t.List[str] = field(default_factory=list, required=True)

    @property
    def filename(self) -> str:
        return os.path.basename(self.filepath)

    @property
    def media_type(self) -> str:
        return fomm.get_media_type(self.filepath)

    def get_field(self, field_name):
        return getattr(self, field_name)

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

    def compute_metadata(self, overwrite=False, skip_failures=False):
        fom.compute_sample_metadata(
            self, overwrite=overwrite, skip_failures=skip_failures
        )

    def add_labels(
        self,
        labels,
        label_field=None,
        confidence_thresh=None,
        expand_schema=True,
    ):
        """Adds the given labels to the sample.

        The provided ``labels`` can be any of the following:

        -   A :class:`fiftyone.core.labels.Label` instance, in which case the
            labels are directly saved in the specified ``label_field``

        -   A dict mapping keys to :class:`fiftyone.core.labels.Label`
            instances. In this case, the labels are added as follows::

                for key, value in labels.items():
                    sample[label_key(key)] = value

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
                            label_key(key): value
                            for key, value in frame_dict.items()
                        }
                        for frame_number, frame_dict in labels.items()
                    }
                )

        In the above, the ``label_key`` function maps label dict keys to field
        names, and is defined from ``label_field`` as follows::

            if isinstance(label_field, dict):
                label_key = lambda k: label_field.get(k, k)
            elif label_field is not None:
                label_key = lambda k: label_field + "_" + k
            else:
                label_key = lambda k: k

        Args:
            labels: a :class:`fiftyone.core.labels.Label` or dict of labels per
                the description above
            label_field (None): the sample field, prefix, or dict defining in
                which field(s) to save the labels
            confidence_thresh (None): an optional confidence threshold to apply
                to any applicable labels before saving them
            expand_schema (True): whether to dynamically add new fields
                encountered to the dataset schema. If False, an error is raised
                if any fields are not in the dataset schema
        """
        if isinstance(label_field, dict):
            label_key = lambda k: label_field.get(k, k)
        elif label_field is not None:
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
            elif label_field is None:
                raise ValueError(
                    "A `label_field` must be provided in order to add labels "
                    "to a single frame-level field"
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
            if label_field is None:
                raise ValueError(
                    "A `label_field` must be provided in order to add labels "
                    "to a single sample field"
                )

            # Single sample-level field
            self.set_field(label_field, labels, create=expand_schema)

        if self._in_db:
            self.save()

    def merge(
        self,
        sample,
        fields=None,
        omit_fields=None,
        merge_lists=True,
        overwrite=True,
        expand_schema=True,
    ):
        if sample.media_type != self.media_type:
            raise ValueError(
                "Cannot merge sample with media type '%s' into sample with "
                "media type '%s'" % (sample.media_type, self.media_type)
            )

        if self.media_type == fomm.VIDEO:
            (
                fields,
                frame_fields,
                omit_fields,
                omit_frame_fields,
            ) = self._parse_fields_video(
                fields=fields, omit_fields=omit_fields
            )

        super().merge(
            sample,
            fields=fields,
            omit_fields=omit_fields,
            merge_lists=merge_lists,
            overwrite=overwrite,
            expand_schema=expand_schema,
        )

        if self.media_type == fomm.VIDEO:
            self.frames.merge(
                sample.frames,
                fields=frame_fields,
                omit_fields=omit_frame_fields,
                merge_lists=merge_lists,
                overwrite=overwrite,
                expand_schema=expand_schema,
            )

    def to_dict(self, include_frames=False, include_private=False):
        """Serializes the sample to a JSON dictionary.

        Args:
            include_frames (False): whether to include the frame labels for
                video samples
            include_private (False): whether to include private fields

        Returns:
            a JSON dict
        """
        d = super().to_dict(include_private=include_private)

        if self.media_type == fomm.VIDEO:
            if include_frames:
                d["frames"] = self.frames._to_frames_dict(
                    include_private=include_private
                )
            else:
                d.pop("frames", None)

        return d

    def _secure_media(self, field_name, value):
        if field_name != "filepath":
            return

        new_media_type = fomm.get_media_type(value)
        if self.media_type != new_media_type:
            raise fomm.MediaTypeError(
                "A sample's 'filepath' can be changed, but its media type "
                "cannot; current '%s', new '%s'"
                % (self.media_type, new_media_type)
            )

    def copy(self, fields=None, omit_fields=None):
        if self.media_type == fomm.VIDEO:
            (
                fields,
                frame_fields,
                omit_fields,
                omit_frame_fields,
            ) = self._parse_fields_video(
                fields=fields, omit_fields=omit_fields
            )

        sample = super().__copy__(fields=fields, omit_fields=omit_fields)

        if self.media_type == fomm.VIDEO:
            sample.frames.update(
                {
                    frame_number: frame.copy(
                        fields=frame_fields, omit_fields=omit_frame_fields
                    )
                    for frame_number, frame in self.frames.items()
                }
            )

        return sample

    def reload(self, hard=False):
        if self.media_type == fomm.VIDEO:
            self.frames.reload(hard=hard)

        super().reload(hard=hard)

    def save(self):
        if not self.__fiftyone_ref__.in_db:
            raise ValueError(
                "Cannot save a sample that has not been added to a dataset"
            )

        if self.media_type == fomm.VIDEO:
            self.frames.save()

        super().save()

    @classmethod
    def from_frame(cls, frame, filepath):
        return cls(filepath=filepath, **{k: v for k, v in frame.iter_fields()})


class SampleView(Sample):
    pass


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
    elif hasattr(label, "confidence"):
        if label.confidence is None or label.confidence < confidence_thresh:
            label = None

    return label


def _is_frames_dict(label):
    return (
        label
        and isinstance(label, dict)
        and fofu.is_frame_number(next(iter(label.keys())))
    )
