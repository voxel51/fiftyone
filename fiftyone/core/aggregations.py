"""
Aggregations.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import OrderedDict
from copy import deepcopy
from datetime import date, datetime, timedelta

import numpy as np

import eta.core.utils as etau

import fiftyone.core.expressions as foe
from fiftyone.core.expressions import VALUE
from fiftyone.core.expressions import ViewField as F
import fiftyone.core.fields as fof
import fiftyone.core.media as fom
import fiftyone.core.utils as fou


class Aggregation(object):
    """Abstract base class for all aggregations.

    :class:`Aggregation` instances represent an aggregation or reduction
    of a :class:`fiftyone.core.collections.SampleCollection` instance.

    Args:
        field_or_expr: a field name, ``embedded.field.name``,
            :class:`fiftyone.core.expressions.ViewExpression`, or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            defining the field or expression to aggregate
        expr (None): a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            to apply to ``field_or_expr`` (which must be a field) before
            aggregating
    """

    def __init__(self, field_or_expr, expr=None):
        if field_or_expr is not None and not etau.is_str(field_or_expr):
            if expr is not None:
                raise ValueError(
                    "`field_or_expr` must be a field name when the `expr` "
                    "argument is provided"
                )

            field_name = None
            expr = field_or_expr
        else:
            field_name = field_or_expr

        self._field_name = field_name
        self._expr = expr

    @property
    def field_name(self):
        """The name of the field being computed on, if any."""
        return self._field_name

    @property
    def expr(self):
        """The expression being computed, if any."""
        return self._expr

    @property
    def _has_big_result(self):
        """Whether the aggregation's result is returned across multiple
        documents.

        This property affects the data passed to :meth:`to_mongo` at runtime.
        """
        return False

    @property
    def _is_big_batchable(self):
        """Whether the aggregation has big results and its pipeline is defined
        by a single ``$project`` stage and thus can be combined with other such
        aggregations.

        :class:`Aggregation` classes for which :meth:`_is_big_batchable` may be
        ``True`` must accept an optional ``big_field`` parameter in their
        :meth:`to_mongo` method that specifies the field name to use in its
        ``$project`` stage.
        """
        return False

    def to_mongo(self, sample_collection):
        """Returns the MongoDB aggregation pipeline for this aggregation.

        Args:
            sample_collection: the
                :class:`fiftyone.core.collections.SampleCollection` to which
                the aggregation is being applied

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        raise NotImplementedError("subclasses must implement to_mongo()")

    def parse_result(self, d):
        """Parses the output of :meth:`to_mongo`.

        Args:
            d: the result dict, or, when :meth:`_is_big_batchable` is True, the
                iterable of result dicts

        Returns:
            the aggregation result
        """
        raise NotImplementedError("subclasses must implement parse_result()")

    def default_result(self):
        """Returns the default result for this aggregation.

        Default results are used when aggregations are applied to empty
        collections.

        Returns:
            the aggregation result
        """
        raise NotImplementedError("subclasses must implement default_result()")

    def _needs_frames(self, sample_collection):
        """Whether the aggregation requires frame labels of video samples to be
        attached.

        Args:
            sample_collection: the
                :class:`fiftyone.core.collections.SampleCollection` to which
                the aggregation is being applied

        Returns:
            True/False
        """
        if self._field_name is not None:
            return _is_frame_path(sample_collection, self._field_name)

        if self._expr is not None:
            field_name, _ = _extract_prefix_from_expr(self._expr)
            return _is_frame_path(sample_collection, field_name)

        return False


class AggregationError(Exception):
    """An error raised during the execution of an :class:`Aggregation`."""

    pass


class Bounds(Aggregation):
    """Computes the bounds of a numeric field of a collection.

    ``None``-valued fields are ignored.

    This aggregation is typically applied to *numeric* or *date* field types
    (or lists of such types):

    -   :class:`fiftyone.core.fields.IntField`
    -   :class:`fiftyone.core.fields.FloatField`
    -   :class:`fiftyone.core.fields.DateField`
    -   :class:`fiftyone.core.fields.DateTimeField`

    Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F

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

        aggregation = fo.Bounds("numeric_field")
        bounds = dataset.aggregate(aggregation)
        print(bounds)  # (min, max)

        #
        # Compute the a bounds of a numeric list field
        #

        aggregation = fo.Bounds("numeric_list_field")
        bounds = dataset.aggregate(aggregation)
        print(bounds)  # (min, max)

        #
        # Compute the bounds of a transformation of a numeric field
        #

        aggregation = fo.Bounds(2 * (F("numeric_field") + 1))
        bounds = dataset.aggregate(aggregation)
        print(bounds)  # (min, max)

    Args:
        field_or_expr: a field name, ``embedded.field.name``,
            :class:`fiftyone.core.expressions.ViewExpression`, or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            defining the field or expression to aggregate
        expr (None): a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            to apply to ``field_or_expr`` (which must be a field) before
            aggregating
    """

    def __init__(self, field_or_expr, expr=None):
        super().__init__(field_or_expr, expr=expr)
        self._field_type = None

    def default_result(self):
        """Returns the default result for this aggregation.

        Returns:
            ``(None, None)``
        """
        return None, None

    def parse_result(self, d):
        """Parses the output of :meth:`to_mongo`.

        Args:
            d: the result dict

        Returns:
            the ``(min, max)`` bounds
        """
        bounds = d["min"], d["max"]

        if self._field_type is not None:
            p = self._field_type.to_python
            return p(bounds[0]), p(bounds[1])

        return bounds

    def to_mongo(self, sample_collection):
        path, pipeline, _, id_to_str, field_type = _parse_field_and_expr(
            sample_collection, self._field_name, expr=self._expr
        )

        self._field_type = field_type

        if id_to_str:
            value = {"$toString": "$" + path}
        else:
            value = "$" + path

        pipeline.append(
            {
                "$group": {
                    "_id": None,
                    "min": {"$min": value},
                    "max": {"$max": value},
                }
            }
        )

        return pipeline


