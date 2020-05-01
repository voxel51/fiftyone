"""
FiftyOne Flask server.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

os.environ["FIFTYONE_SERVER"] = "1"  # noqa

from flask import Flask, request, send_file
from flask_socketio import emit, Namespace, SocketIO

import fiftyone.core.dataset as fod
import query

app = Flask(__name__)
app.config["SECRET_KEY"] = "fiftyone"
socketio = SocketIO(app)


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


class State(Namespace):
    """Controller for state"""

    state = {
        "dataset_name": None,
        "query": None,
        "view_tag": None,
    }
    it = None
    ds = None

    def on_connect(self):
        """On connect"""
        pass

    def on_disconnect(self):
        """On disconnect"""
        pass

    def on_update(self, state):
        """On update"""
        if state.get("dataset_name") is not None:
            self.ds = fod.Dataset(state["dataset_name"])
        if state.get("query") is not None:
            self.it = query.Query(state["query"]).iter_samples(self.ds)
            state.update(self._next())
        self.state = state

        emit("update", state, broadcast=True, include_self=False)

    def on_get_current_state(self, _):
        """Get the current state"""
        return self.state

    def on_previous(self, _):
        """Get the previous state using the query iterator"""
        # @todo
        pass

    def on_next(self, _):
        """Get the next state using the query iterator"""
        # @todo
        pass

    def _next(self):
        results = {}
        for i in range(0, 50):
            qidx, sample = next(self.it)
            results[qidx] = sample.serialize()
        return {"samples": results}


socketio.on_namespace(State("/state"))


if __name__ == "__main__":
    socketio.run(app, debug=True)
