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


_LABEL_LIST_FIELDS = (
    fol.Classifications,
    fol.Detections,
    fol.Keypoints,
    fol.Polylines,
)
_NUMERIC_FIELDS = (fof.IntField, fof.FloatField)
_COUNTABLE_FIELDS = (fof.BooleanField, fof.IntField, fof.StringField)
_FRAMES_PREFIX = "frames."


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
            pipeline = _unwind_frames()
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
                return "frames", "$frames", _unwind_frames()

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
        return "<%s: %s>" % (class_name, fou.pformat(d))


class AggregationError(RuntimeError):
    """An error raised during the execution of an :class:`Aggregation`."""

    pass


class Bounds(Aggregation):
    """Computes the bounds of a numeric field or numeric list field of a
    collection.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    numeric_field=1.0,
                    numeric_list_field=[1.0, 2.0, 3.0],
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    numeric_field=4.0,
                    numeric_list_field=[1.5, 2.5],
                ),
            ]
        )

        # Add a generic list field
        dataset.add_sample_field("list_field", fo.ListField)

        #
        # Compute the bounds of a numeric field
        #

        bounds = fo.Bounds("numeric_field")
        r = dataset.aggregate(bounds)
        r.bounds  # (min, max)

        #
        # Compute the a bounds of a numeric list field
        #

        bounds = fo.Bounds("numeric_list_field")
        r = dataset.aggregate(bounds)
        r.bounds  # (min, max)

        #
        # Cannot compute bounds of a generic list field
        #

        bounds = fo.Bounds("list_field")
        dataset.aggregate(bounds)  # error

    Args:
        field_name: the name of the field to compute bounds for
    """

    def _get_default_result(self):
        return BoundsResult(self._field_name, (None, None))

    def _get_output_field(self, _):
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
            field.field, _NUMERIC_FIELDS
        ):
            unwind = True
        elif isinstance(field, _NUMERIC_FIELDS):
            unwind = False
        elif isinstance(field, fof.ListField):
            raise AggregationError(
                "Unsupported field '%s' (%s). You can only compute bounds of "
                "a ListField whose `field` type is explicitly declared as "
                "numeric" % (self._field_name, field)
            )
        else:
            raise AggregationError(
                "Unsupported field '%s' of type %s" % (self._field_name, field)
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
    """The result of the execution of a :class:`Bounds` instance.

    Attributes:
        name: the name of the field
        bounds: the ``(min, max)`` bounds
    """

    def __init__(self, name, bounds):
        self.name = name
        self.bounds = bounds


class ConfidenceBounds(Aggregation):
    """Computes the bounds of the ``confidence`` of a
    :class:`fiftyone.core.labels.Label` field of a collection.

    Examples::

        import fiftyone as fo

        dataset = fo.load_dataset(...)

        #
        # Compute the confidence bounds of a `Classification` field
        #

        bounds = fo.ConfidenceBounds("predictions")
        r = dataset.aggregate(bounds)
        r.bounds  # (min, max)

        #
        # Compute the confidence bounds of a `Detections` field
        #

        bounds = fo.ConfidenceBounds("detections")
        r = dataset.aggregate(bounds)
        r.bounds  # (min, max)

    Args:
        field_name: the name of the label field to compute confidence bounds
            for
    """

    def _get_default_result(self):
        return ConfidenceBoundsResult(self._field_name, (None, None))

    def _get_output_field(self, *args):
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

        if field.document_type in _LABEL_LIST_FIELDS:
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
    """The result of the execution of a :class:`ConfidenceBounds` instance.

    Attributes:
        name: the name of the field
        bounds: the ``(min, max)`` bounds
    """

    def __init__(self, name, bounds):
        self.name = name
        self.bounds = bounds


class Count(Aggregation):
    """Counts the number of samples or number of items with respect to a field
    of a collection.

    If a ``field`` is provided, it can be a
    :class:`fiftyone.core.fields.ListField` or a
    :class:`fiftyone.core.labels.Label` list field.

    Examples::

        import fiftyone as fo

        dataset = fo.load_dataset(...)

        #
        # Compute the number of samples in a dataset
        #

        count = fo.Count()
        r = dataset.aggregate(count)
        r.count

        #
        # Compute the number of objects in a `Detections` field
        #

        detections = fo.Count("detections")
        r = dataset.aggregate(detections)
        r.count

    Args:
        field_name (None): the field whose items to count. If no field name is
            provided, the samples themselves are counted
    """

    def __init__(self, field_name=None):
        super().__init__(field_name)

    def _get_default_result(self):
        return CountResult(self._field_name, 0)

    def _get_output_field(self, *args):
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
            and field.document_type in _LABEL_LIST_FIELDS
        ):
            # @todo this assumes that `Detections` -> `detections`
            path = "%s.%s" % (path, field.document_type.__name__.lower())
            pipeline.append({"$unwind": path})
        elif isinstance(field, fof.ListField):
            pipeline.append({"$unwind": path})

        return pipeline + [{"$count": "count"}]


class CountResult(AggregationResult):
    """The result of the execution of a :class:`Count` instance.

    Attributes:
        name: the name of the field, or ``None`` if the samples were counted
        count: the count
    """

    def __init__(self, name, count):
        self.name = name
        self.count = count


