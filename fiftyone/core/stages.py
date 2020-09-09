"""
View stages.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import random
import reprlib

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING

from fiftyone.core.expressions import ViewExpression, ViewField
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
from fiftyone.core.odm.sample import default_sample_fields

import eta.core.utils as etau


class ViewStage(object):
    """Abstract base class for all view stages.

    :class:`ViewStage` instances represent logical operations to apply to
    :class:`fiftyone.core.collections.SampleCollection` instances, which may
    decide what subset of samples in the collection should pass though the
    stage, and also what subset of the contents of each
    :class:`fiftyone.core.sample.Sample` should be passed. The output of
    view stages are represented by a :class:`fiftyone.core.view.DatasetView`.
    """

    def __str__(self):
        return repr(self)

    def __repr__(self):
        kwargs_str = ", ".join(
            [
                "%s=%s" % (k, _repr.repr(v))
                for k, v in self._kwargs()
                if not k.startswith("_")
            ]
        )

        return "%s(%s)" % (self.__class__.__name__, kwargs_str)

    def get_filtered_list_fields(self):
        """Returns a list of names of fields or subfields that contain arrays
        that may have been filtered by the stage, if any.

        Returns:
            a list of fields, or ``None`` if no fields have been filtered
        """
        return None

    def get_selected_fields(self):
        """Returns a list of fields that have been selected by the stage, if
        any.

        Returns:
            a list of fields, or ``None`` if no fields have been selected
        """
        return None

    def get_excluded_fields(self):
        """Returns a list of fields that have been excluded by the stage, if
        any.

        Returns:
            a list of fields, or ``None`` if no fields have been selected
        """
        return None

    def to_mongo(self):
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        raise NotImplementedError("subclasses must implement `to_mongo()`")

    def validate(self, sample_collection):
        """Validates that the stage can be applied to the given collection.

        Args:
            sample_collection: a
                :class:`fiftyone.core.collections.SampleCollection`

        Raises:
            :class:`ViewStageError` if the stage cannot be applied to the
            collection
        """
        pass

    def _serialize(self):
        """Returns a JSON dict representation of the :class:`ViewStage`.

        Returns:
            a JSON dict
        """
        return {
            "kwargs": self._kwargs(),
            "_cls": etau.get_class_name(self),
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
        return view_stage_cls(**{k: v for (k, v) in d["kwargs"]})


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

    def to_mongo(self):
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        sample_ids = [ObjectId(id) for id in self._sample_ids]
        return [{"$match": {"_id": {"$not": {"$in": sample_ids}}}}]

    def _kwargs(self):
        return [["sample_ids", self._sample_ids]]

    @classmethod
    def _params(cls):
        return [{"name": "sample_ids", "type": "list<id>|id"}]

    def _validate_params(self):
        # Ensures that ObjectIDs are valid
        self.to_mongo()


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
        self._validate_params()

    @property
    def field_names(self):
        """The list of field names to exclude."""
        return self._field_names

    def get_excluded_fields(self):
        return self._field_names

    def to_mongo(self):
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return [{"$unset": self._field_names}]

    def _kwargs(self):
        return [["field_names", self._field_names]]

    @classmethod
    def _params(self):
        return [{"name": "field_names", "type": "list<str>"}]

    def _validate_params(self):
        default_fields = set(default_sample_fields())
        for field_name in self._field_names:
            if field_name.startswith("_"):
                raise ValueError(
                    "Cannot exclude private field '%s'" % field_name
                )

            if (field_name == "id") or (field_name in default_fields):
                raise ValueError(
                    "Cannot exclude default field '%s'" % field_name
                )

    def validate(self, sample_collection):
        sample_collection.validate_fields_exist(self.field_names)


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

    def to_mongo(self):
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
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
            {"name": "field", "type": "str"},
            {"name": "bool", "type": "bool", "default": "True"},
        ]


class FilterField(ViewStage):
    """Filters the values of a given field of a document.

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
    """

    def __init__(self, field, filter):
        self._field = field
        self._filter = filter
        self._validate_params()

    @property
    def field(self):
        """The field to filter."""
        return self._field

    @property
    def filter(self):
        """The filter expression."""
        return self._filter

    def to_mongo(self):
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return [
            {
                "$addFields": {
                    self.field: {
                        "$cond": {
                            "if": self._get_mongo_filter(),
                            "then": "$" + self.field,
                            "else": None,
                        }
                    }
                }
            }
        ]

    def _get_mongo_filter(self):
        if isinstance(self._filter, ViewExpression):
            return self._filter.to_mongo(prefix="$" + self.field)

        return self._filter

    def _kwargs(self):
        return [["field", self._field], ["filter", self._get_mongo_filter()]]

    @classmethod
    def _params(self):
        return [
            {"name": "field", "type": "str"},
            {"name": "filter", "type": "dict"},
        ]

    def _validate_params(self):
        if not isinstance(self._filter, (ViewExpression, dict)):
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

    def get_filtered_list_fields(self):
        return [self._filter_field]

    def to_mongo(self):
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return [
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

    def _get_mongo_filter(self):
        if isinstance(self._filter, ViewExpression):
            return self._filter.to_mongo(prefix="$$this")

        return self._filter

    def validate(self, sample_collection):
        raise NotImplementedError("subclasses must implement `validate()`")


class FilterClassifications(_FilterListField):
    """Filters the :class:`fiftyone.core.labels.Classification` elements in the
    specified :class:`fiftyone.core.labels.Classifications` field of the
    samples in a view.

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
        # is "cat" or "dog"
        #

        stage = FilterClassifications(
            "predictions", F("label").is_in(["cat", "dog"])
        )
        view = dataset.add_stage(stage)

    Args:
        field: the field to filter, which must be a
            :class:`fiftyone.core.labels.Classifications`
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
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
    specified :class:`fiftyone.core.labels.Detections` field of the samples in
    the stage.

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
        # "cat" or "dog"
        #

        stage = FilterDetections(
            "predictions", F("label").is_in(["cat", "dog"])
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
        num: the maximum number of samples to return. If a non-positive
            number is provided, an empty view is returned
    """

    def __init__(self, limit):
        self._limit = limit

    @property
    def limit(self):
        """The maximum number of samples to return."""
        return self._limit

    def to_mongo(self):
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        if self._limit <= 0:
            return [{"$match": {"_id": None}}]

        return [{"$limit": self._limit}]

    def _kwargs(self):
        return [["limit", self._limit]]

    @classmethod
    def _params(cls):
        return [{"name": "limit", "type": "int"}]


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

    def to_mongo(self):
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return [{"$match": self._get_mongo_filter()}]

    def _get_mongo_filter(self):
        if isinstance(self._filter, ViewExpression):
            return {"$expr": self._filter.to_mongo()}

        return self._filter

    def _kwargs(self):
        return [["filter", self._get_mongo_filter()]]

    def _validate_params(self):
        if not isinstance(self._filter, (ViewExpression, dict)):
            raise ValueError(
                "Filter must be a ViewExpression or a MongoDB expression; "
                "found '%s'" % self._filter
            )

    @classmethod
    def _params(cls):
        return [{"name": "filter", "type": "dict"}]


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

    def to_mongo(self):
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
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

    def to_mongo(self):
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return [{"$match": {"tags": {"$in": self._tags}}}]

    def _kwargs(self):
        return [["tags", self._tags]]

    @classmethod
    def _params(cls):
        return [{"name": "tags", "type": "list<str>"}]


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

    def to_mongo(self):
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        return self._pipeline

    def _kwargs(self):
        return [["pipeline", self._pipeline]]

    @classmethod
    def _params(self):
        return [{"name": "pipeline", "type": "dict"}]


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

    def to_mongo(self):
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        sample_ids = [ObjectId(id) for id in self._sample_ids]
        return [{"$match": {"_id": {"$in": sample_ids}}}]

    def _kwargs(self):
        return [["sample_ids", self._sample_ids]]

    @classmethod
    def _params(cls):
        return [{"name": "sample_ids", "type": "list<id>|id"}]

    def _validate_params(self):
        # Ensures that ObjectIDs are valid
        self.to_mongo()


class SelectFields(ViewStage):
    """Selects *only* the fields with the given names from the samples in the
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

        self._field_names = field_names

    @property
    def field_names(self):
        """The list of field names to select."""
        return self._field_names or []

    def get_selected_fields(self):
        default_fields = default_sample_fields()
        return list(set(self.field_names) | set(default_fields))

    def to_mongo(self):
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        default_fields = default_sample_fields(include_private=True)
        selected_fields = list(set(self.field_names) | set(default_fields))
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
            }
        ]

    def _validate_params(self):
        for field_name in self.field_names:
            if field_name.startswith("_"):
                raise ValueError(
                    "Cannot select private field '%s'" % field_name
                )

    def validate(self, sample_collection):
        sample_collection.validate_fields_exist(self.field_names)


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

    def to_mongo(self):
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
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
        return [{"name": "seed", "type": "float|NoneType", "default": "None"}]


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

    def to_mongo(self):
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        if self._skip <= 0:
            return []

        return [{"$skip": self._skip}]

    def _kwargs(self):
        return [["skip", self._skip]]

    @classmethod
    def _params(cls):
        return [{"name": "skip", "type": "int"}]


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

    def to_mongo(self):
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        order = DESCENDING if self._reverse else ASCENDING

        field_or_expr = self._get_mongo_field_or_expr()

        if not isinstance(field_or_expr, dict):
            return [{"$sort": {field_or_expr: order}}]

        return [
            {"$addFields": {"_sort_field": field_or_expr}},
            {"$sort": {"_sort_field": order}},
            {"$unset": "_sort_field"},
        ]

    def _get_mongo_field_or_expr(self):
        if isinstance(self._field_or_expr, ViewField):
            return self._field_or_expr.name

        if isinstance(self._field_or_expr, ViewExpression):
            return self._field_or_expr.to_mongo()

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
            {"name": "reverse", "type": "bool", "default": "False"},
        ]

    def validate(self, sample_collection):
        if etau.is_str(self._field_or_expr):
            sample_collection.validate_fields_exist(self._field_or_expr)


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

    def to_mongo(self):
        """Returns the MongoDB version of the stage.

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
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
            {"name": "size", "type": "int"},
            {"name": "seed", "type": "float|NoneType", "default": "None"},
        ]


def _get_rng(seed):
    if seed is None:
        return random

    _random = random.Random()
    _random.seed(seed)
    return _random


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
    Exists,
    FilterField,
    FilterClassifications,
    FilterDetections,
    Limit,
    Match,
    MatchTag,
    MatchTags,
    Mongo,
    Shuffle,
    Select,
    SelectFields,
    Skip,
    SortBy,
    Take,
]
