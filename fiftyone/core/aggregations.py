"""
Aggregations.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import ObjectId

import eta.core.serial as etas

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.utils as fou

_LABELS = (fol.Classifications, fol.Detections, fol.Keypoints, fol.Polylines)
_NUMBER_FIELDS = (fof.IntField, fof.FloatField)
_VALUE_FIELDS = (fof.BooleanField, fof.StringField)
_FRAMES_PREFIX = "frames."


def _unwind_frames(dataset):
    return [{"$unwind": "$frames"}, {"$replaceRoot": {"newRoot": "$frames"}}]


class Aggregation(object):
    """Abstract base class for all aggregations.

    :class:`Aggregation` instances represent an aggregation or reduction
    of a :class:`fiftyone.core.collections.SampleCollection` instance.

    Args:
        field_name: the name of the field to compute on
    """

    def __init__(self, field_name):
        self._field_name = field_name

    @property
    def field_name(self):
        """The field name being computed on."""
        return self.field_name

    @property
    def _field_name_path(self):
        return self._field_name.replace(".", "__")

    def _get_default_result(self):
        raise NotImplementedError(
            "Subclass must implement _get_default_result()"
        )

    def _get_output_field(self, schema, frame_schema):
        raise NotImplementedError(
            "Subclass must implement _get_output_field()"
        )

    def _get_result(self, d):
        raise NotImplementedError("Subclass must implement _get_result()")

    def _to_mongo(self, dataset, schema, frame_schema):
        raise NotImplementedError("Subclass must implement _to_mongo()")

    def _get_field_path_pipeline(self, schema, frame_schema, dataset):
        if (
            self._field_name.startswith("frames.")
            and dataset.media_type == fom.VIDEO
        ):
            schema = frame_schema
            field_name = self._field_name[len("frames.") :]
            pipeline = _unwind_frames(dataset)
        else:
            field_name = self._field_name
            pipeline = []
        try:
            field = schema[field_name]
            path = "$%s" % field_name
            return field, path, pipeline
        except KeyError:
            if (
                self._field_name == "frames"
                and dataset.media_type == fom.VIDEO
            ):
                return "frames", "$frames", _unwind_frames(dataset)

            raise AggregationError(
                "field `%s` does not exist on this Dataset" % self._field_name
            )


class AggregationResult(etas.Serializable):
    """Abstract base class for all aggregation results.

    :class:`AggregationResult` instances represent the result of the execution
    of an :class:`Aggregation` instance on a
    :class:`fiftyone.core.collections.SampleCollection`.
    """

    def __init__(self, *args, **kwargs):
        raise NotImplementedError("Subclass must implement __init__()")

    def __str__(self):
        return repr(self)

    def __repr__(self):
        d = {}
        for f in self.attributes():
            value = getattr(self, f)
            if isinstance(value, ObjectId):
                d[f] = str(value)
            else:
                d[f] = value

        class_name = self.__class__.__name__
        out = fou.pformat(d)
        return "<%s: %s>" % (class_name, fou.pformat(d))


class AggregationError(RuntimeError):
    """An error raised during the execution of an :class:`Aggregation` by a
    dataset or view.
    """

    pass


class Bounds(Aggregation):
    """Computes the inclusive bounds of a numeric field or a list field of
    a numeric field in a view.

    Note that to compute bounds on a list field of numeric fields, the
    numeric subfield must be explicitly defined.

    Examples::

        import fiftyone as fo
        from fiftyone.core.aggregations import Bounds

        dataset = fo.load_dataset(...)

        #
        # Compute the bounds of a numeric field
        #

        bounds = Bounds("uniqueness")
        bounds_result = dataset.aggregate(bounds)
        bounds_result.bounds # (min, max) inclusive bounds tuple

        #
        # Compute the a bounds of a list field of a numeric field
        #
        # assume the list field was instantiated on the dataset with a call to
        # dataset.add_sample_field()
        #

        dataset.add_sample_field(fo.ListField, subfield=fo.FloatField())
        list_bounds = Bounds("uniqueness_trials")
        list_bounds_result = dataset.aggregate(list_bounds)
        list_bounds_result.bounds # (min, max) inclusive bounds tuple

    Args:
        field_name: the name of the field to compute bounds for
    """

    def _get_default_result(self):
        return BoundsResult(self._field_name, (None, None))

    def _get_output_field(self, view):
        return "%s-bounds" % self._field_name_path

    def _get_result(self, d):
        mn = d["min"]
        mx = d["max"]
        return BoundsResult(self._field_name, (mn, mx))

    def _to_mongo(self, dataset, schema, frame_schema):
        field, path, pipeline = self._get_field_path_pipeline(
            schema, frame_schema, dataset
        )
        if isinstance(field, fof.ListField) and isinstance(
            field.field, _NUMBER_FIELDS
        ):
            unwind = True
        elif isinstance(field, _NUMBER_FIELDS):
            unwind = False
        else:
            raise AggregationError(
                "unsupported field '%s' of type '%s'"
                % (self._field_name, type(field))
            )

        pipeline += [
            {
                "$group": {
                    "_id": None,
                    "min": {"$min": path},
                    "max": {"$max": path},
                }
            },
        ]
        if unwind:
            pipeline = (
                pipeline[: len(pipeline) - 1]
                + [{"$unwind": path}]
                + pipeline[len(pipeline) - 1 :]
            )

        return pipeline


class BoundsResult(AggregationResult):
    """The result of the execution of a :class:`Bounds` instance by a dataset
    or view.

    Attributes:
        name: the name of the field
        bounds: the inclusive (min, max) bounds tuple
    """

    def __init__(self, name, bounds):
        self.name = name
        self.bounds = bounds


class ConfidenceBounds(Aggregation):
    """Computes the inclusive bounds of the confidences of a
    :class:`fiftyone.core.labels.Label`

    Examples::

        import fiftyone as fo
        from fiftyone.core.aggregations import ConfidenceBounds

        dataset = fo.load_dataset(...)

        #
        # Compute the confidence bounds of a fo.Classification label field
        #

        bounds = ConfidenceBounds("predictions")
        bounds_result = dataset.aggregate(bounds)
        bounds_result.bounds # (min, max) inclusive confidence bounds tuple

        #
        # Compute the a confidence bounds a fo.Detections label field
        #

        detections_bounds = ConfidenceBounds("detections")
        detections_bounds_result = dataset.aggregate(detections_bounds)
        detections_bounds_result.bounds # (min, max) inclusive bounds tuple

    Args:
        field_name: the name of the label field to compute confidence bounds
            for
    """

    def _get_default_result(self):
        return ConfidenceBoundsResult(self._field_name, (None, None))

    def _get_output_field(self, view):
        return "%s-confidence-bounds" % self._field_name_path

    def _get_result(self, d):
        mn = d["min"]
        mx = d["max"]
        return ConfidenceBoundsResult(self._field_name, (mn, mx))

    def _to_mongo(self, dataset, schema, frame_schema):
        field, path, pipeline = self._get_field_path_pipeline(
            schema, frame_schema, dataset
        )
        if not isinstance(field, fof.EmbeddedDocumentField) or not issubclass(
            field.document_type, fol.Label
        ):
            raise AggregationError("field '%s' is not a Label")

        if field.document_type in _LABELS:
            path = "%s.%s" % (path, field.document_type.__name__.lower())
            pipeline.append(
                {"$unwind": {"path": path, "preserveNullAndEmptyArrays": True}}
            )

        path = "%s.confidence" % path
        pipeline += [
            {
                "$group": {
                    "_id": None,
                    "min": {"$min": path},
                    "max": {"$max": path},
                }
            },
        ]

        return pipeline


class ConfidenceBoundsResult(AggregationResult):
    """The result of the execution of a :class:`ConfidenceBounds` instance by a
    dataset or view.

    Attributes:
        name: the name of the field
        bounds: the inclusive (min, max) confidence bounds tuple
    """

    def __init__(self, name, bounds):
        self.name = name
        self.bounds = bounds


class Count(Aggregation):
    """Counts the items with respect to a field, or the number of samples if
    no field_name is provided.

    Examples::

        import fiftyone as fo
        from fiftyone.core.aggregations import Count

        dataset = fo.load_dataset(...)

        #
        # Compute the number of samples in a dataset
        #

        count = Count()
        count_result = dataset.aggregate(count)
        count_result.count

        #
        # Compute the number of detections in a fo.Detections label field
        #

        detections = Count("detections")
        detections_result = dataset.aggregate(detections)
        detections_result.count

    Args:
        field_name: the name of the field to have its items counted. If no
            field name is provided, samples themselves are counted
    """

    def __init__(self, field_name=None):
        super().__init__(field_name)

    def _get_default_result(self):
        return CountResult(self._field_name, 0)

    def _get_output_field(self, view):
        if self._field_name is None:
            return "count"

        return "%s-count" % self._field_name_path

    def _get_result(self, d):
        return CountResult(self._field_name, d["count"])

    def _to_mongo(self, dataset, schema, frame_schema):
        if self._field_name is None:
            return [{"$count": "count"}]

        field, path, pipeline = self._get_field_path_pipeline(
            schema, frame_schema, dataset
        )

        if (
            isinstance(field, fof.EmbeddedDocumentField)
            and field.document_type in _LABELS
        ):
            path = "%s.%s" % (path, field.document_type.__name__.lower())
            pipeline.append({"$unwind": path})
        elif isinstance(field, fof.ListField):
            pipeline.append({"$unwind": path})

        return pipeline + [{"$count": "count"}]


class CountResult(AggregationResult):
    """The result of the execution of a :class:`Count` instance by a dataset or
    view.

    Attributes:
        name: the name of the field, or "count" if samples were counted
        count: the count
    """

    def __init__(self, name, count):
        if name is None:
            name = "count"

        self.name = name
        self.count = count


class CountLabels(Aggregation):
    """Counts the occurrences of label values for a
    :class:`fiftyone.core.labels.Label` field.

    Examples::

        import fiftyone as fo
        from fiftyone.core.aggregations import CountLabels

        dataset = fo.load_dataset(...)

        #
        # Compute the label counts for "ground_truth" fo.Classifications field
        # in the dataset
        #

        count_labels = CountLabels("ground_truth")
        count_labels_result = dataset.aggregate(count_labels)
        count_labels_result.labels

    Args:
        field_name: the name of the label field
    """

    def _get_default_result(self):
        return CountLabelsResult(self._field_name, {})

    def _get_output_field(self, view):
        return "%s-count-labels" % self._field_name_path

    def _get_result(self, d):
        d = {i["k"]: i["count"] for i in d["result"] if i["k"] is not None}
        return CountLabelsResult(self._field_name, d)

    def _to_mongo(self, dataset, schema, frame_schema):
        field, path, pipeline = self._get_field_path_pipeline(
            schema, frame_schema, dataset
        )
        if not isinstance(field, fof.EmbeddedDocumentField) or not issubclass(
            field.document_type, fol.Label
        ):
            raise AggregationError("field '%s' is not a Label")

        if field.document_type in _LABELS:
            path = "%s.%s" % (path, field.document_type.__name__.lower())
            pipeline.append(
                {"$unwind": {"path": path, "preserveNullAndEmptyArrays": True}}
            )

        path = "%s.label" % path
        pipeline += [
            {"$group": {"_id": path, "count": {"$sum": 1}}},
            {
                "$group": {
                    "_id": None,
                    "result": {"$push": {"k": "$_id", "count": "$count"}},
                }
            },
        ]
        return pipeline


class CountLabelsResult(AggregationResult):
    """The result of the execution of a :class:`CountLabels` instance by a
    dataset or view.

    Attributes:
        name: the name of the field whose values were counted
        labels: a dict mapping the label to the number of occurrences
    """

    def __init__(self, name, labels):
        self.name = name
        self.labels = labels


class CountValues(Aggregation):
    """Counts the occurrences of values or a countable field.

    Countable fields are:

    -   :class:`fiftyone.core.fields.BooleanField`
    -   :class:`fiftyone.core.fields.IntField`
    -   :class:`fiftyone.core.fields.StringField`

    Examples::

        import fiftyone as fo
        from fiftyone.core.aggregations import CountValues

        dataset = fo.load_dataset(...)

        #
        # Compute the tag counts in the dataset
        #

        count_values = CountValues("tags")
        count_values_result = dataset.aggregate(count_values)
        count_values_result.values

    Args:
        field_name: the name of the countable field
    """

    def _get_default_result(self):
        return CountValuesResult(self._field_name, {})

    def _get_output_field(self, view):
        return "%s-count-values" % self._field_name_path

    def _get_result(self, d):
        d = {i["k"]: i["count"] for i in d["result"] if i["k"] is not None}
        return CountValuesResult(self._field_name, d)

    def _to_mongo(self, dataset, schema, frame_schema):
        field, path, pipeline = self._get_field_path_pipeline(
            schema, frame_schema, dataset
        )
        if isinstance(field, _VALUE_FIELDS):
            pass
        elif isinstance(field, fof.ListField) and isinstance(
            field.field, _VALUE_FIELDS
        ):
            pipeline.append({"$unwind": path})
        else:
            raise AggregationError(
                "unsupported field '%s' of type '%s'"
                % (self._field_name, type(field))
            )

        pipeline += [
            {"$group": {"_id": path, "count": {"$sum": 1}}},
            {
                "$group": {
                    "_id": None,
                    "result": {"$push": {"k": "$_id", "count": "$count"}},
                }
            },
        ]
        return pipeline


class CountValuesResult(AggregationResult):
    """The result of the execution of a :class:`CountValues` instance by a
    dataset or view.

    Attributes:
        name: the name of the field whose values were counted
        values: a dict mapping the value to the number of occurrences
    """

    def __init__(self, name, values):
        self.name = name
        self.values = values


class Distinct(Aggregation):
    """Computes the distinct values of a countable field or a list field of a
    countable field.

    Countable fields are:

    -   :class:`fiftyone.core.fields.BooleanField`
    -   :class:`fiftyone.core.fields.IntField`
    -   :class:`fiftyone.core.fields.StringField`

    Note that to compute distinct values for a list field of countable fields,
    the countable subfield must be explicitly defined.

    Examples::

        import fiftyone as fo
        from fiftyone.core.aggregations import Distinct

        dataset = fo.load_dataset(...)

        #
        # Compute the distinct values of string field
        #

        distinct = Distinct("kind")
        distinct_result = dataset.aggregate(distinct)
        distinct_result.values

        #
        # Compute the a bounds of a list field of string fields
        #

        tags = Distinct("tags")
        tags_result = dataset.aggregate(tags)
        tags_result.values

    Args:
        field_name: the name of the field to compute distinct values for
    """

    def _get_default_result(self):
        return DistinctResult(self._field_name, [])

    def _get_output_field(self, view):
        return "%s-distinct" % self._field_name_path

    def _get_result(self, d):
        return DistinctResult(
            self._field_name, sorted(d[self._field_name_path])
        )

    def _to_mongo(self, dataset, schema, frame_schema):
        field, path, pipeline = self._get_field_path_pipeline(
            schema, frame_schema, dataset
        )
        if isinstance(field, fof.ListField) and isinstance(
            field.field, _VALUE_FIELDS
        ):
            unwind = True
        elif isinstance(field, _VALUE_FIELDS):
            unwind = False
        else:
            raise AggregationError(
                "unsupported field '%s' of type '%s'"
                % (self._field_name, type(field))
            )

        pipeline += [
            {
                "$group": {
                    "_id": "None",
                    self._field_name_path: {"$addToSet": path},
                }
            },
        ]

        if unwind:
            pipeline = (
                pipeline[: len(pipeline) - 1]
                + [{"$unwind": path}]
                + pipeline[len(pipeline) - 1 :]
            )

        return pipeline


class DistinctResult(AggregationResult):
    """The result of the execution of a :class:`Distinct` instance by a dataset
    or view.

    Attributes:
        name: the name of the field
        values: a sorted list of distinct values
    """

    def __init__(self, name, values):
        self.name = name
        self.values = values


class DistinctLabels(Aggregation):
    """Computes the distinct label values of a
    :class:`fiftyone.core.labels.Label`.

    Examples::

        import fiftyone as fo
        from fiftyone.core.aggregations import DistinctLabels

        dataset = fo.load_dataset(...)

        #
        # Compute the distinct labels of a fo.Classification label field
        #

        distinct_labels = DistinctLabels("predictions")
        distinct_labels_result = dataset.aggregate(distinct_labels)
        distinct_labels_result.labels

        #
        # Compute the distinct labels of a fo.Detections label field
        #

        detections_labels = DistinctLabels("detections")
        detections_labels_result = dataset.aggregate(detections_labels)
        detections_labels_result.labels

    Args:
        field_name: the name of the label field to compute distinct labels for
    """

    def __init__(self, field_name):
        super().__init__(field_name)

    def _get_default_result(self):
        return DistinctLabelsResult(self._field_name, [])

    def _get_output_field(self, view):
        return "%s-distinct-labels" % self._field_name_path

    def _get_result(self, d):
        return DistinctLabelsResult(self._field_name, sorted(d["labels"]))

    def _to_mongo(self, dataset, schema, frame_schema):
        field, path, pipeline = self._get_field_path_pipeline(
            schema, frame_schema, dataset
        )
        if not isinstance(field, fof.EmbeddedDocumentField) or not issubclass(
            field.document_type, fol.Label
        ):
            raise AggregationError("field '%s' is not a Label")

        if field.document_type in _LABELS:
            path = "%s.%s" % (path, field.document_type.__name__.lower())
            pipeline.append(
                {"$unwind": {"path": path, "preserveNullAndEmptyArrays": True}}
            )

        path = "%s.label" % path
        pipeline.append(
            {"$group": {"_id": None, "labels": {"$addToSet": path}}}
        )

        return pipeline


class DistinctLabelsResult(AggregationResult):
    """The result of the execution of a :class:`DistinctLabels` instance by a
    dataset or view.

    Attributes:
        name: the name of the field
        labels: a sorted list of distinct labels
    """

    def __init__(self, name, labels):
        self.name = name
        self.labels = labels
