import fiftyone.operators as foo
import fiftyone.operators.types as types
import json
import asyncio
from bson import json_util


def serialize_view(view):
    return json.loads(json_util.dumps(view._serialize()))


class E2ESetView(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="e2e_set_view",
            label="E2E: Set view",
        )

    def execute(self, ctx):
        view = ctx.dataset.limit(3)
        ctx.trigger("set_view", {"view": serialize_view(view)})
        return {}


class E2ESayHelloInModal(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="e2e_say_hello_in_modal",
            label="E2E: Say hello in modal",
        )

    def resolve_input(self, ctx):
        inputs = types.Object()
        inputs.str("name", label="Name")
        return types.Property(inputs)

    def execute(self, ctx):
        name = ctx.params.get("name", "Anonymous")
        return {"message": f"Hi {name}!"}

    def resolve_output(self, ctx):
        outputs = types.Object()
        outputs.str("message", label="Message")
        return types.Property(outputs)


class E2ESayHelloInDrawer(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="e2e_say_hello_in_drawer",
            label="E2E: Say hello in drawer",
        )

    def resolve_input(self, ctx):
        inputs = types.Object()
        inputs.str("name", label="Name")
        return types.Property(inputs, view=types.DrawerView(placement="left"))

    def execute(self, ctx):
        name = ctx.params.get("name", "Anonymous")
        return {"message": f"Hi {name}!"}

    def resolve_output(self, ctx):
        outputs = types.Object()
        outputs.str("message", label="Message")
        return types.Property(outputs)


class E2EProgress(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="e2e_progress",
            label="E2E: Progress",
            execute_as_generator=True,
        )

    async def execute(self, ctx):
        MAX = 2
        for i in range(MAX + 1):
            progress_label = f"Loading {i} of {MAX}"
            progress_view = types.ProgressView(label=progress_label)
            loading_schema = types.Object()
            loading_schema.int("percent_complete", view=progress_view)
            show_output_params = {
                "outputs": types.Property(loading_schema).to_json(),
                "results": {"percent_complete": i / MAX},
            }
            yield ctx.trigger("show_output", show_output_params)
            # simulate computation
            await asyncio.sleep(0.5)


def register(p):
    p.register(E2ESetView)
    p.register(E2ESayHelloInModal)
    p.register(E2ESayHelloInDrawer)
    p.register(E2EProgress)
