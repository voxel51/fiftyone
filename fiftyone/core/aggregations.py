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
        return self._field_name

    def _get_default_result(self):
        raise NotImplementedError(
            "Subclass must implement _get_default_result()"
        )

    def _get_result(self, d):
        raise NotImplementedError("Subclass must implement _get_result()")

    def _to_mongo(self, dataset, schema, frame_schema):
        raise NotImplementedError("Subclass must implement _to_mongo()")


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
    """Computes the bounds of a numeric field of a collection.

    This aggregation is typically applied to *numeric* field types (or lists of
    such types):

    -   :class:`fiftyone.core.fields.IntField`
    -   :class:`fiftyone.core.fields.FloatField`

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    numeric_field=1.0,
                    numeric_list_field=[1, 2, 3],
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    numeric_field=4.0,
                    numeric_list_field=[1, 2],
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    numeric_field=None,
                    numeric_list_field=None,
                ),
            ]
        )

        #
        # Compute the bounds of a numeric field
        #

        bounds = fo.Bounds("numeric_field")
        r = dataset.aggregate(bounds)
        r.bounds  # (min, max)

        #
        # Compute the a bounds of a numeric list field
        #

        list_bounds = fo.Bounds("numeric_list_field")
        r = dataset.aggregate(list_bounds)
        r.bounds  # (min, max)

    Args:
        field_name: the name of the field to compute bounds for
    """

    def _get_default_result(self):
        return BoundsResult(self._field_name, (None, None))

    def _get_result(self, d):
        mn = d["min"]
        mx = d["max"]
        return BoundsResult(self._field_name, (mn, mx))

    def _to_mongo(self, dataset, schema, frame_schema):
        path, pipeline, list_fields = _parse_field_name(
            self._field_name, dataset, schema=schema, frame_schema=frame_schema
        )

        for list_field in list_fields:
            pipeline.append({"$unwind": "$" + list_field})

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
        name: the name of the field whose bounds were computed
        bounds: the ``(min, max)`` bounds
    """

    def __init__(self, name, bounds):
        self.name = name
        self.bounds = bounds


class Count(Aggregation):
    """Counts the number of non-``None`` field values in a collection.

    If no field is provided, the samples themselves are counted.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(label="cat"),
                            fo.Detection(label="dog"),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(label="cat"),
                            fo.Detection(label="rabbit"),
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
        # Count the number of samples in the dataset
        #

        count_samples = fo.Count()
        r = dataset.aggregate(count_samples)
        r.count  # count

        #
        # Count the number of samples with `predictions`
        #

        count_predictions = fo.Count("predictions")
        r = dataset.aggregate(count_predictions)
        r.count  # count

        #
        # Count the number of objects in the `predictions` field
        #

        count_objects = fo.Count("predictions.detections")
        r = dataset.aggregate(count_objects)
        r.count  # count

    Args:
        field_name (None): the name of the field whose values to count. If none
            is provided, the samples themselves are counted
    """

    def __init__(self, field_name=None):
        super().__init__(field_name)

    def _get_default_result(self):
        return CountResult(self._field_name, 0)

    def _get_result(self, d):
        return CountResult(self._field_name, d["count"])

    def _to_mongo(self, dataset, schema, frame_schema):
        if self._field_name is None:
            return [{"$count": "count"}]

        path, pipeline, list_fields = _parse_field_name(
            self._field_name, dataset, schema=schema, frame_schema=frame_schema
        )

        for list_field in list_fields:
            pipeline.append({"$unwind": "$" + list_field})

        if dataset.media_type != fom.VIDEO or path != "frames":
            pipeline.append({"$match": {"$expr": {"$gt": ["$" + path, None]}}})

        return pipeline + [{"$count": "count"}]


class CountResult(AggregationResult):
    """The result of the execution of a :class:`Count` instance.

    Attributes:
        name: the name of the field, or ``None`` if the samples themselves were
            counted
        count: the count
    """

    def __init__(self, name, count):
        self.name = name
        self.count = count


class CountValues(Aggregation):
    """Counts the occurrences of field values in a collection.

    This aggregation is typically applied to *countable* field types (or lists
    of such types):

    -   :class:`fiftyone.core.fields.BooleanField`
    -   :class:`fiftyone.core.fields.IntField`
    -   :class:`fiftyone.core.fields.StringField`

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    tags=["sunny"],
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(label="cat"),
                            fo.Detection(label="dog"),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    tags=["cloudy"],
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(label="cat"),
                            fo.Detection(label="rabbit"),
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
        # Compute the tag counts in the dataset
        #

        count_values = fo.CountValues("tags")
        r = dataset.aggregate(count_values)
        r.values  # dict mapping tags to counts

        #
        # Compute the predicted label counts in the dataset
        #

        count_values = fo.CountValues("predictions.detections.label")
        r = dataset.aggregate(count_values)
        r.values  # dict mapping tags to counts

    Args:
        field_name: the name of the field to count
    """

    def _get_default_result(self):
        return CountValuesResult(self._field_name, {})

    def _get_result(self, d):
        d = {i["k"]: i["count"] for i in d["result"] if i["k"] is not None}
        return CountValuesResult(self._field_name, d)

    def _to_mongo(self, dataset, schema, frame_schema):
        path, pipeline, list_fields = _parse_field_name(
            self._field_name, dataset, schema=schema, frame_schema=frame_schema
        )

        for list_field in list_fields:
            pipeline.append({"$unwind": "$" + list_field})

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
    """Computes the distinct values of a field in a collection.

    This aggregation is typically applied to *countable* field types (or lists
    of such types):

    -   :class:`fiftyone.core.fields.BooleanField`
    -   :class:`fiftyone.core.fields.IntField`
    -   :class:`fiftyone.core.fields.StringField`

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    tags=["sunny"],
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(label="cat"),
                            fo.Detection(label="dog"),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    tags=["sunny", "cloudy"],
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(label="cat"),
                            fo.Detection(label="rabbit"),
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
        # Get the distinct tags in a dataset
        #

        distinct_tags = fo.Distinct("tags")
        r = dataset.aggregate(distinct_tags)
        r.values  # list of distinct values

        #
        # Get the distint predicted labels in a dataset
        #

        distinct_labels = fo.Distinct("predictions.detections.label")
        r = dataset.aggregate(distinct_labels)
        r.values  # list of distinct values

    Args:
        field_name: the name of the field to compute distinct values for
    """

    def _get_default_result(self):
        return DistinctResult(self._field_name, [])

    def _get_result(self, d):
        return DistinctResult(self._field_name, sorted(d["values"]))

    def _to_mongo(self, dataset, schema, frame_schema):
        path, pipeline, list_fields = _parse_field_name(
            self._field_name, dataset, schema=schema, frame_schema=frame_schema
        )

        for list_field in list_fields:
            pipeline.append({"$unwind": "$" + list_field})

        pipeline.append(
            {"$group": {"_id": None, "values": {"$addToSet": "$" + path},}}
        )

        return pipeline


class DistinctResult(AggregationResult):
    """The result of the execution of a :class:`Distinct` instance.

    Attributes:
        name: the name of the field that was computed on
        values: a sorted list of distinct values
    """

    def __init__(self, name, values):
        self.name = name
        self.values = values


class HistogramValues(Aggregation):
    """Computes a histogram of the field values in a collection.

    This aggregation is typically applied to *numeric* field types (or
    lists of such types):

    -   :class:`fiftyone.core.fields.IntField`
    -   :class:`fiftyone.core.fields.FloatField`

    Examples::

        import numpy as np
        import matplotlib.pyplot as plt

        import fiftyone as fo

        samples = []
        for idx in range(100):
            samples.append(
                fo.Sample(
                    filepath="/path/to/image%d.png" % idx,
                    numeric_field=np.random.randn(),
                    numeric_list_field=list(np.random.randn(10)),
                )
            )

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        def plot_hist(counts, edges):
            counts = np.asarray(counts)
            edges = np.asarray(edges)
            left_edges = edges[:-1]
            widths = edges[1:] - edges[:-1]
            plt.bar(left_edges, counts, width=widths, align="edge")

        #
        # Compute a histogram of a numeric field
        #

        histogram_values = fo.HistogramValues(
            "numeric_field", bins=50, range=(-4, 4)
        )
        r = dataset.aggregate(histogram_values)

        plot_hist(r.counts, r.edges)
        plt.show(block=False)

        #
        # Compute the histogram of a numeric list field
        #

        # Compute bounds automatically
        bounds = fo.Bounds("numeric_list_field")
        r = dataset.aggregate(bounds)
        limits = (r.bounds[0], r.bounds[1] + 1e-6)  # right interval is open

        histogram_values = fo.HistogramValues(
            "numeric_list_field", bins=50, range=limits
        )
        r = dataset.aggregate(histogram_values)

        plot_hist(r.counts, r.edges)
        plt.show(block=False)

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
        path, pipeline, list_fields = _parse_field_name(
            self._field_name, dataset, schema=schema, frame_schema=frame_schema
        )

        for list_field in list_fields:
            pipeline.append({"$unwind": "$" + list_field})

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


