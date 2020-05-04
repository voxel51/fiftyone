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

import eta.core.serial as etas

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


class StateDescription(etas.Serializable):
    """A StateDescription describes the shared state between the FiftyOne GUI
    and the FiftyOne Session.

    Attributes:
        dataset: (optional) the current dataset
        view: (optional) the current view
        pipeline: (optional) the current pipeline (or query)
    """

    def __init__(self, dataset=None, view=None, pipeline=None):
        """Creates a StateDescription instance.

        Args:
            dataset: (optional) the current dataset
            view: (optional) the current view
            pipeline: (optional) the current pipeline (or query)
        """
        self.dataset = dataset
        self.view = view
        self.pipeline = pipeline or []

    @classmethod
    def from_dict(cls, d, **kwargs):
        """Constructs a StateDescription from a JSON dictionary.

        Args:
            d: a JSON dictionary

        Returns:
            a StateDescription
        """
        dataset = d.get("dataset", None)
        if dataset is not None:
            dataset = fod.Dataset(dataset)

        view = d.get("view", None)

        pipeline = d.get("pipeline", None)

        return cls(dataset=dataset, view=view, pipeline=pipeline)


class State(Namespace):
    """Controller for state"""

    state = {
        "dataset_name": None,
        "query": None,
        "view_tag": None,
        "samples": [],
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
        if state["dataset_name"]:
            self.ds = fod.Dataset(state["dataset_name"])
            self.it = query.Query([]).iter_samples(self.ds)
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
        print(_)
        state = self._next()
        samples = state["samples"]
        state.update(self.state)
        state["samples"] = samples
        self.state = state
        return self.state

    def _next(self):
        results = {}
        for i in range(0, 25):
            while True:
                try:
                    qidx, sample = next(self.it)
                    break
                except ValueError:
                    pass
            results[qidx] = sample.serialize()
        return {"samples": results}


socketio.on_namespace(State("/state"))


if __name__ == "__main__":
    socketio.run(app, debug=True)
