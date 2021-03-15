"""
Plotly utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import itertools
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

    The provided ``figure`` may contain multiple traces.

    All traces must contain IDs in their ``customdata`` attribute that identify
    the points in the traces.

    Args:
        figure: a ``plotly.graph_objects.Figure``
        points (None): an optional ``num_points x 2`` array of points. If
            provided, selection is manually performed across all visible traces
            using these points
        ids (None): an optional ``num_points`` array indicating the IDs of each
            point in ``points``. Only necessary when ``points`` is provided
    """

    def __init__(self, figure, points=None, ids=None):
        if not foc.is_notebook_context():
            raise foc.ContextError(
                "Interactive Plotly plots can only be used in notebooks"
            )

        self._widget = pgo.FigureWidget(figure)
        self._traces = self._widget.data
        self._trace_ids = {}
        self._ids_to_traces = {}
        self._ids_to_inds = {}
        self._select_callback = None
        self._callback_flags = {}
        self._handle = None

        # For manual point selection calculations
        self._points = points
        self._point_ids = ids
        self._trace_inds = None
        self._ids = None

        self._init_traces()
        self._init_callback_flags()

        super().__init__()

    def _init_callback_flags(self):
        self._callback_flags = {t.name: False for t in self._traces}

    def _init_traces(self):
        for idx, trace in enumerate(self._traces):
            if trace.customdata is None or not isinstance(
                trace.customdata, np.ndarray
            ):
                _name = "'%s'" % trace.name if trace.name else str(idx)
                raise ValueError(
                    "Trace %s does not contain IDs in its `customdata` "
                    "attribute" % _name
                )

            trace_ids = trace.customdata
            if trace_ids.ndim > 1:
                trace_ids = trace_ids[:, 0]

            self._trace_ids[idx] = trace_ids

            self._ids_to_traces.update({_id: idx for _id in trace_ids})
            self._ids_to_inds[idx] = {
                _id: idx for idx, _id in enumerate(trace_ids)
            }

        if self._points is not None:
            self._trace_inds = np.zeros(len(self._points), dtype=int)
            for trace_idx, trace in enumerate(self._traces):
                trace_ids = set(self._trace_ids[trace_idx])
                for point_idx, _id in enumerate(self._point_ids):
                    if _id in trace_ids:
                        self._trace_inds[point_idx] = trace_idx

    @property
    def _any_selected(self):
        return any(bool(t.selectedpoints) for t in self._traces)

    @property
    def _selected_ids(self):
        if self._ids is not None:
            return list(self._ids)

        ids = []
        for idx, trace in enumerate(self._traces):
            if trace.selectedpoints:
                ids.append(self._trace_ids[idx][list(trace.selectedpoints)])

        return list(itertools.chain.from_iterable(ids))

    def _register_selection_callback(self, callback):
        self._select_callback = callback

    def _show(self):
        def _on_selection(trace, points, selector):
            self._onselect(trace, selector=selector)

        def _on_deselect(trace, points):
            self._onselect(trace)

        for trace in self._traces:
            trace.on_selection(_on_selection)
            trace.on_deselect(_on_deselect)

        from IPython.display import display

        # Create an empty display that we'll use for `freeze()` later
        # Replacing the widget with an image in the same handle didn't work...
        self._handle = display(display_id=True)
        self._handle.display({"text/plain": ""}, raw=True)

        display(self._widget)

    def _freeze(self):
        from IPython.display import Image

        # kaleido: pip install kaleido
        # orca: npm install -g electron@6.1.4 orca
        width = self._widget.layout.width
        height = self._widget.layout.height
        image_bytes = self._widget.to_image(
            format="png", height=height, width=width
        )

        self._widget.close()
        self._handle.update(Image(image_bytes))

    def _disconnect(self):
        for trace in self._traces:
            trace.on_selection(None)
            trace.on_deselect(None)

    def _select_ids(self, ids):
        if ids is None:
            ids = []

        # Split IDs into traces
        per_trace_ids = defaultdict(list)
        for _id in ids:
            per_trace_ids[self._ids_to_traces[_id]].append(_id)

        for idx, trace in enumerate(self._traces):
            # Convert IDs to point inds
            inds_map = self._ids_to_inds[idx]
            trace_ids = per_trace_ids[idx]
            trace_inds = [inds_map[_id] for _id in trace_ids]
            if not trace_inds:
                trace_inds = None

            # Select points
            trace.update(selectedpoints=trace_inds)

    def _onselect(self, trace, selector=None):
        # Manually compute points within selector
        if self._points is not None:
            self._manualselect(selector)

        if self._select_callback is None:
            return

        self._callback_flags[trace.name] = True

        if not self._ready_for_callback():
            return

        self._init_callback_flags()
        self._select_callback(self.selected_ids)

    def _ready_for_callback(self):
        # We're ready for callback if there is at least one visible trace and
        # all visible traces have fired their selection events
        return (
            sum(
                self._callback_flags[t.name]
                for t in self._traces
                if t.visible == True
            )
            > 0
        )

    def _manualselect(self, selector):
        if not isinstance(selector, (pcb.LassoSelector, pcb.BoxSelector)):
            return

        visible_traces = set(
            idx
            for idx, trace in enumerate(self._traces)
            if trace.visible == True  # can be `{False, True, "legendonly"}`
        )

        if not visible_traces:
            self._ids = np.array([], dtype=self._point_ids.dtype)
            return

        if isinstance(selector, pcb.LassoSelector):
            vertices = np.stack((selector.xs, selector.ys), axis=1)
        else:
            x1, x2 = selector.xrange
            y1, y2 = selector.yrange
            vertices = np.array([[x1, y1], [x1, y2], [x2, y2], [x2, y1]])

        # @todo don't use matplotlib here?
        path = mpl.path.Path(vertices)
        found = path.contains_points(self._points)

        mask = np.array([ind in visible_traces for ind in self._trace_inds])

        self._ids = self._point_ids[found & mask]


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
