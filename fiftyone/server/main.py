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


def load_state(func):
    """Load state descorator.

    Args:
        func: the StateController method to decorate

    Returns:
        the wrapped function
    """

    def wrapper(self, *args, **kwargs):
        state = fos.StateDescription.from_dict(self.state)
        state = func(self, state, *args, **kwargs)
        self.state = state.serialize()
        emit("update", self.state, broadcast=True, include_self=False)
        return self.state

    return wrapper


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
        print(state)
        self.state = state
        emit("update", state, broadcast=True, include_self=False)

    def on_get_current_state(self, _):
        """Get the current state"""
        return self.state

    @load_state
    def on_add_selection(self, state, _id):
        """Add a sample to the selected samples list

        Args:
            state: the current StateDescription
            _id: the sample id

        Returns:
            the updated StateDescription
        """
        selected = set(state.selected)
        selected.add(_id)
        state.selected = list(selected)
        return state

    @load_state
    def on_remove_selection(self, state, _id):
        """Remove a sample from the selected samples list

        Args:
            state: the current StateDescription
            _id: the sample id

        Returns:
            the updated StateDescription
        """
        selected = set(state.selected)
        selected.remove(_id)
        state.selected = list(selected)
        return state

    def on_page(self, page, page_length=20):
        """Get the next state using the query iterator"""
        state = fos.StateDescription.from_dict(self.state)
        if state.view is not None:
            view = state.view
        elif state.dataset is not None:
            view = state.dataset.default_view()
        else:
            return []
        view = view.offset((page - 1) * page_length).take(page_length)
        res = [
            s.get_backing_doc_dict(extended=True) for s in view.iter_samples()
        ]
        return res

    def on_get_label_distributions(self, _):
        state = fos.StateDescription.from_dict(self.state)
        if state.view is not None:
            view = state.view
        elif state.dataset is not None:
            view = state.dataset.default_view()
        else:
            return []
        return view._label_distributions()

    def on_get_facets(self, _):
        state = fos.StateDescription.from_dict(self.state)
        if state.view is not None:
            view = state.view
        elif state.dataset is not None:
            view = state.dataset.default_view()
        else:
            return []
        return view._facets()

    def on_set_facets(self, facet):
        name, value = facet.split(".")
        state = fos.StateDescription.from_dict(self.state)
        if state.view is not None:
            view = state.view
        elif state.dataset is not None:
            view = state.dataset.default_view()
        else:
            raise ValueError("No view")
        state.view = state.dataset.default_view().filter(tag=value)
        self.state = state.serialize()
        emit("update", self.state, broadcast=True, include_self=True)


socketio.on_namespace(StateController("/state"))


if __name__ == "__main__":
    socketio.run(app, debug=True)
