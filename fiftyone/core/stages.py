"""
View stages.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import random
import reprlib
import uuid
import warnings

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING

import eta.core.utils as etau

import fiftyone.core.expressions as foe
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
from fiftyone.core.odm.frame import DatasetFrameSampleDocument
from fiftyone.core.odm.mixins import default_sample_fields
from fiftyone.core.odm.sample import DatasetSampleDocument


_FRAMES_PREFIX = "frames."


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

    def get_filtered_list_fields(self):
        """Returns a list of names of fields or subfields that contain arrays
        that may have been filtered by the stage, if any.

        Returns:
            a list of fields, or ``None`` if no fields have been filtered
        """
        return None

    def get_selected_fields(self, frames=False):
        """Returns a list of fields that have been selected by the stage, if
        any.

        Args:
            frames (False): whether to return sample-level (False) or
                frame-level (True) fields

        Returns:
            a list of fields, or ``None`` if no fields have been selected
        """
        return None

    def get_excluded_fields(self, frames=False):
        """Returns a list of fields that have been excluded by the stage, if
        any.

        Args:
            frames (False): whether to return sample-level (False) or
                frame-level (True) fields

        Returns:
            a list of fields, or ``None`` if no fields have been selected
        """
        return None

    def to_mongo(self, sample_collection):
        """Returns the MongoDB version of the stage.

        Args:
            sample_collection: the
                :class:`fiftyone.core.collections.SampleCollection` to which
                the stage is being applied

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        raise NotImplementedError("subclasses must implement `to_mongo()`")

    def to_frames_mongo(self, sample_collection):
        """Returns the MongoDB version of the stage for the frames pipeline, if
        any.

        Args:
            sample_collection: the
                :class:`fiftyone.core.collections.SampleCollection` to which
                the stage is being applied

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return []

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

    def _serialize(self):
        """Returns a JSON dict representation of the :class:`ViewStage`.

        Returns:
            a JSON dict
        """
        if self._uuid is None:
            self._uuid = str(uuid.uuid4())

        return {
            "_cls": etau.get_class_name(self),
            "_uuid": self._uuid,
            "kwargs": self._kwargs(),
        }

    def _kwargs(self):
        """Returns a list of ``[name, value]`` lists describing the parameters
        that define the stage.

        Returns:
            a JSON dict
        """
        raise NotImplementedError("subclasses must implement `_kwargs()`")

    @classmethod
    def _params(self):
        """Returns a list of JSON dicts describing the parameters that define
        the stage.

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
    """Excludes the samples with the given IDs from the view.

    Examples::

        import fiftyone as fo
        from fiftyone.core.stages import Exclude

        dataset = fo.load_dataset(...)

        #
        # Exclude a single sample from a dataset
        #

        stage = Exclude("5f3c298768fd4d3baf422d2f")
        view = dataset.add_stage(stage)

        #
        # Exclude a list of samples from a dataset
        #

        stage = Exclude([
            "5f3c298768fd4d3baf422d2f",
            "5f3c298768fd4d3baf422d30"
        ])
        view = dataset.add_stage(stage)

    Args:
        sample_ids: a sample ID or iterable of sample IDs
    """

    def __init__(self, sample_ids):
        if etau.is_str(sample_ids):
            self._sample_ids = [sample_ids]
        else:
            self._sample_ids = list(sample_ids)

        self._validate_params()

    @property
    def sample_ids(self):
        """The list of sample IDs to exclude."""
        return self._sample_ids

    def to_mongo(self, _):
        sample_ids = [ObjectId(id) for id in self._sample_ids]
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

    def _validate_params(self):
        # Ensures that ObjectIDs are valid
        for id in self._sample_ids:
            ObjectId(id)


class ExcludeFields(ViewStage):
    """Excludes the fields with the given names from the samples in the view.

    Note that default fields cannot be excluded.

    Examples::

        import fiftyone as fo
        from fiftyone.core.stages import ExcludeFields

        dataset = fo.load_dataset(...)

        #
        # Exclude a field from all samples in a dataset
        #

        stage = ExcludeFields("predictions")
        view = dataset.add_stage(stage)

        #
        # Exclude a list of fields from all samples in a dataset
        #

        stage = ExcludeFields(["ground_truth", "predictions"])
        view = dataset.add_stage(stage)

    Args:
        field_names: a field name or iterable of field names to exclude
    """

    def __init__(self, field_names):
        if etau.is_str(field_names):
            field_names = [field_names]

        self._field_names = list(field_names)
        self._dataset = None

    @property
    def field_names(self):
        """The list of field names to exclude."""
        return self._field_names

    def get_excluded_fields(self, frames=False):
        if frames:
            default_fields = default_sample_fields(
                DatasetFrameSampleDocument, include_private=True
            )
            excluded_fields = [
                f[len(_FRAMES_PREFIX) :]
                for f in self.field_names
                if f.startswith(_FRAMES_PREFIX)
            ]
        else:
            default_fields = default_sample_fields(
                DatasetSampleDocument, include_private=True
            )
            if not frames and (self._dataset.media_type == fom.VIDEO):
                default_fields += ("frames",)

            excluded_fields = [
                f for f in self.field_names if not f.startswith(_FRAMES_PREFIX)
            ]

        for field_name in excluded_fields:
            if field_name.startswith("_"):
                raise ValueError(
                    "Cannot exclude private field '%s'" % field_name
                )

            if field_name in default_fields:
                raise ValueError(
                    "Cannot exclude default field '%s'" % field_name
                )

        return excluded_fields

    def to_mongo(self, _):
        fields = self.get_excluded_fields()
        if not fields:
            return []

        return [{"$unset": fields}]

    def to_frames_mongo(self, _):
        fields = self.get_excluded_fields(frames=True)
        if not fields:
            return []

        return [{"$unset": fields}]

    def _kwargs(self):
        return [["field_names", self._field_names]]

    @classmethod
    def _params(self):
        return [
            {
                "name": "field_names",
                "type": "list<str>",
                "placeholder": "list,of,fields",
            }
        ]

    def validate(self, sample_collection):
        import fiftyone.core.view as fov

        if isinstance(sample_collection, fov.DatasetView):
            self._dataset = sample_collection._dataset
        else:
            self._dataset = sample_collection

        # Using dataset here allows a field to be excluded multiple times
        self._dataset.validate_fields_exist(self.field_names)