class Sum(Aggregation):
    """Computes the sum of the (non-``None``) field values of a collection.

    This aggregation is typically applied to *numeric* field types (or lists of
    such types):

    -   :class:`fiftyone.core.fields.IntField`
    -   :class:`fiftyone.core.fields.FloatField`

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    numeric_field=1.0,
                    numeric_list_field=[1, 2, 3],
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    numeric_field=4.0,
                    numeric_list_field=[1, 2],
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    numeric_field=None,
                    numeric_list_field=None,
                ),
            ]
        )

        #
        # Compute the sum of a numeric field
        #

        sum = fo.Sum("numeric_field")
        r = dataset.aggregate(sum)
        r.sum  # the sum

        #
        # Compute the sum of a numeric list field
        #

        sum = fo.Sum("numeric_list_field")
        r = dataset.aggregate(sum)
        r.sum  # the sum

    Args:
        field_name: the name of the field to sum
    """

    def __init__(self, field_name):
        super().__init__(field_name)

    def _get_default_result(self):
        return SumResult(self._field_name, 0)

    def _get_result(self, d):
        return SumResult(self._field_name, d["sum"])

    def _to_mongo(self, dataset, schema, frame_schema):
        path, pipeline, list_fields = _parse_field_name(
            self._field_name, dataset, schema=schema, frame_schema=frame_schema
        )

        for list_field in list_fields:
            pipeline.append({"$unwind": "$" + list_field})

        pipeline.append({"$group": {"_id": None, "sum": {"$sum": "$" + path}}})

        return pipeline


