"""
FiftyOne Flask server.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging

from flask import Flask, request, send_file
from flask_socketio import emit, Namespace, SocketIO

import fiftyone.core.state as fos

logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config["SECRET_KEY"] = "fiftyone"
socketio = SocketIO(app, async_mode="eventlet", cors_allowed_origin="*")


@app.route("/")
def get_sample_media():
    """
    Get the sample media

    Returns:
        bytes
    """
    path = request.args.get("path")
    mime_type = request.args.get("mime_type")
    return send_file(path, mimetype=mime_type)


class StateController(Namespace):
    """Controller for state

    Attributes:
        state: a StateDescription instance
    """

    def __init__(self, *args, **kwargs):
        """Creates a StateController instance.

        Args:
            *args: args tuple or list
            **kwargs: kwargs dictionary
        """
        self.state = fos.StateDescription().serialize()
        super(StateController, self).__init__(*args, **kwargs)

    def on_connect(self):
        """On connect"""
        pass

    def on_disconnect(self):
        """On disconnect"""
        pass

    def on_update(self, state):
        """Update the StateDescription

        Args:
            state: a serialized StateDescription
        """
        self.state = state
        print(state)
        emit("update", state, broadcast=True, include_self=False)

    def on_get_current_state(self, _):
        """Get the current state"""
        return self.state

    def on_page(self, page, page_length=20):
        """Get the next state using the query iterator"""
        print(page)
        state = fos.StateDescription.from_dict(self.state)
        if state.view is not None:
            view = state.view
        elif state.dataset is not None:
            view = state.dataset.default_view()
        else:
            return []
        view = view.offset((page - 1) * page_length).limit(page_length)
        res = [s.serialize() for s in view.iter_samples()]
        return res


socketio.on_namespace(StateController("/state"))


if __name__ == "__main__":
    socketio.run(app, debug=True)
