"""
Patches views.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy

import eta.core.utils as etau

import fiftyone.core.aggregations as foa
import fiftyone.core.sample as fos
import fiftyone.core.view as fov


class PatchView(fos.SampleView):
    """A patch in a :class:`PatchesView`.

    A :class:`PatchView` should never be created manually, only returned by
    patches views.

    Args:
        doc: a :class:`fiftyone.core.odm.DatasetSampleDocument`
        view: the :class:`PatchesView` that the patch belongs to
        selected_fields (None): a set of field names that this patch view is
            restricted to
        excluded_fields (None): a set of field names that are excluded from
            this patch view
        filtered_fields (None): a set of field names of list fields that are
            filtered in this patch view
    """

    pass


class PatchesView(fov.DatasetView):
    """A view of patches from a :class:`fiftyone.core.dataset.Dataset`.

    Patches views contain an ordered collection of patch samples, each of which
    contains a subset of a sample of the parent dataset corresponding to a
    single object or logical grouping of of objects.

    Patches views are :class:`fiftyone.core.view.DatasetView` instances, so
    they can be refined by adding :class:`fiftyone.core.stages.ViewStage`
    instances to them to create a chain of operations defining the patches
    of interest.

    Patches retrieved from patches views are returned as :class:`PatchView`
    objects.

    Args:
        source_collection: the
            :class:`fiftyone.core.collections.SampleCollection` from which this
            patches view was created
        patches_stage: the :class:`fiftyone.core.stages.ToPatches` stage that
            defines how the patches were extracted
        patches_dataset: the patches :class:`fiftyone.core.dataset.Dataset`
    """

    _SAMPLE_CLS = PatchView

    def __init__(
        self, source_collection, patches_stage, patches_dataset, _stages=None
    ):
        if _stages is None:
            _stages = []

        self._source_collection = source_collection
        self._patches_stage = patches_stage
        self._patches_dataset = patches_dataset
        self._stages = _stages

    def __copy__(self):
        return self.__class__(
            self._source_collection,
            deepcopy(self._patches_stage),
            self._patches_dataset,
            _stages=deepcopy(self._stages),
        )

    @property
    def _dataset(self):
        return self._patches_dataset

    @property
    def _root_dataset(self):
        return self._source_collection._root_dataset

    @property
    def _all_stages(self):
        return (
            self._source_collection.view()._all_stages
            + [self._patches_stage]
            + self._stages
        )

    @property
    def name(self):
        return self.dataset_name + "-patches"

    @property
    def patches_field(self):
        """The field from which the patches in this view were extracted."""
        return self._patches_stage.field

    def summary(self):
        """Returns a string summary of the view.

        Returns:
            a string summary
        """
        _, tags_path = self._get_label_field_path(self.patches_field, "tags")
        aggs = self.aggregate(
            [foa.Count(), foa.Distinct(tags_path)], _attach_frames=False
        )
        elements = [
            "Dataset:        %s" % self.dataset_name,
            "Media type:     %s" % self.media_type,
            "Num patches:    %d" % aggs[0],
            "Patch tags:     %s" % aggs[1],
            "Patch fields:",
            self._to_fields_str(self.get_field_schema()),
        ]

        elements.extend(["View stages:", self._make_view_stages_str()])

        return "\n".join(elements)

    def tag_samples(self, tags, update_source=True):
        """Adds the tag(s) to all samples in this collection, if necessary.

        Args:
            tags: a tag or iterable of tags
            update_source (True): whether to add the tags to the labels in the
                source dataset
        """
        super().tag_samples(tags)

        if update_source:
            sync_fcn = lambda view: view.tag_labels(
                tags, label_fields=self.patches_field
            )
            self._sync_source_patches(sync_fcn)

    def untag_samples(self, tags, update_source=True):
        """Removes the tag(s) from all samples in this collection, if
        necessary.

        Args:
            tags: a tag or iterable of tags
            update_source (True): whether to remove the tags from the labels in
                the source dataset
        """
        super().untag_samples(tags)

        if update_source:
            sync_fcn = lambda view: view.untag_labels(
                tags, label_fields=self.patches_field
            )
            self._sync_source_patches(sync_fcn)

    def tag_labels(self, tags, label_fields=None, update_source=True):
        """Adds the tag(s) to all labels in the specified label field(s) of
        this collection, if necessary.

        Args:
            tags: a tag or iterable of tags
            label_fields (None): an optional name or iterable of names of
                :class:`fiftyone.core.labels.Label` fields. By default, all
                label fields are used
            update_source (True): whether to add the tags to the labels in the
                source dataset
        """
        if etau.is_str(label_fields):
            label_fields = [label_fields]

        super().tag_labels(tags, label_fields=label_fields)

        if update_source and (
            label_fields is None or self.patches_field in label_fields
        ):
            sync_fcn = lambda view: view.tag_labels(
                tags, label_fields=self.patches_field
            )
            self._sync_source_patches(sync_fcn)

    def untag_labels(self, tags, label_fields=None, update_source=True):
        """Removes the tag from all labels in the specified label field(s) of
        this collection, if necessary.

        Args:
            tags: a tag or iterable of tags
            label_fields (None): an optional name or iterable of names of
                :class:`fiftyone.core.labels.Label` fields. By default, all
                label fields are used
            update_source (True): whether to remove the tags from the labels in
                the source dataset
        """
        if etau.is_str(label_fields):
            label_fields = [label_fields]

        super().untag_labels(tags, label_fields=label_fields)

        if update_source and (
            label_fields is None or self.patches_field in label_fields
        ):
            sync_fcn = lambda view: view.untag_labels(
                tags, label_fields=self.patches_field
            )
            self._sync_source_patches(sync_fcn)

    def _sync_source_patches(self, sync_fcn):
        _, id_path = self._get_label_field_path(self.patches_field, "id")
        ids = self.values(id_path, unwind=True)
        source_labels_view = self._source_collection.select_labels(
            ids=ids, fields=self.patches_field
        )

        sync_fcn(source_labels_view)
