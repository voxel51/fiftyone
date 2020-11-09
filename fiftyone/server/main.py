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

from json_util import convert, FiftyOneJSONEncoder
from util import get_file_dimensions
from pipelines import DISTRIBUTION_PIPELINES, TAGS, LABELS, SCALARS


logger = logging.getLogger(__name__)


# connect to the existing DB service to initialize global port information
db = DatabaseService()
db.start()


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


class FileHandler(tornado.web.RequestHandler):
    async def get(self):
        chunk_size = 1024 * 1024 * 1  # 1 MiB
        path = self.get_query_argument("path")

        with open(path, "rb") as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                try:
                    self.write(chunk)  # write the chunk to response
                    await self.flush()  # send the chunk to client
                except tornado.iostream.StreamClosedError:
                    # this means the client has closed the connection
                    # so break the loop
                    break
                finally:
                    # deleting the chunk is very important because
                    # if many clients are downloading files at the
                    # same time, the chunks in memory will keep
                    # increasing and will eat up the RAM
                    del chunk
                    await asyncio.sleep(0)


class FiftyOneHandler(tornado.web.RequestHandler):
    def get(self):
        self.write({"version": foc.VERSION})


class StagesHandler(tornado.web.RequestHandler):
    def get(self):
        """Gets ViewStage descriptions"""
        self.write(
            {
                "stages": [
                    {"name": stage.__name__, "params": stage._params()}
                    for stage in _STAGES
                ]
            }
        )


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


def _load_state(trigger_update=False):
    def decorator(func):
        def wrapper(self, *args, **kwargs):
            state = self.state.copy()
            state = fos.StateDescription.from_dict(state)
            state = func(self, state, *args, **kwargs)
            self.state = state.serialize()
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


class StateHandler(tornado.websocket.WebSocketHandler):

    clients = set()
    state = fos.StateDescription().serialize()
    prev_state = fos.StateDescription().serialize()
    app_clients = set()

    @staticmethod
    def dumps(data):
        return FiftyOneJSONEncoder.dumps(data)

    @staticmethod
    def loads(data):
        return FiftyOneJSONEncoder.loads(data)

    @property
    def sample_collection(self):
        db = self.settings["db"]
        state = fos.StateDescription.from_dict(StateHandler.state)
        return db[state.dataset._sample_collection_name]

    def write_message(self, message):
        if message is None:
            return
        message = self.dumps(message)
        return super().write_message(message)

    def check_origin(self, origin):
        return True

    def open(self):
        StateHandler.clients.add(self)
        logger.debug("connected")
        self.write_message({"type": "update", "state": StateHandler.state})

    def on_close(self):
        StateHandler.clients.remove(self)
        StateHandler.app_clients.discard(self)
        logger.debug("disconnected")

    @_catch_errors
    async def on_message(self, message):
        message = self.loads(message)
        event = getattr(self, "on_%s" % message.pop("type"))
        logger.debug("%s event" % event.__name__)
        await event(**message)

    async def on_as_app(self):
        StateHandler.app_clients.add(self)
        awaitables = self.get_statistics_awaitables(only=self)
        awaitables += [self.send_page(1, only=self)]
        asyncio.gather(*awaitables)

    async def on_page(self, **kwargs):
        await self.send_page(**kwargs)

    async def on_update(self, state):
        StateHandler.state = state
        awaitables = [
            self.send_page(1),
            self.send_updates(ignore=self),
        ]
        awaitables += self.get_statistics_awaitables()
        asyncio.gather(*awaitables)

    def get_statistics_awaitables(self, only=None):
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

    async def on_fiftyone(self):
        self.write_message(
            {
                "type": "fiftyone",
                "data": {"version": foc.VERSION, "user_id": get_user_id(),},
            }
        )

    @classmethod
    async def send_updates(cls, ignore=None):
        response = {"type": "update", "state": StateHandler.state}
        for client in cls.clients:
            if client == ignore:
                continue
            client.write_message(response)

    async def send_statistics(self, stages, extended=False, only=None):
        state = fos.StateDescription.from_dict(StateHandler.state)
        if state.dataset is None:
            stats = []
        else:
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

    def on_add_selection(self, _id):
        selected = set(StateHandler.state["selected"])
        selected.add(_id)
        StateHandler.state["selected"] = selected
        self.send_updates(ignore=self)

    async def on_remove_selection(self, _id):
        selected = set(StateHandler.state["selected"])
        selected.remove(_id)
        StateHandler.state["selected"] = selected
        self.send_updates(ignore=self)

    async def on_clear_selection(self):
        StateHandler.state["selected"] = []
        self.send_updates(ignore=self)

    async def on_set_selected_objects(self, selected_objects):
        if not isinstance(selected_objects, list):
            raise TypeError("selected_objects must be a list")

        StateHandler.state["selected_objects"] = selected_objects
        self.send_updates(ignore=self)

    async def on_get_video_data(self, sample_d):
        state = fos.StateDescription.from_dict(StateHandler.state)
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
        self.write_message(
            {
                "type": "video_data",
                "data": {
                    "frames": frames,
                    "labels": labels.serialize(),
                    "fps": fps,
                },
            }
        )

    async def send_page(self, page, page_length=20, only=None):
        state = fos.StateDescription.from_dict(StateHandler.state)
        if state.view is not None:
            view = state.view
        elif state.dataset is not None:
            view = state.dataset.view()
        else:
            self.write_message({"type": "page", "results": [], "more": False})
            return

        for stage_dict in state.filters.values():
            stage = fosg.ViewStage._from_dict(stage_dict)
            if type(stage) in _WITHOUT_PAGINATION_EXTENDED_STAGES:
                continue

            view = view.add_stage(stage)

        view = view.skip((page - 1) * page_length)
        pipeline = view._pipeline(hide_frames=True, squash_frames=True)
        samples = await self.sample_collection.aggregate(pipeline).to_list(
            page_length
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

        message = {"type": "page", "results": results, "more": more}

        if only:
            only.write_message(message)
        else:
            for client in self.clients:
                client.write_message(message)

    async def on_distributions(self, group):
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
    def __init__(self, **settings):
        handlers = [
            (r"/fiftyone", FiftyOneHandler),
            (r"/", FileHandler),
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
