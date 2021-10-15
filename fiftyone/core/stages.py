"""
View stages.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict, OrderedDict
import contextlib
from copy import deepcopy
import random
import reprlib
import uuid
import warnings

from bson import ObjectId
from deprecated import deprecated
import numpy as np

import eta.core.utils as etau

import fiftyone.core.expressions as foe
from fiftyone.core.expressions import ViewField as F
from fiftyone.core.expressions import VALUE
import fiftyone.core.fields as fof
import fiftyone.core.frame as fofr
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
from fiftyone.core.odm.document import MongoEngineBaseDocument
import fiftyone.core.sample as fos
import fiftyone.core.utils as fou
import fiftyone.core.validation as fova

foc = fou.lazy_import("fiftyone.core.clips")
fod = fou.lazy_import("fiftyone.core.dataset")
fop = fou.lazy_import("fiftyone.core.patches")
fov = fou.lazy_import("fiftyone.core.video")
foug = fou.lazy_import("fiftyone.utils.geojson")


class ViewStage(object):
    """Abstract base class for all view stages.

    :class:`ViewStage` instances represent logical operations to apply to
    :class:`fiftyone.core.collections.SampleCollection` instances, which may
    decide what subset of samples in the collection should pass though the
    stage, and also what subset of the contents of each
    :class:`fiftyone.core.sample.Sample` should be passed. The output of
    view stages are represented by a :class:`fiftyone.core.view.DatasetView`.
    """

    _uuid = None

    def __str__(self):
        return repr(self)

    def __repr__(self):
        kwargs_list = []
        for k, v in self._kwargs():
            if k.startswith("_"):
                continue

            v_repr = _repr.repr(v)
            # v_repr = etau.summarize_long_str(v_repr, 30)
            kwargs_list.append("%s=%s" % (k, v_repr))

        kwargs_str = ", ".join(kwargs_list)
        return "%s(%s)" % (self.__class__.__name__, kwargs_str)

    @property
    def has_view(self):
        """Whether this stage's output view should be loaded via
        :meth:`load_view` rather than appending stages to an aggregation
        pipeline via :meth:`to_mongo`.
        """
        return False

    def get_filtered_fields(self, sample_collection, frames=False):
        """Returns a list of names of fields or embedded fields that contain
        **arrays** have been filtered by the stage, if any.

        For example, if a stage filters a
        :class:`fiftyone.core.labels.Detections` field called
        ``"predictions"``, it should include ``"predictions.detections"`` in
        the returned list.

        The ``"frames."`` prefix should be omitted when ``frames`` is True.

        Args:
            sample_collection: the
                :class:`fiftyone.core.collections.SampleCollection` to which
                the stage is being applied
            frames (False): whether to return sample-level (False) or
                frame-level (True) fields

        Returns:
            a list of fields, or ``None`` if no fields have been filtered
        """
        return None

    def get_selected_fields(self, sample_collection, frames=False):
        """Returns a list of fields that have been selected by the stage, if
        any.

        View stages only need to report selected fields if they insist that
        non-selected fields not appear in the schema of the returned view.

        Args:
            sample_collection: the
                :class:`fiftyone.core.collections.SampleCollection` to which
                the stage is being applied
            frames (False): whether to return sample-level (False) or
                frame-level (True) fields

        Returns:
            a list of fields, or ``None`` if no fields have been selected
        """
        return None

    def get_excluded_fields(self, sample_collection, frames=False):
        """Returns a list of fields that have been excluded by the stage, if
        any.

        View stages only need to report excluded fields if they insist that
        excluded fields not appear in the schema of the returned view.

        Args:
            sample_collection: the
                :class:`fiftyone.core.collections.SampleCollection` to which
                the stage is being applied
            frames (False): whether to return sample-level (False) or
                frame-level (True) fields

        Returns:
            a list of fields, or ``None`` if no fields have been selected
        """
        return None

    def load_view(self, sample_collection):
        """Loads the :class:`fiftyone.core.view.DatasetView` containing the
        output of the stage.

        Only usable if :meth:`has_view` is ``True``.

        Args:
            sample_collection: the
                :class:`fiftyone.core.collections.SampleCollection` to which
                the stage is being applied

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        if not self.has_view:
            raise ValueError(
                "%s stages use `to_mongo()`, not `load_view()`" % type(self)
            )

        raise NotImplementedError("subclasses must implement `load_view()`")

    def to_mongo(self, sample_collection):
        """Returns the MongoDB aggregation pipeline for the stage.

        Only usable if :meth:`has_view` is ``False``.

        Args:
            sample_collection: the
                :class:`fiftyone.core.collections.SampleCollection` to which
                the stage is being applied

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        if not self.has_view:
            raise ValueError(
                "%s stages use `load_view()`, not `to_mongo()`" % type(self)
            )

        raise NotImplementedError("subclasses must implement `to_mongo()`")

    def validate(self, sample_collection):
        """Validates that the stage can be applied to the given collection.

        Args:
            sample_collection: a
                :class:`fiftyone.core.collections.SampleCollection`

        Raises:
            :class:`ViewStageError`: if the stage cannot be applied to the
                collection
        """
        pass

    def _needs_frames(self, sample_collection):
        """Whether the stage requires frame labels of video samples to be
        attached.

        Args:
            sample_collection: the
                :class:`fiftyone.core.collections.SampleCollection` to which
                the stage is being applied

        Returns:
            True/False
        """
        return False

    def _serialize(self, include_uuid=True):
        """Returns a JSON dict representation of the :class:`ViewStage`.

        Args:
            include_uuid (True): whether to include the stage's UUID in the JSON
                representation

        Returns:
            a JSON dict
        """
        d = {
            "_cls": etau.get_class_name(self),
            "kwargs": self._kwargs(),
        }

        if include_uuid:
            if self._uuid is None:
                self._uuid = str(uuid.uuid4())

            d["_uuid"] = self._uuid

        return d

    def _kwargs(self):
        """Returns a list of ``[name, value]`` lists describing the parameters
        of this stage instance.

        Returns:
            a list of ``[name, value]`` lists
        """
        raise NotImplementedError("subclasses must implement `_kwargs()`")

    @classmethod
    def _params(cls):
        """Returns a list of JSON dicts describing the stage's supported
        parameters.

        Returns:
            a list of JSON dicts
        """
        raise NotImplementedError("subclasses must implement `_params()`")

    @classmethod
    def _from_dict(cls, d):
        """Creates a :class:`ViewStage` instance from a serialized JSON dict
        representation of it.

        Args:
            d: a JSON dict

        Returns:
            a :class:`ViewStage`
        """
        view_stage_cls = etau.get_class(d["_cls"])
        uuid = d.get("_uuid", None)
        stage = view_stage_cls(**{k: v for (k, v) in d["kwargs"]})
        stage._uuid = uuid
        return stage


class ViewStageError(Exception):
    """An error raised when a problem with a :class:`ViewStage` is encountered.
    """

    pass


class Exclude(ViewStage):
    """Excludes the samples with the given IDs from a collection.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(filepath="/path/to/image1.png"),
                fo.Sample(filepath="/path/to/image2.png"),
                fo.Sample(filepath="/path/to/image3.png"),
            ]
        )

        #
        # Exclude the first sample from the dataset
        #

        sample_id = dataset.first().id
        stage = fo.Exclude(sample_id)
        view = dataset.add_stage(stage)

        #
        # Exclude the first and last samples from the dataset
        #

        sample_ids = [dataset.first().id, dataset.last().id]
        stage = fo.Exclude(sample_ids)
        view = dataset.add_stage(stage)

    Args:
        sample_ids: the samples to exclude. Can be any of the following:

            -   a sample ID
            -   an iterable of sample IDs
            -   a :class:`fiftyone.core.sample.Sample` or
                :class:`fiftyone.core.sample.SampleView`
            -   an iterable of sample IDs
            -   a :class:`fiftyone.core.collections.SampleCollection`
            -   an iterable of :class:`fiftyone.core.sample.Sample` or
                :class:`fiftyone.core.sample.SampleView` instances
    """

    def __init__(self, sample_ids):
        self._sample_ids = _get_sample_ids(sample_ids)

    @property
    def sample_ids(self):
        """The list of sample IDs to exclude."""
        return self._sample_ids

    def to_mongo(self, _):
        sample_ids = [ObjectId(_id) for _id in self._sample_ids]
        return [{"$match": {"_id": {"$not": {"$in": sample_ids}}}}]

    def _kwargs(self):
        return [["sample_ids", self._sample_ids]]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "sample_ids",
                "type": "list<id>|id",
                "placeholder": "list,of,sample,ids",
            }
        ]


class ExcludeBy(ViewStage):
    """Excludes the samples with the given field values from a collection.

    This stage is typically used to work with categorical fields (strings,
    ints, and bools). If you want to exclude samples based on floating point
    fields, use :class:`Match`.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(filepath="image%d.jpg" % i, int=i, str=str(i))
                for i in range(10)
            ]
        )

        #
        # Create a view excluding samples whose `int` field have the given
        # values
        #

        stage = fo.ExcludeBy("int", [1, 9, 3, 7, 5])
        view = dataset.add_stage(stage)
        print(view.head(5))

        #
        # Create a view excluding samples whose `str` field have the given
        # values
        #

        stage = fo.ExcludeBy("str", ["1", "9", "3", "7", "5"])
        view = dataset.add_stage(stage)
        print(view.head(5))

    Args:
        field: a field or ``embedded.field.name``
        values: a value or iterable of values to exclude by
    """

    def __init__(self, field, values):
        if etau.is_container(values):
            values = list(values)
        else:
            values = [values]

        self._field = field
        self._values = values

    @property
    def field(self):
        """The field whose values to exclude by."""
        return self._field

    @property
    def values(self):
        """The list of values to exclude by."""
        return self._values

    def to_mongo(self, sample_collection):
        field_name, is_id_field, _ = sample_collection._handle_id_fields(
            self._field
        )

        if is_id_field:
            values = [
                value if isinstance(value, ObjectId) else ObjectId(value)
                for value in self._values
            ]
        else:
            values = self._values

        return [{"$match": {field_name: {"$not": {"$in": values}}}}]

    def _kwargs(self):
        return [["field", self._field], ["values", self._values]]

    @classmethod
    def _params(cls):
        return [
            {"name": "field", "type": "field|str", "placeholder": "field"},
            {
                "name": "values",
                "type": "json",
                "placeholder": "list,of,values",
            },
        ]


class ExcludeFields(ViewStage):
    """Excludes the fields with the given names from the samples in a
    collection.

    Note that default fields cannot be excluded.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    ground_truth=fo.Classification(label="cat"),
                    predictions=fo.Classification(label="cat", confidence=0.9),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    ground_truth=fo.Classification(label="dog"),
                    predictions=fo.Classification(label="dog", confidence=0.8),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    ground_truth=None,
                    predictions=None,
                ),
            ]
        )

        #
        # Exclude the `predictions` field from all samples
        #

        stage = fo.ExcludeFields("predictions")
        view = dataset.add_stage(stage)

    Args:
        field_names: a field name or iterable of field names to exclude
    """

    def __init__(self, field_names, _allow_missing=False):
        if etau.is_str(field_names):
            field_names = [field_names]
        elif field_names is not None:
            field_names = list(field_names)

        self._field_names = field_names
        self._allow_missing = _allow_missing

    @property
    def field_names(self):
        """The list of field names to exclude."""
        return self._field_names

    def get_excluded_fields(self, sample_collection, frames=False):
        if sample_collection.media_type == fom.VIDEO:
            fields, frame_fields = fou.split_frame_fields(self.field_names)
            return frame_fields if frames else fields

        return self.field_names

    def to_mongo(self, sample_collection):
        excluded_fields = self.get_excluded_fields(
            sample_collection, frames=False
        )

        excluded_frame_fields = [
            sample_collection._FRAMES_PREFIX + f
            for f in self.get_excluded_fields(sample_collection, frames=True)
        ]

        if excluded_frame_fields:
            # Don't project on root `frames` and embedded fields
            # https://docs.mongodb.com/manual/reference/operator/aggregation/project/#path-collision-errors-in-embedded-fields
            excluded_fields = [f for f in excluded_fields if f != "frames"]
            excluded_fields += excluded_frame_fields

        if not excluded_fields:
            return []

        return [{"$unset": excluded_fields}]

    def _needs_frames(self, sample_collection):
        return any(
            sample_collection._is_frame_field(f) for f in self.field_names
        )

    def _kwargs(self):
        return [
            ["field_names", self._field_names],
            ["_allow_missing", self._allow_missing],
        ]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "field_names",
                "type": "list<str>",
                "placeholder": "list,of,fields",
            },
            {"name": "_allow_missing", "type": "bool", "default": "False"},
        ]

    def validate(self, sample_collection):
        if self._allow_missing:
            return

        # Using dataset here allows a field to be excluded multiple times
        sample_collection._dataset.validate_fields_exist(self.field_names)

        if sample_collection.media_type == fom.VIDEO:
            fields, frame_fields = fou.split_frame_fields(self.field_names)
        else:
            fields = self.field_names
            frame_fields = None

        if fields:
            default_fields = set(
                sample_collection._get_default_sample_fields(
                    include_private=True
                )
            )

            defaults = [f for f in fields if f in default_fields]
            if defaults:
                raise ValueError("Cannot exclude default fields %s" % defaults)

        if frame_fields:
            default_frame_fields = set(
                sample_collection._get_default_frame_fields(
                    include_private=True
                )
            )

            defaults = [f for f in fields if f in default_frame_fields]
            if defaults:
                raise ValueError(
                    "Cannot exclude default frame fields %s" % defaults
                )


class ExcludeFrames(ViewStage):
    """Excludes the frames with the given IDs from a video collection.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart-video")

        #
        # Exclude some specific frames
        #

        frame_ids = [
            dataset.first().frames.first().id,
            dataset.last().frames.last().id,
        ]

        stage = fo.ExcludeFrames(frame_ids)
        view = dataset.add_stage(stage)

        print(dataset.count("frames"))
        print(view.count("frames"))

    Args:
        frame_ids: the frames to exclude. Can be any of the following:

            -   a frame ID
            -   an iterable of frame IDs
            -   a :class:`fiftyone.core.frame.Frame` or
                :class:`fiftyone.core.frame.FrameView`
            -   an iterable of :class:`fiftyone.core.frame.Frame` or
                :class:`fiftyone.core.frame.FrameView` instances
            -   a :class:`fiftyone.core.collections.SampleCollection`, in which
                case the frame IDs in the collection are used

        omit_empty (True): whether to omit samples that have no frames after
            excluding the specified frames
    """

    def __init__(self, frame_ids, omit_empty=True):
        self._frame_ids = _get_frame_ids(frame_ids)
        self._omit_empty = omit_empty

    @property
    def frame_ids(self):
        """The list of frame IDs to exclude."""
        return self._frame_ids

    @property
    def omit_empty(self):
        """Whether to omit samples that have no frames after filtering."""
        return self._omit_empty

    def to_mongo(self, _):
        frame_ids = [ObjectId(_id) for _id in self._frame_ids]
        select_expr = F("frames").filter(~F("_id").is_in(frame_ids))
        pipeline = [{"$set": {"frames": select_expr.to_mongo()}}]

        if self._omit_empty:
            non_empty_expr = F("frames").length() > 0
            pipeline.append({"$match": {"$expr": non_empty_expr.to_mongo()}})

        return pipeline

    def _kwargs(self):
        return [
            ["frame_ids", self._frame_ids],
            ["omit_empty", self._omit_empty],
        ]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "frame_ids",
                "type": "list<id>|id",
                "placeholder": "list,of,frame,ids",
            },
            {
                "name": "omit_empty",
                "type": "bool",
                "default": "True",
                "placeholder": "omit empty (default=True)",
            },
        ]

    def _needs_frames(self, _):
        return True

    def validate(self, sample_collection):
        fova.validate_video_collection(sample_collection)


class ExcludeLabels(ViewStage):
    """Excludes the specified labels from a collection.

    The returned view will omit samples, sample fields, and individual labels
    that do not match the specified selection criteria.

    You can perform an exclusion via one or more of the following methods:

    -   Provide the ``labels`` argument, which should contain a list of dicts
        in the format returned by
        :meth:`fiftyone.core.session.Session.selected_labels`, to exclude
        specific labels

    -   Provide the ``ids`` argument to exclude labels with specific IDs

    -   Provide the ``tags`` argument to exclude labels with specific tags

    If multiple criteria are specified, labels must match all of them in order
    to be excluded.

    By default, the exclusion is applied to all
    :class:`fiftyone.core.labels.Label` fields, but you can provide the
    ``fields`` argument to explicitly define the field(s) in which to exclude.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart")

        #
        # Exclude the labels currently selected in the App
        #

        session = fo.launch_app(dataset)

        # Select some labels in the App...

        stage = fo.ExcludeLabels(labels=session.selected_labels)
        view = dataset.add_stage(stage)

        #
        # Exclude labels with the specified IDs
        #

        # Grab some label IDs
        ids = [
            dataset.first().ground_truth.detections[0].id,
            dataset.last().predictions.detections[0].id,
        ]

        stage = fo.ExcludeLabels(ids=ids)
        view = dataset.add_stage(stage)

        print(dataset.count("ground_truth.detections"))
        print(view.count("ground_truth.detections"))

        print(dataset.count("predictions.detections"))
        print(view.count("predictions.detections"))

        #
        # Exclude labels with the specified tags
        #

        # Grab some label IDs
        ids = [
            dataset.first().ground_truth.detections[0].id,
            dataset.last().predictions.detections[0].id,
        ]

        # Give the labels a "test" tag
        dataset = dataset.clone()  # create copy since we're modifying data
        dataset.select_labels(ids=ids).tag_labels("test")

        print(dataset.count_values("ground_truth.detections.tags"))
        print(dataset.count_values("predictions.detections.tags"))

        # Exclude the labels via their tag
        stage = fo.ExcludeLabels(tags="test")
        view = dataset.add_stage(stage)

        print(dataset.count("ground_truth.detections"))
        print(view.count("ground_truth.detections"))

        print(dataset.count("predictions.detections"))
        print(view.count("predictions.detections"))

    Args:
        labels (None): a list of dicts specifying the labels to exclude in the
            format returned by
            :meth:`fiftyone.core.session.Session.selected_labels`
        ids (None): an ID or iterable of IDs of the labels to exclude
        tags (None): a tag or iterable of tags of labels to exclude
        fields (None): a field or iterable of fields from which to exclude
        omit_empty (True): whether to omit samples that have no labels after
            filtering
    """

    def __init__(
        self, labels=None, ids=None, tags=None, fields=None, omit_empty=True
    ):
        if labels is not None:
            sample_ids, labels_map = _parse_labels(labels)
        else:
            sample_ids, labels_map = None, None

        if etau.is_str(ids):
            ids = [ids]
        elif ids is not None:
            ids = list(ids)

        if etau.is_str(tags):
            tags = [tags]
        elif tags is not None:
            tags = list(tags)

        if etau.is_str(fields):
            fields = [fields]
        elif fields is not None:
            fields = list(fields)

        self._labels = labels
        self._ids = ids
        self._tags = tags
        self._fields = fields
        self._omit_empty = omit_empty
        self._sample_ids = sample_ids
        self._labels_map = labels_map
        self._pipeline = None

    @property
    def labels(self):
        """A list of dicts specifying the labels to exclude."""
        return self._labels

    @property
    def ids(self):
        """A list of IDs of labels to exclude."""
        return self._ids

    @property
    def tags(self):
        """A list of tags of labels to exclude."""
        return self._tags

    @property
    def fields(self):
        """A list of fields from which labels are being excluded."""
        return self._fields

    @property
    def omit_empty(self):
        """Whether to omit samples that have no labels after filtering."""
        return self._omit_empty

    def get_filtered_fields(self, sample_collection, frames=False):
        if self._labels is not None:
            fields = self._labels_map.keys()
        elif self._fields is not None:
            fields = self._fields
        else:
            fields = sample_collection._get_label_fields()

        filtered_fields = []

        for field in fields:
            list_path, is_list_field, is_frame_field = _parse_labels_field(
                sample_collection, field
            )
            if is_list_field and frames == is_frame_field:
                list_path, _ = sample_collection._handle_frame_field(list_path)
                filtered_fields.append(list_path)

        if filtered_fields:
            return filtered_fields

        return None

    def to_mongo(self, _):
        if self._pipeline is None:
            raise ValueError(
                "`validate()` must be called before using a %s stage"
                % self.__class__
            )

        return self._pipeline

    def _kwargs(self):
        return [
            ["labels", self._labels],
            ["ids", self._ids],
            ["tags", self._tags],
            ["fields", self._fields],
            ["omit_empty", self._omit_empty],
        ]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "labels",
                "type": "NoneType|json",
                "placeholder": "[{...}]",
                "default": "None",
            },
            {
                "name": "ids",
                "type": "NoneType|list<id>|id",
                "placeholder": "ids",
                "default": "None",
            },
            {
                "name": "tags",
                "type": "NoneType|list<str>|str",
                "placeholder": "tags",
                "default": "None",
            },
            {
                "name": "fields",
                "type": "NoneType|list<str>|str",
                "placeholder": "fields",
                "default": "None",
            },
            {
                "name": "omit_empty",
                "type": "bool",
                "default": "True",
                "placeholder": "omit empty (default=True)",
            },
        ]

    def _needs_frames(self, sample_collection):
        if self._labels is not None:
            fields = self._labels_map.keys()
        elif self._fields is not None:
            fields = self._fields
        else:
            fields = sample_collection._get_label_fields()

        return any(sample_collection._is_frame_field(f) for f in fields)

    def _make_labels_pipeline(self, sample_collection):
        pipeline = []

        # Exclude specified labels
        for field, labels_map in self._labels_map.items():
            label_filter = ~F("_id").is_in(
                [foe.ObjectId(_id) for _id in labels_map]
            )
            stage = FilterLabels(field, label_filter, only_matches=False)
            stage.validate(sample_collection)
            pipeline.extend(stage.to_mongo(sample_collection))

        # Filter samples with no labels, if requested
        if self._omit_empty:
            fields = sample_collection._get_label_fields()
            pipeline.extend(
                _make_omit_empty_labels_pipeline(sample_collection, fields)
            )

        return pipeline

    def _make_pipeline(self, sample_collection):
        pipeline = []

        if self._fields is not None:
            fields = self._fields
        else:
            fields = sample_collection._get_label_fields()

        filter_expr = None

        if self._ids is not None:
            filter_expr = ~F("_id").is_in([ObjectId(_id) for _id in self._ids])

        if self._tags is not None:
            tag_expr = (F("tags") != None).if_else(
                ~F("tags").contains(self._tags), False
            )
            if filter_expr is not None:
                filter_expr &= tag_expr
            else:
                filter_expr = tag_expr

        # Filter excluded labels
        if filter_expr is not None:
            for field in fields:
                stage = FilterLabels(field, filter_expr, only_matches=False)
                stage.validate(sample_collection)
                pipeline.extend(stage.to_mongo(sample_collection))

        # Filter samples with no labels, if requested
        if self._omit_empty:
            fields = sample_collection._get_label_fields()
            pipeline.extend(
                _make_omit_empty_labels_pipeline(sample_collection, fields)
            )

        return pipeline

    def validate(self, sample_collection):
        if self._labels is not None:
            self._pipeline = self._make_labels_pipeline(sample_collection)
        else:
            self._pipeline = self._make_pipeline(sample_collection)


class Exists(ViewStage):
    """Returns a view containing the samples in a collection that have (or do
    not have) a non-``None`` value for the given field or embedded field.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    ground_truth=fo.Classification(label="cat"),
                    predictions=fo.Classification(label="cat", confidence=0.9),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    ground_truth=fo.Classification(label="dog"),
                    predictions=fo.Classification(label="dog", confidence=0.8),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    ground_truth=fo.Classification(label="dog"),
                    predictions=fo.Classification(label="dog"),
                ),
                fo.Sample(
                    filepath="/path/to/image4.png",
                    ground_truth=None,
                    predictions=None,
                ),
                fo.Sample(filepath="/path/to/image5.png"),
            ]
        )

        #
        # Only include samples that have a value in their `predictions` field
        #

        stage = fo.Exists("predictions")
        view = dataset.add_stage(stage)

        #
        # Only include samples that do NOT have a value in their `predictions`
        # field
        #

        stage = fo.Exists("predictions", False)
        view = dataset.add_stage(stage)

        #
        # Only include samples that have prediction confidences
        #

        stage = fo.Exists("predictions.confidence")
        view = dataset.add_stage(stage)

    Args:
        field: the field name or ``embedded.field.name``
        bool (True): whether to check if the field exists (True) or does not
            exist (False)
    """

    def __init__(self, field, bool=True):
        self._field = field
        self._bool = bool

    @property
    def field(self):
        """The field to check for existence."""
        return self._field

    @property
    def bool(self):
        """Whether to check if the field exists (True) or does not exist
        (False).
        """
        return self._bool

    def to_mongo(self, sample_collection):
        field_name, is_frame_field = sample_collection._handle_frame_field(
            self._field
        )

        if not is_frame_field:
            expr = F(field_name).exists(self._bool)
            return [{"$match": {"$expr": expr.to_mongo()}}]

        expr = F("frames").filter(F(field_name).exists(self._bool))
        return [
            {"$set": {"frames": expr.to_mongo()}},
            {"$match": {"$expr": (F("frames").length() > 0).to_mongo()}},
        ]

    def _needs_frames(self, sample_collection):
        return sample_collection._is_frame_field(self._field)

    def _kwargs(self):
        return [["field", self._field], ["bool", self._bool]]

    @classmethod
    def _params(cls):
        return [
            {"name": "field", "type": "field|str"},
            {
                "name": "bool",
                "type": "bool",
                "default": "True",
                "placeholder": "bool (default=True)",
            },
        ]


class FilterField(ViewStage):
    """Filters the values of a given field or embedded field of each sample in
    a collection.

    Values of ``field`` for which ``filter`` returns ``False`` are
    replaced with ``None``.

    Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    ground_truth=fo.Classification(label="cat"),
                    predictions=fo.Classification(label="cat", confidence=0.9),
                    numeric_field=1.0,
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    ground_truth=fo.Classification(label="dog"),
                    predictions=fo.Classification(label="dog", confidence=0.8),
                    numeric_field=-1.0,
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    ground_truth=None,
                    predictions=None,
                    numeric_field=None,
                ),
            ]
        )

        #
        # Only include classifications in the `predictions` field
        # whose `label` is "cat"
        #

        stage = fo.FilterField("predictions", F("label") == "cat")
        view = dataset.add_stage(stage)

        #
        # Only include samples whose `numeric_field` value is positive
        #

        stage = fo.FilterField("numeric_field", F() > 0)
        view = dataset.add_stage(stage)

    Args:
        field: the field name or ``embedded.field.name``
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
        only_matches (True): whether to only include samples that match the
            filter (True) or include all samples (False)
    """

    def __init__(self, field, filter, only_matches=True, _new_field=None):
        self._field = field
        self._filter = filter
        self._only_matches = only_matches
        self._new_field = _new_field or field
        self._is_frame_field = None
        self._validate_params()

    @property
    def field(self):
        """The field to filter."""
        return self._field

    @property
    def filter(self):
        """The filter expression."""
        return self._filter

    @property
    def only_matches(self):
        """Whether to only include samples that match the filter."""
        return self._only_matches

    def to_mongo(self, sample_collection):
        field_name, is_frame_field = sample_collection._handle_frame_field(
            self._field
        )
        new_field = self._get_new_field(sample_collection)

        if is_frame_field:
            return _get_filter_frames_field_pipeline(
                field_name,
                new_field,
                self._filter,
                only_matches=self._only_matches,
            )

        return _get_filter_field_pipeline(
            field_name,
            new_field,
            self._filter,
            only_matches=self._only_matches,
        )

    def _get_mongo_filter(self):
        if self._is_frame_field:
            filter_field = self._field.split(".", 1)[1]  # remove `frames`
            return _get_field_mongo_filter(
                self._filter, prefix="$frame." + filter_field
            )

        return _get_field_mongo_filter(self._filter, prefix=self._field)

    def _get_new_field(self, sample_collection):
        new_field, _ = sample_collection._handle_frame_field(self._new_field)
        return new_field

    def _needs_frames(self, sample_collection):
        return sample_collection._is_frame_field(self._field)

    def _kwargs(self):
        return [
            ["field", self._field],
            ["filter", self._get_mongo_filter()],
            ["only_matches", self._only_matches],
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "field", "type": "field|str"},
            {"name": "filter", "type": "json", "placeholder": ""},
            {
                "name": "only_matches",
                "type": "bool",
                "default": "True",
                "placeholder": "only matches (default=True)",
            },
        ]

    def _validate_params(self):
        if not isinstance(self._filter, (foe.ViewExpression, dict, bool)):
            raise ValueError(
                "Filter must be a ViewExpression or a MongoDB aggregation "
                "expression defining a filter; found '%s'" % self._filter
            )

    def validate(self, sample_collection):
        sample_collection.validate_fields_exist(self._field)

        field, is_frame_field = sample_collection._handle_frame_field(
            self._field
        )
        self._is_frame_field = is_frame_field

        if is_frame_field:
            if field in ("id", "frame_number"):
                raise ValueError(
                    "Cannot filter required frame field '%s'" % field
                )
        else:
            if field in ("id", "filepath"):
                raise ValueError("Cannot filter required field '%s'" % field)


def _get_filter_field_pipeline(
    filter_field, new_field, filter_arg, only_matches=True, prefix=""
):
    cond = _get_field_mongo_filter(filter_arg, prefix=prefix + filter_field)

    pipeline = [
        {
            "$set": {
                prefix
                + new_field: {
                    "$cond": {
                        "if": cond,
                        "then": "$" + prefix + filter_field,
                        "else": None,
                    }
                }
            }
        }
    ]

    if only_matches:
        match_expr = _get_field_only_matches_expr(prefix + new_field)
        pipeline.append({"$match": {"$expr": match_expr.to_mongo()}})

    return pipeline


def _get_field_only_matches_expr(field):
    return F(field).exists()


def _get_filter_frames_field_pipeline(
    filter_field, new_field, filter_arg, only_matches=True, prefix=""
):
    cond = _get_field_mongo_filter(
        filter_arg, prefix="$frame." + prefix + filter_field
    )

    pipeline = [
        {
            "$set": {
                "frames": {
                    "$map": {
                        "input": "$frames",
                        "as": "frame",
                        "in": {
                            "$mergeObjects": [
                                "$$frame",
                                {
                                    prefix
                                    + new_field: {
                                        "$cond": {
                                            "if": cond,
                                            "then": "$$frame."
                                            + prefix
                                            + filter_field,
                                            "else": None,
                                        }
                                    }
                                },
                            ]
                        },
                    }
                }
            }
        }
    ]

    if only_matches:
        match_expr = _get_frames_field_only_matches_expr(prefix + new_field)
        pipeline.append({"$match": {"$expr": match_expr.to_mongo()}})

    return pipeline


def _get_frames_field_only_matches_expr(field):
    return F("frames").reduce(VALUE + F(field).exists().to_int()) > 0


def _get_field_mongo_filter(filter_arg, prefix="$this"):
    if isinstance(filter_arg, foe.ViewExpression):
        return filter_arg.to_mongo(prefix="$" + prefix)

    return filter_arg


class FilterLabels(ViewStage):
    """Filters the :class:`fiftyone.core.labels.Label` field of each sample in
    a collection.

    If the specified ``field`` is a single :class:`fiftyone.core.labels.Label`
    type, fields for which ``filter`` returns ``False`` are replaced with
    ``None``:

    -   :class:`fiftyone.core.labels.Classification`
    -   :class:`fiftyone.core.labels.Detection`
    -   :class:`fiftyone.core.labels.Polyline`
    -   :class:`fiftyone.core.labels.Keypoint`

    If the specified ``field`` is a :class:`fiftyone.core.labels.Label` list
    type, the label elements for which ``filter`` returns ``False`` are omitted
    from the view:

    -   :class:`fiftyone.core.labels.Classifications`
    -   :class:`fiftyone.core.labels.Detections`
    -   :class:`fiftyone.core.labels.Polylines`
    -   :class:`fiftyone.core.labels.Keypoints`

    Classifications Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    predictions=fo.Classification(label="cat", confidence=0.9),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    predictions=fo.Classification(label="dog", confidence=0.8),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    predictions=fo.Classification(label="rabbit"),
                ),
                fo.Sample(
                    filepath="/path/to/image4.png",
                    predictions=None,
                ),
            ]
        )

        #
        # Only include classifications in the `predictions` field whose
        # `confidence` is greater than 0.8
        #

        stage = fo.FilterLabels("predictions", F("confidence") > 0.8)
        view = dataset.add_stage(stage)

        #
        # Only include classifications in the `predictions` field whose `label`
        # is "cat" or "dog"
        #

        stage = fo.FilterLabels("predictions", F("label").is_in(["cat", "dog"]))
        view = dataset.add_stage(stage)

    Detections Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="cat",
                                bounding_box=[0.1, 0.1, 0.5, 0.5],
                                confidence=0.9,
                            ),
                            fo.Detection(
                                label="dog",
                                bounding_box=[0.2, 0.2, 0.3, 0.3],
                                confidence=0.8,
                            ),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="cat",
                                bounding_box=[0.5, 0.5, 0.4, 0.4],
                                confidence=0.95,
                            ),
                            fo.Detection(label="rabbit"),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="squirrel",
                                bounding_box=[0.25, 0.25, 0.5, 0.5],
                                confidence=0.5,
                            ),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image4.png",
                    predictions=None,
                ),
            ]
        )

        #
        # Only include detections in the `predictions` field whose `confidence`
        # is greater than 0.8
        #

        stage = fo.FilterLabels("predictions", F("confidence") > 0.8)
        view = dataset.add_stage(stage)

        #
        # Only include detections in the `predictions` field whose `label` is
        # "cat" or "dog"
        #

        stage = fo.FilterLabels("predictions", F("label").is_in(["cat", "dog"]))
        view = dataset.add_stage(stage)

        #
        # Only include detections in the `predictions` field whose bounding box
        # area is smaller than 0.2
        #

        # Bboxes are in [top-left-x, top-left-y, width, height] format
        bbox_area = F("bounding_box")[2] * F("bounding_box")[3]

        stage = fo.FilterLabels("predictions", bbox_area < 0.2)
        view = dataset.add_stage(stage)

    Polylines Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    predictions=fo.Polylines(
                        polylines=[
                            fo.Polyline(
                                label="lane",
                                points=[[(0.1, 0.1), (0.1, 0.6)]],
                                filled=False,
                            ),
                            fo.Polyline(
                                label="road",
                                points=[[(0.2, 0.2), (0.5, 0.5), (0.2, 0.5)]],
                                filled=True,
                            ),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    predictions=fo.Polylines(
                        polylines=[
                            fo.Polyline(
                                label="lane",
                                points=[[(0.4, 0.4), (0.9, 0.4)]],
                                filled=False,
                            ),
                            fo.Polyline(
                                label="road",
                                points=[[(0.6, 0.6), (0.9, 0.9), (0.6, 0.9)]],
                                filled=True,
                            ),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    predictions=None,
                ),
            ]
        )

        #
        # Only include polylines in the `predictions` field that are filled
        #

        stage = fo.FilterLabels("predictions", F("filled") == True)
        view = dataset.add_stage(stage)

        #
        # Only include polylines in the `predictions` field whose `label` is
        # "lane"
        #

        stage = fo.FilterLabels("predictions", F("label") == "lane")
        view = dataset.add_stage(stage)

        #
        # Only include polylines in the `predictions` field with at least
        # 3 vertices
        #

        num_vertices = F("points").map(F().length()).sum()
        stage = fo.FilterLabels("predictions", num_vertices >= 3)
        view = dataset.add_stage(stage)

    Keypoints Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    predictions=fo.Keypoint(
                        label="house",
                        points=[(0.1, 0.1), (0.1, 0.9), (0.9, 0.9), (0.9, 0.1)],
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    predictions=fo.Keypoint(
                        label="window",
                        points=[(0.4, 0.4), (0.5, 0.5), (0.6, 0.6)],
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    predictions=None,
                ),
            ]
        )

        #
        # Only include keypoints in the `predictions` field whose `label` is
        # "house"
        #

        stage = fo.FilterLabels("predictions", F("label") == "house")
        view = dataset.add_stage(stage)

        #
        # Only include keypoints in the `predictions` field with less than four
        # points
        #

        stage = fo.FilterLabels("predictions", F("points").length() < 4)
        view = dataset.add_stage(stage)

    Args:
        field: the label field to filter
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
        only_matches (True): whether to only include samples with at least
            one label after filtering (True) or include all samples (False)
        trajectories (False): whether to match entire object trajectories for
            which the object matches the given filter on at least one frame.
            Only applicable to video datasets and frame-level label fields
            whose objects have their ``index`` attributes populated
    """

    def __init__(
        self,
        field,
        filter,
        only_matches=True,
        trajectories=False,
        _new_field=None,
        _prefix="",
    ):
        self._field = field
        self._filter = filter
        self._only_matches = only_matches
        self._trajectories = trajectories
        self._new_field = _new_field or field
        self._prefix = _prefix
        self._labels_field = None
        self._is_frame_field = None
        self._is_labels_list_field = None
        self._validate_params()

    @property
    def field(self):
        """The label field to filter."""
        return self._field

    @property
    def filter(self):
        """The filter expression."""
        return self._filter

    @property
    def only_matches(self):
        """Whether to only include samples that match the filter."""
        return self._only_matches

    @property
    def trajectories(self):
        """Whether to match entire object trajectories for which the object
        matches the given filter on at least one frame.
        """
        return self._trajectories

    def get_filtered_fields(self, sample_collection, frames=False):
        if self._is_labels_list_field and (frames == self._is_frame_field):
            list_path, _ = sample_collection._handle_frame_field(
                self._labels_field
            )
            return [list_path]

        return None

    def to_mongo(self, sample_collection):
        if self._labels_field is None:
            raise ValueError(
                "`validate()` must be called before using a %s stage"
                % self.__class__
            )

        labels_field, is_frame_field = sample_collection._handle_frame_field(
            self._labels_field
        )
        new_field = self._get_new_field(sample_collection)

        pipeline = []

        if self._trajectories:
            (
                set_pipeline,
                label_filter,
                unset_pipeline,
            ) = _get_trajectories_filter(
                sample_collection, self._field, self._filter
            )

            pipeline.extend(set_pipeline)
        else:
            label_filter = self._filter

        if is_frame_field:
            if self._is_labels_list_field:
                _make_filter_pipeline = _get_filter_frames_list_field_pipeline
            else:
                _make_filter_pipeline = _get_filter_frames_field_pipeline
        elif self._is_labels_list_field:
            _make_filter_pipeline = _get_filter_list_field_pipeline
        else:
            _make_filter_pipeline = _get_filter_field_pipeline

        filter_pipeline = _make_filter_pipeline(
            labels_field,
            new_field,
            label_filter,
            only_matches=self._only_matches,
            prefix=self._prefix,
        )

        pipeline.extend(filter_pipeline)

        if self._trajectories:
            pipeline.extend(unset_pipeline)

        return pipeline

    def _parse_labels_field(self, sample_collection):
        field_name, is_list_field, is_frame_field = _parse_labels_field(
            sample_collection, self._field
        )
        self._is_frame_field = is_frame_field
        self._labels_field = field_name
        self._is_labels_list_field = is_list_field
        self._is_frame_field = is_frame_field

    def _get_mongo_filter(self):
        if self._trajectories:
            if self._is_labels_list_field:
                return _get_list_trajectory_mongo_filter(self._filter)

            return _get_trajectory_mongo_filter(self._filter)

        if self._is_labels_list_field:
            return _get_list_field_mongo_filter(self._filter)

        if self._is_frame_field:
            filter_field = self._field.split(".", 1)[1]  # remove `frames`
            return _get_field_mongo_filter(
                self._filter, prefix="$frame." + filter_field
            )

        return _get_field_mongo_filter(self._filter, prefix=self._field)

    def _get_new_field(self, sample_collection):
        field, _ = sample_collection._handle_frame_field(self._labels_field)
        new_field, _ = sample_collection._handle_frame_field(self._new_field)

        if "." in field:
            return ".".join([new_field, field.split(".")[-1]])

        return new_field

    def _needs_frames(self, sample_collection):
        return sample_collection._is_frame_field(self._labels_field)

    def _kwargs(self):
        return [
            ["field", self._field],
            ["filter", self._get_mongo_filter()],
            ["only_matches", self._only_matches],
            ["trajectories", self._trajectories],
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "field", "type": "field|str"},
            {"name": "filter", "type": "json", "placeholder": ""},
            {
                "name": "only_matches",
                "type": "bool",
                "default": "True",
                "placeholder": "only matches (default=True)",
            },
            {
                "name": "trajectories",
                "type": "bool",
                "default": "False",
                "placeholder": "trajectories (default=False)",
            },
        ]

    def _validate_params(self):
        if not isinstance(self._filter, (foe.ViewExpression, dict, bool)):
            raise ValueError(
                "Filter must be a ViewExpression or a MongoDB aggregation "
                "expression defining a filter; found '%s'" % self._filter
            )

    def validate(self, sample_collection):
        self._parse_labels_field(sample_collection)


def _get_filter_list_field_pipeline(
    filter_field, new_field, filter_arg, only_matches=True, prefix=""
):
    cond = _get_list_field_mongo_filter(filter_arg)
    pipeline = [
        {
            "$set": {
                prefix
                + new_field: {
                    "$filter": {
                        "input": "$" + prefix + filter_field,
                        "cond": cond,
                    }
                }
            }
        }
    ]

    if only_matches:
        match_expr = _get_list_field_only_matches_expr(prefix + new_field)
        pipeline.append({"$match": {"$expr": match_expr.to_mongo()}})

    return pipeline


def _get_list_field_only_matches_expr(field):
    return F(field).length() > 0


def _get_filter_frames_list_field_pipeline(
    filter_field, new_field, filter_arg, only_matches=True, prefix=""
):
    cond = _get_list_field_mongo_filter(filter_arg)
    label_field, labels_list = new_field.split(".")[-2:]

    old_field = filter_field.split(".")[0]

    pipeline = [
        {
            "$set": {
                "frames": {
                    "$map": {
                        "input": "$frames",
                        "as": "frame",
                        "in": {
                            "$mergeObjects": [
                                "$$frame",
                                {
                                    prefix
                                    + label_field: {
                                        "$mergeObjects": [
                                            "$$frame." + prefix + old_field,
                                            {
                                                labels_list: {
                                                    "$filter": {
                                                        "input": "$$frame."
                                                        + prefix
                                                        + filter_field,
                                                        "cond": cond,
                                                    }
                                                }
                                            },
                                        ]
                                    }
                                },
                            ]
                        },
                    }
                }
            }
        }
    ]

    if only_matches:
        match_expr = _get_frames_list_field_only_matches_expr(
            prefix + new_field
        )
        pipeline.append({"$match": {"$expr": match_expr.to_mongo()}})

    return pipeline


def _get_frames_list_field_only_matches_expr(field):
    return F("frames").reduce(VALUE + F(field).length()) > 0


def _get_trajectories_filter(sample_collection, field, filter_arg):
    label_type = sample_collection._get_label_field_type(field)
    path, is_frame_field = sample_collection._handle_frame_field(field)

    if not is_frame_field:
        raise ValueError(
            "Filtering trajectories is only supported for frame fields"
        )

    if issubclass(label_type, (fol.Detections, fol.Polylines, fol.Keypoints)):
        path += "." + label_type._LABEL_LIST_FIELD
        cond = _get_list_trajectory_mongo_filter(filter_arg)
        filter_expr = (F("index") != None) & foe.ViewExpression(cond)
        reduce_expr = VALUE.extend(
            (F(path) != None).if_else(
                F(path).filter(filter_expr).map(F("index")), [],
            )
        )
    elif issubclass(label_type, (fol.Detection, fol.Polyline, fol.Keypoint)):
        cond = _get_trajectory_mongo_filter(filter_arg)
        filter_expr = (F("index") != None) & foe.ViewExpression(cond)
        reduce_expr = (
            F(path)
            .apply(filter_expr)
            .if_else(VALUE.append(F(path + ".index")), VALUE)
        )
    else:
        raise ValueError(
            "Cannot filter trajectories for field '%s' of type %s"
            % (field, label_type)
        )

    # union() removes duplicates
    indexes_expr = F("frames").reduce(reduce_expr, []).union()

    set_pipeline = [{"$set": {"_indexes": indexes_expr.to_mongo()}}]
    label_filter = (F("$_indexes") != None) & F("$_indexes").contains(
        [F("index")]
    )
    unset_pipeline = [{"$unset": "_indexes"}]

    return set_pipeline, label_filter, unset_pipeline


def _get_trajectory_mongo_filter(filter_arg):
    if isinstance(filter_arg, foe.ViewExpression):
        return filter_arg.to_mongo(prefix="$$expr")

    return filter_arg


def _get_list_trajectory_mongo_filter(filter_arg):
    if isinstance(filter_arg, foe.ViewExpression):
        return filter_arg.to_mongo(prefix="$$this")

    return filter_arg


def _get_list_field_mongo_filter(filter_arg):
    if isinstance(filter_arg, foe.ViewExpression):
        return filter_arg.to_mongo(prefix="$$this")

    return filter_arg


class _FilterListField(FilterField):
    def _get_new_field(self, sample_collection):
        new_field, _ = sample_collection._handle_frame_field(self._new_field)
        return new_field

    @property
    def _filter_field(self):
        raise NotImplementedError("subclasses must implement `_filter_field`")

    def get_filtered_fields(self, sample_collection, frames=False):
        list_path, is_frame_field = sample_collection._handle_frame_field(
            self._filter_field
        )

        if frames == is_frame_field:
            return [list_path]

        return None

    def to_mongo(self, sample_collection):
        filter_field, is_frame_field = sample_collection._handle_frame_field(
            self._filter_field
        )
        new_field = self._get_new_field(sample_collection)

        if is_frame_field:
            _make_pipeline = _get_filter_frames_list_field_pipeline
        else:
            _make_pipeline = _get_filter_list_field_pipeline

        return _make_pipeline(
            filter_field,
            new_field,
            self._filter,
            only_matches=self._only_matches,
        )

    def _get_mongo_filter(self):
        return _get_list_field_mongo_filter(self._filter)

    def validate(self, sample_collection):
        raise NotImplementedError("subclasses must implement `validate()`")


@deprecated(reason="Use FilterLabels instead")
class FilterClassifications(_FilterListField):
    """Filters the :class:`fiftyone.core.labels.Classification` elements in the
    specified :class:`fiftyone.core.labels.Classifications` field of each
    sample in a collection.

    .. warning::

        This class is deprecated and will be removed in a future release.
        Use the drop-in replacement :class:`FilterLabels` instead.

    Args:
        field: the field to filter, which must be a
            :class:`fiftyone.core.labels.Classifications`
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
        only_matches (True): whether to only include samples with at least
            one classification after filtering (True) or include all samples
            (False)
    """

    @property
    def _filter_field(self):
        return self.field + ".classifications"

    def validate(self, sample_collection):
        sample_collection.validate_field_type(
            self.field,
            fof.EmbeddedDocumentField,
            embedded_doc_type=fol.Classifications,
        )


@deprecated(reason="Use FilterLabels instead")
class FilterDetections(_FilterListField):
    """Filters the :class:`fiftyone.core.labels.Detection` elements in the
    specified :class:`fiftyone.core.labels.Detections` field of each sample in
    a collection.

    .. warning::

        This class is deprecated and will be removed in a future release.
        Use the drop-in replacement :class:`FilterLabels` instead.

    Args:
        field: the field to filter, which must be a
            :class:`fiftyone.core.labels.Detections`
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
        only_matches (True): whether to only include samples with at least
            one detection after filtering (True) or include all samples (False)
    """

    @property
    def _filter_field(self):
        return self.field + ".detections"

    def validate(self, sample_collection):
        sample_collection.validate_field_type(
            self.field,
            fof.EmbeddedDocumentField,
            embedded_doc_type=fol.Detections,
        )


@deprecated(reason="Use FilterLabels instead")
class FilterPolylines(_FilterListField):
    """Filters the :class:`fiftyone.core.labels.Polyline` elements in the
    specified :class:`fiftyone.core.labels.Polylines` field of each sample in a
    collection.

    .. warning::

        This class is deprecated and will be removed in a future release.
        Use the drop-in replacement :class:`FilterLabels` instead.

    Args:
        field: the field to filter, which must be a
            :class:`fiftyone.core.labels.Polylines`
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
        only_matches (True): whether to only include samples with at least
            one polyline after filtering (True) or include all samples (False)
    """

    @property
    def _filter_field(self):
        return self.field + ".polylines"

    def validate(self, sample_collection):
        sample_collection.validate_field_type(
            self.field,
            fof.EmbeddedDocumentField,
            embedded_doc_type=fol.Polylines,
        )


@deprecated(reason="Use FilterLabels instead")
class FilterKeypoints(_FilterListField):
    """Filters the :class:`fiftyone.core.labels.Keypoint` elements in the
    specified :class:`fiftyone.core.labels.Keypoints` field of each sample in a
    collection.

    .. warning::

        This class is deprecated and will be removed in a future release.
        Use the drop-in replacement :class:`FilterLabels` instead.

    Args:
        field: the field to filter, which must be a
            :class:`fiftyone.core.labels.Keypoints`
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
        only_matches (True): whether to only include samples with at least
            one keypoint after filtering (True) or include all samples (False)
    """

    @property
    def _filter_field(self):
        return self.field + ".keypoints"

    def validate(self, sample_collection):
        sample_collection.validate_field_type(
            self.field,
            fof.EmbeddedDocumentField,
            embedded_doc_type=fol.Keypoints,
        )


class _GeoStage(ViewStage):
    def __init__(self, location_field):
        self._location_field = location_field
        self._location_key = None

    @property
    def location_field(self):
        """The location field."""
        return self._location_field

    def validate(self, sample_collection):
        if self._location_field is None:
            self._location_field = sample_collection._get_geo_location_field()

        if sample_collection._is_label_field(
            self._location_field, fol.GeoLocation
        ):
            # Assume the user meant the `.point` field
            self._location_key = self._location_field + ".point"
        else:
            # Assume the user directly specified the subfield to use
            self._location_key = self._location_field

        # These operations require a spherical index
        sample_collection.create_index([(self._location_key, "2dsphere")])


class GeoNear(_GeoStage):
    """Sorts the samples in a collection by their proximity to a specified
    geolocation.

    .. note::

        This stage must be the **first stage** in any
        :class:`fiftyone.core.view.DatasetView` in which it appears.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz

        TIMES_SQUARE = [-73.9855, 40.7580]

        dataset = foz.load_zoo_dataset("quickstart-geo")

        #
        # Sort the samples by their proximity to Times Square
        #

        stage = fo.GeoNear(TIMES_SQUARE)
        view = dataset.add_stage(stage)

        #
        # Sort the samples by their proximity to Times Square, and only
        # include samples within 5km
        #

        stage = fo.GeoNear(TIMES_SQUARE, max_distance=5000)
        view = dataset.add_stage(stage)

        #
        # Sort the samples by their proximity to Times Square, and only
        # include samples that are in Manhattan
        #

        import fiftyone.utils.geojson as foug

        in_manhattan = foug.geo_within(
            "location.point",
            [
                [
                    [-73.949701, 40.834487],
                    [-73.896611, 40.815076],
                    [-73.998083, 40.696534],
                    [-74.031751, 40.715273],
                    [-73.949701, 40.834487],
                ]
            ]
        )

        stage = fo.GeoNear(
            TIMES_SQUARE, location_field="location", query=in_manhattan
        )
        view = dataset.add_stage(stage)

    Args:
        point: the reference point to compute distances to. Can be any of the
            following:

            -   A ``[longitude, latitude]`` list
            -   A GeoJSON dict with ``Point`` type
            -   A :class:`fiftyone.core.labels.GeoLocation` instance whose
                ``point`` attribute contains the point

        location_field (None): the location data of each sample to use. Can be
            any of the following:

            -   The name of a :class:`fiftyone.core.fields.GeoLocation` field
                whose ``point`` attribute to use as location data
            -   An ``embedded.field.name`` containing GeoJSON data to use as
                location data
            -   ``None``, in which case there must be a single
                :class:`fiftyone.core.fields.GeoLocation` field on the samples,
                which is used by default

        min_distance (None): filter samples that are less than this distance
            (in meters) from ``point``
        max_distance (None): filter samples that are greater than this distance
            (in meters) from ``point``
        query (None): an optional dict defining a
            `MongoDB read query <https://docs.mongodb.com/manual/tutorial/query-documents/#read-operations-query-argument>`_
            that samples must match in order to be included in this view
    """

    def __init__(
        self,
        point,
        location_field=None,
        min_distance=None,
        max_distance=None,
        query=None,
    ):
        super().__init__(location_field)
        self._point = foug.parse_point(point)
        self._min_distance = min_distance
        self._max_distance = max_distance
        self._query = query

    @property
    def point(self):
        """The point to search proximity to."""
        return self._point

    @property
    def min_distance(self):
        """The minimum distance for matches, in meters."""
        return self._min_distance

    @property
    def max_distance(self):
        """The maximum distance for matches, in meters."""
        return self._max_distance

    @property
    def query(self):
        """A query dict specifying a match condition."""
        return self._query

    def to_mongo(self, _, **__):
        distance_field = self._location_field + "._distance"

        geo_near_expr = {
            "near": self._point,
            "key": self._location_key,
            "distanceField": distance_field,
            "spherical": True,
        }

        if self._min_distance is not None:
            geo_near_expr["minDistance"] = self._min_distance

        if self._max_distance is not None:
            geo_near_expr["maxDistance"] = self._max_distance

        if self._query is not None:
            geo_near_expr["query"] = self._query

        return [{"$geoNear": geo_near_expr}, {"$unset": distance_field}]

    def _kwargs(self):
        return [
            ["point", self._point],
            ["location_field", self._location_field],
            ["min_distance", self._min_distance],
            ["max_distance", self._max_distance],
            ["query", self._query],
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "point", "type": "json", "placeholder": ""},
            {
                "name": "location_field",
                "type": "NoneType|field|str",
                "placeholder": "",
                "default": "None",
            },
            {
                "name": "min_distance",
                "type": "NoneType|float",
                "placeholder": "min distance (meters)",
                "default": "None",
            },
            {
                "name": "max_distance",
                "type": "NoneType|float",
                "placeholder": "max distance (meters)",
                "default": "None",
            },
            {
                "name": "query",
                "type": "NoneType|dict",
                "placeholder": "",
                "default": "None",
            },
        ]


class GeoWithin(_GeoStage):
    """Filters the samples in a collection to only match samples whose
    geolocation is within a specified boundary.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz

        MANHATTAN = [
            [
                [-73.949701, 40.834487],
                [-73.896611, 40.815076],
                [-73.998083, 40.696534],
                [-74.031751, 40.715273],
                [-73.949701, 40.834487],
            ]
        ]

        dataset = foz.load_zoo_dataset("quickstart-geo")

        #
        # Create a view that only contains samples in Manhattan
        #

        stage = fo.GeoWithin(MANHATTAN)
        view = dataset.add_stage(stage)

    Args:
        boundary: a :class:`fiftyone.core.labels.GeoLocation`,
            :class:`fiftyone.core.labels.GeoLocations`, GeoJSON dict, or list
            of coordinates that define a ``Polygon`` or ``MultiPolygon`` to
            search within
        location_field (None): the location data of each sample to use. Can be
            any of the following:

            -   The name of a :class:`fiftyone.core.fields.GeoLocation` field
                whose ``point`` attribute to use as location data
            -   An ``embedded.field.name`` that directly contains the GeoJSON
                location data to use
            -   ``None``, in which case there must be a single
                :class:`fiftyone.core.fields.GeoLocation` field on the samples,
                which is used by default

        strict (True): whether a sample's location data must strictly fall
            within boundary (True) in order to match, or whether any
            intersection suffices (False)
    """

    def __init__(self, boundary, location_field=None, strict=True):
        super().__init__(location_field)
        self._boundary = foug.parse_polygon(boundary)
        self._strict = strict

    @property
    def boundary(self):
        """A GeoJSON dict describing the boundary to match within."""
        return self._boundary

    @property
    def strict(self):
        """Whether matches must be strictly contained in the boundary."""
        return self._strict

    def to_mongo(self, _, **__):
        op = "$geoWithin" if self._strict else "$geoIntersects"
        return [
            {
                "$match": {
                    self._location_key: {op: {"$geometry": self._boundary}}
                }
            }
        ]

    def _kwargs(self):
        return [
            ["boundary", self._boundary],
            ["location_field", self._location_field],
            ["strict", self._strict],
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "boundary", "type": "json", "placeholder": ""},
            {
                "name": "location_field",
                "type": "NoneType|field|str",
                "placeholder": "",
                "default": "None",
            },
            {
                "name": "strict",
                "type": "bool",
                "default": "True",
                "placeholder": "strict (default=True)",
            },
        ]


class GroupBy(ViewStage):
    """Creates a view that reorganizes the samples in a collection so that they
    are grouped by a specified field or expression.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("cifar10", split="test")

        # Take a random sample of 1000 samples and organize them by ground
        # truth label with groups arranged in decreasing order of size
        stage = fo.GroupBy(
            "ground_truth.label",
            sort_expr=F().length(),
            reverse=True,
        )
        view = dataset.take(1000).add_stage(stage)

        print(view.values("ground_truth.label"))
        print(
            sorted(
                view.count_values("ground_truth.label").items(),
                key=lambda kv: kv[1],
                reverse=True,
            )
        )

    Args:
        field_or_expr: the field or ``embedded.field.name`` to group by, or a
            :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that defines the value to group by
        sort_expr (None): an optional
            :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that defines how to sort the groups in the output view. If
            provided, this expression will be evaluated on the list of samples
            in each group
        reverse (False): whether to return the results in descending order
    """

    def __init__(self, field_or_expr, sort_expr=None, reverse=False):
        self._field_or_expr = field_or_expr
        self._sort_expr = sort_expr
        self._reverse = reverse

    @property
    def field_or_expr(self):
        """The field or expression to group by."""
        return self._field_or_expr

    @property
    def sort_expr(self):
        """An expression defining how the sort the groups in the output view.
        """
        return self._sort_expr

    @property
    def reverse(self):
        """Whether to sort the groups in descending order."""
        return self._reverse

    def to_mongo(self, _):
        field_or_expr = self._get_mongo_field_or_expr()
        sort_expr = self._get_mongo_sort_expr()

        if etau.is_str(field_or_expr):
            group_expr = "$" + field_or_expr
        else:
            group_expr = field_or_expr

        pipeline = [
            {"$group": {"_id": group_expr, "docs": {"$push": "$$ROOT"}}}
        ]

        if sort_expr is not None:
            order = -1 if self._reverse else 1
            pipeline.extend(
                [
                    {"$set": {"_sort_field": sort_expr}},
                    {"$sort": {"_sort_field": order}},
                    {"$unset": "_sort_field"},
                ]
            )

        pipeline.extend(
            [{"$unwind": "$docs"}, {"$replaceRoot": {"newRoot": "$docs"}}]
        )

        return pipeline

    def _needs_frames(self, sample_collection):
        if sample_collection.media_type != fom.VIDEO:
            return False

        field_or_expr = self._get_mongo_field_or_expr()

        if etau.is_str(field_or_expr):
            return sample_collection._is_frame_field(field_or_expr)

        return _is_frames_expr(field_or_expr)

    def _get_mongo_field_or_expr(self):
        if isinstance(self._field_or_expr, foe.ViewField):
            return self._field_or_expr._expr

        if isinstance(self._field_or_expr, foe.ViewExpression):
            return self._field_or_expr.to_mongo()

        return self._field_or_expr

    def _get_mongo_sort_expr(self):
        if isinstance(self._sort_expr, foe.ViewExpression):
            return self._sort_expr.to_mongo(prefix="$docs")

        return self._sort_expr

    def _kwargs(self):
        return [
            ["field_or_expr", self._get_mongo_field_or_expr()],
            ["sort_expr", self._get_mongo_sort_expr()],
            ["reverse", self._reverse],
        ]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "field_or_expr",
                "type": "field|str|json",
                "placeholder": "field or expression",
            },
            {
                "name": "sort_expr",
                "type": "NoneType|json",
                "placeholder": "sort expression",
                "default": "None",
            },
            {
                "name": "reverse",
                "type": "bool",
                "default": "False",
                "placeholder": "reverse (default=False)",
            },
        ]

    def validate(self, sample_collection):
        field_or_expr = self._get_mongo_field_or_expr()

        if etau.is_str(field_or_expr):
            sample_collection.validate_fields_exist(field_or_expr)
            sample_collection.create_index(field_or_expr)


class Limit(ViewStage):
    """Creates a view with at most the given number of samples.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    ground_truth=fo.Classification(label="cat"),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    ground_truth=fo.Classification(label="dog"),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    ground_truth=None,
                ),
            ]
        )

        #
        # Only include the first 2 samples in the view
        #

        stage = fo.Limit(2)
        view = dataset.add_stage(stage)

    Args:
        limit: the maximum number of samples to return. If a non-positive
            number is provided, an empty view is returned
    """

    def __init__(self, limit):
        self._limit = limit

    @property
    def limit(self):
        """The maximum number of samples to return."""
        return self._limit

    def to_mongo(self, _):
        if self._limit <= 0:
            return [{"$match": {"_id": None}}]

        return [{"$limit": self._limit}]

    def _kwargs(self):
        return [["limit", self._limit]]

    @classmethod
    def _params(cls):
        return [{"name": "limit", "type": "int", "placeholder": "int"}]


class LimitLabels(ViewStage):
    """Limits the number of :class:`fiftyone.core.labels.Label` instances in
    the specified labels list field of each sample in a collection.

    The specified ``field`` must be one of the following types:

    -   :class:`fiftyone.core.labels.Classifications`
    -   :class:`fiftyone.core.labels.Detections`
    -   :class:`fiftyone.core.labels.Keypoints`
    -   :class:`fiftyone.core.labels.Polylines`

    Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="cat",
                                bounding_box=[0.1, 0.1, 0.5, 0.5],
                                confidence=0.9,
                            ),
                            fo.Detection(
                                label="dog",
                                bounding_box=[0.2, 0.2, 0.3, 0.3],
                                confidence=0.8,
                            ),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="cat",
                                bounding_box=[0.5, 0.5, 0.4, 0.4],
                                confidence=0.95,
                            ),
                            fo.Detection(label="rabbit"),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image4.png",
                    predictions=None,
                ),
            ]
        )

        #
        # Only include the first detection in the `predictions` field of each
        # sample
        #

        stage = fo.LimitLabels("predictions", 1)
        view = dataset.add_stage(stage)

    Args:
        field: the labels list field to filter
        limit: the maximum number of labels to include in each labels list.
            If a non-positive number is provided, all lists will be empty
    """

    def __init__(self, field, limit):
        self._field = field
        self._limit = limit
        self._labels_list_field = None
        self._is_frame_field = None

    @property
    def field(self):
        """The labels field to limit."""
        return self._field

    @property
    def limit(self):
        """The maximum number of labels to allow in each labels list."""
        return self._limit

    def get_filtered_fields(self, sample_collection, frames=False):
        if frames == self._is_frame_field:
            list_path, _ = sample_collection._handle_frame_field(
                self._labels_list_field
            )
            return [list_path]

        return None

    def to_mongo(self, sample_collection):
        if self._labels_list_field is None:
            raise ValueError(
                "`validate()` must be called before using a %s stage"
                % self.__class__
            )

        limit = max(self._limit, 0)
        root, leaf = self._labels_list_field.rsplit(".", 1)

        expr = (F() != None).if_else(
            F().set_field(leaf, F(leaf)[:limit]), None,
        )
        pipeline, _ = sample_collection._make_set_field_pipeline(root, expr)

        return pipeline

    def _needs_frames(self, sample_collection):
        return self._is_frame_field

    def _kwargs(self):
        return [
            ["field", self._field],
            ["limit", self._limit],
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "field", "type": "field"},
            {"name": "limit", "type": "int", "placeholder": "int"},
        ]

    def validate(self, sample_collection):
        list_field, is_frame_field = _parse_labels_list_field(
            sample_collection, self._field
        )
        self._labels_list_field = list_field
        self._is_frame_field = is_frame_field


class MapLabels(ViewStage):
    """Maps the ``label`` values of a :class:`fiftyone.core.labels.Label` field
    to new values for each sample in a collection.

    Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    weather=fo.Classification(label="sunny"),
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="cat",
                                bounding_box=[0.1, 0.1, 0.5, 0.5],
                                confidence=0.9,
                            ),
                            fo.Detection(
                                label="dog",
                                bounding_box=[0.2, 0.2, 0.3, 0.3],
                                confidence=0.8,
                            ),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    weather=fo.Classification(label="cloudy"),
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="cat",
                                bounding_box=[0.5, 0.5, 0.4, 0.4],
                                confidence=0.95,
                            ),
                            fo.Detection(label="rabbit"),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    weather=fo.Classification(label="partly cloudy"),
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="squirrel",
                                bounding_box=[0.25, 0.25, 0.5, 0.5],
                                confidence=0.5,
                            ),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image4.png",
                    predictions=None,
                ),
            ]
        )

        #
        # Map the "partly cloudy" weather label to "cloudy"
        #

        stage = fo.MapLabels("weather", {"partly cloudy": "cloudy"})
        view = dataset.add_stage(stage)

        #
        # Map "rabbit" and "squirrel" predictions to "other"
        #

        stage = fo.MapLabels(
            "predictions", {"rabbit": "other", "squirrel": "other"}
        )
        view = dataset.add_stage(stage)

    Args:
        field: the labels field to map
        map: a dict mapping label values to new label values
    """

    def __init__(self, field, map):
        self._field = field
        self._map = map
        self._labels_field = None

    @property
    def field(self):
        """The labels field to map."""
        return self._field

    @property
    def map(self):
        """The labels map dict."""
        return self._map

    def to_mongo(self, sample_collection):
        labels_field = _parse_labels_field(sample_collection, self._field)[0]
        label_path = labels_field + ".label"
        expr = F().map_values(self._map)
        pipeline, _ = sample_collection._make_set_field_pipeline(
            label_path, expr
        )
        return pipeline

    def _needs_frames(self, sample_collection):
        return sample_collection._is_frame_field(self._field)

    def _kwargs(self):
        return [
            ["field", self._field],
            ["map", self._map],
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "field", "type": "field"},
            {"name": "map", "type": "dict", "placeholder": "map"},
        ]

    def validate(self, sample_collection):
        _parse_labels_field(sample_collection, self._field)


class SetField(ViewStage):
    """Sets a field or embedded field on each sample in a collection by
    evaluating the given expression.

    This method can process embedded list fields. To do so, simply append
    ``[]`` to any list component(s) of the field path.

    .. note::

        There are two cases where FiftyOne will automatically unwind array
        fields without requiring you to explicitly specify this via the ``[]``
        syntax:

        **Top-level lists:** when you specify a ``field`` path that refers to a
        top-level list field of a dataset; i.e., ``list_field`` is
        automatically coerced to ``list_field[]``, if necessary.

        **List fields:** When you specify a ``field`` path that refers to the
        list field of a |Label| class, such as the
        :attr:`Detections.detections <fiftyone.core.labels.Detections.detections>`
        attribute; i.e., ``ground_truth.detections.label`` is automatically
        coerced to ``ground_truth.detections[].label``, if necessary.

        See the examples below for demonstrations of this behavior.

    The provided ``expr`` is interpreted relative to the document on which the
    embedded field is being set. For example, if you are setting a nested field
    ``field="embedded.document.field"``, then the expression ``expr`` you
    provide will be applied to the ``embedded.document`` document. Note that
    you can override this behavior by defining an expression that is bound to
    the root document by prepending ``"$"`` to any field name(s) in the
    expression.

    See the examples below for more information.

    .. note::

        Note that you cannot set a non-existing top-level field using this
        stage, since doing so would violate the dataset's schema. You can,
        however, first declare a new field via
        :meth:`fiftyone.core.dataset.Dataset.add_sample_field` and then
        populate it in a view via this stage.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("quickstart")

        #
        # Replace all values of uniqueness that are less than 0.5 with `None`
        #

        stage = fo.SetField(
            "uniqueness",
            (F("uniqueness") >= 0.5).if_else(F("uniqueness"), None)
        )
        view = dataset.add_stage(stage)
        print(view.bounds("uniqueness"))

        #
        # Lower bound all object confidences in the `predictions` field by 0.5
        #

        stage = fo.SetField(
            "predictions.detections.confidence", F("confidence").max(0.5)
        )
        view = dataset.add_stage(stage)
        print(view.bounds("predictions.detections.confidence"))

        #
        # Add a `num_predictions` property to the `predictions` field that
        # contains the number of objects in the field
        #

        stage = fo.SetField(
            "predictions.num_predictions",
            F("$predictions.detections").length(),
        )
        view = dataset.add_stage(stage)
        print(view.bounds("predictions.num_predictions"))

        #
        # Set an `is_animal` field on each object in the `predictions` field
        # that indicates whether the object is an animal
        #

        ANIMALS = [
            "bear", "bird", "cat", "cow", "dog", "elephant", "giraffe",
            "horse", "sheep", "zebra"
        ]

        stage = fo.SetField(
            "predictions.detections.is_animal", F("label").is_in(ANIMALS)
        )
        view = dataset.add_stage(stage)
        print(view.count_values("predictions.detections.is_animal"))

    Args:
        field: the field or ``embedded.field.name`` to set
        expr: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that defines the field value to set
    """

    def __init__(self, field, expr, _allow_missing=False):
        if isinstance(expr, MongoEngineBaseDocument):
            expr = expr.to_dict()
            expr.pop("_id", None)

        self._field = field
        self._expr = expr
        self._allow_missing = _allow_missing
        self._pipeline = None
        self._expr_dict = None

    @property
    def field(self):
        """The field to set."""
        return self._field

    @property
    def expr(self):
        """The expression to apply."""
        return self._expr

    def to_mongo(self, sample_collection):
        if self._pipeline is None:
            raise ValueError(
                "`validate()` must be called before using a %s stage"
                % self.__class__
            )

        return self._pipeline

    def _needs_frames(self, sample_collection):
        if sample_collection.media_type != fom.VIDEO:
            return False

        is_frame_field = sample_collection._is_frame_field(self._field)
        is_frame_expr = _is_frames_expr(self._get_mongo_expr())
        return is_frame_field or is_frame_expr

    def _kwargs(self):
        return [
            ["field", self._field],
            ["expr", self._get_mongo_expr()],
            ["_allow_missing", self._allow_missing],
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "field", "type": "field|str"},
            {"name": "expr", "type": "json", "placeholder": ""},
            {"name": "_allow_missing", "type": "bool", "default": "False"},
        ]

    def _get_mongo_expr(self):
        if self._expr_dict is not None:
            return self._expr_dict

        #
        # This won't be correct if there are list fields involved
        #
        # Note, however, that this code path won't be taken when this stage has
        # been added to a view; this is purely for `ViewStage.__repr__`
        #
        if "." in self._field:
            prefix = "$" + self._field.rsplit(".", 1)[0]
        else:
            prefix = None

        return foe.to_mongo(self._expr, prefix=prefix)

    def validate(self, sample_collection):
        if not self._allow_missing:
            sample_collection.validate_fields_exist(self._field)

        pipeline, expr_dict = sample_collection._make_set_field_pipeline(
            self._field,
            self._expr,
            embedded_root=True,
            allow_missing=self._allow_missing,
        )
        self._pipeline = pipeline
        self._expr_dict = expr_dict


class Match(ViewStage):
    """Filters the samples in the collection by the given filter.

    Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    weather=fo.Classification(label="sunny"),
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="cat",
                                bounding_box=[0.1, 0.1, 0.5, 0.5],
                                confidence=0.9,
                            ),
                            fo.Detection(
                                label="dog",
                                bounding_box=[0.2, 0.2, 0.3, 0.3],
                                confidence=0.8,
                            ),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image2.jpg",
                    weather=fo.Classification(label="cloudy"),
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="cat",
                                bounding_box=[0.5, 0.5, 0.4, 0.4],
                                confidence=0.95,
                            ),
                            fo.Detection(label="rabbit"),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    weather=fo.Classification(label="partly cloudy"),
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="squirrel",
                                bounding_box=[0.25, 0.25, 0.5, 0.5],
                                confidence=0.5,
                            ),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image4.jpg",
                    predictions=None,
                ),
            ]
        )

        #
        # Only include samples whose `filepath` ends with ".jpg"
        #

        stage = fo.Match(F("filepath").ends_with(".jpg"))
        view = dataset.add_stage(stage)

        #
        # Only include samples whose `weather` field is "sunny"
        #

        stage = fo.Match(F("weather").label == "sunny")
        view = dataset.add_stage(stage)

        #
        # Only include samples with at least 2 objects in their `predictions`
        # field
        #

        stage = fo.Match(F("predictions").detections.length() >= 2)
        view = dataset.add_stage(stage)

        #
        # Only include samples whose `predictions` field contains at least one
        # object with area smaller than 0.2
        #

        # Bboxes are in [top-left-x, top-left-y, width, height] format
        bbox = F("bounding_box")
        bbox_area = bbox[2] * bbox[3]

        small_boxes = F("predictions.detections").filter(bbox_area < 0.2)
        stage = fo.Match(small_boxes.length() > 0)
        view = dataset.add_stage(stage)

    Args:
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
    """

    def __init__(self, filter):
        self._filter = filter
        self._validate_params()

    @property
    def filter(self):
        """The filter expression."""
        return self._filter

    def to_mongo(self, _):
        return [{"$match": self._get_mongo_expr()}]

    def _needs_frames(self, sample_collection):
        if sample_collection.media_type != fom.VIDEO:
            return False

        return _is_frames_expr(self._get_mongo_expr())

    def _get_mongo_expr(self):
        if not isinstance(self._filter, foe.ViewExpression):
            return self._filter

        return {"$expr": self._filter.to_mongo()}

    def _kwargs(self):
        return [["filter", self._get_mongo_expr()]]

    def _validate_params(self):
        if not isinstance(self._filter, (foe.ViewExpression, dict, bool)):
            raise ValueError(
                "Filter must be a ViewExpression or a MongoDB aggregation "
                "expression defining a filter; found '%s'" % self._filter
            )

    @classmethod
    def _params(cls):
        return [{"name": "filter", "type": "json", "placeholder": ""}]


class MatchFrames(ViewStage):
    """Filters the frames in a video collection by the given filter.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("quickstart-video")

        #
        # Match frames with at least 10 detections
        #

        num_objects = F("detections.detections").length()
        stage = fo.MatchFrames(num_objects > 10)
        view = dataset.add_stage(stage)

        print(dataset.count())
        print(view.count())

        print(dataset.count("frames"))
        print(view.count("frames"))

    Args:
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
        omit_empty (True): whether to omit samples with no frame labels after
            filtering
    """

    def __init__(self, filter, omit_empty=True):
        self._filter = filter
        self._omit_empty = omit_empty
        self._validate_params()

    @property
    def filter(self):
        """The filter expression."""
        return self._filter

    @property
    def omit_empty(self):
        """Whether to omit samples that have no frames after filtering."""
        return self._omit_empty

    def _get_mongo_expr(self):
        if not isinstance(self._filter, foe.ViewExpression):
            return self._filter

        return self._filter.to_mongo(prefix="$$this")

    def to_mongo(self, _):
        pipeline = [
            {
                "$set": {
                    "frames": {
                        "$filter": {
                            "input": "$frames",
                            "as": "this",
                            "cond": self._get_mongo_expr(),
                        }
                    }
                }
            }
        ]

        if self._omit_empty:
            non_empty_expr = F("frames").length() > 0
            pipeline.append({"$match": {"$expr": non_empty_expr.to_mongo()}})

        return pipeline

    def _kwargs(self):
        return [
            ["filter", self._get_mongo_expr()],
            ["omit_empty", self._omit_empty],
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "filter", "type": "json", "placeholder": ""},
            {
                "name": "omit_empty",
                "type": "bool",
                "default": "True",
                "placeholder": "omit empty (default=True)",
            },
        ]

    def _validate_params(self):
        if not isinstance(self._filter, (foe.ViewExpression, dict, bool)):
            raise ValueError(
                "Filter must be a ViewExpression or a MongoDB aggregation "
                "expression defining a filter; found '%s'" % self._filter
            )

    def _needs_frames(self, _):
        return True

    def validate(self, sample_collection):
        fova.validate_video_collection(sample_collection)


class MatchLabels(ViewStage):
    """Selects the samples from a collection that contain the specified labels.

    The returned view will only contain samples that have at least one label
    that matches the specified selection criteria.

    Note that, unlike :class:`SelectLabels` and :class:`FilterLabels`, this
    stage will not filter the labels themselves; it only selects the
    corresponding samples.

    You can perform a selection via one or more of the following methods:

    -   Provide the ``labels`` argument, which should contain a list of dicts
        in the format returned by
        :meth:`fiftyone.core.session.Session.selected_labels`, to match
        specific labels

    -   Provide the ``ids`` argument to match labels with specific IDs

    -   Provide the ``tags`` argument to match labels with specific tags

    -   Provide the ``filter`` argument to match labels based on a boolean
        :class:`fiftyone.core.expressions.ViewExpression` that is applied to
        each individual :class:`fiftyone.core.labels.Label` element

    If multiple criteria are specified, labels must match all of them in order
    to trigger a sample match.

    By default, the selection is applied to all
    :class:`fiftyone.core.labels.Label` fields, but you can provide the
    ``fields`` argument to explicitly define the field(s) in which to search.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("quickstart")

        #
        # Only show samples whose labels are currently selected in the App
        #

        session = fo.launch_app(dataset)

        # Select some labels in the App...

        stage = fo.MatchLabels(labels=session.selected_labels)
        view = dataset.add_stage(stage)

        #
        # Only include samples that contain labels with the specified IDs
        #

        # Grab some label IDs
        ids = [
            dataset.first().ground_truth.detections[0].id,
            dataset.last().predictions.detections[0].id,
        ]

        stage = fo.MatchLabels(ids=ids)
        view = dataset.add_stage(stage)

        print(len(view))
        print(view.count("ground_truth.detections"))
        print(view.count("predictions.detections"))

        #
        # Only include samples that contain labels with the specified tags
        #

        # Grab some label IDs
        ids = [
            dataset.first().ground_truth.detections[0].id,
            dataset.last().predictions.detections[0].id,
        ]

        # Give the labels a "test" tag
        dataset = dataset.clone()  # create copy since we're modifying data
        dataset.select_labels(ids=ids).tag_labels("test")

        print(dataset.count_values("ground_truth.detections.tags"))
        print(dataset.count_values("predictions.detections.tags"))

        # Retrieve the labels via their tag
        stage = fo.MatchLabels(tags="test")
        view = dataset.add_stage(stage)

        print(len(view))
        print(view.count("ground_truth.detections"))
        print(view.count("predictions.detections"))

        #
        # Only include samples that contain labels matching a filter
        #

        filter = F("confidence") > 0.99
        stage = fo.MatchLabels(filter=filter, fields="predictions")
        view = dataset.add_stage(stage)

        print(len(view))
        print(view.count("ground_truth.detections"))
        print(view.count("predictions.detections"))

    Args:
        labels (None): a list of dicts specifying the labels to select in the
            format returned by
            :meth:`fiftyone.core.session.Session.selected_labels`
        ids (None): an ID or iterable of IDs of the labels to select
        tags (None): a tag or iterable of tags of labels to select
        filter (None): a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing whether to select a given label.
            In the case of list fields like
            :class:`fiftyone.core.labels.Detections`, the filter is applied to
            the list elements, not the root field
        fields (None): a field or iterable of fields from which to select
    """

    _FILTER_PREFIX = "$$FIELD"

    def __init__(
        self, labels=None, ids=None, tags=None, filter=None, fields=None,
    ):
        if labels is not None:
            sample_ids, labels_map = _parse_labels(labels)
        else:
            sample_ids, labels_map = None, None

        if etau.is_str(ids):
            ids = [ids]
        elif ids is not None:
            ids = list(ids)

        if etau.is_str(tags):
            tags = [tags]
        elif tags is not None:
            tags = list(tags)

        if etau.is_str(fields):
            fields = [fields]
        elif fields is not None:
            fields = list(fields)

        self._labels = labels
        self._ids = ids
        self._tags = tags
        self._filter = filter
        self._fields = fields
        self._sample_ids = sample_ids
        self._labels_map = labels_map
        self._pipeline = None

    @property
    def labels(self):
        """A list of dicts specifying the labels to match."""
        return self._labels

    @property
    def ids(self):
        """A list of IDs of labels to match."""
        return self._ids

    @property
    def tags(self):
        """A list of tags of labels to match."""
        return self._tags

    @property
    def filter(self):
        """A filter expression that defines the labels to match."""
        return self._filter

    @property
    def fields(self):
        """A list of fields from which labels are being matched."""
        return self._fields

    def to_mongo(self, _):
        if self._pipeline is None:
            raise ValueError(
                "`validate()` must be called before using a %s stage"
                % self.__class__
            )

        return self._pipeline

    def _kwargs(self):
        return [
            ["labels", self._labels],
            ["ids", self._ids],
            ["tags", self._tags],
            ["filter", self._get_mongo_filter()],
            ["fields", self._fields],
        ]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "labels",
                "type": "NoneType|json",
                "placeholder": "[{...}]",
                "default": "None",
            },
            {
                "name": "ids",
                "type": "NoneType|list<id>|id",
                "placeholder": "ids",
                "default": "None",
            },
            {
                "name": "tags",
                "type": "NoneType|list<str>|str",
                "placeholder": "tags",
                "default": "None",
            },
            {
                "name": "filter",
                "type": "NoneType|json",
                "placeholder": "filter",
                "default": "None",
            },
            {
                "name": "fields",
                "type": "NoneType|list<field>|field|list<str>|str",
                "placeholder": "fields",
                "default": "None",
            },
        ]

    def _get_mongo_filter(self):
        if isinstance(self._filter, foe.ViewExpression):
            return self._filter.to_mongo(prefix=self._FILTER_PREFIX)

        return self._filter

    def _needs_frames(self, sample_collection):
        if self._labels is not None:
            fields = self._labels_map.keys()
        elif self._fields is not None:
            fields = self._fields
        else:
            fields = sample_collection._get_label_fields()

        return any(sample_collection._is_frame_field(f) for f in fields)

    def _make_labels_pipeline(self, sample_collection):
        stage = Select(self._sample_ids)
        stage.validate(sample_collection)
        return stage.to_mongo(sample_collection)

    def _make_pipeline(self, sample_collection):
        if self._ids is None and self._tags is None and self._filter is None:
            return [{"$match": {"$expr": False}}]

        if self._fields is not None:
            fields = self._fields
        else:
            fields = sample_collection._get_label_fields()

        id_tag_expr = None

        if self._ids is not None:
            id_tag_expr = F("_id").is_in([ObjectId(_id) for _id in self._ids])

        if self._tags is not None:
            tag_expr = (F("tags") != None).if_else(
                F("tags").contains(self._tags), False
            )
            if id_tag_expr is None:
                id_tag_expr = tag_expr
            else:
                id_tag_expr &= tag_expr

        pipeline = []

        # Create temporary fields containing only the selected labels
        fields_map = {}
        for field in fields:
            if sample_collection._is_frame_field(field):
                frames, leaf = field.split(".", 1)
                new_field = frames + ".__" + leaf
            else:
                new_field = "__" + field

            fields_map[field] = new_field

            filter_expr = _render_filter(
                sample_collection,
                id_tag_expr,
                self._filter,
                field,
                self._FILTER_PREFIX,
            )

            stage = FilterLabels(
                field, filter_expr, only_matches=False, _new_field=new_field
            )
            stage.validate(sample_collection)
            pipeline.extend(stage.to_mongo(sample_collection))

        # Select samples that have selected labels
        pipeline.extend(
            _make_match_empty_labels_pipeline(sample_collection, fields_map)
        )

        # Delete temporary fields
        if fields_map:
            pipeline.append({"$unset": list(fields_map.values())})

        return pipeline

    def validate(self, sample_collection):
        if self._labels is not None:
            self._pipeline = self._make_labels_pipeline(sample_collection)
        else:
            self._pipeline = self._make_pipeline(sample_collection)


def _render_filter(
    sample_collection, id_tag_expr, filter_expr_or_dict, field, var_prefix
):
    if filter_expr_or_dict is None:
        return id_tag_expr

    if isinstance(filter_expr_or_dict, foe.ViewExpression):
        if id_tag_expr is not None:
            return id_tag_expr & filter_expr_or_dict

        return filter_expr_or_dict

    _, is_list_field, is_frame_field = _parse_labels_field(
        sample_collection, field
    )

    if is_list_field:
        prefix = "$$this"
    elif is_frame_field:
        prefix = "$frame." + field.split(".", 1)[1]
    else:
        prefix = "$" + field

    filter_dict = _replace_prefix(filter_expr_or_dict, var_prefix, prefix)

    if id_tag_expr is not None:
        return {"$and": [id_tag_expr.to_mongo(prefix=prefix), filter_dict]}

    return filter_dict


def _replace_prefix(val, old, new):
    if isinstance(val, dict):
        return {
            _replace_prefix(k, old, new): _replace_prefix(v, old, new)
            for k, v in val.items()
        }

    if isinstance(val, list):
        return [_replace_prefix(v, old, new) for v in val]

    if etau.is_str(val):
        if val == old:
            return new

        if val.startswith(old + "."):
            return new + val[len(old) :]

    return val


class MatchTags(ViewStage):
    """Returns a view containing the samples in the collection that have (or do
    not have) any of the given tag(s).

    To match samples that must contain multiple tags, chain multiple
    :class:`MatchTags` stages together.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    tags=["train"],
                    ground_truth=fo.Classification(label="cat"),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    tags=["test"],
                    ground_truth=fo.Classification(label="cat"),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    ground_truth=None,
                ),
            ]
        )

        #
        # Only include samples that have the "test" tag
        #

        stage = fo.MatchTags("test")
        view = dataset.add_stage(stage)

        #
        # Only include samples that have either the "test" or "train" tag
        #

        stage = fo.MatchTags(["test", "train"])
        view = dataset.add_stage(stage)

        #
        # Only include samples that do not have the "train" tag
        #

        stage = fo.MatchTags("train", bool=False)
        view = dataset.add_stage(stage)

    Args:
        tags: the tag or iterable of tags to match
        bool (True): whether to match samples that have (True) or do not have
            (False) the given tags
    """

    def __init__(self, tags, bool=True):
        if etau.is_str(tags):
            tags = [tags]
        else:
            tags = list(tags)

        self._tags = tags
        self._bool = bool

    @property
    def tags(self):
        """The list of tags to match."""
        return self._tags

    @property
    def bool(self):
        """Whether to match samples that have (True) or do not have (False) any
        of the given tags.
        """
        return self._bool

    def to_mongo(self, _):
        if self._bool:
            return [{"$match": {"tags": {"$in": self._tags}}}]

        return [{"$match": {"tags": {"$nin": self._tags}}}]

    def _kwargs(self):
        return [["tags", self._tags], ["bool", self._bool]]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "tags",
                "type": "list<str>|str",
                "placeholder": "list,of,tags",
            },
            {
                "name": "bool",
                "type": "bool",
                "default": "True",
                "placeholder": "bool (default=True)",
            },
        ]


class Mongo(ViewStage):
    """A view stage defined by a raw MongoDB aggregation pipeline.

    See `MongoDB aggregation pipelines <https://docs.mongodb.com/manual/core/aggregation-pipeline/>`_
    for more details.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="cat",
                                bounding_box=[0.1, 0.1, 0.5, 0.5],
                                confidence=0.9,
                            ),
                            fo.Detection(
                                label="dog",
                                bounding_box=[0.2, 0.2, 0.3, 0.3],
                                confidence=0.8,
                            ),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="cat",
                                bounding_box=[0.5, 0.5, 0.4, 0.4],
                                confidence=0.95,
                            ),
                            fo.Detection(label="rabbit"),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="squirrel",
                                bounding_box=[0.25, 0.25, 0.5, 0.5],
                                confidence=0.5,
                            ),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image4.png",
                    predictions=None,
                ),
            ]
        )

        #
        # Extract a view containing the second and third samples in the dataset
        #

        stage = fo.Mongo([{"$skip": 1}, {"$limit": 2}])
        view = dataset.add_stage(stage)

        #
        # Sort by the number of objects in the `precictions` field
        #

        stage = fo.Mongo([
            {
                "$set": {
                    "_sort_field": {
                        "$size": {"$ifNull": ["$predictions.detections", []]}
                    }
                }
            },
            {"$sort": {"_sort_field": -1}},
            {"$unset": "_sort_field"}
        ])
        view = dataset.add_stage(stage)

    Args:
        pipeline: a MongoDB aggregation pipeline (list of dicts)
    """

    def __init__(self, pipeline):
        self._pipeline = pipeline

    @property
    def pipeline(self):
        """The MongoDB aggregation pipeline."""
        return self._pipeline

    def to_mongo(self, _):
        return self._pipeline

    def _needs_frames(self, sample_collection):
        # The pipeline could be anything; always attach frames for videos
        return sample_collection.media_type == fom.VIDEO

    def _kwargs(self):
        return [["pipeline", self._pipeline]]

    @classmethod
    def _params(cls):
        return [{"name": "pipeline", "type": "json", "placeholder": ""}]


class Select(ViewStage):
    """Selects the samples with the given IDs from a collection.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart")

        #
        # Create a view containing the currently selected samples in the App
        #

        session = fo.launch_app(dataset)

        # Select samples in the App...

        stage = fo.Select(session.selected)
        view = dataset.add_stage(stage)

    Args:
        sample_ids: the samples to select. Can be any of the following:

            -   a sample ID
            -   an iterable of sample IDs
            -   a :class:`fiftyone.core.sample.Sample` or
                :class:`fiftyone.core.sample.SampleView`
            -   an iterable of sample IDs
            -   a :class:`fiftyone.core.collections.SampleCollection`
            -   an iterable of :class:`fiftyone.core.sample.Sample` or
                :class:`fiftyone.core.sample.SampleView` instances

        ordered (False): whether to sort the samples in the returned view to
            match the order of the provided IDs
    """

    def __init__(self, sample_ids, ordered=False):
        self._sample_ids = _get_sample_ids(sample_ids)
        self._ordered = ordered

    @property
    def sample_ids(self):
        """The list of sample IDs to select."""
        return self._sample_ids

    @property
    def ordered(self):
        """Whether to sort the samples in the same order as the IDs."""
        return self._ordered

    def to_mongo(self, _):
        ids = [ObjectId(_id) for _id in self._sample_ids]

        if not self._ordered:
            return [{"$match": {"_id": {"$in": ids}}}]

        return [
            {"$set": {"_select_order": {"$indexOfArray": [ids, "$_id"]}}},
            {"$match": {"_select_order": {"$gt": -1}}},
            {"$sort": {"_select_order": 1}},
            {"$unset": "_select_order"},
        ]

    def _kwargs(self):
        return [["sample_ids", self._sample_ids], ["ordered", self._ordered]]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "sample_ids",
                "type": "list<id>|id",
                "placeholder": "list,of,sample,ids",
            },
            {
                "name": "ordered",
                "type": "bool",
                "default": "False",
                "placeholder": "ordered (default=False)",
            },
        ]


class SelectBy(ViewStage):
    """Selects the samples with the given field values from a collection.

    This stage is typically used to work with categorical fields (strings,
    ints, and bools). If you want to select samples based on floating point
    fields, use :class:`Match`.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(filepath="image%d.jpg" % i, int=i, str=str(i))
                for i in range(100)
            ]
        )

        #
        # Create a view containing samples whose `int` field have the given
        # values
        #

        stage = fo.SelectBy("int", [1, 51, 11, 41, 21, 31])
        view = dataset.add_stage(stage)
        print(view.head(6))

        #
        # Create a view containing samples whose `str` field have the given
        # values, in order
        #

        stage = fo.SelectBy(
            "str", ["1", "51", "11", "41", "21", "31"], ordered=True
        )
        view = dataset.add_stage(stage)
        print(view.head(6))

    Args:
        field: a field or ``embedded.field.name``
        values: a value or iterable of values to select by
        ordered (False): whether to sort the samples in the returned view to
            match the order of the provided values
    """

    def __init__(self, field, values, ordered=False):
        if etau.is_container(values):
            values = list(values)
        else:
            values = [values]

        self._field = field
        self._values = values
        self._ordered = ordered

    @property
    def field(self):
        """The field whose values to select by."""
        return self._field

    @property
    def values(self):
        """The list of values to select by."""
        return self._values

    @property
    def ordered(self):
        """Whether to sort the samples in the same order as the IDs."""
        return self._ordered

    def to_mongo(self, sample_collection):
        field_name, is_id_field, _ = sample_collection._handle_id_fields(
            self._field
        )

        if is_id_field:
            values = [
                value if isinstance(value, ObjectId) else ObjectId(value)
                for value in self._values
            ]
        else:
            values = self._values

        if not self._ordered:
            return [{"$match": {field_name: {"$in": values}}}]

        return [
            {
                "$set": {
                    "_select_order": {
                        "$indexOfArray": [values, "$" + field_name]
                    }
                }
            },
            {"$match": {"_select_order": {"$gt": -1}}},
            {"$sort": {"_select_order": 1}},
            {"$unset": "_select_order"},
        ]

    def _kwargs(self):
        return [
            ["field", self._field],
            ["values", self._values],
            ["ordered", self._ordered],
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "field", "type": "field|str", "placeholder": "field"},
            {
                "name": "values",
                "type": "json",
                "placeholder": "list,of,values",
            },
            {
                "name": "ordered",
                "type": "bool",
                "default": "False",
                "placeholder": "ordered (default=False)",
            },
        ]


class SelectFields(ViewStage):
    """Selects only the fields with the given names from the samples in the
    collection. All other fields are excluded.

    Note that default sample fields are always selected.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    numeric_field=1.0,
                    numeric_list_field=[-1, 0, 1],
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    numeric_field=-1.0,
                    numeric_list_field=[-2, -1, 0, 1],
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    numeric_field=None,
                ),
            ]
        )

        #
        # Include only the default fields on each sample
        #

        stage = fo.SelectFields()
        view = dataset.add_stage(stage)

        #
        # Include only the `numeric_field` field (and the default fields) on
        # each sample
        #

        stage = fo.SelectFields("numeric_field")
        view = dataset.add_stage(stage)

    Args:
        field_names (None): a field name or iterable of field names to select
    """

    def __init__(self, field_names=None, _allow_missing=False):
        if etau.is_str(field_names):
            field_names = [field_names]
        elif field_names is not None:
            field_names = list(field_names)

        self._field_names = field_names
        self._allow_missing = _allow_missing

    @property
    def field_names(self):
        """The list of field names to select."""
        return self._field_names or []

    def get_selected_fields(self, sample_collection, frames=False):
        return self._get_selected_fields(
            sample_collection, frames=frames, use_db_fields=False
        )

    def to_mongo(self, sample_collection):
        selected_fields = self._get_selected_fields(
            sample_collection, frames=False, use_db_fields=True
        )

        if sample_collection.media_type == fom.VIDEO:
            selected_frame_fields = [
                sample_collection._FRAMES_PREFIX + field
                for field in self._get_selected_fields(
                    sample_collection, frames=True, use_db_fields=True
                )
            ]

            if selected_frame_fields:
                # Don't project on root `frames` and embedded fields
                # https://docs.mongodb.com/manual/reference/operator/aggregation/project/#path-collision-errors-in-embedded-fields
                selected_fields = [f for f in selected_fields if f != "frames"]
                selected_fields += selected_frame_fields

        if not selected_fields:
            return []

        return [{"$project": {fn: True for fn in selected_fields}}]

    def _get_selected_fields(
        self, sample_collection, frames=False, use_db_fields=False
    ):
        if frames:
            if sample_collection.media_type != fom.VIDEO:
                return None

            default_fields = sample_collection._get_default_frame_fields(
                include_private=True, use_db_fields=use_db_fields
            )

            selected_fields = []
            for field in self.field_names:
                (
                    field_name,
                    is_frame_field,
                ) = sample_collection._handle_frame_field(field)
                if is_frame_field:
                    selected_fields.append(field_name)
        else:
            default_fields = sample_collection._get_default_sample_fields(
                include_private=True, use_db_fields=use_db_fields
            )
            if sample_collection.media_type == fom.VIDEO:
                default_fields += ("frames",)

            selected_fields = []
            for field in self.field_names:
                if not sample_collection._is_frame_field(field):
                    selected_fields.append(field)

        return list(set(selected_fields) | set(default_fields))

    def _needs_frames(self, sample_collection):
        return any(
            sample_collection._is_frame_field(f) for f in self.field_names
        )

    def _kwargs(self):
        return [
            ["field_names", self._field_names],
            ["_allow_missing", self._allow_missing],
        ]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "field_names",
                "type": "NoneType|list<field>|field|list<str>|str",
                "default": "None",
                "placeholder": "list,of,fields",
            },
            {"name": "_allow_missing", "type": "bool", "default": "False"},
        ]

    def validate(self, sample_collection):
        if self._allow_missing:
            return

        sample_collection.validate_fields_exist(self.field_names)


class SelectFrames(ViewStage):
    """Selects the frames with the given IDs from a video collection.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart-video")

        #
        # Select some specific frames
        #

        frame_ids = [
            dataset.first().frames.first().id,
            dataset.last().frames.last().id,
        ]

        stage = fo.SelectFrames(frame_ids)
        view = dataset.add_stage(stage)

        print(dataset.count())
        print(view.count())

        print(dataset.count("frames"))
        print(view.count("frames"))

    Args:
        frame_ids: the frames to select. Can be any of the following:

            -   a frame ID
            -   an iterable of frame IDs
            -   a :class:`fiftyone.core.frame.Frame` or
                :class:`fiftyone.core.frame.FrameView`
            -   an iterable of :class:`fiftyone.core.frame.Frame` or
                :class:`fiftyone.core.frame.FrameView` instances
            -   a :class:`fiftyone.core.collections.SampleCollection`, in which
                case the frame IDs in the collection are used

        omit_empty (True): whether to omit samples that have no frames after
            selecting the specified frames
    """

    def __init__(self, frame_ids, omit_empty=True):
        self._frame_ids = _get_frame_ids(frame_ids)
        self._omit_empty = omit_empty

    @property
    def frame_ids(self):
        """The list of frame IDs to select."""
        return self._frame_ids

    @property
    def omit_empty(self):
        """Whether to omit samples that have no labels after filtering."""
        return self._omit_empty

    def to_mongo(self, _):
        frame_ids = [ObjectId(_id) for _id in self._frame_ids]
        select_expr = F("frames").filter(F("_id").is_in(frame_ids))
        pipeline = [{"$set": {"frames": select_expr.to_mongo()}}]

        if self._omit_empty:
            non_empty_expr = F("frames").length() > 0
            pipeline.append({"$match": {"$expr": non_empty_expr.to_mongo()}})

        return pipeline

    def _kwargs(self):
        return [
            ["frame_ids", self._frame_ids],
            ["omit_empty", self._omit_empty],
        ]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "frame_ids",
                "type": "list<id>|id",
                "placeholder": "list,of,frame,ids",
            },
            {
                "name": "omit_empty",
                "type": "bool",
                "default": "True",
                "placeholder": "omit empty (default=True)",
            },
        ]

    def _needs_frames(self, _):
        return True

    def validate(self, sample_collection):
        fova.validate_video_collection(sample_collection)


class SelectLabels(ViewStage):
    """Selects only the specified labels from a collection.

    The returned view will omit samples, sample fields, and individual labels
    that do not match the specified selection criteria.

    You can perform a selection via one or more of the following methods:

    -   Provide the ``labels`` argument, which should contain a list of dicts
        in the format returned by
        :meth:`fiftyone.core.session.Session.selected_labels`, to select
        specific labels

    -   Provide the ``ids`` argument to select labels with specific IDs

    -   Provide the ``tags`` argument to select labels with specific tags

    If multiple criteria are specified, labels must match all of them in order
    to be selected.

    By default, the selection is applied to all
    :class:`fiftyone.core.labels.Label` fields, but you can provide the
    ``fields`` argument to explicitly define the field(s) in which to select.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart")

        #
        # Only include the labels currently selected in the App
        #

        session = fo.launch_app(dataset)

        # Select some labels in the App...

        stage = fo.SelectLabels(labels=session.selected_labels)
        view = dataset.add_stage(stage)

        #
        # Only include labels with the specified IDs
        #

        # Grab some label IDs
        ids = [
            dataset.first().ground_truth.detections[0].id,
            dataset.last().predictions.detections[0].id,
        ]

        stage = fo.SelectLabels(ids=ids)
        view = dataset.add_stage(stage)

        print(view.count("ground_truth.detections"))
        print(view.count("predictions.detections"))

        #
        # Only include labels with the specified tags
        #

        # Grab some label IDs
        ids = [
            dataset.first().ground_truth.detections[0].id,
            dataset.last().predictions.detections[0].id,
        ]

        # Give the labels a "test" tag
        dataset = dataset.clone()  # create copy since we're modifying data
        dataset.select_labels(ids=ids).tag_labels("test")

        print(dataset.count_values("ground_truth.detections.tags"))
        print(dataset.count_values("predictions.detections.tags"))

        # Retrieve the labels via their tag
        stage = fo.SelectLabels(tags="test")
        view = dataset.add_stage(stage)

        print(view.count("ground_truth.detections"))
        print(view.count("predictions.detections"))

    Args:
        labels (None): a list of dicts specifying the labels to select in the
            format returned by
            :meth:`fiftyone.core.session.Session.selected_labels`
        ids (None): an ID or iterable of IDs of the labels to select
        tags (None): a tag or iterable of tags of labels to select
        fields (None): a field or iterable of fields from which to select
        omit_empty (True): whether to omit samples that have no labels after
            filtering
    """

    def __init__(
        self, labels=None, ids=None, tags=None, fields=None, omit_empty=True
    ):
        if labels is not None:
            sample_ids, labels_map = _parse_labels(labels)
        else:
            sample_ids, labels_map = None, None

        if etau.is_str(ids):
            ids = [ids]
        elif ids is not None:
            ids = list(ids)

        if etau.is_str(tags):
            tags = [tags]
        elif tags is not None:
            tags = list(tags)

        if etau.is_str(fields):
            fields = [fields]
        elif fields is not None:
            fields = list(fields)

        self._labels = labels
        self._ids = ids
        self._tags = tags
        self._fields = fields
        self._omit_empty = omit_empty
        self._sample_ids = sample_ids
        self._labels_map = labels_map
        self._pipeline = None

    @property
    def labels(self):
        """A list of dicts specifying the labels to select."""
        return self._labels

    @property
    def ids(self):
        """A list of IDs of labels to select."""
        return self._ids

    @property
    def tags(self):
        """A list of tags of labels to select."""
        return self._tags

    @property
    def fields(self):
        """A list of fields from which labels are being selected."""
        return self._fields

    @property
    def omit_empty(self):
        """Whether to omit samples that have no labels after filtering."""
        return self._omit_empty

    def get_filtered_fields(self, sample_collection, frames=False):
        if self._labels is not None:
            fields = self._labels_map.keys()
        elif self._fields is not None:
            fields = self._fields
        else:
            fields = sample_collection._get_label_fields()

        filtered_fields = []

        for field in fields:
            list_path, is_list_field, is_frame_field = _parse_labels_field(
                sample_collection, field
            )
            if is_list_field and frames == is_frame_field:
                list_path, _ = sample_collection._handle_frame_field(list_path)
                filtered_fields.append(list_path)

        if filtered_fields:
            return filtered_fields

        return None

    def to_mongo(self, _):
        if self._pipeline is None:
            raise ValueError(
                "`validate()` must be called before using a %s stage"
                % self.__class__
            )

        return self._pipeline

    def _kwargs(self):
        return [
            ["labels", self._labels],
            ["ids", self._ids],
            ["tags", self._tags],
            ["fields", self._fields],
            ["omit_empty", self._omit_empty],
        ]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "labels",
                "type": "NoneType|json",
                "placeholder": "[{...}]",
                "default": "None",
            },
            {
                "name": "ids",
                "type": "NoneType|list<id>|id",
                "placeholder": "ids",
                "default": "None",
            },
            {
                "name": "tags",
                "type": "NoneType|list<str>|str",
                "placeholder": "tags",
                "default": "None",
            },
            {
                "name": "fields",
                "type": "NoneType|list<field>|field|list<str>|str",
                "placeholder": "fields",
                "default": "None",
            },
            {
                "name": "omit_empty",
                "type": "bool",
                "default": "True",
                "placeholder": "omit empty (default=True)",
            },
        ]

    def _needs_frames(self, sample_collection):
        if self._labels is not None:
            fields = self._labels_map.keys()
        elif self._fields is not None:
            fields = self._fields
        else:
            fields = sample_collection._get_label_fields()

        return any(sample_collection._is_frame_field(f) for f in fields)

    def _make_labels_pipeline(self, sample_collection):
        pipeline = []

        if self._omit_empty:
            # Filter samples with no selected labels
            stage = Select(self._sample_ids)
            stage.validate(sample_collection)
            pipeline.extend(stage.to_mongo(sample_collection))

        #
        # We know that only fields in `_labels_map` will have matches, so
        # exclude other label fields
        #
        # Note that we don't implement `get_excluded_fields()` here, because
        # our intention is not to remove other fields from the schema, only to
        # empty their sample fields in the returned view
        #

        exclude_fields = list(
            set(sample_collection._get_label_fields())
            - set(self._labels_map.keys())
        )
        if exclude_fields:
            stage = ExcludeFields(exclude_fields)
            stage.validate(sample_collection)
            pipeline.extend(stage.to_mongo(sample_collection))

        # Select specified labels
        for field, labels_map in self._labels_map.items():
            label_filter = F("_id").is_in(
                [foe.ObjectId(_id) for _id in labels_map]
            )
            stage = FilterLabels(field, label_filter, only_matches=False)
            stage.validate(sample_collection)
            pipeline.extend(stage.to_mongo(sample_collection))

        return pipeline

    def _make_pipeline(self, sample_collection):
        if self._fields is not None:
            fields = self._fields
        else:
            fields = sample_collection._get_label_fields()

        pipeline = []

        #
        # We know that only `fields` will have matches, so exclude other label
        # fields
        #
        # Note that we don't implement `get_excluded_fields()` here, because
        # our intention is not to remove other fields from the schema, only to
        # empty their sample fields in the returned view
        #

        exclude_fields = list(
            set(sample_collection._get_label_fields()) - set(fields)
        )
        if exclude_fields:
            stage = ExcludeFields(exclude_fields)
            stage.validate(sample_collection)
            pipeline.extend(stage.to_mongo(sample_collection))

        #
        # Filter labels that don't match `tags` and `ids
        #

        filter_expr = None

        if self._ids is not None:
            filter_expr = F("_id").is_in([ObjectId(_id) for _id in self._ids])

        if self._tags is not None:
            tag_expr = (F("tags") != None).if_else(
                F("tags").contains(self._tags), False
            )
            if filter_expr is not None:
                filter_expr &= tag_expr
            else:
                filter_expr = tag_expr

        # Filter to only retain selected labels
        if filter_expr is not None:
            for field in fields:
                stage = FilterLabels(field, filter_expr, only_matches=False)
                stage.validate(sample_collection)
                pipeline.extend(stage.to_mongo(sample_collection))

        # Filter samples with no labels, if requested
        if self._omit_empty:
            pipeline.extend(
                _make_omit_empty_labels_pipeline(sample_collection, fields)
            )

        return pipeline

    def validate(self, sample_collection):
        if self._labels is not None:
            self._pipeline = self._make_labels_pipeline(sample_collection)
        else:
            self._pipeline = self._make_pipeline(sample_collection)


class Shuffle(ViewStage):
    """Randomly shuffles the samples in a collection.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    ground_truth=fo.Classification(label="cat"),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    ground_truth=fo.Classification(label="dog"),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    ground_truth=None,
                ),
            ]
        )

        #
        # Return a view that contains a randomly shuffled version of the
        # samples in the dataset
        #

        stage = fo.Shuffle()
        view = dataset.add_stage(stage)

        #
        # Shuffle the samples with a fixed random seed
        #

        stage = fo.Shuffle(seed=51)
        view = dataset.add_stage(stage)

    Args:
        seed (None): an optional random seed to use when shuffling the samples
    """

    def __init__(self, seed=None, _randint=None):
        self._seed = seed
        self._randint = _randint or _get_rng(seed).randint(1e7, 1e10)

    @property
    def seed(self):
        """The random seed to use, or ``None``."""
        return self._seed

    def to_mongo(self, _):
        # @todo can we avoid creating a new field here?
        return [
            {"$set": {"_rand_shuffle": {"$mod": [self._randint, "$_rand"]}}},
            {"$sort": {"_rand_shuffle": 1}},
            {"$unset": "_rand_shuffle"},
        ]

    def _kwargs(self):
        return [["seed", self._seed], ["_randint", self._randint]]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "seed",
                "type": "NoneType|float",
                "default": "None",
                "placeholder": "seed (default=None)",
            },
            {"name": "_randint", "type": "NoneType|int", "default": "None"},
        ]


class Skip(ViewStage):
    """Omits the given number of samples from the head of a collection.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    ground_truth=fo.Classification(label="cat"),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    ground_truth=fo.Classification(label="dog"),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    ground_truth=fo.Classification(label="rabbit"),
                ),
                fo.Sample(
                    filepath="/path/to/image4.png",
                    ground_truth=None,
                ),
            ]
        )

        #
        # Omit the first two samples from the dataset
        #

        stage = fo.Skip(2)
        view = dataset.add_stage(stage)

    Args:
        skip: the number of samples to skip. If a non-positive number is
            provided, no samples are omitted
    """

    def __init__(self, skip):
        self._skip = skip

    @property
    def skip(self):
        """The number of samples to skip."""
        return self._skip

    def to_mongo(self, _):
        if self._skip <= 0:
            return []

        return [{"$skip": self._skip}]

    def _kwargs(self):
        return [["skip", self._skip]]

    @classmethod
    def _params(cls):
        return [{"name": "skip", "type": "int", "placeholder": "int"}]


class SortBy(ViewStage):
    """Sorts the samples in a collection by the given field(s) or
    expression(s).

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("quickstart")

        #
        # Sort the samples by their `uniqueness` field in ascending order
        #

        stage = fo.SortBy("uniqueness", reverse=False)
        view = dataset.add_stage(stage)

        #
        # Sorts the samples in descending order by the number of detections in
        # their `predictions` field whose bounding box area is less than 0.2
        #

        # Bboxes are in [top-left-x, top-left-y, width, height] format
        bbox = F("bounding_box")
        bbox_area = bbox[2] * bbox[3]

        small_boxes = F("predictions.detections").filter(bbox_area < 0.2)
        stage = fo.SortBy(small_boxes.length(), reverse=True)
        view = dataset.add_stage(stage)

        #
        # Performs a compound sort where samples are first sorted in descending
        # order by number of detections and then in ascending order of
        # uniqueness for samples with the same number of predictions
        #

        stage = fo.SortBy(
            [
                (F("predictions.detections").length(), -1),
                ("uniqueness", 1),
            ]
        )
        view = dataset.add_stage(stage)

        num_objects, uniqueness = view[:5].values(
            [F("predictions.detections").length(), "uniqueness"]
        )
        print(list(zip(num_objects, uniqueness)))

    Args:
        field_or_expr: the field(s) or expression(s) to sort by. This can be
            any of the following:

            -   a field to sort by
            -   an ``embedded.field.name`` to sort by
            -   a :class:`fiftyone.core.expressions.ViewExpression` or a
                `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that defines the quantity to sort by
            -   a list of ``(field_or_expr, order)`` tuples defining a compound
                sort criteria, where ``field_or_expr`` is a field or expression
                as defined above, and ``order`` can be 1 or any string starting
                with "a" for ascending order, or -1 or any string starting with
                "d" for descending order

        reverse (False): whether to return the results in descending order
    """

    def __init__(self, field_or_expr, reverse=False):
        self._field_or_expr = field_or_expr
        self._reverse = reverse

    @property
    def field_or_expr(self):
        """The field or expression to sort by."""
        return self._field_or_expr

    @property
    def reverse(self):
        """Whether to return the results in descending order."""
        return self._reverse

    def to_mongo(self, _):
        field_or_expr = self._get_mongo_field_or_expr()

        if not isinstance(field_or_expr, list):
            field_or_expr = [(field_or_expr, 1)]

        if self._reverse:
            field_or_expr = [(f, -order) for f, order in field_or_expr]

        set_dict = {}
        sort_dict = OrderedDict()
        for idx, (expr, order) in enumerate(field_or_expr, 1):
            if etau.is_str(expr):
                field = expr
            else:
                field = "_sort_field%d" % idx
                set_dict[field] = expr

            sort_dict[field] = order

        pipeline = []

        if set_dict:
            pipeline.append({"$set": set_dict})

        pipeline.append({"$sort": sort_dict})

        if set_dict:
            pipeline.append({"$unset": list(set_dict.keys())})

        return pipeline

    def _needs_frames(self, sample_collection):
        if sample_collection.media_type != fom.VIDEO:
            return False

        field_or_expr = self._get_mongo_field_or_expr()

        if not isinstance(field_or_expr, list):
            field_or_expr = [(field_or_expr, None)]

        needs_frames = False
        for expr, _ in field_or_expr:
            if etau.is_str(expr):
                needs_frames |= sample_collection._is_frame_field(expr)
            else:
                needs_frames |= _is_frames_expr(expr)

        return needs_frames

    def _get_mongo_field_or_expr(self):
        return _serialize_sort_expr(self._field_or_expr)

    def _kwargs(self):
        return [
            ["field_or_expr", self._get_mongo_field_or_expr()],
            ["reverse", self._reverse],
        ]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "field_or_expr",
                "type": "field|str|json",
                "placeholder": "field or expression",
            },
            {
                "name": "reverse",
                "type": "bool",
                "default": "False",
                "placeholder": "reverse (default=False)",
            },
        ]

    def validate(self, sample_collection):
        field_or_expr = self._get_mongo_field_or_expr()

        if etau.is_str(field_or_expr):
            sample_collection.validate_fields_exist(field_or_expr)
            sample_collection.create_index(field_or_expr)


def _serialize_sort_expr(field_or_expr):
    if isinstance(field_or_expr, foe.ViewField):
        return field_or_expr._expr

    if isinstance(field_or_expr, foe.ViewExpression):
        return field_or_expr.to_mongo()

    if isinstance(field_or_expr, (list, tuple)):
        return [
            (_serialize_sort_expr(expr), _parse_sort_order(order))
            for expr, order in field_or_expr
        ]

    return field_or_expr


def _parse_sort_order(order):
    if etau.is_str(order):
        if order:
            if order.lower()[0] == "a":
                return 1

            if order.lower()[0] == "d":
                return -1

    if order in {-1, 1}:
        return order

    raise ValueError(
        "Invalid sort order %s. Supported values are 1 or any string starting "
        "with 'a' for ascending order, or -1 or any string starting with 'd' "
        "for descending order"
    )


class SortBySimilarity(ViewStage):
    """Sorts the samples in a collection by visual similiarity to a specified
    set of query ID(s).

    In order to use this stage, you must first use
    :meth:`fiftyone.brain.compute_similarity` to index your dataset by visual
    similiarity.

    Examples::

        import fiftyone as fo
        import fiftyone.brain as fob
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart").clone()

        fob.compute_similarity(dataset, brain_key="similarity")

        #
        # Sort the samples by their visual similarity to the first sample
        # in the dataset
        #

        query_id = dataset.first().id
        stage = fo.SortBySimilarity(query_id)
        view = dataset.add_stage(stage)

    Args:
        query_ids: an ID or iterable of query IDs. These may be sample IDs or
            label IDs depending on ``brain_key``
        k (None): the number of matches to return. By default, the entire
            collection is sorted
        reverse (False): whether to sort by least similarity
        brain_key (None): the brain key of an existing
            :meth:`fiftyone.brain.compute_similarity` run on the dataset. If
            not specified, the dataset must have an applicable run, which will
            be used by default
    """

    def __init__(
        self, query_ids, k=None, reverse=False, brain_key=None, _state=None
    ):
        if etau.is_str(query_ids):
            query_ids = [query_ids]
        else:
            query_ids = list(query_ids)

        self._query_ids = query_ids
        self._k = k
        self._reverse = reverse
        self._brain_key = brain_key
        self._state = _state
        self._pipeline = None

    @property
    def query_ids(self):
        """The list of query IDs."""
        return self._query_ids

    @property
    def k(self):
        """The number of matches to return."""
        return self._k

    @property
    def reverse(self):
        """Whether to sort by least similiarity."""
        return self._reverse

    @property
    def brain_key(self):
        """The brain key of the
        :class:`fiftyone.brain.similiarity.SimilarityResults` to use.
        """
        return self._brain_key

    def to_mongo(self, _):
        if self._pipeline is None:
            raise ValueError(
                "`validate()` must be called before using a %s stage"
                % self.__class__
            )

        return self._pipeline

    def _kwargs(self):
        return [
            ["query_ids", self._query_ids],
            ["k", self._k],
            ["reverse", self._reverse],
            ["brain_key", self._brain_key],
            ["_state", self._state],
        ]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "query_ids",
                "type": "list<id>|id",
                "placeholder": "list,of,ids",
            },
            {
                "name": "k",
                "type": "NoneType|int",
                "default": "None",
                "placeholder": "k (default=None)",
            },
            {
                "name": "reverse",
                "type": "bool",
                "default": "False",
                "placeholder": "reverse (default=False)",
            },
            {
                "name": "brain_key",
                "type": "NoneType|str",
                "default": "None",
                "placeholder": "brain key",
            },
            {"name": "_state", "type": "NoneType|json", "default": "None"},
        ]

    def validate(self, sample_collection):
        state = {
            "dataset": sample_collection.dataset_name,
            "stages": sample_collection.view()._serialize(include_uuids=False),
            "query_ids": self._query_ids,
            "k": self._k,
            "reverse": self._reverse,
            "brain_key": self._brain_key,
        }

        last_state = deepcopy(self._state)
        if last_state is not None:
            pipeline = last_state.pop("pipeline", None)
        else:
            pipeline = None

        if state != last_state or pipeline is None:
            pipeline = self._make_pipeline(sample_collection)

            state["pipeline"] = pipeline
            self._state = state

        self._pipeline = pipeline

    def _make_pipeline(self, sample_collection):
        if self._brain_key is not None:
            brain_key = self._brain_key
        else:
            brain_key = _get_default_similarity_run(sample_collection)

        results = sample_collection.load_brain_results(brain_key)

        with contextlib.ExitStack() as context:
            if sample_collection != results.view:
                results.use_view(sample_collection)
                context.enter_context(results)  # pylint: disable=no-member

            return results.sort_by_similarity(
                self._query_ids, k=self._k, reverse=self._reverse, _mongo=True
            )


class Take(ViewStage):
    """Randomly samples the given number of samples from a collection.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    ground_truth=fo.Classification(label="cat"),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    ground_truth=fo.Classification(label="dog"),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    ground_truth=fo.Classification(label="rabbit"),
                ),
                fo.Sample(
                    filepath="/path/to/image4.png",
                    ground_truth=None,
                ),
            ]
        )

        #
        # Take two random samples from the dataset
        #

        stage = fo.Take(2)
        view = dataset.add_stage(stage)

        #
        # Take two random samples from the dataset with a fixed seed
        #

        stage = fo.Take(2, seed=51)
        view = dataset.add_stage(stage)

    Args:
        size: the number of samples to return. If a non-positive number is
            provided, an empty view is returned
        seed (None): an optional random seed to use when selecting the samples
    """

    def __init__(self, size, seed=None, _randint=None):
        self._seed = seed
        self._size = size
        self._randint = _randint or _get_rng(seed).randint(1e7, 1e10)

    @property
    def size(self):
        """The number of samples to return."""
        return self._size

    @property
    def seed(self):
        """The random seed to use, or ``None``."""
        return self._seed

    def to_mongo(self, _):
        if self._size <= 0:
            return [{"$match": {"_id": None}}]

        # @todo can we avoid creating a new field here?
        return [
            {"$set": {"_rand_take": {"$mod": [self._randint, "$_rand"]}}},
            {"$sort": {"_rand_take": 1}},
            {"$limit": self._size},
            {"$unset": "_rand_take"},
        ]

    def _kwargs(self):
        return [
            ["size", self._size],
            ["seed", self._seed],
            ["_randint", self._randint],
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "size", "type": "int", "placeholder": "int"},
            {
                "name": "seed",
                "type": "NoneType|float",
                "default": "None",
                "placeholder": "seed (default=None)",
            },
            {"name": "_randint", "type": "NoneType|int", "default": "None"},
        ]


class ToPatches(ViewStage):
    """Creates a view that contains one sample per object patch in the
    specified field of a collection.

    A ``sample_id`` field will be added that records the sample ID from which
    each patch was taken.

    By default, fields other than ``field`` and the default sample fields will
    not be included in the returned view.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart")

        session = fo.launch_app(dataset)

        #
        # Create a view containing the ground truth patches
        #

        stage = fo.ToPatches("ground_truth")
        view = dataset.add_stage(stage)
        print(view)

        session.view = view

    Args:
        field: the patches field, which must be of type
            :class:`fiftyone.core.labels.Detections` or
            :class:`fiftyone.core.labels.Polylines`
        config (None): an optional dict of keyword arguments for
            :meth:`fiftyone.core.patches.make_patches_dataset` specifying how
            to perform the conversion
        **kwargs: optional keyword arguments for
            :meth:`fiftyone.core.patches.make_patches_dataset` specifying how
            to perform the conversion
    """

    def __init__(self, field, config=None, _state=None, **kwargs):
        if kwargs:
            if config is None:
                config = kwargs
            else:
                config.update(kwargs)

        self._field = field
        self._config = config
        self._state = _state

    @property
    def has_view(self):
        return True

    @property
    def field(self):
        """The patches field."""
        return self._field

    @property
    def config(self):
        """Parameters specifying how to perform the conversion."""
        return self._config

    def load_view(self, sample_collection):
        state = {
            "dataset": sample_collection.dataset_name,
            "stages": sample_collection.view()._serialize(include_uuids=False),
            "field": self._field,
            "config": self._config,
        }

        last_state = deepcopy(self._state)
        if last_state is not None:
            name = last_state.pop("name", None)
        else:
            name = None

        if state != last_state or not fod.dataset_exists(name):
            kwargs = self._config or {}
            patches_dataset = fop.make_patches_dataset(
                sample_collection, self._field, **kwargs
            )

            state["name"] = patches_dataset.name
            self._state = state
        else:
            patches_dataset = fod.load_dataset(name)

        return fop.PatchesView(sample_collection, self, patches_dataset)

    def _kwargs(self):
        return [
            ["field", self._field],
            ["config", self._config],
            ["_state", self._state],
        ]

    @classmethod
    def _params(self):
        return [
            {"name": "field", "type": "field", "placeholder": "label field"},
            {
                "name": "config",
                "type": "NoneType|json",
                "default": "None",
                "placeholder": "config (default=None)",
            },
            {"name": "_state", "type": "NoneType|json", "default": "None"},
        ]


class ToEvaluationPatches(ViewStage):
    """Creates a view based on the results of the evaluation with the given key
    that contains one sample for each true positive, false positive, and false
    negative example in the collection, respectively.

    True positive examples will result in samples with both their ground truth
    and predicted fields populated, while false positive/negative examples wilL
    only have one of their corresponding predicted/ground truth fields
    populated, respectively.

    If multiple predictions are matched to a ground truth object (e.g., if the
    evaluation protocol includes a crowd attribute), then all matched
    predictions will be stored in the single sample along with the ground truth
    object.

    The returned dataset will also have top-level ``type`` and ``iou`` fields
    populated based on the evaluation results for that example, as well as a
    ``sample_id`` field recording the sample ID of the example, and a ``crowd``
    field if the evaluation protocol defines a crowd attribute.

    .. note::

        The returned view will contain patches for the contents of this
        collection, which may differ from the view on which the ``eval_key``
        evaluation was performed. This may exclude some labels that were
        evaluated and/or include labels that were not evaluated.

        If you would like to see patches for the exact view on which an
        evaluation was performed, first call
        :meth:`load_evaluation_view() <fiftyone.core.collections.SampleCollection.load_evaluation_view>`
        to load the view and then convert to patches.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart")
        dataset.evaluate_detections("predictions", eval_key="eval")

        session = fo.launch_app(dataset)

        #
        # Create a patches view for the evaluation results
        #

        stage = fo.ToEvaluationPatches("eval")
        view = dataset.add_stage(stage)
        print(view)

        session.view = view

    Args:
        eval_key: an evaluation key that corresponds to the evaluation of
            ground truth/predicted fields that are of type
            :class:`fiftyone.core.labels.Detections` or
            :class:`fiftyone.core.labels.Polylines`
        config (None): an optional dict of keyword arguments for
            :meth:`fiftyone.core.patches.make_evaluation_patches_dataset`
            specifying how to perform the conversion
        **kwargs: optional keyword arguments for
            :meth:`fiftyone.core.patches.make_evaluation_patches_dataset`
            specifying how to perform the conversion
    """

    def __init__(self, eval_key, config=None, _state=None, **kwargs):
        if kwargs:
            if config is None:
                config = kwargs
            else:
                config.update(kwargs)

        self._eval_key = eval_key
        self._config = config
        self._state = _state

    @property
    def has_view(self):
        return True

    @property
    def eval_key(self):
        """The evaluation key to extract patches for."""
        return self._eval_key

    @property
    def config(self):
        """Parameters specifying how to perform the conversion."""
        return self._config

    def load_view(self, sample_collection):
        state = {
            "dataset": sample_collection.dataset_name,
            "stages": sample_collection.view()._serialize(include_uuids=False),
            "eval_key": self._eval_key,
            "config": self._config,
        }

        last_state = deepcopy(self._state)
        if last_state is not None:
            name = last_state.pop("name", None)
        else:
            name = None

        if state != last_state or not fod.dataset_exists(name):
            kwargs = self._config or {}
            eval_patches_dataset = fop.make_evaluation_patches_dataset(
                sample_collection, self._eval_key, **kwargs
            )

            state["name"] = eval_patches_dataset.name
            self._state = state
        else:
            eval_patches_dataset = fod.load_dataset(name)

        return fop.EvaluationPatchesView(
            sample_collection, self, eval_patches_dataset
        )

    def _kwargs(self):
        return [
            ["eval_key", self._eval_key],
            ["config", self._config],
            ["_state", self._state],
        ]

    @classmethod
    def _params(self):
        return [
            {"name": "eval_key", "type": "str", "placeholder": "eval key"},
            {
                "name": "config",
                "type": "NoneType|json",
                "default": "None",
                "placeholder": "config (default=None)",
            },
            {"name": "_state", "type": "NoneType|json", "default": "None"},
        ]


class ToClips(ViewStage):
    """Creates a view that contains one sample per clip defined by the given
    field or expression in a video collection.

    The returned view will contain:

    -   A ``sample_id`` field that records the sample ID from which each clip
        was taken
    -   A ``support`` field that records the ``[first, last]`` frame support of
        each clip
    -   All frame-level information from the underlying dataset of the input
        collection

    Refer to :meth:`fiftyone.core.clips.make_clips_dataset` to see the
    available configuration options for generating clips.

    .. note::

        The clip generation logic will respect any frame-level modifications
        defined in the input collection, but the output clips will always
        contain all frame-level labels.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("quickstart-video")

        #
        # Create a clips view that contains one clip for each contiguous
        # segment that contains at least one road sign in every frame
        #

        stage1 = fo.FilterLabels("frames.detections", F("label") == "road sign")
        stage2 = fo.ToClips("frames.detections")
        clips = dataset.add_stage(stage1).add_stage(stage2)
        print(clips)

        #
        # Create a clips view that contains one clip for each contiguous
        # segment that contains at least two road signs in every frame
        #

        signs = F("detections.detections").filter(F("label") == "road sign")
        stage = fo.ToClips(signs.length() >= 2)
        clips = dataset.add_stage(stage)
        print(clips)

    Args:
        field_or_expr: can be any of the following:

            -   a :class:`fiftyone.core.labels.TemporalDetection`,
                :class:`fiftyone.core.labels.TemporalDetections`,
                :class:`fiftyone.core.fields.FrameSupportField`, or list of
                :class:`fiftyone.core.fields.FrameSupportField` field
            -   a frame-level label list field of any of the following types:

                -   :class:`fiftyone.core.labels.Classifications`
                -   :class:`fiftyone.core.labels.Detections`
                -   :class:`fiftyone.core.labels.Polylines`
                -   :class:`fiftyone.core.labels.Keypoints`
            -   a :class:`fiftyone.core.expressions.ViewExpression` that
                returns a boolean to apply to each frame of the input
                collection to determine if the frame should be clipped
            -   a list of ``[(first1, last1), (first2, last2), ...]`` lists
                defining the frame numbers of the clips to extract from each
                sample
        config (None): an optional dict of keyword arguments for
            :meth:`fiftyone.core.clips.make_clips_dataset` specifying how to
            perform the conversion
        **kwargs: optional keyword arguments for
            :meth:`fiftyone.core.clips.make_clips_dataset` specifying how to
            perform the conversion
    """

    def __init__(self, field_or_expr, config=None, _state=None, **kwargs):
        if kwargs:
            if config is None:
                config = kwargs
            else:
                config.update(kwargs)

        self._field_or_expr = field_or_expr
        self._config = config
        self._state = _state

    @property
    def has_view(self):
        return True

    @property
    def field_or_expr(self):
        """The field or expression defining how to extract the clips."""
        return self._field_or_expr

    @property
    def config(self):
        """Parameters specifying how to perform the conversion."""
        return self._config

    def load_view(self, sample_collection):
        state = {
            "dataset": sample_collection.dataset_name,
            "stages": sample_collection.view()._serialize(include_uuids=False),
            "field_or_expr": self._get_mongo_field_or_expr(),
            "config": self._config,
        }

        last_state = deepcopy(self._state)
        if last_state is not None:
            name = last_state.pop("name", None)
        else:
            name = None

        if state != last_state or not fod.dataset_exists(name):
            kwargs = self._config or {}
            clips_dataset = foc.make_clips_dataset(
                sample_collection, self._field_or_expr, **kwargs
            )

            state["name"] = clips_dataset.name
            self._state = state
        else:
            clips_dataset = fod.load_dataset(name)

        return foc.ClipsView(sample_collection, self, clips_dataset)

    def _get_mongo_field_or_expr(self):
        if isinstance(self._field_or_expr, foe.ViewExpression):
            return self._field_or_expr.to_mongo()

        return self._field_or_expr

    def _kwargs(self):
        return [
            ["field_or_expr", self._get_mongo_field_or_expr()],
            ["config", self._config],
            ["_state", self._state],
        ]

    @classmethod
    def _params(self):
        return [
            {
                "name": "field_or_expr",
                "type": "field|str|json",
                "placeholder": "field or expression",
            },
            {
                "name": "config",
                "type": "NoneType|json",
                "default": "None",
                "placeholder": "config (default=None)",
            },
            {"name": "_state", "type": "NoneType|json", "default": "None"},
        ]


class ToFrames(ViewStage):
    """Creates a view that contains one sample per frame in a video collection.

    By default, samples will be generated for every frame of each video,
    based on the total frame count of the video files, but this method is
    highly customizable. Refer to
    :meth:`fiftyone.core.video.make_frames_dataset` to see the available
    configuration options.

    .. note::

        Unless you have configured otherwise, creating frame views will
        sample the necessary frames from the input video collection into
        directories of per-frame images. **For large video datasets,
        **this may take some time and require substantial disk space.**

        Frames that have previously been sampled will not be resampled, so
        creating frame views into the same dataset will become faster after the
        frames have been sampled.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("quickstart-video")

        session = fo.launch_app(dataset)

        #
        # Create a frames view for an entire video dataset
        #

        stage = fo.ToFrames()
        frames = dataset.add_stage(stage)
        print(frames)

        session.view = frames

        #
        # Create a frames view that only contains frames with at least 10
        # objects, sampled at a maximum frame rate of 1fps
        #

        num_objects = F("detections.detections").length()
        view = dataset.match_frames(num_objects > 10)

        stage = fo.ToFrames(max_fps=1, sparse=True)
        frames = view.add_stage(stage)
        print(frames)

        session.view = frames

    Args:
        config (None): an optional dict of keyword arguments for
            :meth:`fiftyone.core.video.make_frames_dataset` specifying how to
            perform the conversion
        **kwargs: optional keyword arguments for
            :meth:`fiftyone.core.video.make_frames_dataset` specifying how to
            perform the conversion
    """

    def __init__(self, config=None, _state=None, **kwargs):
        if kwargs:
            if config is None:
                config = kwargs
            else:
                config.update(kwargs)

        self._config = config
        self._state = _state

    @property
    def has_view(self):
        return True

    @property
    def config(self):
        """Parameters specifying how to perform the conversion."""
        return self._config

    def load_view(self, sample_collection):
        state = {
            "dataset": sample_collection.dataset_name,
            "stages": sample_collection.view()._serialize(include_uuids=False),
            "config": self._config,
        }

        last_state = deepcopy(self._state)
        if last_state is not None:
            name = last_state.pop("name", None)
        else:
            name = None

        if state != last_state or not fod.dataset_exists(name):
            kwargs = self._config or {}
            frames_dataset = fov.make_frames_dataset(
                sample_collection, **kwargs
            )

            state["name"] = frames_dataset.name
            self._state = state
        else:
            frames_dataset = fod.load_dataset(name)

        return fov.FramesView(sample_collection, self, frames_dataset)

    def _kwargs(self):
        return [
            ["config", self._config],
            ["_state", self._state],
        ]

    @classmethod
    def _params(self):
        return [
            {
                "name": "config",
                "type": "NoneType|json",
                "default": "None",
                "placeholder": "config (default=None)",
            },
            {"name": "_state", "type": "NoneType|json", "default": "None"},
        ]


def _get_sample_ids(samples_or_ids):
    from fiftyone.core.collections import SampleCollection

    if etau.is_str(samples_or_ids):
        return [samples_or_ids]

    if isinstance(samples_or_ids, (fos.Sample, fos.SampleView)):
        return [samples_or_ids.id]

    if isinstance(samples_or_ids, SampleCollection):
        return samples_or_ids.values("id")

    if isinstance(samples_or_ids, np.ndarray):
        return list(samples_or_ids)

    if not samples_or_ids:
        return []

    if isinstance(next(iter(samples_or_ids)), (fos.Sample, fos.SampleView)):
        return [s.id for s in samples_or_ids]

    return list(samples_or_ids)


def _get_frame_ids(frames_or_ids):
    from fiftyone.core.collections import SampleCollection

    if etau.is_str(frames_or_ids):
        return [frames_or_ids]

    if isinstance(frames_or_ids, (fofr.Frame, fofr.FrameView)):
        return [frames_or_ids.id]

    if isinstance(frames_or_ids, SampleCollection):
        return frames_or_ids.values("frames.id", unwind=True)

    if isinstance(frames_or_ids, np.ndarray):
        return list(frames_or_ids)

    if not frames_or_ids:
        return []

    if isinstance(next(iter(frames_or_ids)), (fofr.Frame, fofr.FrameView)):
        return [s.id for s in frames_or_ids]

    return list(frames_or_ids)


def _get_rng(seed):
    if seed is None:
        return random

    _random = random.Random()
    _random.seed(seed)
    return _random


def _parse_labels_field(sample_collection, field_path):
    label_type = sample_collection._get_label_field_type(field_path)
    is_frame_field = sample_collection._is_frame_field(field_path)
    is_list_field = issubclass(label_type, fol._LABEL_LIST_FIELDS)
    if is_list_field:
        path = field_path + "." + label_type._LABEL_LIST_FIELD
    else:
        path = field_path

    return path, is_list_field, is_frame_field


def _parse_labels_list_field(sample_collection, field_path):
    label_type = sample_collection._get_label_field_type(field_path)
    is_frame_field = sample_collection._is_frame_field(field_path)

    if not issubclass(label_type, fol._LABEL_LIST_FIELDS):
        raise ValueError(
            "Field '%s' must be a labels list type %s; found %s"
            % (field_path, fol._LABEL_LIST_FIELDS, label_type)
        )

    path = field_path + "." + label_type._LABEL_LIST_FIELD

    return path, is_frame_field


def _parse_labels(labels):
    sample_ids = set()
    labels_map = defaultdict(set)
    for label in labels:
        sample_ids.add(label["sample_id"])
        labels_map[label["field"]].add(label["label_id"])

    return sample_ids, labels_map


def _is_frames_expr(val):
    if etau.is_str(val):
        return val == "$frames" or val.startswith("$frames.")

    if isinstance(val, dict):
        for k, v in val.items():
            if _is_frames_expr(k):
                return True

            if _is_frames_expr(v):
                return True

    if isinstance(val, (list, tuple)):
        for v in val:
            if _is_frames_expr(v):
                return True

    return False


def _get_label_field_only_matches_expr(
    sample_collection, field, prefix="", new_field=None
):
    label_type = sample_collection._get_label_field_type(field)
    is_label_list_field = issubclass(label_type, fol._LABEL_LIST_FIELDS)

    if new_field is not None:
        field = new_field

    field, is_frame_field = sample_collection._handle_frame_field(field)

    if is_label_list_field:
        field += "." + label_type._LABEL_LIST_FIELD

    if is_frame_field:
        if is_label_list_field:
            match_fcn = _get_frames_list_field_only_matches_expr
        else:
            match_fcn = _get_frames_field_only_matches_expr
    else:
        if is_label_list_field:
            match_fcn = _get_list_field_only_matches_expr
        else:
            match_fcn = _get_field_only_matches_expr

    return match_fcn(prefix + field)


def _make_omit_empty_labels_pipeline(sample_collection, fields):
    match_exprs = []
    for field in fields:
        match_exprs.append(
            _get_label_field_only_matches_expr(sample_collection, field)
        )

    stage = Match(F.any(match_exprs))
    stage.validate(sample_collection)
    return stage.to_mongo(sample_collection)


def _make_match_empty_labels_pipeline(
    sample_collection, fields_map, match_empty=False
):
    match_exprs = []
    for field, new_field in fields_map.items():
        match_exprs.append(
            _get_label_field_only_matches_expr(
                sample_collection, field, new_field=new_field
            )
        )

    expr = F.any(match_exprs)

    if match_empty:
        expr = ~expr  # match *empty* rather than non-empty samples

    stage = Match(expr)
    stage.validate(sample_collection)
    return stage.to_mongo(sample_collection)


def _get_default_similarity_run(sample_collection):
    if isinstance(sample_collection, fop.PatchesView):
        patches_field = sample_collection.patches_field
        brain_keys = sample_collection._get_similarity_keys(
            patches_field=patches_field
        )

        if not brain_keys:
            raise ValueError(
                "Dataset '%s' has no similarity results for field '%s'. You "
                "must run "
                "`fiftyone.brain.compute_similarity(..., patches_field='%s', ...)` "
                "in order to sort the patches in this view by similarity"
                % (
                    sample_collection.dataset_name,
                    patches_field,
                    patches_field,
                )
            )

    elif isinstance(sample_collection, fop.EvaluationPatchesView):
        gt_field = sample_collection.gt_field
        pred_field = sample_collection.pred_field

        brain_keys = sample_collection._get_similarity_keys(
            patches_field=gt_field
        ) + sample_collection._get_similarity_keys(patches_field=pred_field)

        if not brain_keys:
            raise ValueError(
                "Dataset '%s' has no similarity results for its '%s' or '%s' "
                "fields. You must run "
                "`fiftyone.brain.compute_similarity(..., patches_field=label_field, ...)` "
                "in order to sort the patches in this view by similarity"
                % (sample_collection.dataset_name, gt_field, pred_field)
            )
    else:
        brain_keys = sample_collection._get_similarity_keys(patches_field=None)

        if not brain_keys:
            raise ValueError(
                "Dataset '%s' has no similarity results for its samples. You "
                "must run `fiftyone.brain.compute_similarity()` in order to "
                "sort by similarity" % sample_collection.dataset_name
            )

    brain_key = brain_keys[0]

    if len(brain_keys) > 1:
        msg = "Multiple similarity runs found; using '%s'" % brain_key
        warnings.warn(msg)

    return brain_key


class _ViewStageRepr(reprlib.Repr):
    def repr_ViewExpression(self, expr, level):
        return self.repr1(expr.to_mongo(), level=level - 1)


_repr = _ViewStageRepr()
_repr.maxlevel = 2
_repr.maxdict = 3
_repr.maxlist = 3
_repr.maxtuple = 3
_repr.maxset = 3
_repr.maxstring = 30
_repr.maxother = 30


# Simple registry for the server to grab available view stages
_STAGES = [
    Exclude,
    ExcludeBy,
    ExcludeFields,
    ExcludeFrames,
    ExcludeLabels,
    Exists,
    FilterField,
    FilterLabels,
    FilterClassifications,
    FilterDetections,
    FilterPolylines,
    FilterKeypoints,
    GeoNear,
    GeoWithin,
    GroupBy,
    Limit,
    LimitLabels,
    MapLabels,
    Match,
    MatchFrames,
    MatchLabels,
    MatchTags,
    Mongo,
    Shuffle,
    Select,
    SelectBy,
    SelectFields,
    SelectFrames,
    SelectLabels,
    SetField,
    Skip,
    SortBy,
    SortBySimilarity,
    Take,
    ToPatches,
    ToEvaluationPatches,
    ToClips,
    ToFrames,
]


# Registry of stages that promise to only reorder/select documents
_STAGES_THAT_SELECT_OR_REORDER = {
    # View stages that only reorder documents
    SortBy,
    GroupBy,
    Shuffle,
    # View stages that only select documents
    Exclude,
    ExcludeBy,
    Exists,
    GeoNear,
    GeoWithin,
    Limit,
    Match,
    MatchFrames,
    MatchLabels,
    MatchTags,
    Select,
    SelectBy,
    Skip,
    SortBySimilarity,
    Take,
}
