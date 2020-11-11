"""
FiftyOne Tornado server.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio
import argparse
from collections import defaultdict
from copy import copy
import json
import logging
import os
import traceback
import uuid

from bson import ObjectId
import tornado.escape
import tornado.ioloop
import tornado.iostream
import tornado.options
import tornado.web
import tornado.websocket

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

from fiftyone.server.json_util import convert, FiftyOneJSONEncoder
from fiftyone.server.util import get_file_dimensions
from fiftyone.server.pipelines import (
    DISTRIBUTION_PIPELINES,
    TAGS,
    LABELS,
    SCALARS,
)


logger = logging.getLogger(__name__)


# connect to the existing DB service to initialize global port information
db = DatabaseService()
db.start()


def get_user_id():
    """Gets the UUID of the current user

    Returns:
     a UUID string
    """
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


class RequestHandler(tornado.web.RequestHandler):
    """"Base class for HTTP request handlers"""

    async def get(self):
        self.write(self.get_response())

    @staticmethod
    def get_response():
        """Returns the serializable response

        Returns:
            dict
        """
        raise NotImplementedError("subclass must implement get_response()")


class FiftyOneHandler(RequestHandler):
    """Returns the version info of the fiftyone being used"""

    @staticmethod
    def get_response():
        """Returns the serializable response

        Returns:
            dict
        """
        return {"version": foc.VERSION}


class StagesHandler(RequestHandler):
    """Returns the definitions of stages available to the App"""

    @staticmethod
    def get_response():
        """Returns the serializable response

        Returns:
            dict
        """
        return {
            "stages": [
                {"name": stage.__name__, "params": stage._params()}
                for stage in _STAGES
            ]
        }