class Count(Aggregation):
    """Counts the number of field values in a collection.

    ``None``-valued fields are ignored.

    If no field or expression is provided, the samples themselves are counted.

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
                            fo.Detection(label="squirrel"),
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

        aggregation = fo.Count()
        count = dataset.aggregate(aggregation)
        print(count)  # the count

        #
        # Count the number of samples with `predictions`
        #

        aggregation = fo.Count("predictions")
        count = dataset.aggregate(aggregation)
        print(count)  # the count

        #
        # Count the number of objects in the `predictions` field
        #

        aggregation = fo.Count("predictions.detections")
        count = dataset.aggregate(aggregation)
        print(count)  # the count

        #
        # Count the number of objects in samples with > 2 predictions
        #

        aggregation = fo.Count(
            (F("predictions.detections").length() > 2).if_else(
                F("predictions.detections"), None
            )
        )
        count = dataset.aggregate(aggregation)
        print(count)  # the count

    Args:
        field_or_expr (None): a field name, ``embedded.field.name``,
            :class:`fiftyone.core.expressions.ViewExpression`, or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            defining the field or expression to aggregate. If neither
            ``field_or_expr`` or ``expr`` is provided, the samples themselves
            are counted
        expr (None): a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            to apply to ``field_or_expr`` (which must be a field) before
            aggregating
    """

    def __init__(self, field_or_expr=None, expr=None):
        super().__init__(field_or_expr, expr=expr)

    def default_result(self):
        """Returns the default result for this aggregation.

        Returns:
            ``0``
        """
        return 0

    def parse_result(self, d):
        """Parses the output of :meth:`to_mongo`.

        Args:
            d: the result dict

        Returns:
            the count
        """
        return d["count"]

    def to_mongo(self, sample_collection):
        if self._field_name is None and self._expr is None:
            return [{"$count": "count"}]

        path, pipeline, _, _, _ = _parse_field_and_expr(
            sample_collection, self._field_name, expr=self._expr
        )

        if sample_collection.media_type != fom.VIDEO or path != "frames":
            pipeline.append({"$match": {"$expr": {"$gt": ["$" + path, None]}}})

        pipeline.append({"$count": "count"})

        return pipeline


class CountValues(Aggregation):
    """Counts the occurrences of field values in a collection.

    This aggregation is typically applied to *countable* field types (or lists
    of such types):

    -   :class:`fiftyone.core.fields.BooleanField`
    -   :class:`fiftyone.core.fields.IntField`
    -   :class:`fiftyone.core.fields.StringField`
    -   :class:`fiftyone.core.fields.DateField`
    -   :class:`fiftyone.core.fields.DateTimeField`

    Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F

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

        aggregation = fo.CountValues("tags")
        counts = dataset.aggregate(aggregation)
        print(counts)  # dict mapping values to counts

        #
        # Compute the predicted label counts in the dataset
        #

        aggregation = fo.CountValues("predictions.detections.label")
        counts = dataset.aggregate(aggregation)
        print(counts)  # dict mapping values to counts

        #
        # Compute the predicted label counts after some normalization
        #

        aggregation = fo.CountValues(
            F("predictions.detections.label").map_values(
                {"cat": "pet", "dog": "pet"}
            ).upper()
        )
        counts = dataset.aggregate(aggregation)
        print(counts)  # dict mapping values to counts

    Args:
        field_or_expr: a field name, ``embedded.field.name``,
            :class:`fiftyone.core.expressions.ViewExpression`, or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            defining the field or expression to aggregate
        expr (None): a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            to apply to ``field_or_expr`` (which must be a field) before
            aggregating
    """

    def __init__(
        self,
        field_or_expr,
        expr=None,
        _first=None,
        _sort_by="count",
        _asc=True,
        _include=None,
    ):
        super().__init__(field_or_expr, expr=expr)
        self._first = _first
        self._sort_by = _sort_by
        self._order = 1 if _asc else -1
        self._include = _include
        self._field_type = None

    def default_result(self):
        """Returns the default result for this aggregation.

        Returns:
            ``{}``
        """
        if self._first is not None:
            return 0, []

        return {}

    def parse_result(self, d):
        """Parses the output of :meth:`to_mongo`.

        Args:
            d: the result dict

        Returns:
            a dict mapping values to counts
        """
        if self._field_type is not None:
            p = self._field_type.to_python
        else:
            p = lambda x: x

        if self._first is not None:
            return (
                d["count"],
                [
                    [p(i["k"]), i["count"]]
                    for i in d["result"]
                    if i["k"] is not None
                ],
            )

        return {p(i["k"]): i["count"] for i in d["result"]}

    def to_mongo(self, sample_collection):
        path, pipeline, _, id_to_str, field_type = _parse_field_and_expr(
            sample_collection, self._field_name, expr=self._expr
        )

        self._field_type = field_type

        if id_to_str:
            value = {"$toString": "$" + path}
        else:
            value = "$" + path

        pipeline += [
            {"$group": {"_id": value, "count": {"$sum": 1}}},
        ]

        if self._first is not None:
            sort = OrderedDict()
            limit = self._first

            if self._include is not None:
                limit = max(limit, len(self._include))
                pipeline += [
                    {"$set": {"included": {"$in": ["$_id", self._include]}}},
                ]
                sort["included"] = -1

            sort[self._sort_by] = self._order
            sort["count" if self._sort_by != "count" else "_id"] = self._order

            pipeline += [{"$sort": sort}, {"$limit": limit}]

        pipeline += [
            {
                "$group": {
                    "_id": None,
                    "result": {"$push": {"k": "$_id", "count": "$count"}},
                    "count": {"$sum": 1},
                }
            },
        ]

        return pipeline