class ExcludeObjects(ViewStage):
    """Excludes the specified objects from the view.

    The returned view will omit the objects specified in the provided
    ``objects`` argument, which should have the following format::

        [
            {
                "sample_id": "5f8d254a27ad06815ab89df4",
                "field": "ground_truth",
                "object_id": "5f8d254a27ad06815ab89df3",
            },
            {
                "sample_id": "5f8d255e27ad06815ab93bf8",
                "field": "ground_truth",
                "object_id": "5f8d255e27ad06815ab93bf6",
            },
            ...
        ]

    Examples::

        import fiftyone as fo
        from fiftyone.core.stages import ExcludeObjects

        dataset = fo.load_dataset(...)

        #
        # Exclude the objects currently selected in the App
        #

        session = fo.launch_app(dataset)

        # Select some objects in the App...

        stage = ExcludeObjects(session.selected_objects)
        view = dataset.add_stage(stage)

    Args:
        objects: a list of dicts specifying the objects to exclude
    """

    def __init__(self, objects):
        _, object_ids = _parse_objects(objects)
        self._objects = objects
        self._object_ids = object_ids
        self._pipeline = None

    @property
    def objects(self):
        """A list of dicts specifying the objects to exclude."""
        return self._objects

    def to_mongo(self, _):
        if self._pipeline is None:
            raise ValueError(
                "`validate()` must be called before using a %s stage"
                % self.__class__
            )

        return self._pipeline

    def _kwargs(self):
        return [["objects", self._objects]]

    @classmethod
    def _params(self):
        return [
            {
                "name": "objects",
                "type": "dict",  # @todo use "list<dict>" when supported
                "placeholder": "[{...}]",
            }
        ]

    def _make_pipeline(self, sample_collection):
        label_schema = sample_collection.get_field_schema(
            ftype=fof.EmbeddedDocumentField, embedded_doc_type=fol.Label
        )

        pipeline = []
        for field, object_ids in self._object_ids.items():
            label_filter = ~foe.ViewField("_id").is_in(
                [foe.ObjectId(oid) for oid in object_ids]
            )
            stage = _make_label_filter_stage(label_schema, field, label_filter)
            if stage is None:
                continue

            stage.validate(sample_collection)
            pipeline.extend(stage.to_mongo(sample_collection))

        return pipeline

    def validate(self, sample_collection):
        self._pipeline = self._make_pipeline(sample_collection)


class Exists(ViewStage):
    """Returns a view containing the samples that have (or do not have) a
    non-``None`` value for the given field.

    Examples::

        import fiftyone as fo
        from fiftyone.core.stages import Exists

        dataset = fo.load_dataset(...)

        #
        # Only include samples that have a value in their `predictions` field
        #

        stage = Exists("predictions")
        view = dataset.add_stage(stage)

        #
        # Only include samples that do NOT have a value in their `predictions`
        # field
        #

        stage = Exists("predictions", False)
        view = dataset.add_stage(stage)

    Args:
        field: the field
        bool (True): whether to check if the field exists (True) or does not
            exist (False)
    """

    def __init__(self, field, bool=True):
        self._field = field
        self._bool = bool

    @property
    def field(self):
        """The field to check if exists."""
        return self._field

    @property
    def bool(self):
        """Whether to check if the field exists (True) or does not exist
        (False).
        """
        return self._bool

    def to_mongo(self, _):
        if self._bool:
            return [{"$match": {self._field: {"$exists": True, "$ne": None}}}]

        return [
            {
                "$match": {
                    "$or": [
                        {self._field: {"$exists": False}},
                        {self._field: {"$eq": None}},
                    ]
                }
            }
        ]

    def _kwargs(self):
        return [["field", self._field], ["bool", self._bool]]

    @classmethod
    def _params(cls):
        return [
            {"name": "field", "type": "field"},
            {
                "name": "bool",
                "type": "bool",
                "default": "True",
                "placeholder": "bool (default=True)",
            },
        ]


