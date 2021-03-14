"""
Matplotlib utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import numpy as np
from matplotlib.widgets import Button, LassoSelector
from matplotlib.path import Path
import matplotlib.pyplot as plt
from mpl_toolkits.axes_grid1.inset_locator import InsetPosition
import sklearn.metrics.pairwise as skp

from .interactive import InteractivePlot
from .utils import load_button_icon


class MatplotlibPlot(InteractivePlot):
    """Interactive plot wrapper for a matplotlib collection.

    This class enables collection points to be lasso-ed and click selected.

    The currently selected points are given a visually distinctive style, and
    you can modify your selection by either clicking on individual points or
    drawing a lasso around new points.

    When the shift key is pressed, new selections are added to the selected
    set, or subtracted if the new selection is a subset of the current
    selection.

    Args:
        collection: a ``matplotlib.collections.Collection`` to select points
            from
        ids (None): a list of IDs corresponding to the points in ``collection``
        buttons (None): a list of ``(label, icon_image, callback)`` tuples
            defining buttons to add to the plot
        alpha_other (0.25): a transparency value for unselected points
        expand_selected (3.0): expand the size of selected points by this
            multiple
        click_tolerance (0.02): a click distance tolerance in ``[0, 1]`` when
            clicking individual points
    """

    def __init__(
        self,
        collection,
        ids=None,
        buttons=None,
        alpha_other=0.25,
        expand_selected=3.0,
        click_tolerance=0.02,
    ):
        super().__init__()

        self.collection = collection
        self.ax = collection.axes
        self.alpha_other = alpha_other
        self.expand_selected = expand_selected
        self.click_tolerance = click_tolerance

        self._select_callback = None
        self._canvas = self.ax.figure.canvas
        self._xy = collection.get_offsets()
        self._num_pts = len(self._xy)
        self._fc = collection.get_facecolors()
        self._ms = collection.get_sizes()
        self._init_ms = self._ms[0]

        if ids is None:
            ids = np.arange(self._num_pts)

        self._ids = np.asarray(ids)
        self._ids_to_inds = {_id: idx for idx, _id in enumerate(ids)}
        self._inds = np.array([], dtype=int)
        self._canvas.mpl_connect("close_event", lambda e: self._disconnect())
        self._canvas.header_visible = False

        self._lasso = None
        self._shift = False
        self._title = None
        self._user_button_defs = buttons or []
        self._sync_button_def = None
        self._disconnect_button_def = None
        self._buttons = []
        self._figure_events = []
        self._keypress_events = []

    @property
    def _any_selected(self):
        return self._inds.size > 0

    @property
    def _selected_ids(self):
        return list(self._ids[self._inds])

    def _register_selection_callback(self, callback):
        self._select_callback = callback

    def _register_sync_callback(self, callback):
        def _on_sync(event):
            callback()

        sync_icon = load_button_icon("sync")
        self._sync_button_def = ("sync", sync_icon, _on_sync)

    def _register_disconnect_callback(self, callback):
        def _on_disconnect(event):
            callback()

        disconnect_icon = load_button_icon("disconnect")
        self._disconnect_button_def = (
            "disconnect",
            disconnect_icon,
            _on_disconnect,
        )

    def _show(self):
        self._init_hud()
        self._lasso = LassoSelector(self.ax, onselect=self._onselect)

        def _make_callback(button, callback):
            def _callback(event):
                # Change to non-hover color to convey that something happened
                # https://stackoverflow.com/a/28079210
                button.ax.set_facecolor(button.color)
                self.draw()
                callback(event)

            return _callback

        for button, callback in self._buttons:
            _callback = _make_callback(button, callback)
            button.on_clicked(_callback)

        self._title.set_text("Click or drag to select points")
        self._figure_events = [
            self._canvas.mpl_connect("figure_enter_event", self._onenter),
            self._canvas.mpl_connect("figure_leave_event", self._onexit),
        ]
        self._keypress_events = [
            self._canvas.mpl_connect("key_press_event", self._onkeypress),
            self._canvas.mpl_connect("key_release_event", self._onkeyrelease),
        ]

        self._update_hud(False)
        plt.show(block=False)

    def _draw(self):
        self._canvas.draw_idle()

    def _freeze(self):
        # Disconnect first so that HUD is not visible
        self.disconnect()

        # Turn interactive plot into a static one
        # https://github.com/matplotlib/matplotlib/issues/6071
        plt.close(self.ax.figure)

    def _disconnect(self):
        if not self.is_connected:
            return

        self._lasso.disconnect_events()
        self._lasso = None

        for button, _ in self._buttons:
            button.ax.remove()

        self._buttons = []

        for cid in self._figure_events:
            self._canvas.mpl_disconnect(cid)

        for cid in self._keypress_events:
            self._canvas.mpl_disconnect(cid)

        self._shift = False
        self._figure_events = []
        self._keypress_events = []
        self._update_hud(False)

    def _init_hud(self):
        # Button styling
        gap = 0.02
        size = 0.06
        color = "#DBEBFC"
        hovercolor = "#499CEF"

        self._title = self.ax.set_title("")

        button_defs = list(self._user_button_defs)
        if self._sync_button_def is not None:
            button_defs.append(self._sync_button_def)

        if self._disconnect_button_def is not None:
            button_defs.append(self._disconnect_button_def)

        num_buttons = len(button_defs)

        def _button_pos(i):
            # top of right-side
            # return [1 + gap, 1 - (i + 1) * size - i * gap, size, size]

            # right-side of top
            i = num_buttons - 1 - i
            return [1 - (i + 1) * size - i * gap, 1 + gap, size, size]

        self._buttons = []
        for i, (label, icon_img, callback) in enumerate(button_defs):
            bax = self.ax.figure.add_axes([0, 0, 1, 1], label=label)
            bax.set_axes_locator(InsetPosition(self.ax, _button_pos(i)))
            button = Button(
                bax, "", color=color, hovercolor=hovercolor, image=icon_img
            )
            self._buttons.append((button, callback))

    def _update_hud(self, visible):
        self._title.set_visible(visible)
        for button, _ in self._buttons:
            button.ax.set_visible(visible)

    def _onenter(self, event):
        self._update_hud(True)
        self.draw()

    def _onexit(self, event):
        self._update_hud(False)
        self.draw()

    def _onkeypress(self, event):
        if event.key == "shift":
            self._shift = True
            self._title.set_text("Click or drag to add/remove points")
            self.draw()

    def _onkeyrelease(self, event):
        if event.key == "shift":
            self._shift = False
            self._title.set_text("Click or drag to select points")
            self.draw()

    def _onselect(self, vertices):
        x1, x2 = self.ax.get_xlim()
        y1, y2 = self.ax.get_ylim()
        click_thresh = self.click_tolerance * min(abs(x2 - x1), abs(y2 - y1))

        is_click = np.abs(np.diff(vertices, axis=0)).sum() < click_thresh

        if is_click:
            dists = skp.euclidean_distances(self._xy, np.array([vertices[0]]))
            click_ind = np.argmin(dists)
            if dists[click_ind] < click_thresh:
                inds = [click_ind]
            else:
                inds = []

            inds = np.array(inds, dtype=int)
        else:
            path = Path(vertices)
            inds = np.nonzero(path.contains_points(self._xy))[0]

        if self._shift:
            new_inds = set(inds)
            inds = set(self._inds)
            if new_inds.issubset(inds):
                # The new selection is a subset of the current selection, so
                # remove the selection
                inds.difference_update(new_inds)
            else:
                # The new selection contains new points, so add them
                inds.update(new_inds)

            inds = np.array(sorted(inds), dtype=int)
        else:
            inds = np.unique(inds)

        if inds.size == self._inds.size and np.all(inds == self._inds):
            self.draw()
            return

        self._select_inds(inds)

    def _select_ids(self, ids):
        if ids is not None:
            inds = [self._ids_to_inds[_id] for _id in ids]
        else:
            inds = None

        self._select_inds(inds)

    def _select_inds(self, inds):
        if inds is None:
            inds = []

        self._inds = np.asarray(inds, dtype=int)
        self._update_plot()

        if self._select_callback is not None:
            self._select_callback(self.selected_ids)

    def _update_plot(self):
        self._prep_collection()

        inds = self._inds
        if inds.size == 0:
            self._fc[:, -1] = 1
        else:
            self._fc[:, -1] = self.alpha_other
            self._fc[inds, -1] = 1

        self.collection.set_facecolors(self._fc)

        if self.expand_selected is not None:
            self._ms[:] = self._init_ms
            self._ms[inds] = self.expand_selected * self._init_ms

        self.collection.set_sizes(self._ms)

    def _prep_collection(self):
        # @todo why is this necessary? We do this JIT here because it seems
        # that when __init__() runs, `get_facecolors()` doesn't have all the
        # data yet...
        if len(self._fc) < self._num_pts:
            self._fc = self.collection.get_facecolors()

        if len(self._fc) < self._num_pts:
            self._fc = np.tile(self._fc[0], (self._num_pts, 1))

        if self.expand_selected is not None:
            if len(self._ms) < self._num_pts:
                self._ms = np.tile(self._ms[0], self._num_pts)
