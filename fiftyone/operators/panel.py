"""
FiftyOne panels.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import pydash

import fiftyone.operators.types as types
from fiftyone.operators.operator import OperatorConfig, Operator
from typing_extensions import Literal

PANEL_SURFACE = Literal["grid", "modal", "grid modal"]


class PanelConfig(OperatorConfig):
    """Configuration for a panel.

    Args:
        name: the name of the panel
        label: the display name for the panel
        icon (None): the icon to show in the panel's tab
        light_icon (None): the icon to show in the panel's tab when the App is
            in light mode
        dark_icon (None): the icon to show in the panel's tab when the App is
            in dark mode
        allow_multiple (False): whether to allow multiple instances of the
            panel to be opened
        surfaces ("grid"): the surfaces on which the panel can be displayed
        help_markdown (None): a markdown string to display in the panel's help
            tooltip
        category (Category): the category id of the panel
        priority (None): the priority of the panel for sorting in the UI
    """

    def __init__(
        self,
        name,
        label,
        help_markdown=None,
        beta=False,
        is_new=False,
        category=None,
        icon=None,
        light_icon=None,
        dark_icon=None,
        allow_multiple=False,
        surfaces: PANEL_SURFACE = "grid",
        priority=None,
        **kwargs
    ):
        super().__init__(name)
        self.name = name
        self.label = label
        self.help_markdown = help_markdown
        self.icon = icon
        self.light_icon = light_icon
        self.dark_icon = dark_icon
        self.allow_multiple = allow_multiple
        self.unlisted = True
        self.on_startup = True
        self.surfaces = surfaces
        self.category = category
        self.beta = beta
        self.is_new = is_new
        self.priority = priority
        self.kwargs = kwargs  # unused, placeholder for future extensibility

    def to_json(self):
        return {
            "name": self.name,
            "label": self.label,
            "help_markdown": self.help_markdown,
            "category": str(self.category) if self.category else None,
            "beta": self.beta,
            "is_new": self.is_new,
            "icon": self.icon,
            "light_icon": self.light_icon,
            "dark_icon": self.dark_icon,
            "allow_multiple": self.allow_multiple,
            "on_startup": self.on_startup,
            "unlisted": self.unlisted,
            "surfaces": self.surfaces,
            "priority": self.priority,
        }


class Panel(Operator):
    """A panel."""

    def render(self, ctx):
        """Defines the panel's layout and events.

        This method is called after every panel event is called (on load,
        button callback, context change event, etc).

        Args:
            ctx: the :class:`fiftyone.operators.executor.ExecutionContext`

        Returns:
            a :class:`fiftyone.operators.types.Property`
        """
        raise NotImplementedError("Subclasses must implement render()")

    def resolve_input(self, ctx):
        inputs = types.Object()
        inputs.obj("state", default={})
        inputs.obj("event_args", default={})
        inputs.str("__method__")
        inputs.str("panel_id")
        return types.Property(inputs)

    def on_startup(self, ctx):
        panel_config = {
            "name": self.config.name,
            "label": self.config.label,
            "allow_duplicates": self.config.allow_multiple,
            "help_markdown": self.config.help_markdown,
            "icon": self.config.icon,
            "dark_icon": self.config.dark_icon,
            "light_icon": self.config.light_icon,
            "surfaces": self.config.surfaces,
            "category": self.config.category,
            "beta": self.config.beta,
            "is_new": self.config.is_new,
            "priority": self.config.priority,
            "_builtin": self._builtin,
        }
        methods = ["on_load", "on_unload", "on_change"]
        ctx_change_events = [
            "on_change_ctx",
            "on_change_dataset",
            "on_change_view",
            "on_change_spaces",
            "on_change_current_sample",
            "on_change_selected",
            "on_change_selected_labels",
            "on_change_extended_selection",
            "on_change_group_slice",
            "on_change_query_performance",
        ]
        for method in methods + ctx_change_events:
            if hasattr(self, method) and callable(getattr(self, method)):
                panel_config[method] = self.method_to_uri(method)

        ctx.ops.register_panel(**panel_config)

    def on_load(self, ctx):
        pass

    def execute(self, ctx):
        panel_id = ctx.params.get("panel_id", None)
        method_name = ctx.params.get("__method__", None)
        state = ctx.params.get("state", {})
        event_args = ctx.params.get("event_args", {})
        if method_name is None or method_name == "on_startup":
            return self.on_startup(ctx)

        # trigger the event
        if hasattr(self, method_name):
            method = getattr(self, method_name)
            ctx.event_args = event_args
            method(ctx)

        # render
        panel_output = self.render(ctx)
        ctx.ops.show_panel_output(panel_output)


class WriteOnlyError(Exception):
    """Error raised when trying to read a write-only property."""


class PanelRefBase(object):
    """Base class for panel state and data.

    Args:
        ctx: an :class:`fiftyone.operators.executor.ExecutionContext`
    """

    def __init__(self, ctx):
        self._data = {}
        self._ctx = ctx

    def set(self, key, value=None):
        """Sets some value(s) in the dictionary.

        Args:
            key: a key, ``"nested.key.path"``, or dict mapping multiple
                possibly-nested keys to values
            value (None): the value, if key is a string
        """
        d = key if isinstance(key, dict) else {key: value}

        for k, v in d.items():
            pydash.set_(self._data, k, v)

    def get(self, key, default=None):
        """Gets a value from the dictionary.

        Args:
            key: a key or ``"nested.key.path"``
            default (None): a default value if the key is not found

        Returns:
            the value
        """
        return pydash.get(self._data, key, default)

    def clear(self):
        """Clears the dictionary."""
        self._data = {}

    def __setattr__(self, key, value):
        if key.startswith("_"):
            super().__setattr__(key, value)
        else:
            self.set(key, value)

    def __getattr__(self, key):
        if key == "_data":
            return self._data
        elif key == "_ctx":
            return self._ctx
        else:
            return self.get(key)


class PanelRefState(PanelRefBase):
    """Class representing the state of a panel.

    Args:
        ctx: an :class:`fiftyone.operators.executor.ExecutionContext`
    """

    def __init__(self, ctx):
        super().__init__(ctx)
        self._data = ctx.panel_state

    def set(self, key, value=None):
        """Sets some panel state.

        Args:
            key: a key, ``"nested.key.path"``, or dict mapping multiple
                possibly-nested keys to values
            value (None): the value, if key is a string
        """
        d = key if isinstance(key, dict) else {key: value}
        super().set(d)
        self._ctx.ops.patch_panel_state(d)

    def clear(self):
        """Clears the panel state."""
        super().clear()
        self._ctx.ops.clear_panel_state()

    def apply(self, path):
        """
        Applies the state to the panel.

        Args:
            path (str): The path to the state.
        """
        self._ctx.ops.apply_panel_state_path(path)


class PanelRefData(PanelRefBase):
    """Class representing the data of a panel.

    Args:
        ctx: an :class:`fiftyone.operators.executor.ExecutionContext`
    """

    def set(self, key, value=None):
        """Sets some panel data.

        Args:
            key: a key, ``"nested.key.path"``, or dict mapping multiple
                possibly-nested keys to values
            value (None): the value, if key is a string
        """
        d = key if isinstance(key, dict) else {key: value}
        super().set(d)
        self._ctx.ops.patch_panel_data(d)

    def get(self, key, default=None):
        raise WriteOnlyError("Panel data is write-only")

    def clear(self):
        """Clears the panel data."""
        super().clear()
        self._ctx.ops.clear_panel_data()


class PanelRef(object):
    """Class representing a panel.

    Args:
        ctx: an :class:`fiftyone.operators.executor.ExecutionContext`
    """

    def __init__(self, ctx):
        self._ctx = ctx
        self._state = PanelRefState(ctx)
        self._data = PanelRefData(ctx)

    @property
    def data(self):
        """Panel data."""
        return self._data

    @property
    def state(self):
        """Panel state."""
        return self._state

    @property
    def id(self):
        """Panel ID."""
        return self._ctx.panel_id

    def close(self):
        """Closes the panel."""
        self._ctx.ops.close_panel(id=self.id)

    def set_state(self, key, value=None):
        """Sets some panel state.

        Args:
            key: a key, ``"nested.key.path"``, or dict mapping multiple
                possibly-nested keys to values
            value (None): the value, if key is a string
        """
        self._state.set(key, value=value)

    def get_state(self, key, default=None):
        """Gets some panel state.

        Args:
            key: the key or ``"nested.key.path"``
            default (None): a default value if the key is not found

        Returns:
            the state value
        """
        return self._state.get(key, default=default)

    def set_data(self, key, value=None):
        """Sets some panel data.

        Args:
            key: a key, ``"nested.key.path"``, or dict mapping multiple
                possibly-nested keys to values
            value (None): the value, if key is a string
        """
        self._data.set(key, value=value)

    def set_title(self, title):
        """Sets the title of the panel.

        Args:
            title: a title string
        """
        if title is None:
            raise ValueError("title cannot be None")
        self._ctx.ops.set_panel_title(id=self.id, title=title)