class Distinct(Aggregation):
    """Computes the distinct values of a field in a collection.

    ``None``-valued fields are ignored.

    This aggregation is typically applied to *countable* field types (or lists
    of such types):

    -   :class:`fiftyone.core.fields.BooleanField`
    -   :class:`fiftyone.core.fields.IntField`
    -   :class:`fiftyone.core.fields.StringField`
    -   :class:`fiftyone.core.fields.DateField`
    -   :class:`fiftyone.core.fields.DateTimeField`

    Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F

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

        aggregation = fo.Distinct("tags")
        values = dataset.aggregate(aggregation)
        print(values)  # list of distinct values

        #
        # Get the distinct predicted labels in a dataset
        #

        aggregation = fo.Distinct("predictions.detections.label")
        values = dataset.aggregate(aggregation)
        print(values)  # list of distinct values

        #
        # Get the distinct predicted labels after some normalization
        #

        aggregation = fo.Distinct(
            F("predictions.detections.label").map_values(
                {"cat": "pet", "dog": "pet"}
            ).upper()
        )
        values = dataset.aggregate(aggregation)
        print(values)  # list of distinct values

    Args:
        field_or_expr: a field name, ``embedded.field.name``,
            :class:`fiftyone.core.expressions.ViewExpression`, or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            defining the field or expression to aggregate
        expr (None): a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            to apply to ``field_or_expr`` (which must be a field) before
            aggregating
    """

    def __init__(self, field_or_expr, expr=None):
        super().__init__(field_or_expr, expr=expr)
        self._field_type = None

    def default_result(self):
        """Returns the default result for this aggregation.

        Returns:
            ``[]``
        """
        return []

    def parse_result(self, d):
        """Parses the output of :meth:`to_mongo`.

        Args:
            d: the result dict

        Returns:
            a sorted list of distinct values
        """
        values = d["values"]

        if self._field_type is not None:
            p = self._field_type.to_python
            return [p(v) for v in values]

        return values

    def to_mongo(self, sample_collection):
        path, pipeline, _, id_to_str, field_type = _parse_field_and_expr(
            sample_collection, self._field_name, expr=self._expr
        )

        self._field_type = field_type

        if id_to_str:
            value = {"$toString": "$" + path}
        else:
            value = "$" + path

        pipeline += [
            {"$match": {"$expr": {"$gt": ["$" + path, None]}}},
            {"$group": {"_id": None, "values": {"$addToSet": value}}},
            {"$unwind": "$values"},
            {"$sort": {"values": 1}},
            {"$group": {"_id": None, "values": {"$push": "$values"}}},
        ]

        return pipeline


