"""
FiftyOne operators.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone.operators.types as types
from fiftyone.operators.operator import OperatorConfig, Operator


class PanelOperatorConfig(OperatorConfig):
    """A configuration for a panel operator."""

    def __init__(self, name, label, icon=None, allow_multiple=False, **kwargs):
        super().__init__(name)
        self.name = name
        self.label = label
        self.icon = icon
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
        }
        methods = ["on_load", "on_unload", "on_change"]
        ctx_change_events = [
            "on_change_view",
            "on_change_dataset",
            "on_change_current_sample",
            "on_change_selected",
            "on_change_selected_labels",
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


class PanelRefState:
    def __init__(self, ctx):
        self._data = ctx.panel_state
        self._ctx = ctx

    def __setattr__(self, key, value):
        if key.startswith("_"):
            super().__setattr__(key, value)
        else:
            self._data[key] = value
            self._ctx.ops.set_panel_state({key: value})

    def __getattr__(self, key):
        return self._data.get(key, None)

    def clear(self):
        self._data = {}
        self._ctx.ops.clear_panel_state()


class PanelRefData:
    def __init__(self, ctx):
        self._data = {}
        self._ctx = ctx

    def __setattr__(self, key, value):
        if key.startswith("_"):
            super().__setattr__(key, value)
        else:
            self._data[key] = value
            self._ctx.ops.patch_panel_data({key: value})

    def __getattr__(self, key):
        raise KeyError("Cannot read panel data")

    def clear(self):
        self._data = {}
        self._ctx.ops.clear_panel_data()


class PanelRef:
    def __init__(self, ctx):
        self._ctx = ctx
        self._state = PanelRefState(ctx)
        self._data = PanelRefData(ctx)

    @property
    def data(self):
        return self._data

    @property
    def state(self):
        return self._state

    @property
    def id(self):
        return self._ctx.panel_id

    def close(self):
        self._ctx.ops.close_panel()