class SumResult(AggregationResult):
    """The result of the execution of a :class:`Sum` instance.

    Attributes:
        name: the name of the field that was summed
        sum: the sum
    """

    def __init__(self, name, sum):
        self.name = name
        self.sum = sum


def _unwind_frames():
    return [{"$unwind": "$frames"}, {"$replaceRoot": {"newRoot": "$frames"}}]


def _parse_field_name(
    field_name, sample_collection, schema=None, frame_schema=None
):
    pipeline = []
    list_fields = set()

    # Handle video fields
    is_frames_query = (
        field_name.startswith(_FRAMES_PREFIX) or field_name == "frames"
    )
    if is_frames_query and (sample_collection.media_type == fom.VIDEO):
        if field_name == "frames":
            return field_name, _unwind_frames(), []

        if frame_schema is not None:
            schema = frame_schema
        else:
            schema = sample_collection.get_frame_field_schema()

        field_name = field_name[len(_FRAMES_PREFIX) :]
        pipeline = _unwind_frames()

    # Parse explicit array references
    chunks = field_name.split("[]")
    for idx in range(len(chunks) - 1):
        list_fields.add("".join(chunks[: (idx + 1)]))

    field_name = "".join(chunks)

    # Ensure root field exists
    root_field_name = field_name.split(".", 1)[0]

    if schema is None:
        schema = sample_collection.get_field_schema()

    try:
        root_field = schema[root_field_name]
    except KeyError:
        raise AggregationError(
            "Field '%s' does not exist on collection '%s'"
            % (root_field_name, sample_collection.name)
        )

    # Detect certain list fields automatically

    if isinstance(root_field, fof.ListField):
        list_fields.add(root_field_name)

    if isinstance(root_field, fof.EmbeddedDocumentField):
        if root_field.document_type in fol._LABEL_LIST_FIELDS:
            prefix = (
                root_field_name
                + "."
                + root_field.document_type._LABEL_LIST_FIELD
            )
            if field_name.startswith(prefix):
                list_fields.add(prefix)

    # sorting is important here because one must unwind field `x` before
    # embedded field `x.y`
    list_fields = sorted(list_fields)

    return field_name, pipeline, list_fields
