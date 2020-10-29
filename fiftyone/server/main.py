"""
FiftyOne Flask server.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import argparse
from collections import defaultdict
from copy import copy
import json
import logging
import os
import traceback
import uuid

from bson import ObjectId
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from flask_socketio import emit, Namespace, SocketIO

import eta.core.labels as etal
import eta.core.utils as etau
import eta.core.video as etav

os.environ["FIFTYONE_SERVER"] = "1"
import fiftyone.core.aggregations as foa
import fiftyone.constants as foc
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
from fiftyone.core.service import DatabaseService
from fiftyone.core.stages import _STAGES
import fiftyone.core.stages as fosg
import fiftyone.core.state as fos
import fiftyone.core.view as fov

from json_util import convert, FiftyOneJSONEncoder
from util import get_file_dimensions
from pipelines import DISTRIBUTION_PIPELINES, TAGS, LABELS, SCALARS


logger = logging.getLogger(__name__)

# connect to the existing DB service to initialize global port information
db = DatabaseService()
db.start()
app = Flask(__name__)
app.json_encoder = FiftyOneJSONEncoder
CORS(app)

app.config["SECRET_KEY"] = "fiftyone"

socketio = SocketIO(
    app,
    async_mode="eventlet",
    cors_allowed_origins="*",
    json=FiftyOneJSONEncoder,
)


def get_user_id():
    uid_path = os.path.join(foc.FIFTYONE_CONFIG_DIR, "var", "uid")

    def read():
        try:
            with open(uid_path) as f:
                return next(f).strip()
        except (IOError, StopIteration):
            return None

    if not read():
        os.makedirs(os.path.dirname(uid_path), exist_ok=True)
        with open(uid_path, "w") as f:
            f.write(str(uuid.uuid4()))
    return read()


@app.route("/")
def get_sample_media():
    """Gets the sample media.

    Returns:
        bytes
    """
    path = request.args.get("path")
    # `conditional`: support partial content
    return send_file(path, conditional=True)


@app.route("/fiftyone")
def get_fiftyone_info():
    return jsonify({"version": foc.VERSION})


@app.route("/stages")
def get_stages():
    """Gets ViewStage descriptions"""
    return {
        "stages": [
            {"name": stage.__name__, "params": stage._params()}
            for stage in _STAGES
        ]
    }


def _catch_errors(func):
    def wrapper(self, *args, **kwargs):
        try:
            self.prev_state = self.state
            return func(self, *args, **kwargs)
        except Exception as error:
            self.state = self.prev_state
            error = {
                "kind": "Server Error",
                "message": (
                    "An exception has been raised by the server. Your session "
                    "has been reverted to its previous state."
                ),
                "session_items": [traceback.format_exc()],
                "app_items": [
                    "A traceback has been printed to your Python shell."
                ],
            }
            emit("notification", error, broadcast=True, include_self=True)

    return wrapper


def _load_state(trigger_update=False):
    def decorator(func):
        def wrapper(self, *args, **kwargs):
            state = self.state.copy()
            state = fos.StateDescription.from_dict(state)
            state = func(self, state, *args, **kwargs)
            self.state = state.serialize()
            emit(
                "update",
                self.state,
                broadcast=True,
                include_self=trigger_update,
            )
            return self.state

        return wrapper

    return decorator


_WITHOUT_PAGINATION_EXTENDED_STAGES = {
    fosg.FilterClassifications,
    fosg.FilterDetections,
    fosg.FilterPolylines,
    fosg.FilterKeypoints,
    fosg.FilterField,
}


def _get_label_object_ids(label):
    """Returns a list of all object IDs contained in the label.

    Args:
        label: an ImageLabel instance

    Returns:
        list of IDs as strings
    """
    list_field_name = type(label).__name__.lower()
    if hasattr(label, "id"):
        return [label.id]
    elif list_field_name in label:
        return [obj.id for obj in label[list_field_name]]
    raise TypeError("Cannot serialize label type: " + str(type(label)))


def _make_frame_labels(name, label, frame_number, prefix=""):
    label = fol.ImageLabel.from_dict(label)
    labels = etav.VideoFrameLabels.from_image_labels(
        label.to_image_labels(name=prefix + name), frame_number,
    )

    for obj in labels.objects:
        obj.frame_number = frame_number

    for attr in labels.attributes():
        container = getattr(labels, attr)
        if isinstance(container, etal.LabelsContainer):
            object_ids = _get_label_object_ids(label)
            assert len(container) == len(object_ids)
            for (obj, object_id) in zip(container, object_ids):
                # force _id to be serialized
                obj._id = object_id
                attrs = obj.attributes() + ["_id"]
                obj.attributes = lambda: attrs

    return labels


class StateController(Namespace):
    """State controller.

    Attributes:
        state: a :class:`fiftyone.core.state.StateDescription`
               instance

    Args:
        **args: positional arguments for ``flask_socketio.Namespace``
        **kwargs: keyword arguments for ``flask_socketio.Namespace``
    """

    def __init__(self, *args, **kwargs):
        self.state = fos.StateDescription().serialize()
        self.prev_state = self.state
        super().__init__(*args, **kwargs)

    def on_connect(self):
        """Handles connection to the server."""
        pass

    def on_disconnect(self):
        """Handles disconnection from the server."""
        pass

    @_catch_errors
    def on_update(self, data):
        """Updates the state.

        Args:
            state_dict: a serialized
                :class:`fiftyone.core.state.StateDescription`
        """
        state = data["data"]
        self.state = fos.StateDescription.from_dict(state).serialize()
        emit(
            "update",
            self.state,
            broadcast=True,
            include_self=data["include_self"],
        )
        return self.state

    @_catch_errors
    def on_get_fiftyone_info(self):
        """Retrieves information about the FiftyOne installation."""
        return {
            "version": foc.VERSION,
            "user_id": get_user_id(),
        }

    @_catch_errors
    @_load_state()
    def on_get_current_state(self, state, _):
        """Gets the current state.

        Returns:
            a :class:`fiftyone.core.state.StateDescription`
        """
        return state

    @_catch_errors
    def on_get_statistics(self, stages):
        """Gets the statistics for a view.

        Returns:
            a :class:`fiftyone.core.state.DatasetStatistics`
        """
        state = fos.StateDescription.from_dict(self.state)
        if state.dataset is None:
            return []
        view = fov.DatasetView(state.dataset)
        view._stages = [fosg.ViewStage._from_dict(s) for s in stages]
        return fos.DatasetStatistics(view).serialize()["stats"]

    @_catch_errors
    @_load_state()
    def on_add_selection(self, state, _id):
        """Adds a sample to the selected samples list.

        Args:
            state: the current
                :class:`fiftyone.core.state.StateDescription`
            _id: the sample ID

        Returns:
            the updated
                :class:`fiftyone.core.state.StateDescription`
        """
        selected = set(state.selected)
        selected.add(_id)
        state.selected = list(selected)
        return state

    @_catch_errors
    @_load_state()
    def on_remove_selection(self, state, _id):
        """Remove a sample from the selected samples list

        Args:
            state: the current
                :class:`fiftyone.core.state.StateDescription`
            _id: the sample ID

        Returns:
            the updated
                :class:`fiftyone.core.state.StateDescription`
        """
        selected = set(state.selected)
        selected.remove(_id)
        state.selected = list(selected)
        return state

    @_catch_errors
    @_load_state()
    def on_clear_selection(self, state):
        """Remove all samples from the selected samples list

        Args:
            state: the current
                :class:`fiftyone.core.state.StateDescription`

        Returns:
            the updated
                :class:`fiftyone.core.state.StateDescription`
        """
        state.selected = []
        return state

    @_catch_errors
    @_load_state()
    def on_set_selected_objects(self, state, selected_objects):
        """Sets the entire selected object list.

        Args:
            state: the current :class:`fiftyone.core.state.StateDescription`
            selected_objects: a list of selected objects
        """
        if not isinstance(selected_objects, list):
            raise TypeError("selected_objects must be a list")

        state.selected_objects = selected_objects
        return state

    @_catch_errors
    def on_get_video_data(self, sample_d):
        """Gets the frame labels for video samples

        Args:
            sample_id: the id of the video sample

        Returns:
            ...
        """
        state = self.state.copy()
        state = fos.StateDescription.from_dict(state)
        find_d = {"_sample_id": ObjectId(sample_d["_id"])}
        labels = etav.VideoLabels()
        frames = list(state.dataset._frame_collection.find(find_d))
        sample = state.dataset[sample_d["_id"]].to_mongo_dict()
        convert(frames)

        for frame_dict in frames:
            frame_number = frame_dict["frame_number"]
            frame_labels = etav.VideoFrameLabels(frame_number=frame_number)
            for k, v in frame_dict.items():
                if isinstance(v, dict) and "_cls" in v:
                    field_labels = _make_frame_labels(
                        k, v, frame_number, prefix="frames."
                    )
                    frame_labels.merge_labels(field_labels)

            labels.add_frame(frame_labels)

        for frame_number in range(
            1, etav.get_frame_count(sample["filepath"]) + 1
        ):
            frame_labels = etav.VideoFrameLabels(frame_number=frame_number)
            for k, v in sample.items():
                if isinstance(v, dict) and k != "frames" and "_cls" in v:
                    field_labels = _make_frame_labels(k, v, frame_number)
                    for obj in field_labels.objects:
                        obj.frame_number = frame_number

                    frame_labels.merge_labels(field_labels)

            labels.add_frame(frame_labels, overwrite=False)

        fps = etav.get_frame_rate(sample_d["filepath"])
        return {"frames": frames, "labels": labels.serialize(), "fps": fps}

    @_catch_errors
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
            view = state.dataset.view()
        else:
            return []

        for stage_dict in state.filters.values():
            stage = fosg.ViewStage._from_dict(stage_dict)
            if type(stage) in _WITHOUT_PAGINATION_EXTENDED_STAGES:
                continue

            view = view.add_stage(stage)

        view = view.skip((page - 1) * page_length).limit(page_length + 1)
        samples = [
            s for s in view._aggregate(hide_frames=True, squash_frames=True)
        ]
        convert(samples)

        more = False
        if len(samples) > page_length:
            samples = samples[:page_length]
            more = page + 1

        results = [{"sample": s} for s in samples]
        for r in results:
            w, h = get_file_dimensions(r["sample"]["filepath"])
            r["width"] = w
            r["height"] = h
            # default to image

        return {"results": results, "more": more}

    @_catch_errors
    def on_get_distributions(self, group):
        """Gets the distributions for the current state with respect to a
        group.

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

        if group == LABELS:
            aggregations = []
            fields = []
            for name, field in view.get_field_schema().items():
                if isinstance(field, fof.EmbeddedDocumentField) and issubclass(
                    field.document_type, fol.Label
                ):
                    aggregations.append(foa.CountLabels(name))
                    fields.append(field)

            if view.media_type == fom.VIDEO:
                for name, field in view.get_frame_field_schema().items():
                    if isinstance(
                        field, fof.EmbeddedDocumentField
                    ) and issubclass(field.document_type, fol.Label):
                        aggregations.append(foa.CountLabels("frames." + name))
                        fields.append(field)

            results = []
            for idx, result in enumerate(view.aggregate(aggregations)):
                results.append(
                    {
                        "type": fields[idx].document_type.__name__,
                        "name": result.name,
                        "data": sorted(
                            [
                                {"key": k, "count": v}
                                for k, v in result.labels.items()
                            ],
                            key=lambda i: i["count"],
                            reverse=True,
                        ),
                    }
                )

            return results

        if group == TAGS:
            result = view.aggregate(foa.CountValues("tags"))
            return [
                {
                    "type": "list",
                    "name": result.name,
                    "data": sorted(
                        [
                            {"key": k, "count": v}
                            for k, v in result.values.items()
                        ],
                        key=lambda i: i["count"],
                        reverse=True,
                    ),
                }
            ]

        return _get_distributions(view, group)


def _get_distributions(view, group):
    pipeline = DISTRIBUTION_PIPELINES[group]

    # we add a sub-pipeline for each numeric as it looks like multiple
    # buckets in a single pipeline is not supported
    if group == SCALARS:
        _numeric_distribution_pipelines(view, pipeline)

    result = list(view._aggregate(pipeline))

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

    return list(view._aggregate(bounds_pipeline))[0] if len(numerics) else {}


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

        # if min and max are equal, we artifically create a boundary
        # @todo alternative approach to scalar fields with only one value
        if mn == mx:
            if mx > 0:
                mn = 0
            else:
                mx = 0

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
    log_path = os.path.join(
        foc.FIFTYONE_CONFIG_DIR, "var", "log", "server.log"
    )
    etau.ensure_basedir(log_path)
    # pylint: disable=no-member
    app.logger.addHandler(logging.FileHandler(log_path, mode="w"))

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5151)
    args = parser.parse_args()

    socketio.run(app, port=args.port, debug=foc.DEV_INSTALL)