class CountLabels(Aggregation):
    """Counts the ``label`` values in a :class:`fiftyone.core.labels.Label`
    field of a collection.

    Examples::

        import fiftyone as fo

        dataset = fo.load_dataset(...)

        #
        # Compute label counts for a `Classification` field called "class"
        #

        count_labels = fo.CountLabels("class")
        r = dataset.aggregate(count_labels)
        r.labels  # dict mapping labels to counts

        #
        # Compute label counts for a `Detections` field called "objects"
        #

        count_labels = fo.CountLabels("objects")
        r = dataset.aggregate(count_labels)
        r.labels  # dict mapping labels to counts

    Args:
        field_name: the name of the label field
    """

    def _get_default_result(self):
        return CountLabelsResult(self._field_name, {})

    def _get_output_field(self, *args):
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

        if field.document_type in _LABEL_LIST_FIELDS:
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
    """The result of the execution of a :class:`CountLabels` instance.

    Attributes:
        name: the name of the field whose values were counted
        labels: a dict mapping labels to counts
    """

    def __init__(self, name, labels):
        self.name = name
        self.labels = labels


class CountValues(Aggregation):
    """Counts the occurrences of values in a countable field or list of
    countable fields of a collection.

    Countable fields are:

    -   :class:`fiftyone.core.fields.BooleanField`
    -   :class:`fiftyone.core.fields.IntField`
    -   :class:`fiftyone.core.fields.StringField`

    Examples::

        import fiftyone as fo

        dataset = fo.load_dataset(...)

        #
        # Compute the tag counts in the dataset
        #

        count_values = fo.CountValues("tags")
        r = dataset.aggregate(count_values)
        r.values  # dict mapping tags to counts

    Args:
        field_name: the name of the countable field
    """

    def _get_default_result(self):
        return CountValuesResult(self._field_name, {})

    def _get_output_field(self, *args):
        return "%s-count-values" % self._field_name_path

    def _get_result(self, d):
        d = {i["k"]: i["count"] for i in d["result"] if i["k"] is not None}
        return CountValuesResult(self._field_name, d)

    def _to_mongo(self, dataset, schema, frame_schema):
        field, path, pipeline = self._get_field_path_pipeline(
            schema, frame_schema, dataset
        )
        if isinstance(field, _COUNTABLE_FIELDS):
            pass
        elif isinstance(field, fof.ListField) and isinstance(
            field.field, _COUNTABLE_FIELDS
        ):
            pipeline.append({"$unwind": path})
        elif isinstance(field, fof.ListField):
            raise AggregationError(
                "Unsupported field '%s' (%s). You can only count values of "
                "a ListField whose `field` type is explicitly declared as a "
                "countable type (%s)"
                % (self._field_name, field, _COUNTABLE_FIELDS)
            )
        else:
            raise AggregationError(
                "Unsupported field '%s' of type %s" % (self._field_name, field)
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
    """The result of the execution of a :class:`CountValues` instance.

    Attributes:
        name: the name of the field whose values were counted
        values: a dict mapping values to counts
    """

    def __init__(self, name, values):
        self.name = name
        self.values = values


class Distinct(Aggregation):
    """Computes the distinct values of a countable field or a list of countable
    fields of a collection.

    Countable fields are:

    -   :class:`fiftyone.core.fields.BooleanField`
    -   :class:`fiftyone.core.fields.IntField`
    -   :class:`fiftyone.core.fields.StringField`

    Examples::

        import fiftyone as fo

        dataset = fo.load_dataset(...)

        #
        # Compute the distinct values of a StringField named `kind`
        #

        distinct = fo.Distinct("kind")
        r = dataset.aggregate(distinct)
        r.values  # list of distinct values

        #
        # Compute the a bounds of the `tags field
        #

        tags = fo.Distinct("tags")
        r = dataset.aggregate(tags)
        r.values  # list of distinct values

    Args:
        field_name: the name of the field to compute distinct values for
    """

    def _get_default_result(self):
        return DistinctResult(self._field_name, [])

    def _get_output_field(self, *args):
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
            field.field, _COUNTABLE_FIELDS
        ):
            unwind = True
        elif isinstance(field, _COUNTABLE_FIELDS):
            unwind = False
        elif isinstance(field, fof.ListField):
            raise AggregationError(
                "Unsupported field '%s' (%s). You can only compute distinct "
                "values of a ListField whose `field` type is explicitly "
                "declared as a countable type (%s)"
                % (self._field_name, field, _COUNTABLE_FIELDS)
            )
        else:
            raise AggregationError(
                "Unsupported field '%s' of type %s" % (self._field_name, field)
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
    """The result of the execution of a :class:`Distinct` instance.

    Attributes:
        name: the name of the field
        values: a sorted list of distinct values
    """

    def __init__(self, name, values):
        self.name = name
        self.values = values


class DistinctLabels(Aggregation):
    """Computes the distinct label values of a
    :class:`fiftyone.core.labels.Label` field of a collection.

    Examples::

        import fiftyone as fo

        dataset = fo.load_dataset(...)

        #
        # Compute the distinct labels of a `Classification` field
        #

        distinct_labels = fo.DistinctLabels("predictions")
        r = dataset.aggregate(distinct_labels)
        r.labels  # list of distinct labels

        #
        # Compute the distinct labels of a `Detections` field
        #

        detections_labels = fo.DistinctLabels("detections")
        r = dataset.aggregate(detections_labels)
        r.labels  # list of distinct labels

    Args:
        field_name: the name of the label field
    """

    def __init__(self, field_name):
        super().__init__(field_name)

    def _get_default_result(self):
        return DistinctLabelsResult(self._field_name, [])

    def _get_output_field(self, *args):
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

        if field.document_type in _LABEL_LIST_FIELDS:
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
    """The result of the execution of a :class:`DistinctLabels` instance.

    Attributes:
        name: the name of the field
        labels: a sorted list of distinct labels
    """

    def __init__(self, name, labels):
        self.name = name
        self.labels = labels


def _unwind_frames():
    return [{"$unwind": "$frames"}, {"$replaceRoot": {"newRoot": "$frames"}}]