class HistogramValues(Aggregation):
    """Computes a histogram of the field values in a collection.

    This aggregation is typically applied to *numeric* or *date* field types
    (or lists of such types):

    -   :class:`fiftyone.core.fields.IntField`
    -   :class:`fiftyone.core.fields.FloatField`
    -   :class:`fiftyone.core.fields.DateField`
    -   :class:`fiftyone.core.fields.DateTimeField`

    Examples::

        import numpy as np
        import matplotlib.pyplot as plt

        import fiftyone as fo
        from fiftyone import ViewField as F

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

        aggregation = fo.HistogramValues("numeric_field", bins=50)
        counts, edges, other = dataset.aggregate(aggregation)

        plot_hist(counts, edges)
        plt.show(block=False)

        #
        # Compute the histogram of a numeric list field
        #

        aggregation = fo.HistogramValues("numeric_list_field", bins=50)
        counts, edges, other = dataset.aggregate(aggregation)

        plot_hist(counts, edges)
        plt.show(block=False)

        #
        # Compute the histogram of a transformation of a numeric field
        #

        aggregation = fo.HistogramValues(2 * (F("numeric_field") + 1), bins=50)
        counts, edges, other = dataset.aggregate(aggregation)

        plot_hist(counts, edges)
        plt.show(block=False)

    Args:
        field_or_expr: a field name, ``embedded.field.name``,
            :class:`fiftyone.core.expressions.ViewExpression`, or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            defining the field or expression to aggregate
        expr (None): a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            to apply to ``field_or_expr`` (which must be a field) before
            aggregating
        bins (None): can be either an integer number of bins to generate or a
            monotonically increasing sequence specifying the bin edges to use.
            By default, 10 bins are created. If ``bins`` is an integer and no
            ``range`` is specified, bin edges are automatically computed from
            the bounds of the field
        range (None): a ``(lower, upper)`` tuple specifying a range in which to
            generate equal-width bins. Only applicable when ``bins`` is an
            integer or ``None``
        auto (False): whether to automatically choose bin edges in an attempt
            to evenly distribute the counts in each bin. If this option is
            chosen, ``bins`` will only be used if it is an integer, and the
            ``range`` parameter is ignored
    """

    def __init__(
        self, field_or_expr, expr=None, bins=None, range=None, auto=False
    ):
        super().__init__(field_or_expr, expr=expr)

        self._bins = bins
        self._range = range
        self._auto = auto

        self._field_type = None
        self._is_datetime = False
        self._num_bins = None
        self._edges = None
        self._last_edges = None

        self._parse_args()

    def default_result(self):
        """Returns the default result for this aggregation.

        Returns:
            a tuple of

            -   **counts**: ``[]``
            -   **edges**: ``[]``
            -   **other**: ``0``
        """
        return [], [], 0

    def parse_result(self, d):
        """Parses the output of :meth:`to_mongo`.

        Args:
            d: the result dict

        Returns:
            a tuple of

            -   **counts**: a list of counts in each bin
            -   **edges**: an increasing list of bin edges of length
                ``len(counts) + 1``. Note that each bin is treated as having an
                inclusive lower boundary and exclusive upper boundary,
                ``[lower, upper)``, including the rightmost bin
            -   **other**: the number of items outside the bins
        """
        if self._auto:
            return self._parse_result_auto(d)

        return self._parse_result_edges(d)

    def to_mongo(self, sample_collection):
        path, pipeline, _, id_to_str, field_type = _parse_field_and_expr(
            sample_collection, self._field_name, expr=self._expr
        )

        self._field_type = field_type

        if id_to_str:
            value = {"$toString": "$" + path}
        else:
            value = "$" + path

        if self._auto:
            pipeline.append(
                {
                    "$bucketAuto": {
                        "groupBy": value,
                        "buckets": self._num_bins,
                        "output": {"count": {"$sum": 1}},
                    }
                }
            )
        else:
            if self._edges is not None:
                edges = self._edges
            else:
                edges = self._compute_bin_edges(sample_collection)

            self._last_edges = edges

            if self._is_datetime:
                edges = [{"$toDate": e} for e in edges]

            pipeline.append(
                {
                    "$bucket": {
                        "groupBy": value,
                        "boundaries": edges,
                        "default": "other",  # counts documents outside of bins
                        "output": {"count": {"$sum": 1}},
                    }
                }
            )

        pipeline.append({"$group": {"_id": None, "bins": {"$push": "$$ROOT"}}})

        return pipeline

    def _parse_args(self):
        if self._range is not None:
            self._range, self._is_datetime = _handle_dates(self._range)

        if self._bins is not None and etau.is_container(self._bins):
            self._bins, self._is_datetime = _handle_dates(self._bins)

        if self._bins is None:
            bins = 10
        else:
            bins = int(self._bins)

        if self._auto:
            if etau.is_numeric(bins):
                self._num_bins = int(bins)
            else:
                self._num_bins = 10

            return

        if not etau.is_numeric(bins):
            # User-provided bin edges
            self._edges = list(bins)
            return

        if self._range is not None:
            # Linearly-spaced bins within `range`
            self._edges = list(
                np.linspace(self._range[0], self._range[1], bins + 1)
            )
        else:
            # Compute bin edges from bounds
            self._num_bins = bins

    def _compute_bin_edges(self, sample_collection):
        bounds = sample_collection.bounds(self._field_name, expr=self._expr)

        if any(b is None for b in bounds):
            bounds = [-1, -1]

        bounds, self._is_datetime = _handle_dates(bounds)
        db = 1 if self._is_datetime else 1e-6

        return list(np.linspace(bounds[0], bounds[1] + db, self._num_bins + 1))

    def _parse_result_edges(self, d):
        edges = self._last_edges
        edges_array = np.array(edges)

        counts = [0] * (len(edges) - 1)
        other = 0
        for di in d["bins"]:
            left = di["_id"]
            if left == "other":
                other = di["count"]
            else:
                left, _ = _handle_dates(left)
                idx = np.abs(edges_array - left).argmin()
                counts[idx] = di["count"]

        edges = self._parse_edges(edges)

        return counts, edges, other

    def _parse_result_auto(self, d):
        counts = []
        edges = []
        for di in d["bins"]:
            counts.append(di["count"])
            edges.append(di["_id"]["min"])

        edges.append(di["_id"]["max"])

        edges = self._parse_edges(edges)

        return counts, edges, 0

    def _parse_edges(self, edges):
        if self._is_datetime:
            edges = [fou.timestamp_to_datetime(e) for e in edges]
        elif self._field_type is not None:
            # Note that we don't do this for datetimes, since we need datetimes
            # rather than dates to handle sub-day resolution
            p = self._field_type.to_python
            edges = [p(e) for e in edges]

        return edges


