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
import fiftyone.core.fields as fof
import fiftyone.core.state as fos

from fiftyone.server.utils import tile
from pipelines import DISTRIBUTION_PIPELINES, LABELS, SCALARS

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
        self._remainder = 0
        self._prev_start_index = None
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
        self._remainder = 0
        self._remainder_start_index = None
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

    def on_page(self, indexes):
        """Gets the requested page of samples.

        Args:
            page: the page number
            page_length: the page length

        Returns:
            the list of sample dicts for the page
        """
        start_index = indexes["startIndex"]
        stop_index = indexes["stopIndex"]
        batch_size = stop_index - start_index + 1
        print(batch_size)

        if start_index != 0:
            while self._prev_start_index != start_index - batch_size:
                continue

        state = fos.StateDescription.from_dict(self.state)
        if state.view is not None:
            view = state.view
        elif state.dataset is not None:
            view = state.dataset.view()
        else:
            return []
        view = view.skip(start_index - self._remainder).limit(batch_size)
        results, remainder = tile(view, self._remainder)
        self._remainder = remainder
        return results

    def on_lengths(self, _):
        state = fos.StateDescription.from_dict(self.state)
        if state.view is not None:
            view = state.view
        elif state.dataset is not None:
            view = state.dataset.view()
        else:
            return {"total": 0, "labels": [], "tags": []}

        labels = view.get_label_fields()
        for idx, l in enumerate(labels):
            l["color"] = idx

        num_labels = len(labels)
        tags = view.get_tags()
        for idx, t in enumerate(tags):
            tags[idx] = {"name": t, "color": num_labels + idx}

        return {"labels": labels, "tags": tags}

    def on_get_distributions(self, group):
        """Gets the distributions for the current state with respect to a group,

        Args:
            group: one of "labels", "tags", or "scalars"

        Returns:
            a list of distributions
        """
        state = fos.StateDescription.from_dict(self.state)
        if state.view is not None:
            view = state.view
        elif state.dataset is not None:
            view = state.dataset.view()
        else:
            return []

        return _get_distributions(view, group)


def _get_distributions(view, group):
    pipeline = DISTRIBUTION_PIPELINES[group]

    # we add a sub-pipeline for each numeric as it looks like multiple
    # buckets in a single pipeline is not supported
    if group == SCALARS:
        _numeric_distribution_pipelines(view, pipeline)

    result = list(view.aggregate(pipeline))

    if group in {LABELS, SCALARS}:
        new_result = []
        for f in result[0].values():
            new_result += f
        result = new_result

    if group != SCALARS:
        for idx, dist in enumerate(result):
            result[idx]["data"] = sorted(
                result[idx]["data"], key=lambda c: c["count"], reverse=True
            )

    return sorted(result, key=lambda d: d["name"])


def _numeric_bounds(view, numerics):
    bounds_pipeline = [{"$facet": {}}]
    for idx, (k, v) in enumerate(numerics.items()):
        bounds_pipeline[0]["$facet"]["numeric-%d" % idx] = [
            {
                "$group": {
                    "_id": k,
                    "min": {"$min": "$%s" % k},
                    "max": {"$max": "$%s" % k},
                },
            }
        ]

    return list(view.aggregate(bounds_pipeline))[0] if len(numerics) else {}


def _numeric_distribution_pipelines(view, pipeline, buckets=50):
    numerics = view._dataset.get_field_schema(ftype=fof.IntField)
    numerics.update(view._dataset.get_field_schema(ftype=fof.FloatField))

    # here we query the min and max for each numeric field
    # unfortunately, it looks like this has to be a separate query
    bounds = _numeric_bounds(view, numerics)

    # for each numeric field, build the boundaries array with the
    # min/max results when adding the field's sub-pipeline
    for idx, (k, v) in enumerate(numerics.items()):
        sub_pipeline = "numeric-%d" % idx
        field_bounds = bounds[sub_pipeline][0]
        mn = field_bounds["min"]
        mx = field_bounds["max"]
        step = (mx - mn) / buckets
        boundaries = [mn + step * s for s in range(0, buckets)]

        pipeline[0]["$facet"][sub_pipeline] = [
            {
                "$bucket": {
                    "groupBy": "$%s" % k,
                    "boundaries": boundaries,
                    "default": "null",
                    "output": {"count": {"$sum": 1}},
                }
            },
            {
                "$group": {
                    "_id": k,
                    "data": {
                        "$push": {
                            "key": {
                                "$cond": [
                                    {"$ne": ["$_id", "null"]},
                                    {"$add": ["$_id", step / 2]},
                                    "null",
                                ]
                            },
                            "count": "$count",
                        }
                    },
                }
            },
            {
                "$project": {
                    "name": k,
                    "type": v.__class__.__name__[
                        : -len("Field")  # grab field type from the class
                    ].lower(),
                    "data": "$data",
                }
            },
        ]


socketio.on_namespace(StateController("/state"))


if __name__ == "__main__":
    socketio.run(app, debug=True)
