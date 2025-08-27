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
        ctx.panel.set_state("counts.first", 0)
        ctx.panel.set_data("counts.second", 0)

    def increment(self, ctx):
        count = ctx.panel.get_state("counts.first")
        ctx.panel.set_state("counts.first", count + 1)

    def decrement(self, ctx):
        count = ctx.panel.get_state("counts.first")
        ctx.panel.set_state("counts.first", count - 1)

    def set_count(self, ctx):
        count = ctx.params.get("count", None)
        ctx.panel.set_data("counts.second", count)

    def load_run_manual(self, ctx):
        return {"run_data": {"name": "My Run One"}}

    def load_run_recoil(self, ctx):
        ctx.trigger(
            "@voxel51/operators/set_panel_one_state",
            params={"run_data": {"name": "My Run One"}},
        )

    def set_samples_count(self, ctx):
        params = {"count": ctx.view.count()}
        ctx.panel.trigger("set_samples_count", params)

    def render(self, ctx):
        panel = types.Object()
        return types.Property(
            panel,
            view=types.View(
                component="CustomViewOne",
                composite_view=True,
                increment=self.increment,
                decrement=self.decrement,
                set_count=self.set_count,
                load_run_manual=self.load_run_manual,
                load_run_recoil=self.load_run_recoil,
                set_samples_count=self.set_samples_count,
            ),
        )


#  to aceces it panel event
# to sync with fuftyone session