class FilterField(ViewStage):
    """Filters the values of a given sample (or embedded document) field.

    Values of ``field`` for which ``filter`` returns ``False`` are
    replaced with ``None``.

    Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F
        from fiftyone.core.stages import FilterField

        dataset = fo.load_dataset(...)

        #
        # Only include classifications in the `predictions` field (assume it is
        # a `Classification` field) whose `label` is "cat"
        #

        stage = FilterField("predictions", F("label") == "cat")
        view = dataset.add_stage(stage)

        #
        # Only include classifications in the `predictions` field (assume it is
        # a `Classification` field) whose `confidence` is greater than 0.8
        #

        stage = FilterField("predictions", F("confidence") > 0.8)
        view = dataset.add_stage(stage)

    Args:
        field: the field to filter
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
        only_matches (False): whether to only include samples that match the
            filter
    """

    def __init__(self, field, filter, only_matches=False):
        self._field = field
        self._filter = filter
        self._only_matches = only_matches
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

    @property
    def _frame_filter_field(self):
        return self._field[len(_FRAMES_PREFIX) :]

    def to_mongo(self, sample_collection):
        if (
            sample_collection.media_type == fom.VIDEO
            and self._field.startswith(_FRAMES_PREFIX)
        ):
            pass
            # return self._get_frames_pipeline()

        pipeline = [
            {
                "$addFields": {
                    self._field: {
                        "$cond": {
                            "if": self._get_mongo_filter(),
                            "then": "$" + self._field,
                            "else": None,
                        }
                    }
                }
            }
        ]

        if self._only_matches:
            pipeline.append(
                {"$match": {self._field: {"$exists": True, "$ne": None}}}
            )

        return pipeline

    def _get_mongo_filter(self):
        if isinstance(self._filter, foe.ViewExpression):
            return self._filter.to_mongo(prefix="$" + self.field)

        return self._filter

    def _kwargs(self):
        return [
            ["field", self._field],
            ["filter", self._get_mongo_filter()],
            ["only_matches", self._only_matches],
        ]

    @classmethod
    def _params(self):
        return [
            {"name": "field", "type": "field"},
            {"name": "filter", "type": "dict", "placeholder": ""},
            {
                "name": "only_matches",
                "type": "bool",
                "default": "False",
                "placeholder": "only matches (default=False)",
            },
        ]

    def _validate_params(self):
        if not isinstance(self._filter, (foe.ViewExpression, dict)):
            raise ValueError(
                "Filter must be a ViewExpression or a MongoDB expression; "
                "found '%s'" % self._filter
            )

    def validate(self, sample_collection):
        if self.field == "filepath":
            raise ValueError("Cannot filter required field `filepath`")

        sample_collection.validate_fields_exist(self.field)


