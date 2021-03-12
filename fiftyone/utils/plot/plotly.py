"""
Plotly utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import logging
import os

import numpy as np
import plotly.callbacks as pcb
import plotly.graph_objects as pgo

import fiftyone.core.context as foc
import fiftyone.core.utils as fou

from .interactive import InteractivePlot

mpl = fou.lazy_import("matplotlib")


logger = logging.getLogger(__name__)


class PlotlyPlot(InteractivePlot):
    """Interactive plot wrapper for a Plotly figure.

    Args:
        figure: a ``plotly.graph_objects.Figure``
        labels (None): a ``num_points`` array of labels for each point. These
            must correspond to the names of the traces in ``figure``
        points (None): an optional ``num_points x 2`` array of points. If
            provided, selection is manually performed across all visible traces
    """

    def __init__(self, figure, labels=None, points=None):
        if not foc.is_notebook_context():
            raise foc.ContextError(
                "Interactive Plotly plots can only be used in notebooks"
            )

        widget = pgo.FigureWidget(figure)
        traces = widget.data

        if len(traces) > 1:
            if labels is None:
                raise ValueError(
                    "Must provide `labels` for figures with multiple traces"
                )

            trace_maps = self._make_trace_maps(labels)
        else:
            trace_maps = None

        self._widget = widget
        self._traces = traces
        self._labels = labels
        self._trace_maps = trace_maps
        self._select_callback = None

        # For manual point selection calculations
        self._points = points
        self._inds = None

        super().__init__()

    @property
    def has_multiple_traces(self):
        return len(self._traces) > 1

    @staticmethod
    def _make_trace_maps(labels):
        trace_maps = defaultdict(dict)
        counts = defaultdict(int)
        for idx, label in enumerate(labels):
            _count = counts[label]
            trace_maps[label][_count] = idx
            counts[label] = _count + 1

        return dict(trace_maps)

    @property
    def any_selected(self):
        return any(bool(t.selectedpoints) for t in self._traces)

    @property
    def selected_inds(self):
        if self._inds is not None:
            return list(self._inds)

        if not self.has_multiple_traces:
            inds = self._traces[0].selectedpoints
            return list(inds) if inds else []

        inds = []
        for trace in self._traces:
            if trace.selectedpoints:
                tmap = self._trace_maps[trace.name]
                inds.extend([tmap[i] for i in trace.selectedpoints])

        return sorted(inds)

    def _connect(self):
        def _on_click(trace, points, state):
            inds = points.point_inds
            self._select_inds(inds)
            self._onselect()

        def _on_selection(trace, points, selector):
            self._onselect(selector=selector)

        def _on_deselect(trace, points):
            self._onselect()

        for trace in self._traces:
            trace.on_click(_on_click)
            trace.on_selection(_on_selection)
            trace.on_deselect(_on_deselect)

    def _disconnect(self):
        for trace in self._traces:
            trace.on_click(None)
            trace.on_selection(None)
            trace.on_deselect(None)

    def _register_selection_callback(self, callback):
        self._select_callback = callback

    def _select_inds(self, inds):
        if not self.has_multiple_traces:
            # May be None, list, or numpy
            # pylint: disable=len-as-condition
            if inds is not None and len(inds) == 0:
                inds = None

            self._traces[0].update(selectedpoints=inds)
            return

        if inds is None:
            inds = []

        trace_inds = defaultdict(list)
        for idx in inds:
            trace_inds[self._labels[idx]].append(idx)

        for trace in self._traces:
            _trace_inds = trace_inds[trace.name] or None
            trace.update(selectedpoints=_trace_inds)

    def _onselect(self, selector=None):
        # Manually compute points within selector
        if self._points is not None:
            self._manualselect(selector)

        # @todo do something about the fact that this will be triggered for
        # every trace?
        if self._select_callback is not None:
            self._select_callback(self.selected_inds)

    def _manualselect(self, selector):
        if not isinstance(selector, (pcb.LassoSelector, pcb.BoxSelector)):
            return

        # visible can be `{False, True, "legendonly"}`
        visible_classes = set(
            t.name for t in self._traces if t.visible == True
        )

        if not visible_classes:
            self._inds = []
            return

        if isinstance(selector, pcb.LassoSelector):
            vertices = np.stack((selector.xs, selector.ys), axis=1)
        else:
            x1, x2 = selector.xrange
            y1, y2 = selector.yrange
            vertices = np.array([[x1, y1], [x1, y2], [x2, y2], [x2, y1]])

        path = mpl.path.Path(vertices)  # @todo don't use matplotlib here
        inds = np.nonzero(path.contains_points(self._points))[0]

        if self.has_multiple_traces:
            # Only select points in visible traces
            self._inds = [
                i for i in inds if self._labels[i] in visible_classes
            ]
        else:
            self._inds = inds

    def show(self):
        from IPython.display import display

        display(self._widget)


def _patch_perform_plotly_relayout():
    """Attempts to patch an unresolved issue with zooming/panning FigureWidgets
    with Mapbox plots.

    https://github.com/plotly/plotly.py/issues/2570
    """
    filepath = os.path.join(
        os.path.dirname(os.__file__),
        "site-packages",
        "plotly",
        "basedatatypes.py",
    )

    with open(filepath, "r") as f:
        code = f.read()

    find = """
            if not BaseFigure._is_key_path_compatible(key_path_str, self.layout):

                raise ValueError("""

    replace = """
            if not BaseFigure._is_key_path_compatible(key_path_str, self.layout):
                # Patched by FiftyOne: https://github.com/voxel51/fiftyone
                # Issue: https://github.com/plotly/plotly.py/issues/2570
                if key_path_str == "mapbox._derived":
                    return

                raise ValueError("""

    if find in code:
        logger.debug("Patching '%s'", filepath)
        fixed = code.replace(find, replace)
        with open(filepath, "w") as f:
            f.write(fixed)
    elif replace in code:
        logger.debug("Already patched '%s'", filepath)
    else:
        logger.debug("Unable to patch '%s'", filepath)


_patch_perform_plotly_relayout()
