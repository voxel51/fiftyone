"""
Core Module for `fiftyone` Sample class

"""
# pragma pylint: disable=redefined-builtin
# pragma pylint: disable=unused-wildcard-import
# pragma pylint: disable=wildcard-import
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals
from builtins import *

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import
import eta.core.frames as etaf
import eta.core.labels as etal


class FiftyOneImageLabels(etaf.FrameLabels):
    """Class encapsulating labels for an image.

    ImageLabels are spatial concepts that describe a collection of information
    about a specific image. ImageLabels can have frame-level attributes,
    object detections, event detections, and segmentation masks.

    Attributes:
        group: (optional) the group of the label
            this can be any arbitrary string but should specify the type and/or
            source of the labels, e.g.:
                "ground_truth", "ground_truth_fine-grain",
                "model_v1_prediction", ..., etc.
        mask: (optional) a segmentation mask for the image
        mask_index: (optional) a MaskIndex describing the semantics of the
            segmentation mask
        attrs: an AttributeContainer of attributes of the image
        objects: a DetectedObjectContainer of objects in the image
        events: a DetectedEventContainer of events in the image
    """

    def __init__(self, group, **kwargs):
        """Creates an ImageLabels instance.

        Args:
            group: (optional) the group of the labels
            **kwargs: valid keyword arguments for FrameLabels(**kwargs)
        """
        self.group = group
        kwargs.pop(
            "frame_number", None
        )  # ImageLabels don't use `frame_number`
        super(FiftyOneImageLabels, self).__init__(**kwargs)

    @property
    def has_group(self):
        """Whether the image has a group."""
        return self.group is not None

    def merge_labels(self, frame_labels, reindex=False):
        """Merges the given FrameLabels into this labels.

        Args:
            frame_labels: a FrameLabels
            reindex: whether to offset the `index` fields of objects and events
                in `frame_labels` before merging so that all indices are
                unique. The default is False
        """
        super(FiftyOneImageLabels, self).merge_labels(
            frame_labels, reindex=reindex
        )

        if isinstance(frame_labels, FiftyOneImageLabels):
            if frame_labels.has_group and not self.has_group:
                self.group = frame_labels.group

    @classmethod
    def from_frame_labels(cls, frame_labels, group=None):
        """Constructs a FiftyOneImageLabels from a FrameLabels.

        Args:
            frame_labels: a FrameLabels instance
            group: (optional) the group of the labels

        Returns:
            a FiftyOneImageLabels instance
        """
        return cls(
            group=group,
            mask=frame_labels.mask,
            mask_index=frame_labels.mask_index,
            attrs=frame_labels.attrs,
            objects=frame_labels.objects,
            events=frame_labels.events,
        )

    def attributes(self):
        """Returns the list of class attributes that will be serialized.

        Returns:
            a list of attribute names
        """
        _attrs = []
        if self.group:
            _attrs.append("group")
        _attrs.extend(super(FiftyOneImageLabels, self).attributes())
        return _attrs

    @classmethod
    def from_dict(cls, d):
        """Constructs a FiftyOneImageLabels from a JSON dictionary.

        Args:
            d: a JSON dictionary

        Returns:
            a FiftyOneImageLabels
        """
        group = d.get("group", None)

        return super(FiftyOneImageLabels, cls).from_dict(d, group=group)


class FiftyOneImageSetLabels(etal.LabelsSet):
    """Class encapsulating labels for multiple groups for a single image, e.g.:

        groups = [
            "ground_truth",
            "model_1_predictions",
            "model_2_predictions",
            ...
        ]

    FiftyOneImageSetLabels support item indexing by the `group` of the
    FiftyOneImageLabels instances in the set.

    FiftyOneImageSetLabels instances behave like defaultdicts: new FiftyOneImageLabels
    instances are automatically created if a non-existent group is accessed.

    FiftyOneImageLabels without group may be added to the set, but they cannot be
    accessed by `group`-based lookup.

    Attributes:
        images: an OrderedDict of FiftyOneImageLabels with groups as keys
        schema: an ImageLabelsSchema describing the schema of the labels
    """

    _ELE_ATTR = "labels"
    _ELE_KEY_ATTR = "group"
    _ELE_CLS = FiftyOneImageLabels
    _ELE_CLS_FIELD = "_LABELS_CLS"

    def sort_by_group(self, reverse=False):
        """Sorts the FiftyOneImageLabels in this instance by group.

        ImageLabels without groups are always put at the end of the set.

        Args:
            reverse: whether to sort in reverse order. By default, this is
                False
        """
        self.sort_by("group", reverse=reverse)

    def clear_frame_attributes(self):
        """Removes all frame attributes from all ImageLabels in the set."""
        for image_labels in self:
            image_labels.clear_frame_attributes()

    def clear_objects(self):
        """Removes all `DetectedObject`s from all ImageLabels in the set."""
        for image_labels in self:
            image_labels.clear_objects()

    def get_groups(self):
        """Returns the set of groups of FiftyOneImageLabels in the set.

        Returns:
            the set of groups
        """
        return set(il.group for il in self if il.group)

    def remove_objects_without_attrs(self, labels=None):
        """Removes `DetectedObject`s from the ImageLabels in the set that do
        not have attributes.

        Args:
            labels: an optional list of DetectedObject label strings to which
                to restrict attention when filtering. By default, all objects
                are processed
        """
        for image_labels in self:
            image_labels.remove_objects_without_attrs(labels=labels)

    @classmethod
    def from_image_labels_patt(cls, image_labels_patt):
        """Creates an ImageSetLabels from a pattern of ImageLabels files.

        Args:
             image_labels_patt: a pattern with one or more numeric sequences
                for ImageLabels files on disk

        Returns:
            an ImageSetLabels instance
        """
        return cls.from_labels_patt(image_labels_patt)
