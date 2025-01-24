"""
Plotly-powered view plots.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
from operator import itemgetter

import numpy as np

import eta.core.utils as etau

import plotly.subplots as ps
import plotly.graph_objects as go

import fiftyone.core.aggregations as foa

from .base import ViewPlot
from .plotly import PlotlyWidgetMixin


_DEFAULT_LAYOUT = dict(
    template="ggplot2", margin={"r": 0, "t": 30, "l": 0, "b": 0}
)

_DEFAULT_MARKER_COLOR = "#FF6D04"


class PlotlyViewPlot(PlotlyWidgetMixin, ViewPlot):
    """Base class for :class:`ViewPlot` instances with Plotly backends.

    Args:
        widget: a :class:`plotly:plotly.graph_objects.FigureWidget`
        init_view (None): an optional initial
            :class:`fiftyone.core.collections.SampleCollection` to load
    """

    def __init__(self, widget, init_view=None):
        self._traces = widget.data

        ViewPlot.__init__(self)
        PlotlyWidgetMixin.__init__(self, widget)  # must be last

        self.init_view = init_view
        if init_view is not None:
            self.connect()
            self.update_view(init_view)

    def _get_trace_updates(self, view, agg_results=None):
        raise NotImplementedError(
            "Subclass must implement _get_trace_updates()"
        )

    def _update_view(self, view, agg_results=None):
        updates = self._get_trace_updates(view, agg_results=agg_results)

        with self._widget.batch_update():
            for trace, update in zip(self._traces, updates):
                trace.update(update)

    def show(self, **kwargs):
        """Shows this plot.

        Args:
            **kwargs: optional parameters for
                :meth:`plotly:plotly.graph_objects.Figure.update_layout`
        """
        super().show(**kwargs)


class ViewGrid(PlotlyViewPlot):
    """A grid of :class:`PlotlyViewPlot` instances.

    Args:
        plots: a :class:`PlotlyViewPlot` or iterable of :class:`PlotlyViewPlot`
            instances
        shape (None): the ``(rows, cols)`` shape to use for the grid
        hgap (None): a horizontal spacing between the subplots, in ``[0, 1]``
        vgap (None): a vertical spacing between the subplots, in ``[0, 1]``
        init_view (None): an optional initial
            :class:`fiftyone.core.collections.SampleCollection` to load
        **kwargs: optional parameters for
            :meth:`plotly:plotly.graph_objects.Figure.update_layout`
    """

    def __init__(
        self, plots, shape=None, hgap=None, vgap=None, init_view=None, **kwargs
    ):
        if not etau.is_container(plots):
            plots = [plots]

        bad_plots = [p for p in plots if not isinstance(p, PlotlyViewPlot)]
        if bad_plots:
            raise ValueError(
                "Found %d unsupported plots; this class only supports %s plots"
                % (len(bad_plots), PlotlyViewPlot)
            )

        self.plots = plots
        self.shape = shape
        self.hgap = hgap
        self.vgap = vgap
        self.layout = kwargs

        self._aggregations = None
        self._agg_lengths = None

        self._init_aggregations()

        widget = self._make_widget()

        super().__init__(widget, init_view=init_view)

    def _init_aggregations(self):
        aggregations = []
        agg_lengths = []
        for plot in self.plots:
            aggs = plot._get_aggregations()
            if aggs is not None:
                aggregations.extend(aggs)
                agg_lengths.append(len(aggs))
            else:
                agg_lengths.append(None)

        if not aggregations:
            aggregations = None
            agg_lengths = None

        self._aggregations = aggregations
        self._agg_lengths = agg_lengths

    def _get_aggregations(self):
        return self._aggregations

    def _make_widget(self):
        widget = _make_composite_widget(
            self.plots, shape=self.shape, hgap=self.hgap, vgap=self.vgap
        )

        layout = _DEFAULT_LAYOUT.copy()
        layout.update(self.layout)

        widget.update_layout(**layout)

        return widget

    def _get_trace_updates(self, view, agg_results=None):
        if agg_results is None:
            agg_results = itertools.repeat(None)
        else:
            agg_iter = iter(agg_results)
            agg_results = []
            for agg_len in self._agg_lengths:
                if agg_len is None:
                    _agg_results = None
                else:
                    _agg_results = [next(agg_iter) for _ in range(agg_len)]

                agg_results.append(_agg_results)

        updates = []
        for plot, _agg_results in zip(self.plots, agg_results):
            update = plot._get_trace_updates(view, agg_results=_agg_results)
            updates.extend(update)

        return updates

    def _reopen(self):
        self._widget = self._make_widget()
        self._traces = self._widget.data


class CategoricalHistogram(PlotlyViewPlot):
    """A histogram of a categorial field.

    Args:
        field_or_expr: a field name, ``embedded.field.name``,
            :class:`fiftyone.core.expressions.ViewExpression`, or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            defining the field or expression to plot
        expr (None): an optional
            :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            to apply to ``field_or_expr`` (which must be a field) before
            plotting
        order ("alphabetical"): the x-axis ordering strategy to use. Can be
            "alphabetical" to sort by field value, or "frequency" to sort in
            descending order of frequency, or a function suitable for
            ``sorted(items, key=order)``, where ``items`` is a list of
            ``(value, count)`` tuples
        xlabel (None): an optional x-label for the plot
        log (False): whether to use a log scale y-axis
        bargap (None): relative spacing between bars in ``[0, 1]``
        color (None): a color for the bars. Can be any color supported by
            :meth:`plotly:plotly.graph_objects.bar.Marker.color`
        opacity (None): an optional opacity for the bars in ``[0, 1]``
        init_view (None): an optional initial
            :class:`fiftyone.core.collections.SampleCollection` to load
        **kwargs: optional parameters for
            :meth:`plotly:plotly.graph_objects.Figure.update_layout`
    """

    def __init__(
        self,
        field_or_expr,
        expr=None,
        order="alphabetical",
        xlabel=None,
        log=None,
        bargap=None,
        color=None,
        opacity=None,
        init_view=None,
        **kwargs,
    ):
        self.field_or_expr = field_or_expr
        self.expr = expr
        self.order = order
        self.xlabel = xlabel
        self.log = log
        self.bargap = bargap
        self.color = color
        self.opacity = opacity
        self.layout = kwargs

        if order == "alphabetical":
            self._order = itemgetter(0)
            self._reverse = False
        elif order == "frequency":
            self._order = itemgetter(1)
            self._reverse = True
        else:
            self._order = order
            self._reverse = False

        self._figure = self._make_histogram()

        self._aggregations = [foa.CountValues(field_or_expr, expr=expr)]

        widget = self._make_widget()

        super().__init__(widget, init_view=init_view)

    def _make_widget(self):
        return go.FigureWidget(self._figure)

    def _make_histogram(self):
        if etau.is_str(self.field_or_expr):
            _field = self.field_or_expr.rsplit(".", 1)[-1]
        else:
            _field = "value"

        hover_lines = [
            "<b>%s: %%{x}</b>" % _field,
            "count: %{y}",
        ]
        hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

        if self.color is None:
            marker_color = _DEFAULT_MARKER_COLOR
        else:
            marker_color = self.color

        bar = go.Bar(
            hovertemplate=hovertemplate,
            marker_color=marker_color,
            opacity=self.opacity,
        )

        if self.xlabel is not None:
            xaxis_title = self.xlabel
        elif etau.is_str(self.field_or_expr):
            xaxis_title = self.field_or_expr
        else:
            xaxis_title = None

        layout = _DEFAULT_LAYOUT.copy()

        layout.update(
            dict(
                xaxis_title=xaxis_title,
                yaxis_title="count",
                bargap=self.bargap,
            )
        )

        if self.log:
            layout.update(dict(yaxis_type="log"))

        layout.update(self.layout)

        figure = go.Figure(bar)
        figure.update_layout(**layout)

        return figure

    def _get_aggregations(self):
        return self._aggregations

    def _get_trace_updates(self, view, agg_results=None):
        if view is not None:
            if agg_results is not None:
                counts = agg_results[0]
            else:
                counts = view.aggregate(self._aggregations[0])
        else:
            counts = None

        if counts:
            keys, values = zip(
                *sorted(counts.items(), key=self._order, reverse=self._reverse)
            )
        else:
            keys, values = None, None

        return [dict(x=keys, y=values)]

    def _reopen(self):
        self._widget = self._make_widget()
        self._traces = self._widget.data


class NumericalHistogram(PlotlyViewPlot):
    """A histogram of a numerical field.

    Args:
        field_or_expr: a field name, ``embedded.field.name``,
            :class:`fiftyone.core.expressions.ViewExpression`, or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            defining the field or expression to plot
        expr (None): an optional
            :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            to apply to ``field_or_expr`` (which must be a field) before
            plotting
        bins (None): can be either an integer number of bins to generate or a
            monotonically increasing sequence specifying the bin edges to use.
            By default, 10 bins are created. If ``bins`` is an integer and no
            ``range`` is specified, bin edges are automatically computed from
            the bounds of the field
        range (None): a ``(lower, upper)`` tuple specifying a range in which to
            generate equal-width bins. Only applicable when ``bins`` is an
            integer or ``None``
        xlabel (None): an optional x-label for the plot
        log (False): whether to use a log scale y-axis
        color (None): a color for the bars. Can be any color supported by
            :meth:`plotly:plotly.graph_objects.bar.Marker.color`
        opacity (None): an optional opacity for the bars in ``[0, 1]``
        init_view (None): an optional initial
            :class:`fiftyone.core.collections.SampleCollection` to load
        **kwargs: optional parameters for
            :meth:`plotly:plotly.graph_objects.Figure.update_layout`
    """

    def __init__(
        self,
        field_or_expr,
        expr=None,
        bins=None,
        range=None,
        xlabel=None,
        log=None,
        color=None,
        opacity=None,
        init_view=None,
        **kwargs,
    ):
        self.field_or_expr = field_or_expr
        self.expr = expr
        self.bins = bins
        self.range = range
        self.xlabel = xlabel
        self.log = log
        self.color = color
        self.opacity = opacity
        self.layout = kwargs

        self._figure = self._make_histogram()

        self._aggregations = [
            foa.HistogramValues(
                field_or_expr, expr=expr, bins=bins, range=range
            )
        ]

        widget = self._make_widget()

        super().__init__(widget, init_view=init_view)

    def _make_widget(self):
        return go.FigureWidget(self._figure)

    def _make_histogram(self):
        if etau.is_str(self.field_or_expr):
            _field = self.field_or_expr.rsplit(".", 1)[-1]
        else:
            _field = "value"

        hover_lines = [
            "<b>count: %{y}</b>",
            "%s: [%%{customdata[0]:.2f}, %%{customdata[1]:.2f}]" % _field,
        ]
        hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

        if self.color is None:
            marker_color = _DEFAULT_MARKER_COLOR
        else:
            marker_color = self.color

        bar = go.Bar(
            offset=0,
            hovertemplate=hovertemplate,
            marker_color=marker_color,
            opacity=self.opacity,
        )

        if self.xlabel is not None:
            xaxis_title = self.xlabel
        elif etau.is_str(self.field_or_expr):
            xaxis_title = self.field_or_expr
        else:
            xaxis_title = None

        layout = _DEFAULT_LAYOUT.copy()

        layout.update(dict(xaxis_title=xaxis_title, yaxis_title="count"))

        if self.log:
            layout.update(dict(yaxis_type="log"))

        layout.update(self.layout)

        figure = go.Figure(bar)
        figure.update_layout(**layout)

        return figure

    def _get_aggregations(self):
        return self._aggregations

    def _get_trace_updates(self, view, agg_results=None):
        if view is not None:
            if agg_results is not None:
                counts, edges, _ = agg_results[0]
            else:
                counts, edges, _ = view.aggregate(self._aggregations[0])

            counts = np.asarray(counts)
            edges = np.asarray(edges)

            x = edges[:-1]
            y = counts
            width = edges[1:] - edges[:-1]
            customdata = np.stack((edges[:-1], edges[1:]), axis=1)
        else:
            x, y, width, customdata = None, None, None, None

        return [dict(x=x, y=y, width=width, customdata=customdata)]

    def _reopen(self):
        self._widget = self._make_widget()
        self._traces = self._widget.data


def _make_composite_widget(plots, shape=None, hgap=None, vgap=None):
    if shape is None:
        num_plots = len(plots)
        rows = int(np.floor(np.sqrt(num_plots)))
        cols = int(np.ceil(num_plots / rows))
    else:
        rows, cols = shape

    figure = ps.make_subplots(
        rows=rows, cols=cols, horizontal_spacing=hgap, vertical_spacing=vgap
    )

    num_traces = []
    for idx, plot in enumerate(plots):
        r, c = np.unravel_index(idx, (rows, cols))
        row = r + 1
        col = c + 1
        traces = plot._widget.data
        num_traces.append(len(traces))
        for trace in traces:
            figure.add_trace(trace, row=row, col=col)

        figure.update_xaxes(plot._widget.layout.xaxis, row=row, col=col)
        figure.update_yaxes(plot._widget.layout.yaxis, row=row, col=col)

    figure.update_layout(showlegend=False)

    return go.FigureWidget(figure)
