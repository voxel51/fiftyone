"""
Dataset views.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict, OrderedDict
import contextlib
from copy import copy, deepcopy
import itertools
import numbers

from bson import ObjectId
from pymongo.errors import CursorNotFound

import eta.core.utils as etau

import fiftyone.core.collections as foc
import fiftyone.core.expressions as foe
from fiftyone.core.expressions import ViewField as F
import fiftyone.core.fields as fof
import fiftyone.core.frame as fofr
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
import fiftyone.core.sample as fos
import fiftyone.core.utils as fou

fost = fou.lazy_import("fiftyone.core.stages")


class DatasetView(foc.SampleCollection):
    """A view into a :class:`fiftyone.core.dataset.Dataset`.

    Dataset views represent ordered collections of subsets of samples in a
    dataset.

    Operations on dataset views are designed to be chained together to yield
    the desired subset of the dataset, which is then iterated over to directly
    access the sample views. Each stage in the pipeline defining a dataset view
    is represented by a :class:`fiftyone.core.stages.ViewStage` instance.

    The stages of a dataset view specify:

    -   The subset of samples (and their order) that should be included
    -   The possibly-filtered fields of each sample that should be included

    Samples retrieved from dataset views are returned as
    :class:`fiftyone.core.sample.SampleView` objects, as opposed to
    :class:`fiftyone.core.sample.Sample` objects, since they may contain a
    subset of the sample's content.

    See :ref:`this page <using-views>` for an overview of working with dataset
    views.

    Args:
        dataset: the underlying :class:`fiftyone.core.dataset.Dataset` for the
            view
    """

    __slots__ = (
        "__dataset",
        "__stages",
        "__media_type",
        "__group_slice",
        "__name",
        "_make_sample_fcn",
        "_make_frame_fcn",
    )

    def __init__(
        self,
        dataset,
        _stages=None,
        _media_type=None,
        _group_slice=None,
        _name=None,
    ):
        if _stages is None:
            _stages = []

        self.__dataset = dataset
        self.__stages = _stages
        self.__media_type = _media_type
        self.__group_slice = _group_slice
        self.__name = _name

    def __eq__(self, other):
        if type(other) != type(self):
            return False

        if self._root_dataset != other._root_dataset:
            return False

        # Two views into the same dataset are equal if their stage definitions
        # are equal, excluding their UUIDs
        d = self._serialize(include_uuids=False)
        other_d = other._serialize(include_uuids=False)
        return d == other_d

    def __len__(self):
        return self.count()

    def __getitem__(self, id_filepath_slice):
        if isinstance(id_filepath_slice, numbers.Integral):
            raise KeyError(
                "Accessing samples by numeric index is not supported. "
                "Use sample IDs, filepaths, slices, boolean arrays, or a "
                "boolean ViewExpression instead"
            )

        if isinstance(id_filepath_slice, slice):
            return self._slice(id_filepath_slice)

        if isinstance(id_filepath_slice, foe.ViewExpression):
            return self.match(id_filepath_slice)

        if etau.is_container(id_filepath_slice):
            return self.select(id_filepath_slice)

        try:
            oid = ObjectId(id_filepath_slice)
            query = {"_id": oid}
        except:
            oid = None
            query = {"filepath": id_filepath_slice}

        view = self.match(query)

        try:
            return next(iter(view))
        except StopIteration:
            field = "ID" if oid is not None else "filepath"
            raise KeyError(
                "No sample found with %s '%s'" % (field, id_filepath_slice)
            )

    def __copy__(self):
        return self.__class__(
            self.__dataset,
            _stages=deepcopy(self.__stages),
            _media_type=self.__media_type,
            _group_slice=self.__group_slice,
            _name=self.__name,
        )

    @property
    def _base_view(self):
        return self.__class__(self.__dataset, _group_slice=self.group_slice)

    @property
    def _dataset(self):
        return self.__dataset

    @property
    def _root_dataset(self):
        return self.__dataset

    @property
    def _has_slices(self):
        if self._dataset.media_type != fom.GROUP:
            return False

        for stage in self._stages:
            if isinstance(stage, fost.SelectGroupSlices):
                return False

        return True

    @property
    def _parent_media_type(self):
        if (
            self._dataset.media_type != fom.GROUP
            or not self._is_dynamic_groups
        ):
            return self._dataset.media_type

        for idx, stage in enumerate(self._stages):
            if isinstance(stage, fost.GroupBy):
                break

        return DatasetView._build(
            self._dataset, self._serialize()[:idx]
        ).media_type

    @property
    def _is_generated(self):
        return self._dataset._is_generated

    @property
    def _is_patches(self):
        return self._dataset._is_patches

    @property
    def _is_frames(self):
        return self._dataset._is_frames

    @property
    def _is_clips(self):
        return self._dataset._is_clips

    @property
    def _is_dynamic_groups(self):
        return self._outputs_dynamic_groups()

    @property
    def _sample_cls(self):
        return fos.SampleView

    @property
    def _frame_cls(self):
        return fofr.FrameView

    @property
    def _stages(self):
        return self.__stages

    @property
    def _all_stages(self):
        return self.__stages

    @property
    def media_type(self):
        """The media type of the view."""
        if self.__media_type is not None:
            return self.__media_type

        return self._dataset.media_type

    @property
    def group_field(self):
        """The group field of the view, or None if the view is not grouped."""
        if not self._has_slices:
            return None

        return self._dataset.group_field

    @property
    def group_slice(self):
        """The current group slice of the view, or None if the view is not
        grouped.
        """
        if not self._has_slices:
            return None

        if self.__group_slice is not None:
            return self.__group_slice

        return self._dataset.group_slice

    @group_slice.setter
    def group_slice(self, slice_name):
        if self.media_type != fom.GROUP:
            raise ValueError("DatasetView has no groups")

        if self._is_dynamic_groups and not self._has_slices:
            raise ValueError("Dynamic grouped collections don't have slices")

        if slice_name is not None and slice_name not in self.group_media_types:
            raise ValueError(
                "DatasetView has no group slice '%s'" % slice_name
            )

        self.__group_slice = slice_name

    @property
    def group_slices(self):
        """The list of group slices of the view, or None if the view is not
        grouped.
        """
        if not self._has_slices:
            return None

        return self._dataset.group_slices

    @property
    def group_media_types(self):
        """A dict mapping group slices to media types, or None if the view is
        not grouped.
        """
        if not self._has_slices:
            return None

        return self._dataset.group_media_types

    @property
    def default_group_slice(self):
        """The default group slice of the view, or None if the view is not
        grouped.
        """
        if not self._has_slices:
            return None

        return self._dataset.default_group_slice

    @property
    def name(self):
        """The name of the view if it is a saved view; otherwise None."""
        return self.__name

    @property
    def is_saved(self):
        """Whether the view is a saved view or not."""
        return self.__name is not None

    @property
    def dataset_name(self):
        """The name of the underlying dataset."""
        return self._root_dataset.name

    @property
    def tags(self):
        return self._root_dataset.tags

    @tags.setter
    def tags(self, tags):
        self._root_dataset.tags = tags

    @property
    def description(self):
        return self._root_dataset.description

    @description.setter
    def description(self, description):
        self._root_dataset.description = description

    @property
    def info(self):
        return self._root_dataset.info

    @info.setter
    def info(self, info):
        self._root_dataset.info = info

    @property
    def app_config(self):
        return self._root_dataset.app_config

    @app_config.setter
    def app_config(self, config):
        self._root_dataset.app_config = config

    @property
    def classes(self):
        return self._root_dataset.classes

    @classes.setter
    def classes(self, classes):
        self._root_dataset.classes = classes

    @property
    def default_classes(self):
        return self._root_dataset.default_classes

    @default_classes.setter
    def default_classes(self, classes):
        self._root_dataset.default_classes = classes

    @property
    def mask_targets(self):
        return self._root_dataset.mask_targets

    @mask_targets.setter
    def mask_targets(self, targets):
        self._root_dataset.mask_targets = targets

    @property
    def default_mask_targets(self):
        return self._root_dataset.default_mask_targets

    @default_mask_targets.setter
    def default_mask_targets(self, targets):
        self._root_dataset.default_mask_targets = targets

    @property
    def skeletons(self):
        return self._root_dataset.skeletons

    @skeletons.setter
    def skeletons(self, skeletons):
        self._root_dataset.skeletons = skeletons

    @property
    def default_skeleton(self):
        return self._root_dataset.default_skeleton

    @default_skeleton.setter
    def default_skeleton(self, skeleton):
        self._root_dataset.default_skeleton = skeleton

    def summary(self):
        """Returns a string summary of the view.

        Returns:
            a string summary
        """
        elements = [
            ("Dataset:", self.dataset_name),
            ("Media type:", self.media_type),
            ("Num %s:" % self._elements_str, self.count()),
        ]

        if self.media_type == fom.GROUP:
            elements.insert(2, ("Group slice:", self.group_slice))

        if self.is_saved:
            elements.insert(1, ("View name: ", self.name))

        elements = fou.justify_headings(elements)
        lines = ["%s %s" % tuple(e) for e in elements]

        lines.extend(
            [
                "%s fields:" % self._element_str.capitalize(),
                self._to_fields_str(self.get_field_schema()),
            ]
        )

        if self._has_frame_fields():
            lines.extend(
                [
                    "Frame fields:",
                    self._to_fields_str(self.get_frame_field_schema()),
                ]
            )

        lines.extend(["View stages:", self._make_view_stages_str()])

        return "\n".join(lines)

    def _make_view_stages_str(self):
        if not self._all_stages:
            return "    ---"

        return "    " + "\n    ".join(
            [
                "%d. %s" % (idx, str(stage))
                for idx, stage in enumerate(self._all_stages, 1)
            ]
        )

    def view(self):
        """Returns a copy of this view.

        Returns:
            a :class:`DatasetView`
        """
        return copy(self)

    def iter_samples(
        self,
        progress=False,
        autosave=False,
        batch_size=None,
        batching_strategy=None,
    ):
        """Returns an iterator over the samples in the view.

        Examples::

            import random as r
            import string as s

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("cifar10", split="test")
            view = dataset.shuffle().limit(5000)

            def make_label():
                return "".join(r.choice(s.ascii_letters) for i in range(10))

            # No save context
            for sample in view.iter_samples(progress=True):
                sample.ground_truth.label = make_label()
                sample.save()

            # Save using default batching strategy
            for sample in view.iter_samples(progress=True, autosave=True):
                sample.ground_truth.label = make_label()

            # Save in batches of 10
            for sample in view.iter_samples(
                progress=True, autosave=True, batch_size=10
            ):
                sample.ground_truth.label = make_label()

            # Save every 0.5 seconds
            for sample in view.iter_samples(
                progress=True, autosave=True, batch_size=0.5
            ):
                sample.ground_truth.label = make_label()

        Args:
            progress (False): whether to render a progress bar (True/False),
                use the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead
            autosave (False): whether to automatically save changes to samples
                emitted by this iterator
            batch_size (None): the batch size to use when autosaving samples.
                If a ``batching_strategy`` is provided, this parameter
                configures the strategy as described below. If no
                ``batching_strategy`` is provided, this can either be an
                integer specifying the number of samples to save in a batch
                (in which case ``batching_strategy`` is implicitly set to
                ``"static"``) or a float number of seconds between batched
                saves (in which case ``batching_strategy`` is implicitly set to
                ``"latency"``)
            batching_strategy (None): the batching strategy to use for each
                save operation when autosaving samples. Supported values are:

                -   ``"static"``: a fixed sample batch size for each save
                -   ``"size"``: a target batch size, in bytes, for each save
                -   ``"latency"``: a target latency, in seconds, between saves

                By default, ``fo.config.default_batcher`` is used

        Returns:
            an iterator over :class:`fiftyone.core.sample.SampleView` instances
        """
        with contextlib.ExitStack() as exit_context:
            samples = self._iter_samples()

            pb = fou.ProgressBar(total=self, progress=progress)
            exit_context.enter_context(pb)
            samples = pb(samples)

            if autosave:
                save_context = foc.SaveContext(
                    self,
                    batch_size=batch_size,
                    batching_strategy=batching_strategy,
                )
                exit_context.enter_context(save_context)

            for sample in samples:
                yield sample

                if autosave:
                    save_context.save(sample)

    def _iter_samples(self):
        index = 0

        try:
            for d in self._aggregate(detach_frames=True, detach_groups=True):
                sample = self._make_sample(d)

                index += 1
                yield sample
        except CursorNotFound:
            # The cursor has timed out so we yield from a new one after
            # skipping to the last offset
            view = self.skip(index)
            for sample in view._iter_samples():
                yield sample

    def _make_sample(self, d):
        if getattr(self, "_make_sample_fcn", None) is None:
            self._make_sample_fcn = self._init_make_sample()

        return self._make_sample_fcn(d)

    def _make_frame(self, d):
        if getattr(self, "_make_frame_fcn", None) is None:
            self._make_frame_fcn = self._init_make_frame()

        return self._make_frame_fcn(d)

    def _init_make_sample(self):
        sample_cls = self._sample_cls
        selected_fields, excluded_fields = self._get_selected_excluded_fields(
            roots_only=True
        )
        filtered_fields = self._get_filtered_fields()
        sample_doc_cls = self._dataset._sample_doc_cls

        def make_sample(d):
            try:
                doc = sample_doc_cls.from_dict(d)
                return sample_cls(
                    doc,
                    self,
                    selected_fields=selected_fields,
                    excluded_fields=excluded_fields,
                    filtered_fields=filtered_fields,
                )
            except Exception as e:
                raise ValueError(
                    "Failed to load sample from the database. This is likely "
                    "due to an invalid stage in the DatasetView"
                ) from e

        return make_sample

    def _init_make_frame(self):
        frame_cls = self._frame_cls
        selected_fields, excluded_fields = self._get_selected_excluded_fields(
            frames=True, roots_only=True
        )
        filtered_fields = self._get_filtered_fields(frames=True)
        frame_doc_cls = self._dataset._frame_doc_cls

        def make_frame(d):
            try:
                doc = frame_doc_cls.from_dict(d)
                return frame_cls(
                    doc,
                    self,
                    selected_fields=selected_fields,
                    excluded_fields=excluded_fields,
                    filtered_fields=filtered_fields,
                )
            except Exception as e:
                raise ValueError(
                    "Failed to load frame from the database. This is likely "
                    "due to an invalid stage in the DatasetView"
                ) from e

        return make_frame

    def iter_groups(
        self,
        group_slices=None,
        progress=False,
        autosave=False,
        batch_size=None,
        batching_strategy=None,
    ):
        """Returns an iterator over the groups in the view.

        Examples::

            import random as r
            import string as s

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart-groups")
            view = dataset.select_fields()

            def make_label():
                return "".join(r.choice(s.ascii_letters) for i in range(10))

            # No save context
            for group in view.iter_groups(progress=True):
                for sample in group.values():
                    sample["test"] = make_label()
                    sample.save()

            # Save using default batching strategy
            for group in view.iter_groups(progress=True, autosave=True):
                for sample in group.values():
                    sample["test"] = make_label()

            # Save in batches of 10
            for group in view.iter_groups(
                progress=True, autosave=True, batch_size=10
            ):
                for sample in group.values():
                    sample["test"] = make_label()

            # Save every 0.5 seconds
            for group in view.iter_groups(
                progress=True, autosave=True, batch_size=0.5
            ):
                for sample in group.values():
                    sample["test"] = make_label()

        Args:
            group_slices (None): an optional subset of group slices to load
            progress (False): whether to render a progress bar (True/False),
                use the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead
            autosave (False): whether to automatically save changes to samples
                emitted by this iterator
            batch_size (None): the batch size to use when autosaving samples.
                If a ``batching_strategy`` is provided, this parameter
                configures the strategy as described below. If no
                ``batching_strategy`` is provided, this can either be an
                integer specifying the number of samples to save in a batch
                (in which case ``batching_strategy`` is implicitly set to
                ``"static"``) or a float number of seconds between batched
                saves (in which case ``batching_strategy`` is implicitly set to
                ``"latency"``)
            batching_strategy (None): the batching strategy to use for each
                save operation when autosaving samples. Supported values are:

                -   ``"static"``: a fixed sample batch size for each save
                -   ``"size"``: a target batch size, in bytes, for each save
                -   ``"latency"``: a target latency, in seconds, between saves

                By default, ``fo.config.default_batcher`` is used

        Returns:
            an iterator that emits dicts mapping slice names to
            :class:`fiftyone.core.sample.SampleView` instances, one per group
        """
        if self.media_type != fom.GROUP:
            raise ValueError("%s does not contain groups" % type(self))

        if self._is_dynamic_groups:
            raise ValueError(
                "Use iter_dynamic_groups() for dynamic group views"
            )

        with contextlib.ExitStack() as exit_context:
            groups = self._iter_groups(group_slices=group_slices)

            pb = fou.ProgressBar(total=self, progress=progress)
            exit_context.enter_context(pb)
            groups = pb(groups)

            if autosave:
                save_context = foc.SaveContext(
                    self,
                    batch_size=batch_size,
                    batching_strategy=batching_strategy,
                )
                exit_context.enter_context(save_context)

            for group in groups:
                yield group

                if autosave:
                    for sample in group.values():
                        save_context.save(sample)

    def _iter_groups(self, group_slices=None):
        index = 0

        group_field = self.group_field
        curr_id = None
        group = {}

        try:
            for d in self._aggregate(
                detach_frames=True, groups_only=True, group_slices=group_slices
            ):
                sample = self._make_sample(d)

                group_id = sample[group_field].id
                if curr_id is None:
                    # First overall element
                    curr_id = group_id
                    group[sample[group_field].name] = sample
                elif group_id == curr_id:
                    # Add element to group
                    group[sample[group_field].name] = sample
                else:
                    # Flush last group
                    index += 1
                    yield group

                    # First element of new group
                    curr_id = group_id
                    group = {}
                    group[sample[group_field].name] = sample

            if group:
                yield group
        except CursorNotFound:
            # The cursor has timed out so we yield from a new one after
            # skipping to the last offset
            view = self.skip(index)
            for group in view._iter_groups(group_slices=group_slices):
                yield group

    def iter_dynamic_groups(self, progress=False):
        """Returns an iterator over the dynamic groups in the view.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("cifar10", split="test")

            view = dataset.take(1000).group_by("ground_truth.label")

            for group in view.iter_dynamic_groups():
                group_value = group.first().ground_truth.label
                print("%s: %d" % (group_value, len(group)))

        Args:
            progress (False): whether to render a progress bar (True/False),
                use the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

        Returns:
            an iterator that emits :class:`DatasetView` instances, one per
            group
        """
        if not self._is_dynamic_groups:
            raise ValueError("%s does not contain dynamic groups" % type(self))

        with contextlib.ExitStack() as context:
            groups = self._iter_dynamic_groups()

            pb = fou.ProgressBar(total=self, progress=progress)
            context.enter_context(pb)
            groups = pb(groups)

            for group in groups:
                yield group

    def _iter_dynamic_groups(self):
        group_expr = self._parse_dynamic_groups()[0]
        for group_value in self.values(foe.ViewExpression(group_expr)):
            yield self.get_dynamic_group(group_value)

    def get_group(self, group_id, group_slices=None):
        """Returns a dict containing the samples for the given group ID.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart-groups")
            view = dataset.select_fields()

            group_id = view.take(1).first().group.id
            group = view.get_group(group_id)

            print(group.keys())
            # ['left', 'right', 'pcd']

        Args:
            group_id: a group ID
            group_slices (None): an optional subset of group slices to load

        Returns:
            a dict mapping group names to
            :class:`fiftyone.core.sample.SampleView` instances

        Raises:
            KeyError: if the group ID is not found
        """
        if self.media_type != fom.GROUP:
            raise ValueError("%s does not contain groups" % type(self))

        if self._is_dynamic_groups:
            raise ValueError(
                "Use get_dynamic_group() to retrieve the samples in dynamic "
                "groups"
            )

        if self.group_field is None:
            raise ValueError("%s has no group field" % type(self))

        group_field = self.group_field
        id_field = group_field + "._id"

        view = self.match(F(id_field) == ObjectId(group_id))

        try:
            groups = view._iter_groups(group_slices=group_slices)
            return next(iter(groups))
        except StopIteration:
            raise KeyError(
                "No group found with ID '%s' in field '%s'"
                % (group_id, group_field)
            )

    def get_dynamic_group(self, group_value):
        """Returns a view containing the samples from a dynamic grouped view
        with the given group value.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("cifar10", split="test")

            view = dataset.take(1000).group_by("ground_truth.label")

            group = view.get_dynamic_group("cat")
            print(len(group))  # 104

        Args:
            group_value: the group value

        Returns:
            a :class:`DatasetView`
        """
        if not self._is_dynamic_groups:
            raise ValueError("%s does not contain dynamic groups" % type(self))

        group_expr, is_id_field, root_view, sort = self._parse_dynamic_groups()

        if isinstance(is_id_field, (list, tuple)):
            group_value = [
                ObjectId(v) if i else v
                for v, i in zip(group_value, is_id_field)
            ]
        elif is_id_field:
            group_value = ObjectId(group_value)

        pipeline = []

        if etau.is_str(group_expr):
            pipeline.append({"$match": {group_expr[1:]: group_value}})
        else:
            pipeline.append(
                {"$match": {"$expr": {"$eq": [group_expr, group_value]}}}
            )

        if sort is not None:
            pipeline.append({"$sort": OrderedDict(sort)})

        if root_view.media_type == fom.GROUP:
            view = root_view.mongo(pipeline, _group_slices=[])
            if self.group_slice != root_view.group_slice:
                view.group_slice = self.group_slice

            return view

        return root_view.mongo(pipeline)

    def get_field_schema(
        self,
        ftype=None,
        embedded_doc_type=None,
        read_only=None,
        info_keys=None,
        created_after=None,
        include_private=False,
        flat=False,
        mode=None,
    ):
        """Returns a schema dictionary describing the fields of the samples in
        the view.

        Args:
            ftype (None): an optional field type or iterable of types to which
                to restrict the returned schema. Must be subclass(es) of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): an optional embedded document type or
                iterable of types to which to restrict the returned schema.
                Must be subclass(es) of
                :class:`fiftyone.core.odm.BaseEmbeddedDocument`
            read_only (None): whether to restrict to (True) or exclude (False)
                read-only fields. By default, all fields are included
            info_keys (None): an optional key or list of keys that must be in
                the field's ``info`` dict
            created_after (None): an optional ``datetime`` specifying a minimum
                creation date
            include_private (False): whether to include fields that start with
                ``_`` in the returned schema
            flat (False): whether to return a flattened schema where all
                embedded document fields are included as top-level keys
            mode (None): whether to apply the above constraints before and/or
                after flattening the schema. Only applicable when ``flat`` is
                True. Supported values are ``("before", "after", "both")``. The
                default is ``"after"``

        Returns:
            a dict mapping field names to :class:`fiftyone.core.fields.Field`
            instances
        """
        schema = self._dataset.get_field_schema(
            include_private=include_private
        )

        schema = self._get_filtered_schema(schema)

        return fof.filter_schema(
            schema,
            ftype=ftype,
            embedded_doc_type=embedded_doc_type,
            read_only=read_only,
            info_keys=info_keys,
            created_after=created_after,
            include_private=include_private,
            flat=flat,
            mode=mode,
        )

    def get_frame_field_schema(
        self,
        ftype=None,
        embedded_doc_type=None,
        read_only=None,
        info_keys=None,
        created_after=None,
        include_private=False,
        flat=False,
        mode=None,
    ):
        """Returns a schema dictionary describing the fields of the frames of
        the samples in the view.

        Only applicable for views that contain videos.

        Args:
            ftype (None): an optional field type or iterable of types to which
                to restrict the returned schema. Must be subclass(es) of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): an optional embedded document type or
                iterable of types to which to restrict the returned schema.
                Must be subclass(es) of
                :class:`fiftyone.core.odm.BaseEmbeddedDocument`
            read_only (None): whether to restrict to (True) or exclude (False)
                read-only fields. By default, all fields are included
            info_keys (None): an optional key or list of keys that must be in
                the field's ``info`` dict
            created_after (None): an optional ``datetime`` specifying a minimum
                creation date
            include_private (False): whether to include fields that start with
                ``_`` in the returned schema
            flat (False): whether to return a flattened schema where all
                embedded document fields are included as top-level keys
            mode (None): whether to apply the above constraints before and/or
                after flattening the schema. Only applicable when ``flat`` is
                True. Supported values are ``("before", "after", "both")``.
                The default is ``"after"``

        Returns:
            a dict mapping field names to :class:`fiftyone.core.fields.Field`
            instances, or ``None`` if the view does not contain videos
        """
        if not self._has_frame_fields():
            return None

        schema = self._dataset.get_frame_field_schema(
            include_private=include_private,
        )

        schema = self._get_filtered_schema(schema, frames=True)

        return fof.filter_schema(
            schema,
            ftype=ftype,
            embedded_doc_type=embedded_doc_type,
            read_only=read_only,
            info_keys=info_keys,
            created_after=created_after,
            include_private=include_private,
            flat=flat,
            mode=mode,
        )

    def clone_sample_field(self, field_name, new_field_name):
        """Clones the given sample field of the view into a new field of the
        dataset.

        You can use dot notation (``embedded.field.name``) to clone embedded
        fields.

        .. note::

            This method is not a :class:`fiftyone.core.stages.ViewStage`;
            it immediately writes the requested changes to the underlying
            dataset.

        .. warning::

            If ``new_field_name`` is an embedded field, be aware that this
            operation will save the entire top-level field of
            ``new_field_name`` after performing the clone, which may result in
            data modification/loss if this view modifies this field in any
            other ways.

        Args:
            field_name: the field name or ``embedded.field.name``
            new_field_name: the new field name or ``embedded.field.name``
        """
        self._dataset._clone_sample_fields(
            {field_name: new_field_name}, view=self
        )

    def clone_sample_fields(self, field_mapping):
        """Clones the given sample fields of the view into new fields of the
        dataset.

        You can use dot notation (``embedded.field.name``) to clone embedded
        fields.

        .. note::

            This method is not a :class:`fiftyone.core.stages.ViewStage`;
            it immediately writes the requested changes to the underlying
            dataset.

        .. warning::

            If any of the new field names to specify are embedded fields, be
            aware that this operation will save the entire top-level new
            fields after performing the clone, which may result in data
            modification/loss if this view modifies these fields in any other
            ways.

        Args:
            field_mapping: a dict mapping field names to new field names into
                which to clone each field
        """
        self._dataset._clone_sample_fields(field_mapping, view=self)

    def clone_frame_field(self, field_name, new_field_name):
        """Clones the frame-level field of the view into a new field.

        You can use dot notation (``embedded.field.name``) to clone embedded
        frame fields.

        Only applicable to views that contain videos.

        .. note::

            This method is not a :class:`fiftyone.core.stages.ViewStage`;
            it immediately writes the requested changes to the underlying
            dataset.

        .. warning::

            If ``new_field_name`` is an embedded field, be aware that this
            operation will save the entire top-level field of
            ``new_field_name`` after performing the clone, which may result in
            data modification/loss if this view modifies this field in any
            other ways.

        Args:
            field_name: the field name or ``embedded.field.name``
            new_field_name: the new field name or ``embedded.field.name``
        """
        self._dataset._clone_frame_fields(
            {field_name: new_field_name}, view=self
        )

    def clone_frame_fields(self, field_mapping):
        """Clones the frame-level fields of the view into new frame-level
        fields of the dataset.

        You can use dot notation (``embedded.field.name``) to clone embedded
        frame fields.

        Only applicable to views that contain videos.

        .. note::

            This method is not a :class:`fiftyone.core.stages.ViewStage`;
            it immediately writes the requested changes to the underlying
            dataset.

        .. warning::

            If any of the new field names to specify are embedded fields, be
            aware that this operation will save the entire top-level new
            fields after performing the clone, which may result in data
            modification/loss if this view modifies these fields in any other
            ways.

        Args:
            field_mapping: a dict mapping field names to new field names into
                which to clone each field
        """
        self._dataset._clone_frame_fields(field_mapping, view=self)

    def clear_sample_field(self, field_name):
        """Clears the values of the field from all samples in the view.

        The field will remain in the dataset's schema, and all samples in the
        view will have the value ``None`` for the field.

        You can use dot notation (``embedded.field.name``) to clear embedded
        fields.

        .. note::

            This method is not a :class:`fiftyone.core.stages.ViewStage`;
            it immediately writes the requested changes to the underlying
            dataset.

        .. warning::

            If the field name you specify is an embedded field, be aware that
            this operation will save the entire top-level field after clearing
            the field, which may result in data modification/loss if this view
            modifies the field in any other ways.

        Args:
            field_name: the field name or ``embedded.field.name``
        """
        self._dataset._clear_sample_fields(field_name, view=self)

    def clear_sample_fields(self, field_names):
        """Clears the values of the fields from all samples in the view.

        The fields will remain in the dataset's schema, and all samples in the
        view will have the value ``None`` for the fields.

        You can use dot notation (``embedded.field.name``) to clear embedded
        fields.

        .. note::

            This method is not a :class:`fiftyone.core.stages.ViewStage`;
            it immediately writes the requested changes to the underlying
            dataset.

        .. warning::

            If any of the field names you specify are embedded fields, be aware
            that this operation will save the entire top-level field after
            clearing the fields, which may result in data modification/loss if
            this view modifies these fields in any other ways.

        Args:
            field_names: the field name or iterable of field names
        """
        self._dataset._clear_sample_fields(field_names, view=self)

    def clear_frame_field(self, field_name):
        """Clears the values of the frame-level field from all samples in the
        view.

        The field will remain in the dataset's frame schema, and all frames in
        the view will have the value ``None`` for the field.

        You can use dot notation (``embedded.field.name``) to clear embedded
        frame fields.

        Only applicable to views that contain videos.

        .. note::

            This method is not a :class:`fiftyone.core.stages.ViewStage`;
            it immediately writes the requested changes to the underlying
            dataset.

        .. warning::

            If the field name you specify is an embedded field, be aware that
            this operation will save the entire top-level field after clearing
            the field, which may result in data modification/loss if this view
            modifies the field in any other ways.

        Args:
            field_name: the field name or ``embedded.field.name``
        """
        self._dataset._clear_frame_fields(field_name, view=self)

    def clear_frame_fields(self, field_names):
        """Clears the values of the frame-level fields from all samples in the
        view.

        The fields will remain in the dataset's frame schema, and all frames in
        the view will have the value ``None`` for the fields.

        You can use dot notation (``embedded.field.name``) to clear embedded
        frame fields.

        Only applicable to views that contain videos.

        .. note::

            This method is not a :class:`fiftyone.core.stages.ViewStage`;
            it immediately writes the requested changes to the underlying
            dataset.

        .. warning::

            If any of the field names you specify are embedded fields, be aware
            that this operation will save the entire top-level field after
            clearing the fields, which may result in data modification/loss if
            this view modifies these fields in any other ways.

        Args:
            field_names: the field name or iterable of field names
        """
        self._dataset._clear_frame_fields(field_names, view=self)

    def clear(self):
        """Deletes all samples in the view from the underlying dataset.

        .. note::

            This method is not a :class:`fiftyone.core.stages.ViewStage`;
            it immediately writes the requested changes to the underlying
            dataset.
        """
        self._dataset._clear(view=self)

    def clear_frames(self):
        """Deletes all frame labels from the samples in the view from the
        underlying dataset.

        .. note::

            This method is not a :class:`fiftyone.core.stages.ViewStage`;
            it immediately writes the requested changes to the underlying
            dataset.
        """
        self._dataset._clear_frames(view=self)

    def keep(self):
        """Deletes all samples that are **not** in the view from the underlying
        dataset.

        .. note::

            This method is not a :class:`fiftyone.core.stages.ViewStage`;
            it immediately writes the requested changes to the underlying
            dataset.
        """
        self._dataset._keep(view=self)

    def keep_fields(self):
        """Deletes all fields that are excluded from the view from the
        underlying dataset.

        .. note::

            This method is not a :class:`fiftyone.core.stages.ViewStage`;
            it immediately writes the requested changes to the underlying
            dataset.
        """
        self._dataset._keep_fields(view=self)

    def keep_frames(self):
        """For each sample in the view, deletes all frames labels that are
        **not** in the view from the underlying dataset.

        .. note::

            This method is not a :class:`fiftyone.core.stages.ViewStage`;
            it immediately writes the requested changes to the underlying
            dataset.
        """
        self._dataset._keep_frames(view=self)

    def ensure_frames(self):
        """Ensures that the video view contains frame instances for every frame
        of each sample's source video.

        Empty frames will be inserted for missing frames, and already existing
        frames are left unchanged.

        .. note::

            This method is not a :class:`fiftyone.core.stages.ViewStage`;
            it immediately writes the requested changes to the underlying
            dataset.
        """
        self._dataset._ensure_frames(view=self)

    def save(self, fields=None):
        """Saves the contents of the view to the database.

        This method **does not** delete samples or frames from the underlying
        dataset that this view excludes.

        .. note::

            This method is not a :class:`fiftyone.core.stages.ViewStage`;
            it immediately writes the requested changes to the underlying
            dataset.

        .. warning::

            If a view has excluded fields or filtered list values, this method
            will permanently delete this data from the dataset, unless
            ``fields`` is used to omit such fields from the save.

        Args:
            fields (None): an optional field or iterable of fields to save. If
                specified, only these field's contents are modified
        """
        self._dataset._save(view=self, fields=fields)

    def clone(self, name=None, persistent=False):
        """Creates a new dataset containing a copy of the contents of the view.

        Dataset clones contain deep copies of all samples and dataset-level
        information in the source collection. The source *media files*,
        however, are not copied.

        Args:
            name (None): a name for the cloned dataset. By default,
                :func:`get_default_dataset_name` is used
            persistent (False): whether the cloned dataset should be persistent

        Returns:
            the new :class:`fiftyone.core.dataset.Dataset`
        """
        return self._dataset._clone(
            name=name,
            persistent=persistent,
            view=self,
        )

    def reload(self):
        """Reloads the view.

        Note that :class:`fiftyone.core.sample.SampleView` instances are not
        singletons, so any in-memory samples extracted from this view will not
        be updated by calling this method.
        """
        self._dataset.reload()

        _view = self._base_view
        for stage in self._stages:
            _view = _view.add_stage(stage)

        for name in ("_make_sample_fcn", "_make_frame_fcn"):
            if hasattr(self, name):
                delattr(self, name)

    def to_dict(
        self,
        rel_dir=None,
        include_private=False,
        include_frames=False,
        frame_labels_dir=None,
        pretty_print=False,
    ):
        """Returns a JSON dictionary representation of the view.

        Args:
            rel_dir (None): a relative directory to remove from the
                ``filepath`` of each sample, if possible. The path is converted
                to an absolute path (if necessary) via
                :func:`fiftyone.core.storage.normalize_path`. The typical use
                case for this argument is that your source data lives in a
                single directory and you wish to serialize relative, rather
                than absolute, paths to the data within that directory
            include_private (False): whether to include private fields
            include_frames (False): whether to include the frame labels for
                video samples
            frame_labels_dir (None): a directory in which to write per-sample
                JSON files containing the frame labels for video samples. If
                omitted, frame labels will be included directly in the returned
                JSON dict (which can be quite quite large for video datasets
                containing many frames). Only applicable to datasets that
                contain videos when ``include_frames`` is True
            pretty_print (False): whether to render frame labels JSON in human
                readable format with newlines and indentations. Only applicable
                to datasets that contain videos when a ``frame_labels_dir`` is
                provided

        Returns:
            a JSON dict
        """
        d = super().to_dict(
            rel_dir=rel_dir,
            include_private=include_private,
            include_frames=include_frames,
            frame_labels_dir=frame_labels_dir,
            pretty_print=pretty_print,
        )
        samples = d.pop("samples")  # hack so that `samples` is last in JSON
        d["stages"] = self._serialize(include_uuids=False)
        d["samples"] = samples
        return d

    def _needs_frames(self):
        dataset = self._dataset

        if not dataset._has_frame_fields():
            return False

        for stage in self._stages:
            if stage._needs_frames(dataset):
                return True

        return False

    def _outputs_dynamic_groups(self):
        value = False

        for stage in self._stages:
            _value = stage.outputs_dynamic_groups
            if _value is not None:
                value = _value

        return value

    def _parse_dynamic_groups(self):
        try:
            # Find last dynamic group stage
            bb = [stage.outputs_dynamic_groups for stage in self._stages]
            idx = next(i for i in reversed(range(len(bb))) if bb[i] is True)
        except StopIteration:
            raise ValueError("%s does not contain dynamic groups" % type(self))

        view = self._base_view
        for stage in self._stages[:idx]:
            view = view._add_view_stage(stage, validate=False)

        stage = self._stages[idx]
        group_expr, is_id_field = stage.get_group_expr(view)
        order_by = stage.order_by
        reverse = stage.reverse

        if order_by is not None:
            sort = []
            if etau.is_str(group_expr):
                sort.append((group_expr[1:], 1))

            order = -1 if reverse else 1
            sort.append((order_by, order))
        else:
            sort = None

        return group_expr, is_id_field, view, sort

    def _dynamic_groups_pipeline(self, group_value=None, group_pipeline=None):
        group_expr, _, root_view, sort = self._parse_dynamic_groups()

        # Extracts samples for the current group as emitted just *before* the
        # dynamic grouping stage in the view
        lookup_pipeline = root_view._pipeline(detach_frames=True)
        lookup_pipeline.append(
            {"$match": {"$expr": {"$eq": ["$$group_expr", group_expr]}}}
        )

        if sort is not None:
            lookup_pipeline.append({"$sort": OrderedDict(sort)})

        if group_pipeline is not None:
            lookup_pipeline.extend(group_pipeline)

        pipeline = [
            {"$project": {"_group_expr": group_expr}},
            {
                "$lookup": {
                    "from": self._dataset._sample_collection_name,
                    "let": {"group_expr": "$_group_expr"},
                    "pipeline": lookup_pipeline,
                    "as": "groups",
                }
            },
            {"$unwind": "$groups"},
            {"$replaceRoot": {"newRoot": "$groups"}},
        ]

        return pipeline

    def _pipeline(
        self,
        pipeline=None,
        media_type=None,
        attach_frames=False,
        detach_frames=False,
        frames_only=False,
        support=None,
        group_slice=None,
        group_slices=None,
        detach_groups=False,
        groups_only=False,
        manual_group_select=False,
        post_pipeline=None,
    ):
        _pipelines = []
        _view = self._base_view

        _contains_videos = self._dataset._contains_videos(any_slice=True)
        _found_select_group_slice = False
        _attach_frames_idx = None
        _attach_frames_idx0 = None
        _attach_frames_idx1 = None

        _contains_groups = self._dataset.media_type == fom.GROUP
        _group_slices = set()
        _attach_groups_idx = None

        if not _contains_videos:
            attach_frames = False
            detach_frames = False
            frames_only = False

        idx = 0
        for stage in self._stages:
            if isinstance(stage, fost.SelectGroupSlices):
                # We might need to reattach frames after `SelectGroupSlices`,
                # since it involves a `$lookup` that resets the samples
                _found_select_group_slice = True
                _attach_frames_idx0 = _attach_frames_idx
                _attach_frames_idx = None

            # Determine if stage needs frames attached
            if (
                _contains_videos
                and _attach_frames_idx is None
                and stage._needs_frames(_view)
            ):
                _attach_frames_idx = idx

            if _contains_groups:
                # Special case: report a manual override if the first stage
                # transforms a grouped collection into a non-grouped collection
                if idx == 0:
                    _media_type = stage.get_media_type(_view)
                    if _media_type not in (None, fom.GROUP):
                        manual_group_select = True

                # Determine if stage needs group slices attached
                _stage_group_slices = stage._needs_group_slices(_view)
                if _stage_group_slices:
                    if _attach_groups_idx is None:
                        _attach_groups_idx = idx

                    _group_slices.update(_stage_group_slices)

            _pipeline = stage.to_mongo(_view)

            # @note(SelectGroupSlices)
            # Special case: when selecting group slices of a video dataset that
            # modifies the dataset's schema, frame lookups must be injected in
            # the middle of the stage's pipeline, after the group slice $lookup
            # but *before* the $project stage(s) that reapply schema changes
            if (
                isinstance(stage, fost.SelectGroupSlices)
                and _contains_videos
                and _pipeline
                and "$project" in _pipeline[-1]
            ):
                _pipeline0 = _pipeline
                _pipeline = []
                while _pipeline0 and "$project" in _pipeline0[-1]:
                    _pipeline.insert(0, _pipeline0.pop())

                idx += 1
                _attach_frames_idx1 = idx
                _pipelines.append(_pipeline0)

            _pipelines.append(_pipeline)
            _view = _view._add_view_stage(stage, validate=False)
            idx += 1

        if _attach_frames_idx is None and (attach_frames or frames_only):
            _attach_frames_idx = len(_pipelines)

        #######################################################################
        # Insert frame lookup pipeline(s) if needed
        #######################################################################

        if _attach_frames_idx1 is not None and _attach_frames_idx is not None:
            _attach_frames_idx = _attach_frames_idx1

        if _attach_frames_idx0 is not None and _attach_frames_idx is not None:
            # Two lookups are required; manually do the **last** one and rely
            # on dataset._pipeline() to do the first one
            attach_frames = True
            _pipeline = self._dataset._attach_frames_pipeline(support=support)
            _pipelines.insert(_attach_frames_idx, _pipeline)
        elif _found_select_group_slice and _attach_frames_idx is not None:
            # Must manually attach frames after the group selection
            attach_frames = None  # special syntax: frames already attached
            _pipeline = self._dataset._attach_frames_pipeline(support=support)
            _pipelines.insert(_attach_frames_idx, _pipeline)
        elif _attach_frames_idx0 is not None or _attach_frames_idx is not None:
            # Exactly one lookup is required; rely on dataset._pipeline() to
            # do it
            attach_frames = True

        # @todo use the optimization below instead, which injects frames as
        # late as possible in the pipeline. We can't currently use it because
        # there's some issue with poster frames in the App if the frames are
        # not attached first...

        """
        if _attach_frames_idx0 is not None or _attach_frames_idx is not None:
            attach_frames = None  # special syntax: frames already attached

            if _attach_frames_idx0 is not None:
                _pipeline = self._dataset._attach_frames_pipeline(
                    support=support
                )
                _pipelines.insert(_attach_frames_idx0, _pipeline)

            if _attach_frames_idx is not None:
                if _attach_frames_idx0 is not None:
                    _attach_frames_idx += 1

                _pipeline = self._dataset._attach_frames_pipeline(
                    support=support
                )
                _pipelines.insert(_attach_frames_idx, _pipeline)
        """

        #######################################################################

        # Insert group lookup pipeline if needed
        if _attach_groups_idx is not None:
            _pipeline = self._dataset._attach_groups_pipeline(
                group_slices=_group_slices
            )
            _pipelines.insert(_attach_groups_idx, _pipeline)

        if pipeline is not None:
            _pipelines.append(pipeline)

        _pipeline = list(itertools.chain.from_iterable(_pipelines))

        if media_type is None and not self._is_dynamic_groups:
            media_type = self.media_type

        if group_slice is None and self._dataset.media_type == fom.GROUP:
            group_slice = self.__group_slice or self._dataset.group_slice

        return self._dataset._pipeline(
            pipeline=_pipeline,
            media_type=media_type,
            attach_frames=attach_frames,
            detach_frames=detach_frames,
            frames_only=frames_only,
            support=support,
            group_slice=group_slice,
            group_slices=group_slices,
            detach_groups=detach_groups,
            groups_only=groups_only,
            manual_group_select=manual_group_select,
            post_pipeline=post_pipeline,
        )

    def _aggregate(
        self,
        pipeline=None,
        media_type=None,
        attach_frames=False,
        detach_frames=False,
        frames_only=False,
        support=None,
        group_slice=None,
        group_slices=None,
        detach_groups=False,
        groups_only=False,
        manual_group_select=False,
        post_pipeline=None,
    ):
        _pipeline = self._pipeline(
            pipeline=pipeline,
            media_type=media_type,
            attach_frames=attach_frames,
            detach_frames=detach_frames,
            frames_only=frames_only,
            support=support,
            group_slice=group_slice,
            group_slices=group_slices,
            detach_groups=detach_groups,
            groups_only=groups_only,
            manual_group_select=manual_group_select,
            post_pipeline=post_pipeline,
        )

        return foo.aggregate(self._dataset._sample_collection, _pipeline)

    def _serialize(self, include_uuids=True):
        return [
            stage._serialize(include_uuid=include_uuids)
            for stage in self._all_stages
        ]

    @staticmethod
    def _build(dataset, stage_dicts):
        view = dataset.view()
        for stage_dict in stage_dicts:
            stage = fost.ViewStage._from_dict(stage_dict)
            view = view.add_stage(stage)

        return view

    def _slice(self, s):
        if s.step is not None and s.step != 1:
            raise ValueError(
                "Unsupported slice '%s'; step is not supported" % s
            )

        _len = None

        start = s.start
        if start is not None:
            if start < 0:
                _len = len(self)
                start += _len

            if start <= 0:
                start = None

        stop = s.stop
        if stop is not None and stop < 0:
            if _len is None:
                _len = len(self)

            stop += _len

        if start is None:
            if stop is None:
                return self

            return self.limit(stop)

        if stop is None:
            return self.skip(start)

        return self.skip(start).limit(stop - start)

    def _add_view_stage(self, stage, validate=True):
        if validate:
            stage.validate(self)

        if stage.has_view:
            view = stage.load_view(self)
        else:
            view = copy(self)
            view._stages.append(stage)

            media_type = stage.get_media_type(self)
            if media_type is not None:
                view._set_media_type(media_type)

        view._set_name(None)

        return view

    def _set_media_type(self, media_type):
        self.__media_type = media_type

    def _set_name(self, name):
        self.__name = name

    def _get_filtered_schema(self, schema, frames=False):
        if schema is None:
            return None

        selected_fields, excluded_fields = self._get_selected_excluded_fields(
            frames=frames
        )

        if selected_fields is not None or excluded_fields is not None:
            _filter_schema(schema, selected_fields, excluded_fields)

        return schema

    def _get_selected_excluded_fields(self, frames=False, roots_only=False):
        selected_fields = None
        excluded_fields = None

        _view = self._base_view
        for stage in self._stages:
            sf = stage.get_selected_fields(_view, frames=frames)
            if sf:
                if roots_only:
                    sf = {f.split(".", 1)[0] for f in sf}

                if selected_fields is None:
                    selected_fields = set(sf)
                else:
                    _merge_selected_fields(selected_fields, sf)

            ef = stage.get_excluded_fields(_view, frames=frames)
            if ef:
                if roots_only:
                    ef = {f for f in ef if "." not in f}

                if excluded_fields is None:
                    excluded_fields = set(ef)
                else:
                    excluded_fields.update(ef)

            _view = _view._add_view_stage(stage, validate=False)

        if (
            roots_only
            and selected_fields is not None
            and excluded_fields is not None
        ):
            selected_fields.difference_update(excluded_fields)
            excluded_fields = None

        return selected_fields, excluded_fields

    def _get_edited_fields(self, frames=False):
        edited_fields = None

        _view = self._base_view
        for stage in self._stages:
            ef = stage.get_edited_fields(_view, frames=frames)
            if ef:
                if edited_fields is None:
                    edited_fields = set(ef)
                else:
                    edited_fields.update(ef)

            _view = _view._add_view_stage(stage, validate=False)

        return edited_fields

    def _get_filtered_fields(self, frames=False):
        filtered_fields = None

        _view = self._base_view
        for stage in self._stages:
            ff = stage.get_filtered_fields(_view, frames=frames)
            if ff:
                if filtered_fields is None:
                    filtered_fields = set(ff)
                else:
                    filtered_fields.update(ff)

            _view = _view._add_view_stage(stage, validate=False)

        return filtered_fields

    def _get_missing_fields(self, frames=False):
        if frames:
            if not self._has_frame_fields():
                return None

            dataset_schema = self._dataset.get_frame_field_schema(flat=True)
            view_schema = self.get_frame_field_schema(flat=True)
        else:
            dataset_schema = self._dataset.get_field_schema(flat=True)
            view_schema = self.get_field_schema(flat=True)

        missing_fields = set(dataset_schema.keys()) - set(view_schema.keys())
        _discard_nested_leafs(missing_fields)

        return missing_fields

    def _get_group_media_types(self):
        for stage in reversed(self._stages):
            if isinstance(stage, fost.SelectGroupSlices):
                return stage._get_group_media_types(self._dataset)

        return self._dataset.group_media_types


def make_optimized_select_view(
    sample_collection,
    sample_ids,
    ordered=False,
    groups=False,
    flatten=False,
):
    """Returns a view that selects the provided sample IDs that is optimized
    to reduce the document list as early as possible in the pipeline.

    .. warning::

        This method **deletes** any other view stages that reorder/select
        documents, so the returned view may not respect the order of the
        documents in the input collection.

    Args:
        sample_collection:  a
            :class:`fiftyone.core.collections.SampleCollection`
        sample_ids: a sample ID or iterable of sample IDs to select
        ordered (False): whether to sort the samples in the returned view to
            match the order of the provided IDs
        groups (False): whether the IDs are group IDs, not sample IDs
        flatten (False): whether to flatten group datasets before selecting
            sample ids

    Returns:
        a :class:`DatasetView`
    """
    in_view = sample_collection.view()
    stages = in_view._stages

    if any(isinstance(stage, fost.Mongo) for stage in stages):
        # We have no way of knowing what a `Mongo()` stage might do, so we must
        # run the entire view's aggregation first and then select the samples
        # of interest at the end
        view = in_view
        stages = []
    else:
        view = in_view._base_view

    if groups:
        view = view.select_groups(sample_ids, ordered=ordered)
    else:
        if view.media_type == fom.GROUP and view.group_slices and flatten:
            view = view.select_group_slices(_allow_mixed=True)
        else:
            for stage in stages:
                if type(stage) in fost._STAGES_THAT_SELECT_FIRST:
                    view = view._add_view_stage(stage, validate=False)

        view = view.select(sample_ids, ordered=ordered)

    #
    # Selecting the samples of interest first can be significantly faster than
    # running the entire aggregation and then selecting them.
    #
    # However, in order to do that, we must omit any `Skip()` stages, which
    # depend on the number of documents in the pipeline.
    #
    # In addition, we take the liberty of omitting other stages that are known
    # to only select/reorder documents.
    #
    # @note this is brittle because if any new stages like `Skip()` are added
    # that could affect our ability to select the samples of interest first,
    # we'll need to account for that here...
    #

    for stage in stages:
        if type(stage) not in fost._STAGES_THAT_SELECT_OR_REORDER:
            view = view._add_view_stage(stage, validate=False)

    return view


def _merge_selected_fields(selected_fields, sf):
    #
    # When merging selected fields from multiple view stages, it is possible
    # that one stage selects nested fields within a root field that has been
    # previously selected. In this case, the correct behavior is that the
    # merged list contains the nested fields but *not* the root fields.
    #
    # https://docs.mongodb.com/manual/reference/operator/aggregation/project/#path-collision-errors-in-embedded-fields
    #
    nested_fields = set()
    for f in sf:
        if any(f.startswith(field + ".") for field in selected_fields):
            nested_fields.add(f)

    selected_fields.update(nested_fields)
    selected_fields.intersection_update(sf)


def _filter_schema(schema, selected_fields, excluded_fields):
    selected_fields, roots1 = _parse_selected_fields(selected_fields)
    excluded_fields, roots2 = _parse_excluded_fields(excluded_fields)
    filtered_roots = roots1 | roots2

    # Explicitly include roots of any embedded fields that have been selected
    if roots1:
        selected_fields[""].update(roots1)

    # Copy any top-level fields whose embedded fields will be filtered
    if filtered_roots:
        for name in tuple(schema.keys()):
            if name in filtered_roots:
                schema[name] = schema[name].copy()

    sf = selected_fields.get("", None)
    ef = excluded_fields.get("", None)

    if sf is not None:
        for name in tuple(schema.keys()):
            if name not in sf:
                del schema[name]

    if ef is not None:
        for name in tuple(schema.keys()):
            if name in ef:
                del schema[name]

    if filtered_roots:
        for name, field in schema.items():
            _filter_embedded_field_schema(
                field, name, selected_fields, excluded_fields
            )


def _parse_selected_fields(paths):
    d = defaultdict(set)
    r = set()

    if paths is not None:
        for path in paths:
            if "." in path:
                chunks = path.split(".")
                root = chunks[0]
                r.add(root)

                for i in range(1, len(chunks)):
                    base = ".".join(chunks[:i])
                    leaf = chunks[i]
                    d[base].add(leaf)
            else:
                d[""].add(path)

    return d, r


def _parse_excluded_fields(paths):
    d = defaultdict(set)
    r = set()

    if paths is not None:
        for path in paths:
            if "." in path:
                root = path.split(".", 1)[0]
                r.add(root)

                base, leaf = path.rsplit(".", 1)
                d[base].add(leaf)
            else:
                d[""].add(path)

    return d, r


def _filter_embedded_field_schema(
    field, path, selected_fields, excluded_fields
):
    while isinstance(field, fof.ListField):
        field = field.field

    if not isinstance(field, fof.EmbeddedDocumentField):
        return

    sf = selected_fields.get(path, None)
    ef = excluded_fields.get(path, None)

    if sf is not None or ef is not None:
        field._use_view(selected_fields=sf, excluded_fields=ef)

    for name, _field in field._fields.items():
        _path = path + "." + name
        _filter_embedded_field_schema(
            _field, _path, selected_fields, excluded_fields
        )


def _discard_nested_leafs(paths):
    discard = set()

    for path in paths:
        chunks = path.split(".")
        for i in range(1, len(chunks)):
            root = ".".join(chunks[:i])
            if root in paths:
                discard.add(path)

    for path in discard:
        paths.discard(path)
