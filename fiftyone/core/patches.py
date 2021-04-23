"""
Patches views.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy
import itertools

import eta.core.utils as etau

import fiftyone.core.aggregations as foa
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.sample as fos
import fiftyone.core.utils as fou
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

    def save(self, update_source=True):
        """Saves the patch to the database.

        Args:
            update_source (True): whether to push changes to the source dataset
        """
        super().save()

        if update_source:
            self._view._sync_source_sample(self)


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

        self._patches_field = patches_stage.field
        self._label_type = self._patches_dataset._get_label_field_type(
            self._patches_field
        )
        self._has_label_lists = issubclass(
            self._label_type, fol._LABEL_LIST_FIELDS
        )

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
    def _element_str(self):
        return "patch"

    @property
    def _elements_str(self):
        return "patches"

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
        return self._patches_field

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
            ("Dataset:", self.dataset_name),
            ("Media type:", self.media_type),
            ("Num patches:", aggs[0]),
            ("Patch tags:", aggs[1]),
        ]

        elements = fou.justify_headings(elements)
        lines = ["%s %s" % tuple(e) for e in elements]

        lines.extend(
            ["Patch fields:", self._to_fields_str(self.get_field_schema()),]
        )

        if self.media_type == fom.VIDEO:
            lines.extend(
                [
                    "Frame fields:",
                    self._to_fields_str(self.get_frame_field_schema()),
                ]
            )

        lines.extend(["View stages:", self._make_view_stages_str()])

        return "\n".join(lines)

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
            self._sync_source_fcn(sync_fcn)

    def untag_samples(self, tags, update_source=True):
        """Removes the tag(s) from all samples in this collection, if
        necessary.

        Args:
            tags: a tag or iterable of tags
            update_source (True): whether to push changes to the source dataset
        """
        super().untag_samples(tags)

        if update_source:
            sync_fcn = lambda view: view.untag_labels(
                tags, label_fields=self.patches_field
            )
            self._sync_source_fcn(sync_fcn)

    def tag_labels(self, tags, label_fields=None, update_source=True):
        """Adds the tag(s) to all labels in the specified label field(s) of
        this collection, if necessary.

        Args:
            tags: a tag or iterable of tags
            label_fields (None): an optional name or iterable of names of
                :class:`fiftyone.core.labels.Label` fields. By default, all
                label fields are used
            update_source (True): whether to push changes to the source dataset
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
            self._sync_source_fcn(sync_fcn)

    def untag_labels(self, tags, label_fields=None, update_source=True):
        """Removes the tag from all labels in the specified label field(s) of
        this collection, if necessary.

        Args:
            tags: a tag or iterable of tags
            label_fields (None): an optional name or iterable of names of
                :class:`fiftyone.core.labels.Label` fields. By default, all
                label fields are used
            update_source (True): whether to push changes to the source dataset
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
            self._sync_source_fcn(sync_fcn)

    def save(self, fields=None, update_source=True):
        """Overwrites the underlying dataset with the contents of the view.

        .. warning::

            This will permanently delete any omitted, filtered, or otherwise
            modified contents of the dataset.

        Args:
            fields (None): an optional field or list of fields to save. If
                specified, only these fields are overwritten
            update_source (True): whether to push changes to the source dataset
        """
        if etau.is_str(fields):
            fields = [fields]

        super().save(fields=fields)

        if update_source and (fields is None or self.patches_field in fields):
            self._sync_source_all()

    def _sync_source_sample(self, sample):
        doc = sample._doc.field_to_mongo(sample, self.patches_field)

        # Merge sample-level tags into label tags
        if self._has_label_lists:
            doc = doc.get(self._label_type._LABEL_LIST_FIELD, [])
            for _doc in doc:
                _doc["tags"].extend(sample.tags)
        else:
            doc["tags"].extend(sample.tags)

        self._source_collection._set_labels_by_id(
            self.patches_field, [sample.sample_id], [doc]
        )

    def _sync_source_fcn(self, sync_fcn):
        _, id_path = self._get_label_field_path(self.patches_field, "id")
        ids = self.values(id_path, unwind=True)
        source_labels_view = self._source_collection.select_labels(
            ids=ids, fields=self.patches_field
        )

        sync_fcn(source_labels_view)

    def _sync_source_all(self):
        _, id_path = self._get_label_field_path(self.patches_field, "id")
        label_path = id_path.rsplit(".", 1)[0]

        #
        # Sync label updates
        #

        sample_ids, tags, docs = self.aggregate(
            [
                foa.Values("sample_id"),
                foa.Values("tags"),
                foa.Values(label_path),
            ]
        )

        # Merge sample-level tags into label tags
        if self._has_label_lists:
            for _tags, _docs in zip(tags, docs):
                if not _tags:
                    continue

                for doc in _docs:
                    doc["tags"].extend(_tags)
        else:
            for _tags, doc in zip(tags, docs):
                if not _tags:
                    continue

                doc["tags"].extend(_tags)

        self._source_collection._set_labels_by_id(
            self.patches_field, sample_ids, docs
        )

        #
        # Sync label deletions
        #

        if self._has_label_lists:
            _docs = list(
                itertools.chain.from_iterable(_docs for _docs in docs if _docs)
            )
            ids = [d["_id"] for d in _docs]
        else:
            ids = [d["_id"] for d in docs]

        all_ids = self._patches_dataset.values(id_path, unwind=True)
        deleted_ids = set(all_ids) - set(ids)

        if deleted_ids:
            # @todo optimize by using `labels` syntax
            self._source_collection.delete_labels(
                ids=deleted_ids, fields=self.patches_field
            )
