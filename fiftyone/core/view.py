"""
Dataset views.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import OrderedDict
from copy import copy, deepcopy
import numbers

from bson import ObjectId

import fiftyone.core.aggregations as foa
import fiftyone.core.collections as foc
import fiftyone.core.media as fom
import fiftyone.core.sample as fos


class DatasetView(foc.SampleCollection):
    """A view into a :class:`fiftyone.core.dataset.Dataset`.

    Dataset views represent ordered collections of subsets of samples in a
    dataset.

    Operations on dataset views are designed to be chained together to yield
    the desired subset of the dataset, which is then iterated over to directly
    access the sample views. Each stage in the pipeline defining a dataset view
    is represented by a :class:`fiftyone.core.stages.ViewStage` instance.

    The stages of a dataset view specify:

    -   what subset of samples (and their order) should be included
    -   what "parts" (fields and their elements) of the sample should be
        included

    Samples retrieved from dataset views are returns as
    :class:`fiftyone.core.sample.SampleView` objects, as opposed to
    :class:`fiftyone.core.sample.Sample` objects, since they may contain a
    subset of the sample's content.

    Example use::

        # Print paths for 5 random samples from the test split of a dataset
        view = dataset.match_tag("test").take(5)
        for sample in view:
            print(sample.filepath)

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`
    """

    def __init__(self, dataset):
        self._dataset = dataset
        self._stages = []

    def __len__(self):
        return self.aggregate(foa.Count()).count

    def __getitem__(self, sample_id):
        if isinstance(sample_id, numbers.Integral):
            raise KeyError(
                "Accessing samples by numeric index is not supported. "
                "Use sample IDs or slices"
            )

        if isinstance(sample_id, slice):
            return self._slice(sample_id)

        view = self.match({"_id": ObjectId(sample_id)})
        try:
            return view.first()
        except ValueError:
            raise KeyError("No sample found with ID '%s'" % sample_id)

    def __copy__(self):
        view = self.__class__(self._dataset)
        view._stages = deepcopy(self._stages)
        return view

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
        return self._dataset.name

    @property
    def info(self):
        """The :meth:`fiftyone.core.dataset.Dataset.info` dict of the
        underlying dataset.
        """
        return self._dataset.info

    @property
    def stages(self):
        """The list of :class:`fiftyone.core.stages.ViewStage` instances in
        this view's pipeline.
        """
        return self._stages

    def summary(self):
        """Returns a string summary of the view.

        Returns:
            a string summary
        """
        aggs = self.aggregate(
            [foa.Count(), foa.Distinct("tags")], _attach_frames=False
        )
        elements = [
            "Dataset:        %s" % self.dataset_name,
            "Media type:     %s" % self.media_type,
            "Num samples:    %d" % aggs[0].count,
            "Tags:           %s" % aggs[1].values,
            "Sample fields:",
            self._dataset._to_fields_str(self.get_field_schema()),
        ]

        if self.media_type == fom.VIDEO:
            elements.extend(
                [
                    "Frame fields:",
                    self._dataset._to_fields_str(
                        self.get_frame_field_schema()
                    ),
                ]
            )

        elements.extend(["View stages:", self._make_view_stages_str()])

        return "\n".join(elements)

    def _make_view_stages_str(self):
        if not self._stages:
            return "    ---"

        return "    " + "\n    ".join(
            ["%d. %s" % (idx, str(d)) for idx, d in enumerate(self._stages, 1)]
        )

    def iter_samples(self):
        """Returns an iterator over the samples in the view.

        Returns:
            an iterator over :class:`fiftyone.core.sample.SampleView` instances
        """
        selected_fields, excluded_fields = self._get_selected_excluded_fields()
        filtered_fields = self._get_filtered_fields()

        for d in self._aggregate(hide_frames=True):
            try:
                frames = d.pop("_frames", [])
                doc = self._dataset._sample_dict_to_doc(d)
                sample = fos.SampleView(
                    doc,
                    self._dataset,
                    selected_fields=selected_fields,
                    excluded_fields=excluded_fields,
                    filtered_fields=filtered_fields,
                )
                if self.media_type == fom.VIDEO:
                    sample.frames._set_replacements(frames)
                yield sample
            except Exception as e:
                raise ValueError(
                    "Failed to load sample from the database. This is likely "
                    "due to an invalid stage in the DatasetView"
                ) from e

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
                `_` in the returned schema

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
                `_` in the returned schema

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

    def get_tags(self):
        """Returns the list of unique tags of samples in the view.

        Returns:
            a list of tags
        """
        return self.aggregate(foa.Distinct("tags")).values

    def create_index(self, field):
        """Creates a database index on the given field, enabling efficient
        sorting on that field.

        Args:
            field: the name of the field to index
        """
        self._dataset.create_index(field)

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
        d["stages"] = [s._serialize() for s in self._stages]
        d["samples"] = samples
        return d

    def _pipeline(
        self,
        pipeline=None,
        hide_frames=False,
        squash_frames=False,
        attach_frames=True,
    ):
        _pipeline = []

        for s in self._stages:
            _pipeline.extend(s.to_mongo(self))

        if pipeline is not None:
            _pipeline.extend(pipeline)

        return self._dataset._pipeline(
            pipeline=_pipeline,
            hide_frames=hide_frames,
            squash_frames=squash_frames,
            attach_frames=attach_frames,
        )

    def _aggregate(
        self,
        pipeline=None,
        hide_frames=False,
        squash_frames=False,
        attach_frames=True,
    ):
        _pipeline = self._pipeline(
            pipeline=pipeline,
            hide_frames=hide_frames,
            squash_frames=squash_frames,
            attach_frames=attach_frames,
        )
        return self._dataset._sample_collection.aggregate(_pipeline)

    @property
    def _doc(self):
        return self._dataset._doc

    def _get_pipeline(self):
        pipeline = []

        for s in self._stages:
            pipeline.extend(s.to_mongo())

        return pipeline

    def _serialize(self):
        return [s._serialize() for s in self._stages]

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

        view = copy(self)
        view._stages.append(stage)
        return view

    def _get_filtered_schema(self, schema, frames=False):
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
            _selected_fields = stage.get_selected_fields(frames=frames)
            if _selected_fields:
                if selected_fields is None:
                    selected_fields = set(_selected_fields)
                else:
                    selected_fields.intersection_update(_selected_fields)

            _excluded_fields = stage.get_excluded_fields(frames=frames)
            if _excluded_fields:
                excluded_fields.update(_excluded_fields)

        if selected_fields is not None:
            selected_fields.difference_update(excluded_fields)
            excluded_fields = None

        return selected_fields, excluded_fields

    def _get_filtered_fields(self):
        filtered_fields = set()
        for stage in self._stages:
            _filtered_fields = stage.get_filtered_list_fields()
            if _filtered_fields:
                filtered_fields.update(_filtered_fields)

        return filtered_fields
