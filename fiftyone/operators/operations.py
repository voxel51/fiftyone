import json
from bson import json_util


class Operations(object):
    def __init__(self, ctx):
        self._ctx = ctx

    """
    Call the "set_view" operator. This operator sets the view of the FiftyOne App.

    Args:
        view: the :class:`fiftyone.View` to set
    Returns:
        The :class:`fiftyone.operators.message.GeneratedMessage` object
    """

    def set_view(self, view):
        return self._ctx.trigger(
            "set_view",
            params=dict(view=_serialize_view(view)),
        )


def _serialize_view(view):
    return json.loads(json_util.dumps(view._serialize()))