class Mean(Aggregation):
    """Computes the arithmetic mean of the field values of a collection.

    ``None``-valued fields are ignored.

    This aggregation is typically applied to *numeric* field types (or lists of
    such types):

    -   :class:`fiftyone.core.fields.IntField`
    -   :class:`fiftyone.core.fields.FloatField`

    Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F

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
        # Compute the mean of a numeric field
        #

        aggregation = fo.Mean("numeric_field")
        mean = dataset.aggregate(aggregation)
        print(mean)  # the mean

        #
        # Compute the mean of a numeric list field
        #

        aggregation = fo.Mean("numeric_list_field")
        mean = dataset.aggregate(aggregation)
        print(mean)  # the mean

        #
        # Compute the mean of a transformation of a numeric field
        #

        aggregation = fo.Mean(2 * (F("numeric_field") + 1))
        mean = dataset.aggregate(aggregation)
        print(mean)  # the mean

    Args:
        field_or_expr: a field name, ``embedded.field.name``,
            :class:`fiftyone.core.expressions.ViewExpression`, or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            defining the field or expression to aggregate
        expr (None): a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            to apply to ``field_or_expr`` (which must be a field) before
            aggregating
    """

    def default_result(self):
        """Returns the default result for this aggregation.

        Returns:
            ``0``
        """
        return 0

    def parse_result(self, d):
        """Parses the output of :meth:`to_mongo`.

        Args:
            d: the result dict

        Returns:
            the mean
        """
        return d["mean"]

    def to_mongo(self, sample_collection):
        path, pipeline, _, id_to_str, _ = _parse_field_and_expr(
            sample_collection, self._field_name, expr=self._expr
        )

        if id_to_str:
            value = {"$toString": "$" + path}
        else:
            value = "$" + path

        pipeline.append({"$group": {"_id": None, "mean": {"$avg": value}}})

        return pipeline


class Std(Aggregation):
    """Computes the standard deviation of the field values of a collection.

    ``None``-valued fields are ignored.

    This aggregation is typically applied to *numeric* field types (or lists of
    such types):

    -   :class:`fiftyone.core.fields.IntField`
    -   :class:`fiftyone.core.fields.FloatField`

    Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F

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
        # Compute the standard deviation of a numeric field
        #

        aggregation = fo.Std("numeric_field")
        std = dataset.aggregate(aggregation)
        print(std)  # the standard deviation

        #
        # Compute the standard deviation of a numeric list field
        #

        aggregation = fo.Std("numeric_list_field")
        std = dataset.aggregate(aggregation)
        print(std)  # the standard deviation

        #
        # Compute the standard deviation of a transformation of a numeric field
        #

        aggregation = fo.Std(2 * (F("numeric_field") + 1))
        std = dataset.aggregate(aggregation)
        print(std)  # the standard deviation

    Args:
        field_or_expr: a field name, ``embedded.field.name``,
            :class:`fiftyone.core.expressions.ViewExpression`, or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            defining the field or expression to aggregate
        expr (None): a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            to apply to ``field_or_expr`` (which must be a field) before
            aggregating
        sample (False): whether to compute the sample standard deviation rather
            than the population standard deviation
    """

    def __init__(self, field_or_expr, expr=None, sample=False):
        super().__init__(field_or_expr, expr=expr)
        self._sample = sample

    def default_result(self):
        """Returns the default result for this aggregation.

        Returns:
            ``0``
        """
        return 0

    def parse_result(self, d):
        """Parses the output of :meth:`to_mongo`.

        Args:
            d: the result dict

        Returns:
            the standard deviation
        """
        return d["std"]

    def to_mongo(self, sample_collection):
        path, pipeline, _, id_to_str, _ = _parse_field_and_expr(
            sample_collection, self._field_name, expr=self._expr
        )

        if id_to_str:
            value = {"$toString": "$" + path}
        else:
            value = "$" + path

        op = "$stdDevSamp" if self._sample else "$stdDevPop"
        pipeline.append({"$group": {"_id": None, "std": {op: value}}})

        return pipeline


