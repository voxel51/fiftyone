"""
View stages.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from copy import deepcopy
import random
import reprlib
import uuid
import warnings

from bson import ObjectId
from deprecated import deprecated

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

fod = fou.lazy_import("fiftyone.core.dataset")
fop = fou.lazy_import("fiftyone.core.patches")
foug = fou.lazy_import("fiftyone.utils.geojson")
foup = fou.lazy_import("fiftyone.utils.patches")


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
        self._validate_params()

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

    def _validate_params(self):
        # Ensures that ObjectIDs are valid
        for _id in self._sample_ids:
            ObjectId(_id)


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

    def __init__(self, field_names):
        if etau.is_str(field_names):
            field_names = [field_names]
        elif field_names is not None:
            field_names = list(field_names)

        self._field_names = field_names

    @property
    def field_names(self):
        """The list of field names to exclude."""
        return self._field_names

    def get_excluded_fields(self, sample_collection, frames=False):
        if frames:
            default_fields = fofr.get_default_frame_fields(
                include_private=True, include_id=True
            )

            excluded_fields = []
            for field in self.field_names:
                (
                    field_name,
                    is_frame_field,
                ) = sample_collection._handle_frame_field(field)
                if is_frame_field:
                    excluded_fields.append(field_name)
        else:
            default_fields = fos.get_default_sample_fields(
                include_private=True, include_id=True
            )
            if sample_collection.media_type == fom.VIDEO:
                default_fields += ("frames",)

            excluded_fields = []
            for field in self.field_names:
                if not sample_collection._is_frame_field(field):
                    excluded_fields.append(field)

        for field_name in excluded_fields:
            if field_name.startswith("_"):
                raise ValueError(
                    "Cannot exclude private field '%s'" % field_name
                )

            if field_name == "id" or field_name in default_fields:
                ftype = "frame field" if frames else "field"
                raise ValueError(
                    "Cannot exclude default %s '%s'" % (ftype, field_name)
                )

        return excluded_fields

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
        return [["field_names", self._field_names]]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "field_names",
                "type": "list<str>",
                "placeholder": "list,of,fields",
            }
        ]

    def validate(self, sample_collection):
        # Using dataset here allows a field to be excluded multiple times
        sample_collection._dataset.validate_fields_exist(self.field_names)


class ExcludeLabels(ViewStage):
    """Excludes the specified labels from a collection.

    The returned view will omit samples, sample fields, and individual labels
    that do not match the specified selection criteria.

    You can perform an exclusion via one of the following methods:

    -   Provide one or both of the ``ids`` and ``tags`` arguments, and
        optionally the ``fields`` argument

    -   Provide the ``labels`` argument, which should contain a list of dicts
        in the format returned by
        :meth:`fiftyone.core.session.Session.selected_labels`

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
        dataset = dataset.clone()  # create a copy since we're modifying data
        dataset.select_labels(ids=ids).tag_labels("test")

        print(dataset.count_values("ground_truth.detections.tags"))
        print(dataset.count_values("predictions.detections.tags"))

        # Exclude the labels via their tag
        stage = fo.ExcludeLabels(tags=["test"])
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
                _make_omit_empty_pipeline(sample_collection, fields)
            )

        return pipeline

    def _make_pipeline(self, sample_collection):
        pipeline = []

        #
        # Filter labels that match `tags` or `id`
        #

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

        if filter_expr is not None:
            for field in fields:
                stage = FilterLabels(field, filter_expr, only_matches=False)
                stage.validate(sample_collection)
                pipeline.extend(stage.to_mongo(sample_collection))

        # Filter samples with no labels, if requested
        if self._omit_empty:
            fields = sample_collection._get_label_fields()
            pipeline.extend(
                _make_omit_empty_pipeline(sample_collection, fields)
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
        self._new_field = _new_field or field
        self._only_matches = only_matches
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
        if not isinstance(self._filter, (foe.ViewExpression, dict)):
            raise ValueError(
                "Filter must be a ViewExpression or a MongoDB aggregation "
                "expression defining a filter; found '%s'" % self._filter
            )

    def validate(self, sample_collection):
        if self._field == "filepath":
            raise ValueError("Cannot filter required field `filepath`")

        sample_collection.validate_fields_exist(self._field)

        _, is_frame_field = sample_collection._handle_frame_field(self._field)
        self._is_frame_field = is_frame_field


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


class FilterLabels(FilterField):
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
    """

    def __init__(
        self, field, filter, only_matches=True, _new_field=None, _prefix=""
    ):
        self._field = field
        self._filter = filter
        self._new_field = _new_field or field
        self._only_matches = only_matches
        self._prefix = _prefix
        self._labels_field = None
        self._is_frame_field = None
        self._is_labels_list_field = None
        self._validate_params()

    def get_filtered_fields(self, sample_collection, frames=False):
        labels_field, is_frame_field = sample_collection._handle_frame_field(
            self._labels_field
        )

        if self._is_labels_list_field and (frames == is_frame_field):
            return [labels_field]

        return None

    def to_mongo(self, sample_collection):
        self._get_labels_field(sample_collection)

        labels_field, is_frame_field = sample_collection._handle_frame_field(
            self._labels_field
        )
        new_field = self._get_new_field(sample_collection)

        if is_frame_field:
            if self._is_labels_list_field:
                _make_pipeline = _get_filter_frames_list_field_pipeline
            else:
                _make_pipeline = _get_filter_frames_field_pipeline
        elif self._is_labels_list_field:
            _make_pipeline = _get_filter_list_field_pipeline
        else:
            _make_pipeline = _get_filter_field_pipeline

        return _make_pipeline(
            labels_field,
            new_field,
            self._filter,
            only_matches=self._only_matches,
            prefix=self._prefix,
        )

    def _needs_frames(self, sample_collection):
        return sample_collection._is_frame_field(self._labels_field)

    def _get_mongo_filter(self):
        if self._is_labels_list_field:
            return _get_list_field_mongo_filter(self._filter)

        if self._is_frame_field:
            filter_field = self._field.split(".", 1)[1]  # remove `frames`
            return _get_field_mongo_filter(
                self._filter, prefix="$frame." + filter_field
            )

        return _get_field_mongo_filter(self._filter, prefix=self._field)

    def _get_labels_field(self, sample_collection):
        field_name, is_list_field, is_frame_field = _get_labels_field(
            sample_collection, self._field
        )
        self._is_frame_field = is_frame_field
        self._labels_field = field_name
        self._is_labels_list_field = is_list_field
        self._is_frame_field = is_frame_field

    def _get_new_field(self, sample_collection):
        field, _ = sample_collection._handle_frame_field(self._labels_field)
        new_field, _ = sample_collection._handle_frame_field(self._new_field)

        if "." in field:
            return ".".join([new_field, field.split(".")[-1]])

        return new_field

    def validate(self, sample_collection):
        self._get_labels_field(sample_collection)


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


def _get_list_field_mongo_filter(filter_arg, prefix="$this"):
    if isinstance(filter_arg, foe.ViewExpression):
        return filter_arg.to_mongo(prefix="$" + prefix)

    return filter_arg


class _FilterListField(FilterField):
    def _get_new_field(self, sample_collection):
        new_field, _ = sample_collection._handle_frame_field(self._new_field)
        return new_field

    @property
    def _filter_field(self):
        raise NotImplementedError("subclasses must implement `_filter_field`")

    def get_filtered_fields(self, sample_collection, frames=False):
        filter_field, is_frame_field = sample_collection._handle_frame_field(
            self._filter_field
        )

        if frames == is_frame_field:
            return [filter_field]

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

        # These operations require a `sphere2d` index
        sample_collection.create_index(self._location_key, sphere2d=True)


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

    def to_mongo(self, sample_collection):
        if self._labels_list_field is None:
            raise ValueError(
                "`validate()` must be called before using a %s stage"
                % self.__class__
            )

        limit = max(self._limit, 0)

        expr = F()[:limit]
        pipeline, _ = sample_collection._make_set_field_pipeline(
            self._labels_list_field, expr
        )

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
        self._labels_list_field, self._is_frame_field = _get_labels_list_field(
            sample_collection, self._field
        )


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
        labels_field, _, is_frame_field = _get_labels_field(
            sample_collection, self._field
        )

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
        _get_labels_field(sample_collection, self._field)


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
        expr: a :class:`fiftyone.core.expressions.ViewExpression or
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
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "field", "type": "field|str"},
            {"name": "expr", "type": "json", "placeholder": ""},
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
        if not isinstance(self._filter, (foe.ViewExpression, dict)):
            raise ValueError(
                "Filter must be a ViewExpression or a MongoDB aggregation "
                "expression defining a filter; found '%s'" % self._filter
            )

    @classmethod
    def _params(cls):
        return [{"name": "filter", "type": "json", "placeholder": ""}]


class MatchTags(ViewStage):
    """Returns a view containing the samples in the collection that have any of
    the given tag(s).

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

    Args:
        tags: the tag or iterable of tags to match
    """

    def __init__(self, tags):
        if etau.is_str(tags):
            tags = [tags]
        else:
            tags = list(tags)

        self._tags = tags

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
                "type": "list<str>|str",
                "placeholder": "list,of,tags",
            }
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
        self._validate_params()

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

    def _validate_params(self):
        # Ensures that ObjectIDs are valid
        for _id in self._sample_ids:
            ObjectId(_id)


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

    def __init__(self, field_names=None):
        if etau.is_str(field_names):
            field_names = [field_names]
        elif field_names is not None:
            field_names = list(field_names)

        self._field_names = field_names

    @property
    def field_names(self):
        """The list of field names to select."""
        return self._field_names or []

    def get_selected_fields(self, sample_collection, frames=False):
        if frames:
            default_fields = fofr.get_default_frame_fields(
                include_private=True, include_id=True
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
            default_fields = fos.get_default_sample_fields(
                include_private=True, include_id=True
            )
            if sample_collection.media_type == fom.VIDEO:
                default_fields += ("frames",)

            selected_fields = []
            for field in self.field_names:
                if not sample_collection._is_frame_field(field):
                    selected_fields.append(field)

        return list(set(selected_fields) | set(default_fields))

    def to_mongo(self, sample_collection):
        selected_fields = self.get_selected_fields(
            sample_collection, frames=False
        )

        selected_frame_fields = [
            sample_collection._FRAMES_PREFIX + f
            for f in self.get_selected_fields(sample_collection, frames=True)
        ]

        if selected_frame_fields:
            # Don't project on root `frames` and embedded fields
            # https://docs.mongodb.com/manual/reference/operator/aggregation/project/#path-collision-errors-in-embedded-fields
            selected_fields = [f for f in selected_fields if f != "frames"]
            selected_fields += selected_frame_fields

        if not selected_fields:
            return []

        return [{"$project": {fn: True for fn in selected_fields}}]

    def _needs_frames(self, sample_collection):
        return any(
            sample_collection._is_frame_field(f) for f in self.field_names
        )

    def _kwargs(self):
        return [["field_names", self._field_names]]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "field_names",
                "type": "NoneType|list<field>|field|list<str>|str",
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
        sample_collection.validate_fields_exist(self.field_names)


class SelectLabels(ViewStage):
    """Selects only the specified labels from a collection.

    The returned view will omit samples, sample fields, and individual labels
    that do not match the specified selection criteria.

    You can perform a selection via one of the following methods:

    -   Provide one or both of the ``ids`` and ``tags`` arguments, and
        optionally the ``fields`` argument

    -   Provide the ``labels`` argument, which should contain a list of dicts
        in the format returned by
        :meth:`fiftyone.core.session.Session.selected_labels`

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
        dataset = dataset.clone()  # create a copy since we're modifying data
        dataset.select_labels(ids=ids).tag_labels("test")

        print(dataset.count_values("ground_truth.detections.tags"))
        print(dataset.count_values("predictions.detections.tags"))

        # Retrieve the labels via their tag
        stage = fo.SelectLabels(tags=["test"])
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

        # Filter samples with no labels, if requested
        if self._omit_empty:
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

        if filter_expr is not None:
            for field in fields:
                stage = FilterLabels(field, filter_expr, only_matches=False)
                stage.validate(sample_collection)
                pipeline.extend(stage.to_mongo(sample_collection))

        # Filter samples with no labels, if requested
        if self._omit_empty:
            pipeline.extend(
                _make_omit_empty_pipeline(sample_collection, fields)
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
    """Sorts the samples in a collection by the given field or expression.

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

    Args:
        field_or_expr: the field or ``embedded.field.name`` to sort by, or a
            :class:`fiftyone.core.expressions.ViewExpression` or a
            `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that defines the quantity to sort by
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
        order = -1 if self._reverse else 1

        field_or_expr = self._get_mongo_field_or_expr()

        if etau.is_str(field_or_expr):
            return [{"$sort": {field_or_expr: order}}]

        return [
            {"$set": {"_sort_field": field_or_expr}},
            {"$sort": {"_sort_field": order}},
            {"$unset": "_sort_field"},
        ]

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

        # If sorting by a field, not an expression
        if etau.is_str(field_or_expr):
            # Make sure the field exists
            sample_collection.validate_fields_exist(field_or_expr)

            # Create an index on the field, if necessary, to make sorting
            # more efficient
            sample_collection.create_index(field_or_expr)


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

        return results.sort_by_similarity(
            self._query_ids,
            k=self._k,
            reverse=self._reverse,
            samples=sample_collection,
            mongo=True,
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

    Fields other than ``field`` and the default sample fields will not be
    included in the returned view. A ``sample_id`` field will be added that
    records the sample ID from which each patch was taken.

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
    """

    def __init__(self, field, _state=None):
        self._field = field
        self._state = _state

    @property
    def has_view(self):
        return True

    @property
    def field(self):
        """The patches field."""
        return self._field

    def load_view(self, sample_collection):
        state = {
            "dataset": sample_collection.dataset_name,
            "stages": sample_collection.view()._serialize(include_uuids=False),
            "field": self._field,
        }

        last_state = deepcopy(self._state)
        if last_state is not None:
            name = last_state.pop("name", None)
        else:
            name = None

        if state != last_state or not fod.dataset_exists(name):
            patches_dataset = foup.make_patches_dataset(
                sample_collection, self._field
            )

            state["name"] = patches_dataset.name
            self._state = state
        else:
            patches_dataset = fod.load_dataset(name)

        return fop.PatchesView(sample_collection, self, patches_dataset)

    def _kwargs(self):
        return [
            ["field", self._field],
            ["_state", self._state],
        ]

    @classmethod
    def _params(self):
        return [
            {"name": "field", "type": "field", "placeholder": "label field"},
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
    """

    def __init__(self, eval_key, _state=None):
        self._eval_key = eval_key
        self._state = _state

    @property
    def has_view(self):
        return True

    @property
    def eval_key(self):
        """The evaluation key to extract patches for."""
        return self._eval_key

    def load_view(self, sample_collection):
        state = {
            "dataset": sample_collection.dataset_name,
            "stages": sample_collection.view()._serialize(include_uuids=False),
            "eval_key": self._eval_key,
        }

        last_state = deepcopy(self._state)
        if last_state is not None:
            name = last_state.pop("name", None)
        else:
            name = None

        if state != last_state or not fod.dataset_exists(name):
            eval_patches_dataset = foup.make_evaluation_dataset(
                sample_collection, self._eval_key
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
            ["_state", self._state],
        ]

    @classmethod
    def _params(self):
        return [
            {"name": "eval_key", "type": "str", "placeholder": "eval key"},
            {"name": "_state", "type": "NoneType|json", "default": "None"},
        ]


def _get_sample_ids(samples_or_ids):
    import fiftyone.core.collections as foc

    if etau.is_str(samples_or_ids):
        return [samples_or_ids]

    if isinstance(samples_or_ids, (fos.Sample, fos.SampleView)):
        return [samples_or_ids.id]

    if isinstance(samples_or_ids, foc.SampleCollection):
        return samples_or_ids.values("id")

    if not samples_or_ids:
        return []

    if isinstance(next(iter(samples_or_ids)), (fos.Sample, fos.SampleView)):
        return [s.id for s in samples_or_ids]

    return list(samples_or_ids)


def _get_rng(seed):
    if seed is None:
        return random

    _random = random.Random()
    _random.seed(seed)
    return _random


def _get_labels_field(sample_collection, field_path):
    field, is_frame_field = _get_field(sample_collection, field_path)

    if isinstance(field, fof.EmbeddedDocumentField):
        document_type = field.document_type
        is_list_field = issubclass(document_type, fol._LABEL_LIST_FIELDS)
        if is_list_field:
            path = field_path + "." + document_type._LABEL_LIST_FIELD
        elif issubclass(document_type, fol._SINGLE_LABEL_FIELDS):
            path = field_path
        else:
            path = None

        if path is not None:
            return path, is_list_field, is_frame_field

    raise ValueError(
        "Field '%s' must be a Label type %s; found '%s'"
        % (field_path, fol._LABEL_FIELDS, field)
    )


def _get_labels_list_field(sample_collection, field_path):
    field, is_frame_field = _get_field(sample_collection, field_path)

    if isinstance(field, fof.EmbeddedDocumentField):
        document_type = field.document_type
        if issubclass(document_type, fol._LABEL_LIST_FIELDS):
            path = field_path + "." + document_type._LABEL_LIST_FIELD
            return path, is_frame_field

    raise ValueError(
        "Field '%s' must be a labels list type %s; found '%s'"
        % (field_path, fol._LABEL_LIST_FIELDS, field)
    )


def _get_field(sample_collection, field_path):
    field_name, is_frame_field = sample_collection._handle_frame_field(
        field_path
    )

    if is_frame_field:
        schema = sample_collection.get_frame_field_schema()
    else:
        schema = sample_collection.get_field_schema()

    if field_name not in schema:
        ftype = "Frame field" if is_frame_field else "Field"
        raise ValueError("%s '%s' does not exist" % (ftype, field_path))

    field = schema[field_name]

    return field, is_frame_field


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


def _get_label_field_only_matches_expr(sample_collection, field, prefix=""):
    label_type = sample_collection._get_label_field_type(field)
    field, is_frame_field = sample_collection._handle_frame_field(field)
    is_label_list_field = issubclass(label_type, fol._LABEL_LIST_FIELDS)

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


def _make_omit_empty_pipeline(sample_collection, fields):
    match_exprs = []
    for field in fields:
        match_exprs.append(
            _get_label_field_only_matches_expr(sample_collection, field)
        )

    stage = Match(F.any(match_exprs))
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
    ExcludeFields,
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
    Limit,
    LimitLabels,
    MapLabels,
    Match,
    MatchTags,
    Mongo,
    Shuffle,
    Select,
    SelectFields,
    SelectLabels,
    SetField,
    Skip,
    SortBy,
    SortBySimilarity,
    Take,
    ToPatches,
    ToEvaluationPatches,
]
