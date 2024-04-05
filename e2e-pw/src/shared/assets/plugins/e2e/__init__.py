import fiftyone.operators as foo
import json
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


def register(p):
    p.register(E2ESetView)