class Sum(Aggregation):
    """Computes the sum of the field values of a collection.

    ``None``-valued fields are ignored.

    This aggregation is typically applied to *numeric* field types (or lists of
    such types):

    -   :class:`fiftyone.core.fields.IntField`
    -   :class:`fiftyone.core.fields.FloatField`

    Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F

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

        aggregation = fo.Sum("numeric_field")
        total = dataset.aggregate(aggregation)
        print(total)  # the sum

        #
        # Compute the sum of a numeric list field
        #

        aggregation = fo.Sum("numeric_list_field")
        total = dataset.aggregate(aggregation)
        print(total)  # the sum

        #
        # Compute the sum of a transformation of a numeric field
        #

        aggregation = fo.Sum(2 * (F("numeric_field") + 1))
        total = dataset.aggregate(aggregation)
        print(total)  # the sum

    Args:
        field_or_expr: a field name, ``embedded.field.name``,
            :class:`fiftyone.core.expressions.ViewExpression`, or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            defining the field or expression to aggregate
        expr (None): a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            to apply to ``field_or_expr`` (which must be a field) before
            aggregating
    """

    def default_result(self):
        """Returns the default result for this aggregation.

        Returns:
            ``0``
        """
        return 0

    def parse_result(self, d):
        """Parses the output of :meth:`to_mongo`.

        Args:
            d: the result dict

        Returns:
            the sum
        """
        return d["sum"]

    def to_mongo(self, sample_collection):
        path, pipeline, _, id_to_str, _ = _parse_field_and_expr(
            sample_collection, self._field_name, expr=self._expr
        )

        if id_to_str:
            value = {"$toString": "$" + path}
        else:
            value = "$" + path

        pipeline.append({"$group": {"_id": None, "sum": {"$sum": value}}})

        return pipeline


class Values(Aggregation):
    """Extracts the values of the field from all samples in a collection.

    Values aggregations are useful for efficiently extracting a slice of field
    or embedded field values across all samples in a collection. See the
    examples below for more details.

    The dual function of :class:`Values` is
    :meth:`set_values() <fiftyone.core.collections.SampleCollection.set_values>`,
    which can be used to efficiently set a field or embedded field of all
    samples in a collection by providing lists of values of same structure
    returned by this aggregation.

    .. note::

        Unlike other aggregations, :class:`Values` does not automatically
        unwind list fields, which ensures that the returned values match the
        potentially-nested structure of the documents.

        You can opt-in to unwinding specific list fields using the ``[]``
        syntax, or you can pass the optional ``unwind=True`` parameter to
        unwind all supported list fields. See :ref:`aggregations-list-fields`
        for more information.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

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
        # Get all values of a field
        #

        aggregation = fo.Values("numeric_field")
        values = dataset.aggregate(aggregation)
        print(values)  # [1.0, 4.0, None]

        #
        # Get all values of a list field
        #

        aggregation = fo.Values("numeric_list_field")
        values = dataset.aggregate(aggregation)
        print(values)  # [[1, 2, 3], [1, 2], None]

        #
        # Get all values of transformed field
        #

        aggregation = fo.Values(2 * (F("numeric_field") + 1))
        values = dataset.aggregate(aggregation)
        print(values)  # [4.0, 10.0, None]

        #
        # Get values from a label list field
        #

        dataset = foz.load_zoo_dataset("quickstart")

        # list of `Detections`
        aggregation = fo.Values("ground_truth")
        detections = dataset.aggregate(aggregation)

        # list of lists of `Detection` instances
        aggregation = fo.Values("ground_truth.detections")
        detections = dataset.aggregate(aggregation)

        # list of lists of detection labels
        aggregation = fo.Values("ground_truth.detections.label")
        labels = dataset.aggregate(aggregation)

    Args:
        field_or_expr: a field name, ``embedded.field.name``,
            :class:`fiftyone.core.expressions.ViewExpression`, or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            defining the field or expression to aggregate
        expr (None): a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            to apply to ``field_or_expr`` (which must be a field) before
            aggregating
        missing_value (None): a value to insert for missing or ``None``-valued
            fields
        unwind (False): whether to automatically unwind all recognized list
            fields (True) or unwind all list fields except the top-level sample
            field (-1)
    """

    def __init__(
        self,
        field_or_expr,
        expr=None,
        missing_value=None,
        unwind=False,
        _allow_missing=False,
        _big_result=True,
        _raw=False,
    ):
        super().__init__(field_or_expr, expr=expr)

        self._missing_value = missing_value
        self._unwind = unwind
        self._allow_missing = _allow_missing
        self._big_result = _big_result
        self._big_field = None
        self._raw = _raw
        self._field_type = None
        self._num_list_fields = None

    @property
    def _has_big_result(self):
        return self._big_result

    @property
    def _is_big_batchable(self):
        return (
            self._big_result
            and not self._unwind
            and self._expr is None
            and self._field_name is not None
            and "[]" not in self._field_name
        )

    def default_result(self):
        """Returns the default result for this aggregation.

        Returns:
            ``[]``
        """
        return []

    def parse_result(self, d):
        """Parses the output of :meth:`to_mongo`.

        Args:
            d: the result dict

        Returns:
            the list of field values
        """
        if self._big_result:
            values = [di[self._big_field] for di in d]
        else:
            values = d["values"]

        if self._raw:
            return values

        if self._field_type is not None:
            fcn = self._field_type.to_python
            level = 1 + self._num_list_fields
            return _transform_values(values, fcn, level=level)

        return values

    def to_mongo(self, sample_collection, big_field="values"):
        (
            path,
            pipeline,
            list_fields,
            id_to_str,
            field_type,
        ) = _parse_field_and_expr(
            sample_collection,
            self._field_name,
            expr=self._expr,
            unwind=self._unwind,
            allow_missing=self._allow_missing,
        )

        self._big_field = big_field
        self._field_type = field_type
        self._num_list_fields = len(list_fields)

        pipeline.extend(
            _make_extract_values_pipeline(
                path,
                list_fields,
                id_to_str,
                self._missing_value,
                self._big_result,
                big_field,
            )
        )

        return pipeline