def _catch_errors(func):
    async def wrapper(self, *args, **kwargs):
        try:
            StateHandler.prev_state = StateHandler.state
            result = await func(self, *args, **kwargs)
            return result
        except Exception as error:
            StateHandler.state = StateHandler.prev_state
            for client in StateHandler.clients:
                client.write_message(
                    {
                        "type": "notification",
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
                )

    return wrapper


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


class StateHandler(tornado.websocket.WebSocketHandler):
    """WebSocket handler for bi-directional state communication.

    Attributes:
        app_clients: active App clients
        clients: active clients
        state: the current a serialized
            :class:`fiftyone.core.state.StateDescription`, serialized
        prev_state: the previous a serialized
            :class:`fiftyone.core.state.StateDescription`, serialized
    """

    app_clients = set()
    clients = set()
    state = fos.StateDescription().serialize()
    prev_state = fos.StateDescription().serialize()

    @staticmethod
    def dumps(data):
        """Serializes data to a JSON formatted :class:`str`.

        Args:
            data: serializable object

        Returns:
            :class:`str`
        """
        return FiftyOneJSONEncoder.dumps(data)

    @staticmethod
    def loads(data):
        """Deserialized data to an object.

        Args:
            data: :class:`str`, :class:`bytes`, or :class:`bytearray`

        Returns:
            an object
        """
        return FiftyOneJSONEncoder.loads(data)

    @property
    def sample_collection(self):
        """Getter for the current sample collection."""
        db = self.settings["db"]
        state = fos.StateDescription.from_dict(StateHandler.state)
        return db[state.dataset._sample_collection_name]

    def write_message(self, message):
        """Writes a message to the client.

        Args:
            message: a serializable object
        """
        if message is None:
            return
        message = self.dumps(message)
        return super().write_message(message)

    def check_origin(self, origin):
        """Accepts all origins.

        Returns:
            True
        """
        return True

    def open(self):
        """On open, add the client to the active clients set, and write the
        current state to the new client.
        """
        StateHandler.clients.add(self)
        self.write_message({"type": "update", "state": StateHandler.state})

    def on_close(self):
        """On close, remove the client from the active clients set, and
        active App clients set (if applicable).
        """
        StateHandler.clients.remove(self)
        StateHandler.app_clients.discard(self)

    @_catch_errors
    async def on_message(self, message):
        """On message, call the associated event awaitable, with respect to 
        the provided message type.

        Args:
            message: a serialzed message
        """
        message = self.loads(message)
        event = getattr(self, "on_%s" % message.pop("type"))
        logger.debug("%s event" % event.__name__)
        await event(**message)

    async def on_as_app(self):
        """Event for registering a client as an App."""
        StateHandler.app_clients.add(self)
        awaitables = self.get_statistics_awaitables(only=self)
        asyncio.gather(*awaitables)

    async def on_fiftyone(self):
        """Event for FiftyOne package version and user id requests."""
        self.write_message(
            {
                "type": "fiftyone",
                "data": {"version": foc.VERSION, "user_id": get_user_id(),},
            }
        )

    async def on_filters_update(self, filters):
        """Event for updating state filters. Sends an extended dataset statistics
        message to active App clients.

        Args:
            filters: a :class:`dict` mapping field path to a serialized
                :class:fiftyone.core.stages.Stage`
        """
        StateHandler.state["filters"] = filters
        state = StateHandler.state
        view = state["view"] or []
        await self.send_statistics(
            view + list(state["filters"].values()), extended=True
        )

    async def on_page(self, **kwargs):
        """Event for pagination requests"""
        await self.send_page(**kwargs)

    async def on_update(self, state):
        """Event for state updates. Sends an update message to all active
        clients, and statistics messages to active App clients.

        Args:
            state: a serialized :class:`fiftyone.core.state.StateDescription`
        """
        StateHandler.state = state
        awaitables = [
            self.send_updates(ignore=self),
        ]
        awaitables += self.get_statistics_awaitables()
        asyncio.gather(*awaitables)

    async def on_add_selection(self, _id):
        """Event for adding a :class:`fiftyone.core.samples.Sample` _id to the
        currently selected sample _ids.

        Sends state updates to all active clients.

        Args:
            _id: a sample _id
        """
        selected = set(StateHandler.state["selected"])
        selected.add(_id)
        StateHandler.state["selected"] = selected
        await self.send_updates(ignore=self)

    async def on_remove_selection(self, _id):
        """Event for removing a :class:`fiftyone.core.samples.Sample` _id from the
        currently selected sample _ids

        Sends state updates to all active clients.

        Args:
            _id: a sample _id
        """
        selected = set(StateHandler.state["selected"])
        selected.remove(_id)
        StateHandler.state["selected"] = selected
        await self.send_updates(ignore=self)

    async def on_clear_selection(self):
        """Event for clearing the currently selected sample _ids.

        Sends state updates to all active clients.
        """
        StateHandler.state["selected"] = []
        await self.send_updates(ignore=self)

    async def on_set_selected_objects(self, selected_objects):
        """Event for setting the entire selected objects list.

        Args:
            selected_object: a list of selected objects
        """
        if not isinstance(selected_objects, list):
            raise TypeError("selected_objects must be a list")

        StateHandler.state["selected_objects"] = selected_objects
        await self.send_updates(ignore=self)

    async def on_get_video_data(self, _id, filepath):
        """Gets the frame labels for video samples.

        Args:
            _id: a sample _id
            filepath: the absolute path to the sample's video on disk
        """
        state = fos.StateDescription.from_dict(StateHandler.state)
        find_d = {"_sample_id": ObjectId(_id)}
        labels = etav.VideoLabels()
        frames = list(state.dataset._frame_collection.find(find_d))
        sample = state.dataset[_id].to_mongo_dict()
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

        fps = etav.get_frame_rate(filepath)
        self.write_message(
            {
                "type": "video_data-%s" % _id,
                "frames": frames,
                "labels": labels.serialize(),
                "fps": fps,
            }
        )

    def get_statistics_awaitables(self, only=None):
        """Gets statistic awaitables that will send statistics to the relevant
        client(s) when executed
    
        Args:
            only: a specific client to only 

        Returns:
            a list of coroutines
        """
        if StateHandler.state["dataset"] is None:
            return []
        state = StateHandler.state
        view = state["view"] or []
        awaitables = [self.send_statistics(view, only=only)]

        if len(state["filters"]):
            awaitables.append(
                self.send_statistics(
                    view + list(state["filters"].values()),
                    extended=True,
                    only=only,
                )
            )

        return awaitables

    @classmethod
    async def send_updates(cls, ignore=None):
        response = {"type": "update", "state": StateHandler.state}
        for client in cls.clients:
            if client == ignore:
                continue
            client.write_message(response)

    async def send_statistics(self, stages, extended=False, only=None):
        state = fos.StateDescription.from_dict(StateHandler.state)
        if stages is None:
            stages = []

        view = fov.DatasetView(state.dataset)
        for stage_dict in stages:
            stage = fosg.ViewStage._from_dict(stage_dict)
            view = view.add_stage(stage)

        aggs = fos.DatasetStatistics(view).aggregations
        stats = await view._async_aggregate(self.sample_collection, aggs)
        stats = [r.serialize(reflective=True) for r in stats]

        message = {"type": "statistics", "stats": stats, "extended": extended}

        if only:
            only.write_message(message)
        else:
            for client in StateHandler.app_clients:
                client.write_message(message)

    async def send_page(self, page, page_length=20):
        """Sends a pagination response to the current client

        Args:
            page: the page number
            page_length: the number of items to return
        """
        state = fos.StateDescription.from_dict(StateHandler.state)
        if state.view is not None:
            view = state.view
        elif state.dataset is not None:
            view = state.dataset.view()
        else:
            self.write_message(
                {"type": "page", "page": page, "results": [], "more": False}
            )
            return

        for stage_dict in state.filters.values():
            stage = fosg.ViewStage._from_dict(stage_dict)
            if type(stage) in _WITHOUT_PAGINATION_EXTENDED_STAGES:
                continue

            view = view.add_stage(stage)

        view = view.skip((page - 1) * page_length)
        pipeline = view._pipeline(hide_frames=True, squash_frames=True)
        samples = await self.sample_collection.aggregate(pipeline).to_list(
            page_length + 1
        )
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

        message = {
            "type": "page",
            "page": page,
            "results": results,
            "more": more,
        }

        self.write_message(message)

    async def on_distributions(self, group):
        """Sends distribution data with respect to a group to the requesting
        client.

        Args:
            group: the distribution group. Valid groups are 'labels', 'scalars',
                and 'tags'.
        """
        state = fos.StateDescription.from_dict(StateHandler.state)
        results = None
        if state.view is not None:
            view = state.view
        elif state.dataset is not None:
            view = state.dataset.view()
        else:
            results = []

        if group == LABELS and results is None:
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
            response = await view._async_aggregate(
                self.sample_collection, aggregations
            )
            for idx, result in enumerate(response):
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

        elif group == TAGS and results is None:
            result = await view._async_aggregate(
                self.sample_collection, foa.CountValues("tags")
            )
            results = [
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
        elif results is None:
            results = await _get_distributions(
                self.sample_collection, view, group
            )

        self.write_message({"type": "distributions", "results": results})


async def _get_distributions(coll, view, group):
    pipeline = DISTRIBUTION_PIPELINES[group]
    await _numeric_distribution_pipelines(coll, view, pipeline)

    pipeline = view._pipeline(pipeline=pipeline)
    response = await coll.aggregate(pipeline).to_list(1)

    result = []
    for f in response[0].values():
        result += f

    return sorted(result, key=lambda d: d["name"])


async def _numeric_bounds(coll, view, numerics):
    bounds_pipeline = [{"$facet": {}}]
    if len(numerics) == 0:
        return {}

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

    pipeline = view._pipeline(pipeline=bounds_pipeline)
    result = await coll.aggregate(pipeline).to_list(1)
    return result[0]


async def _numeric_distribution_pipelines(coll, view, pipeline, buckets=50):
    numerics = view._dataset.get_field_schema(ftype=fof.IntField)
    numerics.update(view._dataset.get_field_schema(ftype=fof.FloatField))

    # here we query the min and max for each numeric field
    # unfortunately, it looks like this has to be a separate query
    bounds = await _numeric_bounds(coll, view, numerics)

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


class Application(tornado.web.Application):
    """FiftyOne Tornado Application"""

    def __init__(self, **settings):
        handlers = [
            (r"/fiftyone", FiftyOneHandler),
            (r"/filepath/(.*)", tornado.web.StaticFileHandler, {"path": "/"}),
            (r"/stages", StagesHandler),
            (r"/state", StateHandler),
        ]
        db = foo.get_async_db_conn()
        super().__init__(handlers, db=db, **settings)


if __name__ == "__main__":
    log_path = os.path.join(
        foc.FIFTYONE_CONFIG_DIR, "var", "log", "server.log"
    )
    etau.ensure_basedir(log_path)
    # pylint: disable=no-member
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5151)
    args = parser.parse_args()
    app = Application(debug=foc.DEV_INSTALL)
    app.listen(args.port)
    tornado.ioloop.IOLoop.current().start()
