"""
Dataset views.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import OrderedDict
from copy import copy, deepcopy
import numbers

from bson import ObjectId
from pymongo.errors import CursorNotFound

import eta.core.utils as etau

import fiftyone.core.aggregations as foa
import fiftyone.core.collections as foc
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

    def __init__(self, dataset, _stages=None):
        if _stages is None:
            _stages = []

        self.__dataset = dataset
        self.__stages = _stages

    def __eq__(self, other_view):
        if type(other_view) != type(self):
            return False

        # Two views into the same dataset are equal if their stage definitions
        # are equal, excluding their UUIDs
        d = self._serialize(include_uuids=False)
        other_d = other_view._serialize(include_uuids=False)
        return d == other_d

    def __len__(self):
        return self.count()

    def __getitem__(self, id_filepath_slice):
        if isinstance(id_filepath_slice, numbers.Integral):
            raise KeyError(
                "Accessing samples by numeric index is not supported. "
                "Use sample IDs, filepaths, or slices"
            )

        if isinstance(id_filepath_slice, slice):
            return self._slice(id_filepath_slice)

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
        return self.__class__(self.__dataset, _stages=deepcopy(self.__stages))

    @property
    def _base_view(self):
        return self.__class__(self.__dataset)

    @property
    def _dataset(self):
        return self.__dataset

    @property
    def _root_dataset(self):
        return self.__dataset

    @property
    def _is_patches(self):
        return self._dataset._is_patches

    @property
    def _is_frames(self):
        return self._dataset._is_frames

    @property
    def _sample_cls(self):
        return fos.SampleView

    @property
    def _stages(self):
        return self.__stages

    @property
    def _all_stages(self):
        return self.__stages

    @property
    def media_type(self):
        """The media type of the underlying dataset."""
        return self._dataset.media_type

    @property
    def name(self):
        """The name of the view."""
        return self.dataset_name + "-view"

    @property
    def dataset_name(self):
        """The name of the underlying dataset."""
        return self._root_dataset.name

    @property
    def info(self):
        return self._root_dataset.info

    @info.setter
    def info(self, info):
        self._root_dataset.info = info

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

    def summary(self):
        """Returns a string summary of the view.

        Returns:
            a string summary
        """
        aggs = self.aggregate([foa.Count(), foa.Distinct("tags")])
        elements = [
            ("Dataset:", self.dataset_name),
            ("Media type:", self.media_type),
            ("Num %s:" % self._elements_str, aggs[0]),
            ("Tags:", aggs[1]),
        ]

        elements = fou.justify_headings(elements)
        lines = ["%s %s" % tuple(e) for e in elements]

        lines.extend(
            [
                "%s fields:" % self._element_str.capitalize(),
                self._to_fields_str(self.get_field_schema()),
            ]
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

    def iter_samples(self, progress=False):
        """Returns an iterator over the samples in the view.

        Args:
            progress (False): whether to render a progress bar tracking the
                iterator's progress

        Returns:
            an iterator over :class:`fiftyone.core.sample.SampleView` instances
        """
        if progress:
            with fou.ProgressBar(total=len(self)) as pb:
                for sample in pb(self._iter_samples()):
                    yield sample
        else:
            for sample in self._iter_samples():
                yield sample

    def _iter_samples(self):
        sample_cls = self._sample_cls
        selected_fields, excluded_fields = self._get_selected_excluded_fields()
        filtered_fields = self._get_filtered_fields()

        index = 0

        try:
            for d in self._aggregate(detach_frames=True):
                try:
                    doc = self._dataset._sample_dict_to_doc(d)
                    sample = sample_cls(
                        doc,
                        self,
                        selected_fields=selected_fields,
                        excluded_fields=excluded_fields,
                        filtered_fields=filtered_fields,
                    )
                    index += 1
                    yield sample

                except Exception as e:
                    raise ValueError(
                        "Failed to load sample from the database. This is "
                        "likely due to an invalid stage in the DatasetView"
                    ) from e

        except CursorNotFound:
            # The cursor has timed out so we yield from a new one after
            # skipping to the last offset

            view = self.skip(index)
            for sample in view.iter_samples():
                yield sample

    def get_field_schema(
        self, ftype=None, embedded_doc_type=None, include_private=False
    ):
        """Returns a schema dictionary describing the fields of the samples in
        the view.

        Args:
            ftype (None): an optional field type to which to restrict the
                returned schema. Must be a subclass of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): an optional embedded document type to
                which to restrict the returned schema. Must be a subclass of
                :class:`fiftyone.core.odm.BaseEmbeddedDocument`
            include_private (False): whether to include fields that start with
                ``_`` in the returned schema

        Returns:
             an ``OrderedDict`` mapping field names to field types
        """
        field_schema = self._dataset.get_field_schema(
            ftype=ftype,
            embedded_doc_type=embedded_doc_type,
            include_private=include_private,
        )

        return self._get_filtered_schema(field_schema)

    def get_frame_field_schema(
        self, ftype=None, embedded_doc_type=None, include_private=False
    ):
        """Returns a schema dictionary describing the fields of the frames of
        the samples in the view.

        Only applicable for video datasets.

        Args:
            ftype (None): an optional field type to which to restrict the
                returned schema. Must be a subclass of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): an optional embedded document type to
                which to restrict the returned schema. Must be a subclass of
                :class:`fiftyone.core.odm.BaseEmbeddedDocument`
            include_private (False): whether to include fields that start with
                ``_`` in the returned schema

        Returns:
            a dictionary mapping field names to field types, or ``None`` if
            the dataset is not a video dataset
        """
        field_schema = self._dataset.get_frame_field_schema(
            ftype=ftype,
            embedded_doc_type=embedded_doc_type,
            include_private=include_private,
        )

        return self._get_filtered_schema(field_schema, frames=True)

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

        Only applicable to video datasets.

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

        Only applicable to video datasets.

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

        Only applicable to video datasets.

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

        Only applicable to video datasets.

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
        """Removes all samples in the view from the underlying dataset."""
        self._dataset._clear(view=self)

    def clear_frames(self):
        """Removes all frame labels from the samples in the view."""
        self._dataset._clear_frames(view=self)

    def ensure_frames(self):
        """Ensures that the video view contains frame instances for every frame
        of each sample's source video.

        Empty frames will be inserted for missing frames, and already existing
        frames are left unchanged.
        """
        self._dataset._ensure_frames(view=self)

    def save(self, fields=None):
        """Overwrites the underlying dataset with the contents of the view.

        .. warning::

            This will permanently delete any omitted, filtered, or otherwise
            modified contents of the dataset.

        Args:
            fields (None): an optional field or list of fields to save. If
                specified, only these fields are overwritten
        """
        if etau.is_str(fields):
            fields = [fields]

        self._dataset._save(view=self, fields=fields)

    def clone(self, name=None):
        """Creates a new dataset containing only the contents of the view.

        Args:
            name (None): a name for the cloned dataset. By default,
                :func:`get_default_dataset_name` is used

        Returns:
            the new :class:`Dataset`
        """
        return self._dataset._clone(name=name, view=self)

    def reload(self):
        """Reloads the underlying dataset from the database.

        Note that :class:`fiftyone.core.sample.SampleView` instances are not
        singletons, so any in-memory samples extracted from this view will not
        be updated by calling this method.
        """
        self._dataset.reload()

    def to_dict(self, rel_dir=None, frame_labels_dir=None, pretty_print=False):
        """Returns a JSON dictionary representation of the view.

        Args:
            rel_dir (None): a relative directory to remove from the
                ``filepath`` of each sample, if possible. The path is converted
                to an absolute path (if necessary) via
                ``os.path.abspath(os.path.expanduser(rel_dir))``. The typical
                use case for this argument is that your source data lives in
                a single directory and you wish to serialize relative, rather
                than absolute, paths to the data within that directory
            frame_labels_dir (None): a directory in which to write per-sample
                JSON files containing the frame labels for video samples. If
                omitted, frame labels will be included directly in the returned
                JSON dict (which can be quite quite large for video datasets
                containing many frames). Only applicable to video datasets
            pretty_print (False): whether to render frame labels JSON in human
                readable format with newlines and indentations. Only applicable
                to video datasets when a ``frame_labels_dir`` is provided

        Returns:
            a JSON dict
        """
        d = super().to_dict(
            rel_dir=rel_dir,
            frame_labels_dir=frame_labels_dir,
            pretty_print=pretty_print,
        )
        samples = d.pop("samples")  # hack so that `samples` is last in JSON
        d["stages"] = self._serialize(include_uuids=False)
        d["samples"] = samples
        return d

    def _needs_frames(self):
        if self.media_type != fom.VIDEO:
            return False

        for stage in self._stages:
            if stage._needs_frames(self):
                return True

        return False

    def _pipeline(
        self,
        pipeline=None,
        attach_frames=False,
        detach_frames=False,
        frames_only=False,
    ):
        _pipeline = []
        _view = self._base_view
        for stage in self._stages:
            _pipeline.extend(stage.to_mongo(_view))
            _view._stages.append(stage)

        if pipeline is not None:
            _pipeline.extend(pipeline)

        attach_frames |= self._needs_frames()

        return self._dataset._pipeline(
            pipeline=_pipeline,
            attach_frames=attach_frames,
            detach_frames=detach_frames,
            frames_only=frames_only,
        )

    def _aggregate(
        self,
        pipeline=None,
        attach_frames=False,
        detach_frames=False,
        frames_only=False,
    ):
        _pipeline = self._pipeline(
            pipeline=pipeline,
            attach_frames=attach_frames,
            detach_frames=detach_frames,
            frames_only=frames_only,
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

    def _add_view_stage(self, stage):
        stage.validate(self)

        if stage.has_view:
            view = stage.load_view(self)
        else:
            view = copy(self)
            view._stages.append(stage)

        return view

    def _get_filtered_schema(self, schema, frames=False):
        if schema is None:
            return None

        selected_fields, excluded_fields = self._get_selected_excluded_fields(
            frames=frames
        )
        if selected_fields is not None:
            schema = OrderedDict(
                {fn: f for fn, f in schema.items() if fn in selected_fields}
            )

        if excluded_fields is not None:
            schema = OrderedDict(
                {
                    fn: f
                    for fn, f in schema.items()
                    if fn not in excluded_fields
                }
            )

        return schema

    def _get_selected_excluded_fields(self, frames=False):
        selected_fields = None
        excluded_fields = set()

        for stage in self._stages:
            _selected_fields = stage.get_selected_fields(self, frames=frames)
            if _selected_fields:
                if selected_fields is None:
                    selected_fields = set(_selected_fields)
                else:
                    selected_fields.intersection_update(_selected_fields)

            _excluded_fields = stage.get_excluded_fields(self, frames=frames)
            if _excluded_fields:
                excluded_fields.update(_excluded_fields)

        if selected_fields is not None:
            selected_fields.difference_update(excluded_fields)
            excluded_fields = None

        return selected_fields, excluded_fields

    def _get_filtered_fields(self, frames=False):
        filtered_fields = set()
        for stage in self._stages:
            _filtered_fields = stage.get_filtered_fields(self, frames=frames)
            if _filtered_fields:
                filtered_fields.update(_filtered_fields)

        return filtered_fields

    def _get_missing_fields(self, frames=False):
        if frames:
            dataset_schema = self._dataset.get_frame_field_schema()
            view_schema = self.get_frame_field_schema()
        else:
            dataset_schema = self._dataset.get_field_schema()
            view_schema = self.get_field_schema()

        return set(dataset_schema.keys()) - set(view_schema.keys())

    def _contains_all_fields(self, frames=False):
        selected_fields, excluded_fields = self._get_selected_excluded_fields(
            frames=frames
        )
        filtered_fields = self._get_filtered_fields(frames=frames)
        return not any((selected_fields, excluded_fields, filtered_fields))


def make_optimized_select_view(sample_collection, sample_ids, ordered=False):
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

    Returns:
        a :class:`DatasetView`
    """
    view = sample_collection.view()

    if any(isinstance(stage, fost.Mongo) for stage in view._stages):
        #
        # We have no way of knowing what a `Mongo()` stage might do, so we must
        # run the entire view's aggregation first and then select the samples
        # of interest at the end
        #
        return view.select(sample_ids, ordered=ordered)

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
    optimized_view = view._dataset.select(sample_ids, ordered=ordered)
    for stage in view._stages:
        if type(stage) not in fost._STAGES_THAT_SELECT_OR_REORDER:
            optimized_view._stages.append(stage)

    return optimized_view
