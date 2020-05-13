"""
FiftyOne Flask server.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
# pragma pylint: disable=redefined-builtin
# pragma pylint: disable=unused-wildcard-import
# pragma pylint: disable=wildcard-import
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals
from builtins import *

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import logging
import os

from flask import Flask, request, send_file
from flask_socketio import emit, Namespace, SocketIO

os.environ["FIFTYONE_SERVER"] = "1"
import fiftyone.core.state as fos


logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config["SECRET_KEY"] = "fiftyone"

socketio = SocketIO(app, async_mode="eventlet", cors_allowed_origin="*")


@app.route("/")
def get_sample_media():
    """Gets the sample media.

    Returns:
        bytes
    """
    path = request.args.get("path")
    return send_file(path)


def _load_state(func):
    def wrapper(self, *args, **kwargs):
        state = fos.StateDescription.from_dict(self.state)
        state = func(self, state, *args, **kwargs)
        self.state = state.serialize()
        emit("update", self.state, broadcast=True, include_self=False)
        return self.state

    return wrapper


class StateController(Namespace):
    """State controller.

    Attributes:
        state: a :class:`fiftyone.core.state.StateDescription` instance

    Args:
        **args: postional arguments for ``flask_socketio.Namespace``
        **kwargs: keyword arguments for ``flask_socketio.Namespace``
    """

    def __init__(self, *args, **kwargs):
        self.state = fos.StateDescription().serialize()
        super(StateController, self).__init__(*args, **kwargs)

    def on_connect(self):
        """Handles connection to the server."""
        pass

    def on_disconnect(self):
        """Handles disconnection from the server."""
        pass

    def on_update(self, state):
        """Updates the state.

        Args:
            state: a serialized :class:`fiftyone.core.state.StateDescription`
        """
        self.state = state
        emit("update", state, broadcast=True, include_self=False)

    def on_get_current_state(self, _):
        """Gets the current state.

        Returns:
            a :class:`fiftyone.core.state.StateDescription`
        """
        return self.state

    @_load_state
    def on_add_selection(self, state, _id):
        """Adds a sample to the selected samples list.

        Args:
            state: the current :class:`fiftyone.core.state.StateDescription`
            _id: the sample ID

        Returns:
            the updated :class:`fiftyone.core.state.StateDescription`
        """
        selected = set(state.selected)
        selected.add(_id)
        state.selected = list(selected)
        return state

    @_load_state
    def on_remove_selection(self, state, _id):
        """Remove a sample from the selected samples list

        Args:
            state: the current :class:`fiftyone.core.state.StateDescription`
            _id: the sample ID

        Returns:
            the updated :class:`fiftyone.core.state.StateDescription`
        """
        selected = set(state.selected)
        selected.remove(_id)
        state.selected = list(selected)
        return state

    def on_page(self, page, page_length=20):
        """Gets the requested page of samples.

        Args:
            page: the page number
            page_length: the page length

        Returns:
            the list of sample dicts for the page
        """
        state = fos.StateDescription.from_dict(self.state)
        if state.view is not None:
            view = state.view
        elif state.dataset is not None:
            view = state.dataset.default_view()
        else:
            return []

        view = view.skip((page - 1) * page_length).limit(page_length)
        return [s.get_backing_doc_dict(extended=True) for s in view]

    def on_get_label_distributions(self, _):
        """Gets the labels distributions for the current state.

        Args:
            _: the message, which is not used

        Returns:
            the list of label distributions
        """
        state = fos.StateDescription.from_dict(self.state)
        if state.view is not None:
            view = state.view
        elif state.dataset is not None:
            view = state.dataset.default_view()
        else:
            return []

        return view._get_label_distributions()

    def on_get_facets(self, _):
        """Gets the facets for the current state.

        Args:
            _: the message, which is not used

        Returns:
            the list of facets
        """
        state = fos.StateDescription.from_dict(self.state)
        if state.view is not None:
            view = state.view
        elif state.dataset is not None:
            view = state.dataset.default_view()
        else:
            return []

        return view._get_facets()

    def on_set_facets(self, facets):
        """Sets the facets for the current state.

        Args:
            facets: the facets string
        """
        _, value = facets.split(".")
        state = fos.StateDescription.from_dict(self.state)
        state.view = state.dataset.default_view().match_tag(value)
        self.state = state.serialize()
        emit("update", self.state, broadcast=True, include_self=True)


socketio.on_namespace(StateController("/state"))


if __name__ == "__main__":
    socketio.run(app, debug=True)
