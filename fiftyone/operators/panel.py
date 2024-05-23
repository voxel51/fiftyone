"""
FiftyOne operators.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone.operators.types as types
from fiftyone.operators.operator import OperatorConfig, Operator

import pydash


class PanelOperatorConfig(OperatorConfig):
    """A configuration for a panel operator."""

    def __init__(
        self,
        name,
        label,
        icon=None,
        dark_icon=None,
        light_icon=None,
        allow_multiple=False,
        **kwargs
    ):
        super().__init__(name)
        self.name = name
        self.label = label
        self.icon = icon
        self.dark_icon = dark_icon
        self.light_icon = light_icon
        self.allow_multiple = allow_multiple
        self.unlisted = True
        self.on_startup = True
        self.kwargs = kwargs  # unused, placeholder for future extensibility

    def to_json(self):
        d = super().to_json()
        return {
            **d,
            "name": self.name,
            "label": self.label,
            "icon": self.icon,
            "dark_icon": self.dark_icon,
            "light_icon": self.light_icon,
            "allow_multiple": self.allow_multiple,
        }


class Panel(Operator):
    """A panel operator."""

    def render(self, ctx):
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
            "icon": self.config.icon,
            "dark_icon": self.config.dark_icon,
            "light_icon": self.config.light_icon,
        }
        methods = ["on_load", "on_unload", "on_change"]
        ctx_change_events = [
            "on_change_ctx",
            "on_change_view",
            "on_change_dataset",
            "on_change_current_sample",
            "on_change_selected",
            "on_change_selected_labels",
            "on_change_extended_selection",
        ]
        for method in methods + ctx_change_events:
            if hasattr(self, method) and callable(getattr(self, method)):
                panel_config[method] = self.method_to_uri(method)

        ctx.ops.register_panel(**panel_config)

    def execute(self, ctx):
        panel_id = ctx.params.get("panel_id", None)
        method_name = ctx.params.get("__method__", None)
        state = ctx.params.get("state", {})
        event_args = ctx.params.get("event_args", {})
        if method_name is None or method_name == "on_startup":
            return self.on_startup(ctx)

        # trigger the event
        method = getattr(self, method_name)
        ctx.event_args = event_args
        method(ctx)

        # render
        panel_output = self.render(ctx)
        ctx.ops.show_panel_output(panel_output)


class WriteOnlyError(Exception):
    """Error raised when trying to read a write-only property."""


class PanelRefBase:
    """
    Base class for panel state and data.

    Attributes:
        _data (dict): A dictionary to store the data or state.
        _ctx: The context object containing the operations.
    """

    def __init__(self, ctx):
        self._data = {}
        self._ctx = ctx

    def set(self, key, value):
        """
        Sets the value in the dictionary.

        Args:
            key (str): The key.
            value (any): The value.
        """
        pydash.set_(self._data, key, value)

    def get(self, key, default=None):
        """
        Gets the value from the dictionary.

        Args:
            key (str): The key.
            default (any): The default value if key is not found.

        Returns:
            The value.
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
    """
    Class representing the state of a panel.
    """

    def __init__(self, ctx):
        super().__init__(ctx)
        self._data = ctx.panel_state

    def set(self, key, value):
        """
        Sets the state of the panel.

        Args:
            key (str): A dot delimited path.
            value (any): The state value.
        """
        super().set(key, value)
        args = {}
        pydash.set_(args, key, value)
        self._ctx.ops.patch_panel_state(args)

    def clear(self):
        """Clears the panel state."""
        super().clear()
        self._ctx.ops.clear_panel_state()


class PanelRefData(PanelRefBase):
    """
    Class representing the data of a panel.
    """

    def set(self, key, value):
        """
        Sets the data of the panel.

        Args:
            key (str): The data key.
            value (any): The data value.
        """
        super().set(key, value)
        args = {}
        pydash.set_(args, key, value)
        self._ctx.ops.patch_panel_data(args)

    def get(self, key, default=None):
        raise WriteOnlyError("Panel data is write-only")

    def clear(self):
        """Clears the panel data."""
        super().clear()
        self._ctx.ops.clear_panel_data()


class PanelRef:
    """
    Represents a panel in the app.
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
        self._ctx.ops.close_panel()

    def set_state(self, key, value):
        """
        Sets the state of the panel.

        Args:
            key (str): A dot delimited path.
            value (any): The state value.
        """
        self._state.set(key, value)

    def get_state(self, key, default=None):
        """
        Gets the state of the panel.

        Args:
            key (str): A dot delimited path.
            default (any): The default value if key is not found.

        Returns:
            The state value.
        """
        return self._state.get(key, default)

    def set_data(self, key, value):
        """
        Sets the data of the panel.

        Args:
            key (str): The data key.
            value (any): The data value.
        """
        self._data.set(key, value)
