"""
Builtin panels.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone.operators.panel import Panel, PanelConfig

import fiftyone.operators.types as types


class PanelOne(Panel):
    @property
    def config(self):
        return PanelConfig(
            name="panel_one",
            label="Panel One",
            icon="looks_one",
        )

    def on_load(self, ctx):
        pass

    def render(self, ctx):
        panel = types.Object()
        return types.Property(
            panel,
            view=types.View(component="CustomViewOne", composite_view=True),
        )
