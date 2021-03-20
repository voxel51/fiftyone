"""
Plotly-powered view plots.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from operator import itemgetter

import numpy as np

import eta.core.utils as etau

import plotly.subplots as ps
import plotly.graph_objects as go

from .base import ViewPlot
from .plotly import PlotlyWidgetMixin


class PlotlyViewPlot(PlotlyWidgetMixin, ViewPlot):
    """Base class for :class:`ViewPlot` instances with Plotly backends.

    Args:
        widget: a ``plotly.graph_objects.FigureWidget``
    """

    def __init__(self, widget):
        self._traces = widget.data
        PlotlyWidgetMixin.__init__(self, widget)
        ViewPlot.__init__(self)

    def _get_trace_updates(self, view):
        raise NotImplementedError(
            "Subclass must implement _get_trace_updates()"
        )

    def _update_view(self, view):
        updates = self._get_trace_updates(view)
        for trace, update in zip(self._traces, updates):
            trace.update(update)

    def show(self, **kwargs):
        """Shows this plot.

        Args:
            **kwargs: optional parameters for
                ``plotly.graph_objects.Figure.update_layout(**kwargs)``
        """
        super().show(**kwargs)


class ViewGrid(PlotlyViewPlot):
    """A grid of :class:`PlotlyViewPlot` instances.

    Args:
        plots: a :class:`PlotlyViewPlot` or iterable of :class:`PlotlyViewPlot`
            instances
            :class:`fiftyone.core.collections.SampleCollection` to load
        shape (None): the ``(rows, cols)`` shape to use for the grid
        **kwargs: optional parameters for
            ``plotly.graph_objects.Figure.update_layout(**kwargs)``
    """

    def __init__(self, plots, shape=None, **kwargs):
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
        self.layout = kwargs

        widget = self._make_widget()

        super().__init__(widget)

    def _make_widget(self):
        widget = _make_composite_widget(self.plots, shape=self.shape)

        layout = dict(template="ggplot2")
        layout.update(self.layout)

        widget.update_layout(**layout)

        return widget

    def _get_trace_updates(self, view):
        updates = []
        for plot in self.plots:
            updates.extend(plot._get_trace_updates(view))

        return updates

    def _reopen(self):
        self._widget = self._make_widget()
        self._traces = self._widget.data


class CategoricalHistogram(PlotlyViewPlot):
    """A histogram of a categorial field.

    Args:
        field: the name of the field or ``embedded.field.name`` to plot
        expr (None): an optional
            :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            to apply to the field before aggregating
        order ("alphabetical"): the x-axis ordering strategy to use. Can be
            "alphabetical" to sort by field value, or "frequency" to sort in
            descending order of frequency, or a function suitable for
            ``sorted(items, key=order)``, where ``items`` is a list of
            ``(value, count)`` tuples
        xlabel (None): an optional x-label for the plot
        logy (None): whether to set the y-axis to log scale
        bargap (None): relative spacing between bars in ``[0, 1]``
        color (None): a color for the bars. Can be any color supported by
            ``plotly.graph_objects.bar.Marker.color``
        opacity (None): an optional opacity for the bars in ``[0, 1]``
        **kwargs: optional parameters for
            ``plotly.graph_objects.Figure.update_layout(**kwargs)``
    """

    def __init__(
        self,
        field,
        expr=None,
        order="alphabetical",
        xlabel=None,
        logy=None,
        bargap=None,
        color=None,
        opacity=None,
        **kwargs,
    ):
        self.field = field
        self.expr = expr
        self.order = order
        self.xlabel = xlabel
        self.logy = logy
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

        widget = self._make_widget()

        super().__init__(widget)

    def _make_widget(self):
        return go.FigureWidget(self._figure)

    def _make_histogram(self):
        _field = self.field.rsplit(".", 1)[-1]

        hover_lines = [
            "<b>%s: %%{x}</b>" % _field,
            "count: %{y}",
        ]
        hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

        if self.color is None:
            marker_color = "#FF6D04"
        else:
            marker_color = self.color

        bar = go.Bar(
            hovertemplate=hovertemplate,
            marker_color=marker_color,
            opacity=self.opacity,
        )

        if self.xlabel is not None:
            xaxis_title = self.xlabel
        else:
            xaxis_title = self.field

        layout = dict(
            xaxis_title=xaxis_title,
            yaxis_title="count",
            bargap=self.bargap,
            template="ggplot2",
        )

        if self.logy:
            layout["yaxis_type"] = "log"

        layout.update(self.layout)

        figure = go.Figure(bar)
        figure.update_layout(**layout)

        return figure

    def _get_trace_updates(self, view):
        if view is not None:
            counts = view.count_values(self.field, expr=self.expr)
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
        field: the name of the field or ``embedded.field.name`` to plot
        expr (None): an optional
            :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            to apply to the field before aggregating
        bins (None): can be either an integer number of bins to generate or a
            monotonically increasing sequence specifying the bin edges to use.
            By default, 10 bins are created. If ``bins`` is an integer and no
            ``range`` is specified, bin edges are automatically computed from
            the bounds of the field
        range (None): a ``(lower, upper)`` tuple specifying a range in which to
            generate equal-width bins. Only applicable when ``bins`` is an
            integer or ``None``
        xlabel (None): an optional x-label for the plot
        logy (None): whether to set the y-axis to log scale
        color (None): a color for the bars. Can be any color supported by
            ``plotly.graph_objects.bar.Marker.color``
        opacity (None): an optional opacity for the bars in ``[0, 1]``
        **kwargs: optional parameters for
                ``plotly.graph_objects.Figure.update_layout(**kwargs)``
    """

    def __init__(
        self,
        field,
        expr=None,
        bins=None,
        range=None,
        xlabel=None,
        logy=None,
        color=None,
        opacity=None,
        **kwargs,
    ):
        self.field = field
        self.expr = expr
        self.bins = bins
        self.range = range
        self.xlabel = xlabel
        self.logy = logy
        self.color = color
        self.opacity = opacity
        self.layout = kwargs

        self._figure = self._make_histogram()

        widget = self._make_widget()

        super().__init__(widget)

    def _make_widget(self):
        return go.FigureWidget(self._figure)

    def _make_histogram(self):
        _field = self.field.rsplit(".", 1)[-1]

        hover_lines = [
            "<b>count: %{y}</b>",
            "%s: [%%{customdata[0]:.2f}, %%{customdata[1]:.2f}]" % _field,
        ]
        hovertemplate = "<br>".join(hover_lines) + "<extra></extra>"

        if self.color is None:
            marker_color = "#FF6D04"
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
        else:
            xaxis_title = self.field

        layout = dict(
            xaxis_title=xaxis_title, yaxis_title="count", template="ggplot2"
        )

        if self.logy:
            layout["yaxis_type"] = "log"

        layout.update(self.layout)

        figure = go.Figure(bar)
        figure.update_layout(**layout)

        return figure

    def _get_trace_updates(self, view):
        if view is not None:
            counts, edges, _ = view.histogram_values(
                self.field, expr=self.expr, bins=self.bins, range=self.range
            )
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


def _make_composite_widget(plots, shape=None):
    if shape is None:
        num_plots = len(plots)
        rows = int(np.floor(np.sqrt(num_plots)))
        cols = int(np.ceil(num_plots / rows))
    else:
        rows, cols = shape

    figure = ps.make_subplots(rows=rows, cols=cols)

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
