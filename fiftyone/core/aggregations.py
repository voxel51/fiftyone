"""
Aggregations.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import ObjectId

import numpy as np

import eta.core.serial as etas
import eta.core.utils as etau

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
        if dataset.media_type == fom.VIDEO:
            if self._field_name == "frames":
                return "frames", "frames", _unwind_frames(), None, None

            schema = frame_schema
            field_name = self._field_name[len("frames.") :]
            pipeline = _unwind_frames()
        else:
            field_name = self._field_name
            pipeline = []

        root_field_name = field_name.split(".", 1)[0]

        try:
            root_field = schema[root_field_name]
        except KeyError:
            raise AggregationError(
                "Field '%s' does not exist on dataset '%s'"
                % (self._field_name, dataset.name)
            )

        list_field = None
        if isinstance(root_field, fof.ListField):
            list_field = root_field_name

        labels_list_field = None
        if isinstance(root_field, fof.EmbeddedDocumentField):
            if root_field.document_type in _LABEL_LIST_FIELDS:
                prefix = (
                    root_field_name
                    + "."
                    + root_field.document_type.__name__.lower()
                )
                if field_name.startswith(prefix):
                    labels_list_field = prefix

        return root_field, field_name, pipeline, list_field, labels_list_field


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
        (
            _,
            path,
            pipeline,
            list_field,
            labels_list_field,
        ) = self._get_field_path_pipeline(schema, frame_schema, dataset)

        if list_field:
            pipeline.append({"$unwind": "$" + list_field})

        if labels_list_field:
            pipeline.append({"$unwind": "$" + labels_list_field})

        pipeline.append(
            {
                "$group": {
                    "_id": None,
                    "min": {"$min": "$" + path},
                    "max": {"$max": "$" + path},
                }
            }
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

        (
            _,
            _,
            pipeline,
            list_field,
            labels_list_field,
        ) = self._get_field_path_pipeline(schema, frame_schema, dataset)

        if list_field:
            pipeline.append({"$unwind": "$" + list_field})

        if labels_list_field:
            pipeline.append({"$unwind": "$" + labels_list_field})

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
        (
            _,
            path,
            pipeline,
            list_field,
            labels_list_field,
        ) = self._get_field_path_pipeline(schema, frame_schema, dataset)

        if list_field:
            pipeline.append({"$unwind": "$" + list_field})

        if labels_list_field:
            pipeline.append({"$unwind": "$" + labels_list_field})

        pipeline += [
            {"$group": {"_id": "$" + path, "count": {"$sum": 1}}},
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
        (
            _,
            path,
            pipeline,
            list_field,
            labels_list_field,
        ) = self._get_field_path_pipeline(schema, frame_schema, dataset)

        if list_field:
            pipeline.append({"$unwind": "$" + list_field})

        if labels_list_field:
            pipeline.append({"$unwind": "$" + labels_list_field})

        pipeline.append(
            {
                "$group": {
                    "_id": None,
                    self._field_name_path: {"$addToSet": "$" + path},
                }
            }
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


class HistogramValues(Aggregation):
    """Computes a histogram of the numeric values in a field or list field of a
    collection.

    Examples::

        import fiftyone as fo

        dataset = fo.load_dataset(...)

        #
        # Compute a histogram of values in the float field "uniqueness"
        #

        histogram_values = fo.HistogramValues(
            "uniqueness", bins=50, range=(0, 1)
        )
        r = dataset.aggregate(histogram_values)
        r.counts  # list of counts
        r.edges  # list of bin edges

    Args:
        field_name: the name of the field to histogram
        bins (None): can be either an integer number of bins to generate or a
            monotonically increasing sequence specifying the bin edges to use.
            By default, 10 bins are created. If ``bins`` is an integer and no
            ``range`` is specified, bin edges are automatically distributed in
            an attempt to evenly distribute the counts in each bin
        range (None): a ``(lower, upper)`` tuple specifying a range in which to
            generate equal-width bins. Only applicable when ``bins`` is an
            integer
    """

    def __init__(self, field_name, bins=None, range=None):
        super().__init__(field_name)
        self.bins = bins
        self.range = range

        self._bins = None
        self._edges = None
        self._parse_args()

    def _parse_args(self):
        if self.bins is None:
            bins = 10
        else:
            bins = self.bins

        if etau.is_numeric(bins):
            if self.range is None:
                # Automatic bins
                self._bins = bins
                return

            # Linearly-spaced bins within `range`
            self._edges = list(
                np.linspace(self.range[0], self.range[1], bins + 1)
            )
            return

        # User-provided bin edges
        self._edges = list(bins)

    def _get_default_result(self):
        return HistogramValuesResult(self._field_name, [], [], 0)

    def _get_output_field(self, *args):
        return "%s-histogram-values" % self._field_name_path

    def _get_result(self, d):
        if self._edges is not None:
            return self._get_result_edges(d)

        return self._get_result_auto(d)

    def _get_result_edges(self, d):
        _edges_array = np.array(self._edges)
        edges = list(_edges_array)
        counts = [0] * (len(edges) - 1)
        other = 0
        for di in d["bins"]:
            left = di["_id"]
            if left == "other":
                other = di["count"]
            else:
                idx = np.abs(_edges_array - left).argmin()
                counts[idx] = di["count"]

        return HistogramValuesResult(self._field_name, counts, edges, other)

    def _get_result_auto(self, d):
        counts = []
        edges = []
        for di in d["bins"]:
            counts.append(di["count"])
            edges.append(di["_id"]["min"])

        edges.append(di["_id"]["max"])

        return HistogramValuesResult(self._field_name, counts, edges, 0)

    def _to_mongo(self, dataset, schema, frame_schema):
        (
            _,
            path,
            pipeline,
            list_field,
            labels_list_field,
        ) = self._get_field_path_pipeline(schema, frame_schema, dataset)

        if list_field:
            pipeline.append({"$unwind": "$" + list_field})

        if labels_list_field:
            pipeline.append({"$unwind": "$" + labels_list_field})

        if self._edges is not None:
            pipeline.append(
                {
                    "$bucket": {
                        "groupBy": "$" + path,
                        "boundaries": self._edges,
                        "default": "other",  # counts documents outside of bins
                        "output": {"count": {"$sum": 1}},
                    }
                }
            )
        else:
            pipeline.append(
                {
                    "$bucketAuto": {
                        "groupBy": "$" + path,
                        "buckets": self._bins,
                        "output": {"count": {"$sum": 1}},
                    }
                }
            )

        pipeline.append({"$group": {"_id": None, "bins": {"$push": "$$ROOT"}}})

        return pipeline


class HistogramValuesResult(AggregationResult):
    """The result of the execution of a :class:`HistogramValues` instance.

    Attributes:
        name: the name of the field that was histogramed
        counts: a list of counts in each bin
        edges: an increasing list of bin edges of length ``len(counts) + 1``.
            Note that each bin is treated as having an inclusive lower boundary
            and exclusive upper boundary, ``[lower, upper)``, including the
            rightmost bin
        other: the number of items outside the bins
    """

    def __init__(self, name, counts, edges, other):
        self.name = name
        self.counts = counts
        self.edges = edges
        self.other = other


def _unwind_frames():
    return [{"$unwind": "$frames"}, {"$replaceRoot": {"newRoot": "$frames"}}]