def _is_frame_path(sample_collection, field_name):
    if not field_name:
        return False

    # Remove array references
    path = "".join(field_name.split("[]"))

    return sample_collection._is_frame_field(path)


def _transform_values(values, fcn, level=1):
    if values is None:
        return None

    if level < 1:
        return fcn(values)

    return [_transform_values(v, fcn, level=level - 1) for v in values]


def _make_extract_values_pipeline(
    path, list_fields, id_to_str, missing_value, big_result, big_field
):
    if not list_fields:
        root = path
    else:
        root = list_fields[0]

    expr = F().to_string() if id_to_str else F()

    # This is important, even if `missing_value` is None, since we need to
    # insert `None` for documents with missing fields
    expr = (F() != None).if_else(expr, missing_value)

    if list_fields:
        subfield = path[len(list_fields[-1]) + 1 :]
        expr = _extract_list_values(subfield, expr)

    if len(list_fields) > 1:
        for list_field1, list_field2 in zip(
            reversed(list_fields[:-1]), reversed(list_fields[1:])
        ):
            inner_list_field = list_field2[len(list_field1) + 1 :]
            expr = _extract_list_values(inner_list_field, expr)

    if big_result:
        return [{"$project": {big_field: expr.to_mongo(prefix="$" + root)}}]

    return [
        {"$project": {"value": expr.to_mongo(prefix="$" + root)}},
        {"$group": {"_id": None, "values": {"$push": "$value"}}},
    ]


def _extract_list_values(subfield, expr):
    if subfield:
        map_expr = F(subfield).apply(expr)
    else:
        map_expr = expr

    return F().map(map_expr)


def _parse_field_and_expr(
    sample_collection, field_name, expr=None, unwind=True, allow_missing=False,
):
    # unwind can be {True, False, -1}
    auto_unwind = unwind != False
    keep_top_level = unwind < 0
    omit_terminal_lists = unwind == False

    if field_name is None and expr is None:
        raise ValueError(
            "You must provide a field or an expression in order to define an "
            "aggregation"
        )

    if field_name is None:
        field_name, expr = _extract_prefix_from_expr(expr)

    if expr is not None:
        if field_name is None:
            field_name = "value"
            embedded_root = True
            allow_missing = True
        else:
            embedded_root = False
            allow_missing = False

        pipeline, _ = sample_collection._make_set_field_pipeline(
            field_name,
            expr,
            embedded_root=embedded_root,
            allow_missing=allow_missing,
        )
    else:
        pipeline = []

    (
        path,
        is_frame_field,
        unwind_list_fields,
        other_list_fields,
        id_to_str,
    ) = sample_collection._parse_field_name(
        field_name,
        auto_unwind=auto_unwind,
        omit_terminal_lists=omit_terminal_lists,
        allow_missing=allow_missing,
    )

    if expr is not None:
        id_to_str = False  # we have no way of knowing what type expr outputs

    if expr is None and not id_to_str:
        field_type = _get_field_type(
            sample_collection, field_name, unwind=auto_unwind
        )
    else:
        field_type = None

    if keep_top_level:
        if is_frame_field:
            path = "frames." + path
            unwind_list_fields = ["frames." + f for f in unwind_list_fields]
            other_list_fields = ["frames." + f for f in other_list_fields]
            other_list_fields.insert(0, "frames")
        elif unwind_list_fields:
            first_field = unwind_list_fields.pop(0)
            other_list_fields = sorted([first_field] + other_list_fields)

        pipeline.append({"$project": {path: True}})
    elif auto_unwind:
        if is_frame_field:
            pipeline.extend(
                [
                    {"$unwind": "$frames"},
                    {"$project": {"frames." + path: True}},
                    {"$replaceRoot": {"newRoot": "$frames"}},
                ]
            )
        else:
            pipeline.append({"$project": {path: True}})
    elif unwind_list_fields:
        pipeline.append({"$project": {path: True}})

    (
        _reduce_pipeline,
        _path,
        _unwind_list_fields,
        _other_list_fields,
    ) = _handle_reduce_unwinds(path, unwind_list_fields, other_list_fields)

    if _reduce_pipeline:
        pipeline.extend(_reduce_pipeline)
        path = _path
        unwind_list_fields = _unwind_list_fields
        other_list_fields = _other_list_fields

    for list_field in unwind_list_fields:
        pipeline.append({"$unwind": "$" + list_field})

    return path, pipeline, other_list_fields, id_to_str, field_type