class _FilterListField(FilterField):
    @property
    def _filter_field(self):
        raise NotImplementedError("subclasses must implement `_filter_field`")

    @property
    def _frame_filter_field(self):
        return self._filter_field[len(_FRAMES_PREFIX) :]

    def get_filtered_list_fields(self):
        return [self._filter_field]

    def to_mongo(self, sample_collection):
        if (
            sample_collection.media_type == fom.VIDEO
            and self._filter_field.startswith(_FRAMES_PREFIX)
        ):
            return self._get_frames_pipeline()

        pipeline = [
            {
                "$addFields": {
                    self._filter_field: {
                        "$filter": {
                            "input": "$" + self._filter_field,
                            "cond": self._get_mongo_filter(),
                        }
                    }
                }
            }
        ]

        if self._only_matches:
            pipeline.append(
                {
                    "$match": {
                        self._filter_field: {
                            "$gt": [
                                {
                                    "$size": {
                                        "$ifNull": [
                                            "$" + self._filter_field,
                                            [],
                                        ]
                                    }
                                },
                                0,
                            ]
                        }
                    }
                }
            )

        return pipeline

    def _get_frames_pipeline(self):
        field, array = self._filter_field.split(".")[1:]
        pipeline = [
            {
                "$addFields": {
                    "frames": {
                        "$map": {
                            "input": "$frames",
                            "as": "frame",
                            "in": {
                                "$mergeObjects": [
                                    "$$frame",
                                    {
                                        field: {
                                            array: {
                                                "$filter": {
                                                    "input": "$$frame."
                                                    + self._frame_filter_field,
                                                    "cond": self._get_mongo_filter(),
                                                }
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

        if self._only_matches:
            # @todo
            raise ValueError(
                "Only matching for frame labels is not yet supported"
            )

        return pipeline

    def _get_mongo_filter(self):
        if isinstance(self._filter, foe.ViewExpression):
            return self._filter.to_mongo(prefix="$$this")

        return self._filter

    def validate(self, sample_collection):
        raise NotImplementedError("subclasses must implement `validate()`")


class FilterLabels(_FilterListField):
    """Filters the :class:`fiftyone.core.labels.Label` elements in a labels
    list field of each sample.

    The specified ``field`` must be one of the following types:

    -   :class:`fiftyone.core.labels.Classifications`
    -   :class:`fiftyone.core.labels.Detections`
    -   :class:`fiftyone.core.labels.Polylines`
    -   :class:`fiftyone.core.labels.Keypoints`

    Classifications Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F
        from fiftyone.core.stages import FilterLabels

        dataset = fo.load_dataset(...)

        #
        # Only include classifications in the `predictions` field whose
        # `confidence` greater than 0.8
        #

        stage = FilterLabels("predictions", F("confidence") > 0.8)
        view = dataset.add_stage(stage)

        #
        # Only include classifications in the `predictions` field whose `label`
        # is "cat" or "dog", and only show samples with at least one
        # classification after filtering
        #

        stage = FilterLabels(
            "predictions", F("label").is_in(["cat", "dog"]), only_matches=True
        )
        view = dataset.add_stage(stage)

    Detections Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F
        from fiftyone.core.stages import FilterLabels

        dataset = fo.load_dataset(...)

        #
        # Only include detections in the `predictions` field whose `confidence`
        # is greater than 0.8
        #

        stage = FilterLabels("predictions", F("confidence") > 0.8)
        view = dataset.add_stage(stage)

        #
        # Only include detections in the `predictions` field whose `label` is
        # "cat" or "dog", and only show samples with at least one detection
        # after filtering
        #

        stage = FilterLabels(
            "predictions", F("label").is_in(["cat", "dog"]), only_matches=True
        )
        view = dataset.add_stage(stage)

        #
        # Only include detections in the `predictions` field whose bounding box
        # area is smaller than 0.2
        #

        # bbox is in [top-left-x, top-left-y, width, height] format
        bbox_area = F("bounding_box")[2] * F("bounding_box")[3]

        stage = FilterLabels("predictions", bbox_area < 0.2)
        view = dataset.add_stage(stage)

    Polylines Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F
        from fiftyone.core.stages import FilterLabels

        dataset = fo.load_dataset(...)

        #
        # Only include polylines in the `predictions` field that are filled
        #

        stage = FilterLabels("predictions", F("filled"))
        view = dataset.add_stage(stage)

        #
        # Only include polylines in the `predictions` field whose `label` is
        # "lane", and only show samples with at least one polyline after
        # filtering
        #

        stage = FilterLabels(
            "predictions", F("label") == "lane", only_matches=True
        )
        view = dataset.add_stage(stage)

        #
        # Only include polylines in the `predictions` field with at least
        # 10 vertices
        #

        num_vertices = F("points").map(F().length()).sum()
        stage = FilterLabels("predictions", num_vertices >= 10)
        view = dataset.add_stage(stage)

    Keypoints Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F
        from fiftyone.core.stages import FilterLabels

        dataset = fo.load_dataset(...)

        #
        # Only include keypoints in the `predictions` field whose `label` is
        # "face", and only show samples with at least one keypoint after
        # filtering
        #

        stage = FilterLabels(
            "predictions", F("label") == "face", only_matches=True
        )
        view = dataset.add_stage(stage)

        #
        # Only include keypoints in the `predictions` field with at least
        # 10 points
        #

        stage = FilterLabels("predictions", F("points").length() >= 10)
        view = dataset.add_stage(stage)

    Args:
        field: the labels list field to filter
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
        only_matches (False): whether to only include samples with at least
            one label after filtering
    """

    def __init__(self, field, filter, only_matches=False):
        self._field = field
        self._filter = filter
        self._only_matches = only_matches
        self._labels_list_field = None
        self._validate_params()

    @property
    def _filter_field(self):
        if self._labels_list_field is None:
            raise ValueError(
                "`validate()` must be called before using a %s stage"
                % self.__class__
            )

        return self._labels_list_field

    def to_mongo(self, sample_collection):
        self._labels_list_field = _get_labels_list_field(
            self._field, sample_collection
        )
        return super().to_mongo(sample_collection)

    def validate(self, sample_collection):
        self._labels_list_field = _get_labels_list_field(
            self._field, sample_collection
        )


class FilterClassifications(_FilterListField):
    """Filters the :class:`fiftyone.core.labels.Classification` elements in the
    specified :class:`fiftyone.core.labels.Classifications` field of each
    sample.

    Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F
        from fiftyone.core.stages import FilterClassifications

        dataset = fo.load_dataset(...)

        #
        # Only include classifications in the `predictions` field whose
        # `confidence` greater than 0.8
        #

        stage = FilterClassifications("predictions", F("confidence") > 0.8)
        view = dataset.add_stage(stage)

        #
        # Only include classifications in the `predictions` field whose `label`
        # is "cat" or "dog", and only show samples with at least one
        # classification after filtering
        #

        stage = FilterClassifications(
            "predictions", F("label").is_in(["cat", "dog"]), only_matches=True
        )
        view = dataset.add_stage(stage)

    Args:
        field: the field to filter, which must be a
            :class:`fiftyone.core.labels.Classifications`
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
        only_matches (False): whether to only include samples with at least
            one classification after filtering
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


class FilterDetections(_FilterListField):
    """Filters the :class:`fiftyone.core.labels.Detection` elements in the
    specified :class:`fiftyone.core.labels.Detections` field of each sample.

    Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F
        from fiftyone.core.stages import FilterDetections

        dataset = fo.load_dataset(...)

        #
        # Only include detections in the `predictions` field whose `confidence`
        # is greater than 0.8
        #

        stage = FilterDetections("predictions", F("confidence") > 0.8)
        view = dataset.add_stage(stage)

        #
        # Only include detections in the `predictions` field whose `label` is
        # "cat" or "dog", and only show samples with at least one detection
        # after filtering
        #

        stage = FilterDetections(
            "predictions", F("label").is_in(["cat", "dog"]), only_matches=True
        )
        view = dataset.add_stage(stage)

        #
        # Only include detections in the `predictions` field whose bounding box
        # area is smaller than 0.2
        #

        # bbox is in [top-left-x, top-left-y, width, height] format
        bbox_area = F("bounding_box")[2] * F("bounding_box")[3]

        stage = FilterDetections("predictions", bbox_area < 0.2)
        view = dataset.add_stage(stage)

    Args:
        field: the field to filter, which must be a
            :class:`fiftyone.core.labels.Detections`
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
        only_matches (False): whether to only include samples with at least
            one detection after filtering
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


class FilterPolylines(_FilterListField):
    """Filters the :class:`fiftyone.core.labels.Polyline` elements in the
    specified :class:`fiftyone.core.labels.Polylines` field of each sample.

    Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F
        from fiftyone.core.stages import FilterPolylines

        dataset = fo.load_dataset(...)

        #
        # Only include polylines in the `predictions` field that are filled
        #

        stage = FilterPolylines("predictions", F("filled"))
        view = dataset.add_stage(stage)

        #
        # Only include polylines in the `predictions` field whose `label` is
        # "lane", and only show samples with at least one polyline after
        # filtering
        #

        stage = FilterPolylines(
            "predictions", F("label") == "lane", only_matches=True
        )
        view = dataset.add_stage(stage)

        #
        # Only include polylines in the `predictions` field with at least
        # 10 vertices
        #

        num_vertices = F("points").map(F().length()).sum()
        stage = FilterPolylines("predictions", num_vertices >= 10)
        view = dataset.add_stage(stage)

    Args:
        field: the field to filter, which must be a
            :class:`fiftyone.core.labels.Polylines`
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
        only_matches (False): whether to only include samples with at least
            one polyline after filtering
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


class FilterKeypoints(_FilterListField):
    """Filters the :class:`fiftyone.core.labels.Keypoint` elements in the
    specified :class:`fiftyone.core.labels.Keypoints` field of each sample.

    Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F
        from fiftyone.core.stages import FilterKeypoints

        dataset = fo.load_dataset(...)

        #
        # Only include keypoints in the `predictions` field whose `label` is
        # "face", and only show samples with at least one keypoint after
        # filtering
        #

        stage = FilterKeypoints(
            "predictions", F("label") == "face", only_matches=True
        )
        view = dataset.add_stage(stage)

        #
        # Only include keypoints in the `predictions` field with at least
        # 10 points
        #

        stage = FilterKeypoints("predictions", F("points").length() >= 10)
        view = dataset.add_stage(stage)

    Args:
        field: the field to filter, which must be a
            :class:`fiftyone.core.labels.Keypoints`
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
        only_matches (False): whether to only include samples with at least
            one keypoint after filtering
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


class Limit(ViewStage):
    """Limits the view to the given number of samples.

    Examples::

        import fiftyone as fo
        from fiftyone.core.stages import Limit

        dataset = fo.load_dataset(...)

        #
        # Only include the first 10 samples in the view
        #

        stage = Limit(10)
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
    the specified labels list field of each sample.

    The specified ``field`` must be one of the following types:

    -   :class:`fiftyone.core.labels.Classifications`
    -   :class:`fiftyone.core.labels.Detections`
    -   :class:`fiftyone.core.labels.Polylines`
    -   :class:`fiftyone.core.labels.Keypoints`

    Examples::

        import fiftyone as fo
        from fiftyone.core.stages import LimitLabels

        dataset = fo.load_dataset(...)

        #
        # Only include the first 5 detections in the `ground_truth` field of
        # the view
        #

        stage = LimitLabels("ground_truth", 5)
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

    @property
    def field(self):
        """The labels field to limit."""
        return self._field

    @property
    def limit(self):
        """The maximum number of labels to return in each sample."""
        return self._limit

    def to_mongo(self, sample_collection):
        self._labels_list_field = _get_labels_list_field(
            self._field, sample_collection
        )

        limit = max(self._limit, 0)

        return [
            {
                "$addFields": {
                    self._labels_list_field: {
                        "$slice": ["$" + self._labels_list_field, limit]
                    }
                }
            }
        ]

    def _kwargs(self):
        return [
            ["field", self._field],
            ["limit", self._limit],
        ]

    @classmethod
    def _params(self):
        return [
            {"name": "field", "type": "field"},
            {"name": "limit", "type": "int", "placeholder": "int"},
        ]

    def validate(self, sample_collection):
        self._labels_list_field = _get_labels_list_field(
            self._field, sample_collection
        )


class Match(ViewStage):
    """Filters the samples in the stage by the given filter.

    Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F
        from fiftyone.core.stages import Match

        dataset = fo.load_dataset(...)

        #
        # Only include samples whose `filepath` ends with ".jpg"
        #

        stage = Match(F("filepath").ends_with(".jpg"))
        view = dataset.add_stage(stage)

        #
        # Only include samples whose `predictions` field (assume it is a
        # `Classification` field) has `label` of "cat"
        #

        stage = Match(F("predictions").label == "cat"))
        view = dataset.add_stage(stage)

        #
        # Only include samples whose `predictions` field (assume it is a
        # `Detections` field) has at least 5 detections
        #

        stage = Match(F("predictions").detections.length() >= 5)
        view = dataset.add_stage(stage)

        #
        # Only include samples whose `predictions` field (assume it is a
        # `Detections` field) has at least one detection with area smaller
        # than 0.2
        #

        # bbox is in [top-left-x, top-left-y, width, height] format
        pred_bbox = F("predictions.detections.bounding_box")
        pred_bbox_area = pred_bbox[2] * pred_bbox[3]

        stage = Match((pred_bbox_area < 0.2).length() > 0)
        view = dataset.add_stage(stage)

    Args:
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
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
        return [{"$match": self._get_mongo_filter()}]

    def _get_mongo_filter(self):
        if isinstance(self._filter, foe.ViewExpression):
            return {"$expr": self._filter.to_mongo()}

        return self._filter

    def _kwargs(self):
        return [["filter", self._get_mongo_filter()]]

    def _validate_params(self):
        if not isinstance(self._filter, (foe.ViewExpression, dict)):
            raise ValueError(
                "Filter must be a ViewExpression or a MongoDB expression; "
                "found '%s'" % self._filter
            )

    @classmethod
    def _params(cls):
        return [{"name": "filter", "type": "dict", "placeholder": ""}]


class MatchTag(ViewStage):
    """Returns a view containing the samples that have the given tag.

    Examples::

        import fiftyone as fo
        from fiftyone.core.stages import MatchTag

        dataset = fo.load_dataset(...)

        #
        # Only include samples that have the "test" tag
        #

        stage = MatchTag("test")
        view = dataset.add_stage(stage)

    Args:
        tag: a tag
    """

    def __init__(self, tag):
        self._tag = tag

    @property
    def tag(self):
        """The tag to match."""
        return self._tag

    def to_mongo(self, _):
        return [{"$match": {"tags": self._tag}}]

    def _kwargs(self):
        return [["tag", self._tag]]

    @classmethod
    def _params(cls):
        return [{"name": "tag", "type": "str"}]


class MatchTags(ViewStage):
    """Returns a view containing the samples that have any of the given
    tags.

    To match samples that contain a single tag, use :class:`MatchTag`.

    Examples::

        import fiftyone as fo
        from fiftyone.core.stages import MatchTags

        dataset = fo.load_dataset(...)

        #
        # Only include samples that have either the "test" or "validation" tag
        #

        stage = MatchTags(["test", "validation"])
        view = dataset.add_stage(stage)

    Args:
        tags: an iterable of tags
    """

    def __init__(self, tags):
        self._tags = list(tags)

    @property
    def tags(self):
        """The list of tags to match."""
        return self._tags

    def to_mongo(self, _):
        return [{"$match": {"tags": {"$in": self._tags}}}]

    def _kwargs(self):
        return [["tags", self._tags]]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "tags",
                "type": "list<str>",
                "placeholder": "list,of,tags",
            }
        ]


class Mongo(ViewStage):
    """View stage defined by a raw MongoDB aggregation pipeline.

    See `MongoDB aggregation pipelines <https://docs.mongodb.com/manual/core/aggregation-pipeline/>`_
    for more details.

    Examples::

        import fiftyone as fo
        from fiftyone.core.stages import Mongo

        dataset = fo.load_dataset(...)

        #
        # Extract a view containing the 6th through 15th samples in the dataset
        #

        stage = Mongo([{"$skip": 5}, {"$limit": 10}])
        view = dataset.add_stage(stage)

        #
        # Sort by the number of detections in the `precictions` field of the
        # samples (assume it is a `Detections` field)
        #

        stage = Mongo([
            {
                "$addFields": {
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

    def _kwargs(self):
        return [["pipeline", self._pipeline]]

    @classmethod
    def _params(self):
        return [{"name": "pipeline", "type": "dict", "placeholder": ""}]


class Select(ViewStage):
    """Selects the samples with the given IDs from the view.

    Examples::

        import fiftyone as fo
        from fiftyone.core.stages import Select

        dataset = fo.load_dataset(...)

        #
        # Select the samples with the given IDs from the dataset
        #

        stage = Select([
            "5f3c298768fd4d3baf422d34",
            "5f3c298768fd4d3baf422d35",
            "5f3c298768fd4d3baf422d36",
        ])
        view = dataset.add_stage(stage)

        #
        # Create a view containing the currently selected samples in the App
        #

        session = fo.launch_app(dataset=dataset)

        # Select samples in the App...

        stage = Select(session.selected)
        view = dataset.add_stage(stage)

    Args:
        sample_ids: a sample ID or iterable of sample IDs
    """

    def __init__(self, sample_ids):
        if etau.is_str(sample_ids):
            self._sample_ids = [sample_ids]
        else:
            self._sample_ids = list(sample_ids)

        self._validate_params()

    @property
    def sample_ids(self):
        """The list of sample IDs to select."""
        return self._sample_ids

    def to_mongo(self, _):
        sample_ids = [ObjectId(id) for id in self._sample_ids]
        return [{"$match": {"_id": {"$in": sample_ids}}}]

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

    def _validate_params(self):
        # Ensures that ObjectIDs are valid
        for id in self._sample_ids:
            ObjectId(id)


class SelectFields(ViewStage):
    """Selects only the fields with the given names from the samples in the
    view. All other fields are excluded.

    Note that default sample fields are always selected and will be added if
    not included in ``field_names``.

    Examples::

        import fiftyone as fo
        from fiftyone.core.stages import SelectFields

        dataset = fo.load_dataset(...)

        #
        # Include only the default fields on each sample
        #

        stage = SelectFields()
        view = dataset.add_stage(stage)

        #
        # Include only the `ground_truth` field (and the default fields) on
        # each sample
        #

        stage = SelectFields("ground_truth")
        view = dataset.add_stage(stage)

    Args:
        field_names (None): a field name or iterable of field names to select
    """

    def __init__(self, field_names=None):
        if etau.is_str(field_names):
            field_names = [field_names]
        elif field_names:
            field_names = list(field_names)

        self._field_names = field_names
        self._dataset = None

    @property
    def field_names(self):
        """The list of field names to select."""
        return self._field_names or []

    def get_selected_fields(self, frames=False):
        if frames:
            default_fields = default_sample_fields(
                DatasetFrameSampleDocument, include_private=True
            )

            selected_fields = [
                f[len(_FRAMES_PREFIX) :]
                for f in self.field_names
                if f.startswith(_FRAMES_PREFIX)
            ]
        else:
            default_fields = default_sample_fields(
                DatasetSampleDocument, include_private=True
            )
            if not frames and (self._dataset.media_type == fom.VIDEO):
                default_fields += ("frames",)

            selected_fields = [
                f for f in self.field_names if not f.startswith(_FRAMES_PREFIX)
            ]

        return list(set(selected_fields) | set(default_fields))

    def to_mongo(self, _):
        selected_fields = self.get_selected_fields()
        if not selected_fields:
            return []

        return [{"$project": {fn: True for fn in selected_fields}}]

    def to_frames_mongo(self, _):
        selected_fields = self.get_selected_fields(frames=True)
        if not selected_fields:
            return []

        return [{"$project": {fn: True for fn in selected_fields}}]

    def _kwargs(self):
        return [["field_names", self._field_names]]

    @classmethod
    def _params(self):
        return [
            {
                "name": "field_names",
                "type": "list<str>|NoneType",
                "default": "None",
                "placeholder": "list,of,fields",
            }
        ]

    def _validate_params(self):
        for field_name in self.field_names:
            if field_name.startswith("_"):
                raise ValueError(
                    "Cannot select private field '%s'" % field_name
                )

    def validate(self, sample_collection):
        import fiftyone.core.view as fov

        if isinstance(sample_collection, fov.DatasetView):
            self._dataset = sample_collection._dataset
        else:
            self._dataset = sample_collection

        sample_collection.validate_fields_exist(self.field_names)


class SelectObjects(ViewStage):
    """Selects only the specified objects from the view.

    The returned view will omit samples, sample fields, and individual objects
    that do not appear in the provided ``objects`` argument, which should have
    the following format::

        [
            {
                "sample_id": "5f8d254a27ad06815ab89df4",
                "field": "ground_truth",
                "object_id": "5f8d254a27ad06815ab89df3",
            },
            {
                "sample_id": "5f8d255e27ad06815ab93bf8",
                "field": "ground_truth",
                "object_id": "5f8d255e27ad06815ab93bf6",
            },
            ...
        ]

    Examples::

        import fiftyone as fo
        from fiftyone.core.stages import SelectObjects

        dataset = fo.load_dataset(...)

        #
        # Only include the objects currently selected in the App
        #

        session = fo.launch_app(dataset)

        # Select some objects in the App...

        stage = SelectObjects(session.selected_objects)
        view = dataset.add_stage(stage)

    Args:
        objects: a list of dicts specifying the objects to select
    """

    def __init__(self, objects):
        sample_ids, object_ids = _parse_objects(objects)
        self._objects = objects
        self._sample_ids = sample_ids
        self._object_ids = object_ids
        self._pipeline = None

    @property
    def objects(self):
        """A list of dicts specifying the objects to select."""
        return self._objects

    def to_mongo(self, _):
        if self._pipeline is None:
            raise ValueError(
                "`validate()` must be called before using a %s stage"
                % self.__class__
            )

        return self._pipeline

    def _kwargs(self):
        return [["objects", self._objects]]

    @classmethod
    def _params(self):
        return [
            {
                "name": "objects",
                "type": "dict",  # @todo use "list<dict>" when supported
                "placeholder": "[{...}]",
            }
        ]

    def _make_pipeline(self, sample_collection):
        label_schema = sample_collection.get_field_schema(
            ftype=fof.EmbeddedDocumentField, embedded_doc_type=fol.Label
        )

        pipeline = []

        stage = Select(self._sample_ids)
        stage.validate(sample_collection)
        pipeline.extend(stage.to_mongo(sample_collection))

        stage = SelectFields(list(self._object_ids.keys()))
        stage.validate(sample_collection)
        pipeline.extend(stage.to_mongo(sample_collection))

        for field, object_ids in self._object_ids.items():
            label_filter = foe.ViewField("_id").is_in(
                [foe.ObjectId(oid) for oid in object_ids]
            )
            stage = _make_label_filter_stage(label_schema, field, label_filter)
            if stage is None:
                continue

            stage.validate(sample_collection)
            pipeline.extend(stage.to_mongo(sample_collection))
        return pipeline

    def validate(self, sample_collection):
        self._pipeline = self._make_pipeline(sample_collection)


class Shuffle(ViewStage):
    """Randomly shuffles the samples in the view.

    Examples::

        import fiftyone as fo
        from fiftyone.core.stages import Shuffle

        dataset = fo.load_dataset(...)

        #
        # Return a view that contains a randomly shuffled version of the
        # samples in the dataset
        #

        stage = Shuffle()
        view = dataset.add_stage(stage)

        #
        # Shuffle the samples with a set random seed
        #

        stage = Shuffle(seed=51)
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
        # @todo avoid creating new field here?
        return [
            {"$set": {"_rand_shuffle": {"$mod": [self._randint, "$_rand"]}}},
            {"$sort": {"_rand_shuffle": ASCENDING}},
            {"$unset": "_rand_shuffle"},
        ]

    def _kwargs(self):
        return [["seed", self._seed], ["_randint", self._randint]]

    @classmethod
    def _params(self):
        return [
            {
                "name": "seed",
                "type": "float|NoneType",
                "default": "None",
                "placeholder": "seed (default=None)",
            },
            {"name": "_randint", "type": "int|NoneType", "default": "None"},
        ]


class Skip(ViewStage):
    """Omits the given number of samples from the head of the view.

    Examples::

        import fiftyone as fo
        from fiftyone.core.stages import Skip

        dataset = fo.load_dataset(...)

        #
        # Omit the first 10 samples from the dataset
        #

        stage = Skip(10)
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
    """Sorts the samples in the view by the given field or expression.

    When sorting by an expression, ``field_or_expr`` can either be a
    :class:`fiftyone.core.expressions.ViewExpression` or a
    `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
    that defines the quantity to sort by.

    Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F
        from fiftyone.core.stages import SortBy

        dataset = fo.load_dataset(...)

        #
        # Sorts the samples in descending order by the `confidence` of their
        # `predictions` field (assume it is a `Classification` field)
        #

        stage = SortBy("predictions.confidence", reverse=True)
        view = dataset.add_stage(stage)

        #
        # Sorts the samples in ascending order by the number of detections in
        # their `predictions` field (assume it is a `Detections` field) whose
        # bounding box area is at most 0.2
        #

        # bbox is in [top-left-x, top-left-y, width, height] format
        pred_bbox = F("predictions.detections.bounding_box")
        pred_bbox_area = pred_bbox[2] * pred_bbox[3]

        stage = SortBy((pred_bbox_area < 0.2).length())
        view = dataset.add_stage(stage)

    Args:
        field_or_expr: the field or expression to sort by
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
        order = DESCENDING if self._reverse else ASCENDING

        field_or_expr = self._get_mongo_field_or_expr()

        if etau.is_str(field_or_expr):
            return [{"$sort": {field_or_expr: order}}]

        return [
            {"$addFields": {"_sort_field": field_or_expr}},
            {"$sort": {"_sort_field": order}},
            {"$unset": "_sort_field"},
        ]

    def _get_mongo_field_or_expr(self):
        if isinstance(self._field_or_expr, foe.ViewField):
            return self._field_or_expr.name

        if isinstance(self._field_or_expr, foe.ViewExpression):
            return self._field_or_expr.to_mongo(None)  # @todo: fix me

        return self._field_or_expr

    def _kwargs(self):
        return [
            ["field_or_expr", self._get_mongo_field_or_expr()],
            ["reverse", self._reverse],
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "field_or_expr", "type": "dict|str"},
            {
                "name": "reverse",
                "type": "bool",
                "default": "False",
                "placeholder": "reverse (default=False)",
            },
        ]

    def validate(self, sample_collection):
        field_or_expr = self._get_mongo_field_or_expr()

        # If sorting by a field, not an expression
        if etau.is_str(field_or_expr):
            # Make sure the field exists
            sample_collection.validate_fields_exist(field_or_expr)

            # Create an index on the field, if necessary, to make sorting
            # more efficient
            sample_collection.create_index(field_or_expr)


class Take(ViewStage):
    """Randomly samples the given number of samples from the view.

    Examples::

        import fiftyone as fo
        from fiftyone.core.stages import Take

        dataset = fo.load_dataset(...)

        #
        # Take 10 random samples from the dataset
        #

        stage = Take(10)
        view = dataset.add_stage(stage)

        #
        # Take 10 random samples from the dataset with a set seed
        #

        stage = Take(10, seed=51)
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

        # @todo avoid creating new field here?
        return [
            {"$set": {"_rand_take": {"$mod": [self._randint, "$_rand"]}}},
            {"$sort": {"_rand_take": ASCENDING}},
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
                "type": "float|NoneType",
                "default": "None",
                "placeholder": "seed (default=None)",
            },
            {"name": "_randint", "type": "int|NoneType", "default": "None"},
        ]


def _get_rng(seed):
    if seed is None:
        return random

    _random = random.Random()
    _random.seed(seed)
    return _random


def _get_labels_list_field(field_path, sample_collection):
    if field_path.startswith("frames."):
        if sample_collection.media_type != fom.VIDEO:
            raise ValueError(
                "Field '%s' is a frames field but '%s' is not a video dataset"
                % (field_path, sample_collection.name)
            )

        field_name = field_path[len("frames.") :]
        schema = sample_collection.get_frame_field_schema()
    else:
        field_name = field_path
        schema = sample_collection.get_field_schema()
    field = schema.get(field_name, None)

    if field is None:
        raise ValueError("Field '%s' does not exist" % field_path)

    if isinstance(field, fof.EmbeddedDocumentField):
        document_type = field.document_type
        if document_type is fol.Classifications:
            return field_path + ".classifications"

        if document_type is fol.Detections:
            return field_path + ".detections"

        if document_type is fol.Polylines:
            return field_path + ".polylines"

        if document_type is fol.Keypoints:
            return field_path + ".keypoints"

    allowed_types = (
        fol.Classifications,
        fol.Detections,
        fol.Polylines,
        fol.Keypoints,
    )

    raise ValueError(
        "Field '%s' must be a labels list type %s; found '%s'"
        % (field_path, allowed_types, field)
    )


def _parse_objects(objects):
    sample_ids = set()
    object_ids = defaultdict(set)
    for obj in objects:
        sample_ids.add(obj["sample_id"])
        object_ids[obj["field"]].add(obj["object_id"])

    return sample_ids, object_ids


def _make_label_filter_stage(label_schema, field, label_filter):
    if field not in label_schema:
        raise ValueError("Sample collection has no label field '%s'" % field)

    label_type = label_schema[field].document_type

    if label_type in (
        fol.Classification,
        fol.Detection,
        fol.Polyline,
        fol.Keypoint,
    ):
        return FilterField(field, label_filter)

    if label_type in (
        fol.Classifications,
        fol.Detections,
        fol.Polylines,
        fol.Keypoints,
    ):
        return FilterLabels(field, label_filter)

    msg = "Ignoring unsupported field '%s' (%s)" % (field, label_type)
    warnings.warn(msg)
    return None


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
    ExcludeFields,
    ExcludeObjects,
    Exists,
    FilterField,
    FilterLabels,
    FilterClassifications,
    FilterDetections,
    FilterPolylines,
    FilterKeypoints,
    Limit,
    LimitLabels,
    Match,
    MatchTag,
    MatchTags,
    Mongo,
    Shuffle,
    Select,
    SelectFields,
    SelectObjects,
    Skip,
    SortBy,
    Take,
]