def _handle_reduce_unwinds(path, unwind_list_fields, other_list_fields):
    pipeline = []

    list_fields = sorted(
        [(f, True) for f in unwind_list_fields]
        + [(f, False) for f in other_list_fields],
        key=lambda kv: kv[0],
    )
    num_list_fields = len(list_fields)

    for idx in range(1, num_list_fields):
        list_field, unwind = list_fields[idx]

        # If we're unwinding a list field that is preceeded by another list
        # field that is *not* unwound, we must use `reduce()` to achieve it
        if unwind and not list_fields[idx - 1][1]:
            prev_list = list_fields[idx - 1][0]
            leaf = list_field[len(prev_list) + 1 :]
            reduce_expr = F(prev_list).reduce(
                (F(leaf) != None).if_else(VALUE.extend(F(leaf)), VALUE),
                init_val=[],
            )
            pipeline.append({"$set": {prev_list: reduce_expr.to_mongo()}})
            path, list_fields = _replace_list(
                path, list_fields, list_field, prev_list
            )

    if pipeline:
        unwind_list_fields = []
        other_list_fields = []
        for field, unwind in list_fields:
            if field is not None:
                if unwind:
                    unwind_list_fields.append(field)
                else:
                    other_list_fields.append(field)

    return pipeline, path, unwind_list_fields, other_list_fields


def _replace_list(path, list_fields, old, new):
    new_path = new + path[len(old) :]

    new_list_fields = []
    for field, unwind in list_fields:
        if field == old:
            field = None
        elif field.startswith(old):
            field = new + field[len(old) :]

        new_list_fields.append((field, unwind))

    return new_path, new_list_fields


def _extract_prefix_from_expr(expr):
    prefixes = []
    _find_prefixes(expr, prefixes)

    common = _get_common_prefix(prefixes)
    if common:
        expr = deepcopy(expr)
        _remove_prefix(expr, common)

    return common, expr


def _find_prefixes(expr, prefixes):
    if isinstance(expr, foe.ViewExpression):
        if expr.is_frozen:
            return

        if isinstance(expr, foe.ViewField):
            prefixes.append(expr._expr)
        else:
            _find_prefixes(expr._expr, prefixes)

    elif isinstance(expr, (list, tuple)):
        for e in expr:
            _find_prefixes(e, prefixes)

    elif isinstance(expr, dict):
        for e in expr.values():
            _find_prefixes(e, prefixes)


def _get_common_prefix(prefixes):
    if not prefixes:
        return None

    chunks = [p.split(".") for p in prefixes]
    min_chunks = min(len(c) for c in chunks)

    common = None
    idx = 0
    pre = [c[0] for c in chunks]
    while len(set(pre)) == 1:
        common = pre[0]
        idx += 1

        if idx >= min_chunks:
            break

        pre = [common + "." + c[idx] for c in chunks]

    return common


def _remove_prefix(expr, prefix):
    if isinstance(expr, foe.ViewExpression):
        if expr.is_frozen:
            return

        if isinstance(expr, foe.ViewField):
            if expr._expr == prefix:
                expr._expr = ""
            elif expr._expr.startswith(prefix + "."):
                expr._expr = expr._expr[len(prefix) + 1 :]
        else:
            _remove_prefix(expr._expr, prefix)

    elif isinstance(expr, (list, tuple)):
        for e in expr:
            _remove_prefix(e, prefix)

    elif isinstance(expr, dict):
        for e in expr.values():
            _remove_prefix(e, prefix)


def _get_field_type(sample_collection, field_name, unwind=True):
    # Remove array references
    field_name = "".join(field_name.split("[]"))

    field_type = sample_collection._get_field_type(
        field_name, ignore_primitives=True
    )

    if unwind:
        while isinstance(field_type, fof.ListField):
            field_type = field_type.field

    return field_type


def _handle_dates(arg):
    is_scalar = not etau.is_container(arg)

    if is_scalar:
        arg = [arg]

    is_datetime = any(isinstance(x, (date, datetime)) for x in arg)

    if is_datetime:
        arg = [fou.datetime_to_timestamp(a) for a in arg]

    if is_scalar:
        arg = arg[0]

    return arg, is_datetime
