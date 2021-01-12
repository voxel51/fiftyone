"""
FiftyOne Tornado server.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio
import argparse
from collections import defaultdict
from copy import deepcopy
import os
import posixpath
import traceback

from bson import ObjectId
import tornado.escape
import tornado.ioloop
import tornado.iostream
import tornado.options
import tornado.web
import tornado.websocket

import eta.core.labels as etal
import eta.core.serial as etas
import eta.core.video as etav

os.environ["FIFTYONE_SERVER"] = "1"
import fiftyone as fo
import fiftyone.core.aggregations as foa
import fiftyone.constants as foc
from fiftyone.core.expressions import ViewField as F
import fiftyone.core.dataset as fod
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
from fiftyone.core.service import DatabaseService
from fiftyone.core.stages import _STAGES
import fiftyone.core.stages as fosg
import fiftyone.core.state as fos
import fiftyone.core.view as fov
from fiftyone.utils.uid import _get_user_id

from fiftyone.server.json_util import convert, FiftyOneJSONEncoder
from fiftyone.server.util import get_file_dimensions
from fiftyone.server.pipelines import (
    DISTRIBUTION_PIPELINES,
    TAGS,
    LABELS,
)


# connect to the existing DB service to initialize global port information
dbs = DatabaseService()
dbs.start()
db = foo.get_async_db_conn()


class RequestHandler(tornado.web.RequestHandler):
    """"Base class for HTTP request handlers"""

    def set_default_headers(self, *args, **kwargs):
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Headers", "x-requested-with")
        self.set_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")

    async def get(self):
        self.write(self.get_response())

    def get_response(self):
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
        uid, _ = _get_user_id()
        isfile = os.path.isfile(foc.FEEDBACK_PATH)
        if isfile:
            submitted = etas.load_json(foc.FEEDBACK_PATH)["submitted"]
        else:
            submitted = False
        return {
            "version": foc.VERSION,
            "user_id": uid,
            "do_not_track": fo.config.do_not_track,
            "feedback": {"submitted": submitted, "minimized": isfile},
            "dev_install": foc.DEV_INSTALL or foc.RC_INSTALL,
        }


class NotebookHandler(RequestHandler):
    """Check that the requested handle exists on the server"""

    async def get(self):
        handle_id = self.get_argument("handleId")

        response = self.get_response(handle_id)
        if response is None:
            raise tornado.web.HTTPError(status_code=404)

        self.write(response)

    @staticmethod
    def get_response(handle):
        """Returns if the notebook handle exists on the server.

        Returns:
            the handle ID
        """
        global _notebook_clients
        if handle in set(_notebook_clients.values()):
            return {"exists": True}


class ReactivateHandler(RequestHandler):
    """Reactivates an IPython display handle"""

    async def get(self):
        handle_id = self.get_argument("handleId")
        self.write(self.get_response(handle_id))

    @staticmethod
    def get_response(handle_id):
        """Returns on success

        Args:
            handle_id: a handle uuid
        """
        for client in StateHandler.clients:
            client.write_message({"type": "reactivate", "handle": handle_id})

        return {}


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


class FeedbackHandler(RequestHandler):
    """Returns whether the feedback button should be minimized"""

    def post(self):
        submitted = self.get_argument("submitted", False)
        etas.write_json({"submitted": submitted}, foc.FEEDBACK_PATH)


def _catch_errors(func):
    async def wrapper(self, *args, **kwargs):
        try:
            StateHandler.prev_state = StateHandler.state
            result = await func(self, *args, **kwargs)
            return result
        except Exception:
            StateHandler.state = StateHandler.prev_state
            clients = list(StateHandler.clients)
            if isinstance(self, PollingHandler):
                clients.append(self)
            for client in clients:
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


_notebook_clients = {}
_deactivated_clients = set()


class PollingHandler(tornado.web.RequestHandler):

    clients = defaultdict(set)
    screenshots = {}

    def set_default_headers(self, *args, **kwargs):
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Headers", "x-requested-with")
        self.set_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")

    @staticmethod
    def gather_messages(client):
        messages = [
            {"type": message} for message in PollingHandler.clients[client]
        ]
        PollingHandler.clients[client].clear()
        return messages

    @_catch_errors
    async def get(self):
        # pylint: disable=no-value-for-parameter
        client = self.get_argument("sessionId")
        if client not in PollingHandler.clients:
            PollingHandler.clients[client].add("update")
            PollingHandler.clients[client].add("statistics")
            PollingHandler.clients[client].add("extended_statistics")

        messages = self.gather_messages(client)
        self.write_message({"messages": messages})

    @_catch_errors
    async def post(self):
        # pylint: disable=no-value-for-parameter
        client = self.get_argument("sessionId")
        # pylint: disable=no-value-for-parameter
        mode = self.get_argument("mode")
        message = StateHandler.loads(self.request.body)
        event = message.pop("type")
        force_update = False
        if mode == "push":
            if event == "as_app":
                if message["notebook"]:
                    message["ignore"] = client
                    global _notebook_clients
                    global _deactivated_clients
                    StateHandler.state["active_handle"] = message["handle"]
                    _deactivated_clients.discard(message["handle"])
                    _notebook_clients[client] = message["handle"]
                    event = "update"
                    force_update = True
                    message = {"state": StateHandler.state}

            if event in {"distributions", "page", "get_video_data"}:
                caller = self
            elif event in {"capture", "update"}:
                caller = client
            else:
                caller = StateHandler

            if event == "refresh":
                message["polling_client"] = client

            if event == "update" and not force_update:
                message["ignore_polling_client"] = client

            handle = getattr(StateHandler, "on_%s" % event)
            await handle(caller, **message)

            if caller == self:
                return

            messages = self.gather_messages(client)
            self.write_message({"messages": messages})
            return

        if event == "update":
            self.write_message({"type": "update", "state": StateHandler.state})

        elif event == "deactivate":
            self.write_message({"type": "deactivate"})

        state = fos.StateDescription.from_dict(StateHandler.state)
        if state.view is not None:
            view = state.view
        else:
            view = state.dataset

        if event == "statistics":
            await StateHandler.send_statistics(view, only=self)

        elif event == "extended_statistics":
            await StateHandler.send_statistics(
                view, only=self, filters=state.filters
            )

    def write_message(self, message):
        message = StateHandler.dumps(message)
        self.write(message)


_WITHOUT_PAGINATION_EXTENDED_STAGES = {fosg.FilterLabels, fosg.FilterField}


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

    if list_field_name in label:
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

    @staticmethod
    def sample_collection():
        """Getter for the current sample collection."""
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
            message: a serialized message
        """
        message = self.loads(message)
        event = getattr(self, "on_%s" % message.pop("type"))
        await event(self, **message)

    @staticmethod
    async def on_capture(self, src):
        global _notebook_clients
        for client in StateHandler.clients:
            client.write_message(
                {"type": "capture", _notebook_clients[self]: src}
            )

    @staticmethod
    async def on_as_app(self, notebook=False, handle=None, ignore=None):
        """Event for registering a client as an App."""
        if isinstance(self, StateHandler):
            StateHandler.app_clients.add(self)
        global _notebook_clients
        if isinstance(self, StateHandler) and notebook:
            _notebook_clients[self] = handle
            ignore = self

        if not isinstance(self, StateHandler):
            return

        awaitables = self.get_statistics_awaitables(only=self)
        asyncio.gather(*awaitables)

    @staticmethod
    async def on_refresh(self, polling_client=None):
        """Event for refreshing an App client."""
        StateHandler.state = fos.StateDescription.from_dict(
            StateHandler.state
        ).serialize()
        if polling_client:
            PollingHandler.clients[polling_client].update(
                {"update", "statistics", "extended_statistics"}
            )
        else:
            awaitables = [self.send_updates(only=self)]
            awaitables += self.get_statistics_awaitables(only=self)
            asyncio.gather(*awaitables)

    @staticmethod
    async def on_filters_update(self, filters):
        """Event for updating state filters. Sends an extended dataset statistics
        message to active App clients.

        Args:
            filters: a :class:`dict` mapping field path to a serialized
                :class:fiftyone.core.stages.Stage`
        """
        state = fos.StateDescription.from_dict(StateHandler.state)
        state.filters = filters
        if state.view is not None:
            view = state.view
        else:
            view = state.dataset
        StateHandler.state = state.serialize()
        for clients in PollingHandler.clients.values():
            clients.update({"extended_statistics"})

        await self.send_statistics(view, filters=filters)

    @classmethod
    async def on_page(cls, self, page, page_length=20):
        """Sends a pagination response to the current client

        Args:
            page: the page number
            page_length (20): the number of items to return
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

        for stage in _make_filter_stages(state.dataset, state.filters):
            if type(stage) in _WITHOUT_PAGINATION_EXTENDED_STAGES:
                continue

            view = view.add_stage(stage)

        view = view.skip((page - 1) * page_length)
        pipeline = view._pipeline(hide_frames=True, squash_frames=True)
        samples = (
            await cls.sample_collection()
            .aggregate(pipeline)
            .to_list(page_length + 1)
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

        for r in results:
            s = r["sample"]
            s["filepath"] = (
                s["filepath"].replace(os.sep, posixpath.sep).split(":")[-1]
            )

        message = {
            "type": "page",
            "page": page,
            "results": results,
            "more": more,
        }

        self.write_message(message)

    @staticmethod
    async def on_update(caller, state, ignore_polling_client=None):
        """Event for state updates. Sends an update message to all active
        clients, and statistics messages to active App clients.

        Args:
            state: a serialized :class:`fiftyone.core.state.StateDescription`
        """
        StateHandler.state = state
        active_handle = state["active_handle"]
        global _notebook_clients
        global _deactivated_clients
        _deactivated_clients.discard(active_handle)
        if (
            active_handle
            and caller in _notebook_clients
            and _notebook_clients[caller] != active_handle
        ):
            return
        for client, events in PollingHandler.clients.items():
            if client in _notebook_clients:
                uuid = _notebook_clients[client]
                if uuid != active_handle:
                    events.clear()
                    _deactivated_clients.add(uuid)
                    events.add("deactivate")
                    continue

            if client == ignore_polling_client:
                events.update({"statistics", "extended_statistics"})
            events.update({"update", "statistics", "extended_statistics"})
        awaitables = [
            StateHandler.send_updates(),
        ]
        awaitables += StateHandler.get_statistics_awaitables()
        asyncio.gather(*awaitables)

    @staticmethod
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

    @staticmethod
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

    @staticmethod
    async def on_clear_selection(self):
        """Event for clearing the currently selected sample _ids.

        Sends state updates to all active clients.
        """
        StateHandler.state["selected"] = []
        await self.send_updates(ignore=self)

    @staticmethod
    async def on_set_selected_objects(self, selected_objects):
        """Event for setting the entire selected objects list.

        Args:
            selected_object: a list of selected objects
        """
        if not isinstance(selected_objects, list):
            raise TypeError("selected_objects must be a list")

        StateHandler.state["selected_objects"] = selected_objects
        await self.send_updates(ignore=self)

    @staticmethod
    async def on_set_dataset(self, dataset_name):
        """Event for setting the current dataset by name.

        Args:
            dataset_name: the dataset name
        """
        dataset = fod.load_dataset(dataset_name)
        StateHandler.state = fos.StateDescription(dataset=dataset).serialize()
        await self.on_update(self, StateHandler.state)

    @staticmethod
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

        sample_schema = state.dataset.get_field_schema()
        for frame_number in range(
            1, etav.get_frame_count(sample["filepath"]) + 1
        ):
            frame_labels = etav.VideoFrameLabels(frame_number=frame_number)
            for k, v in sample.items():
                if k not in sample_schema:
                    continue

                field = sample_schema[k]
                if not isinstance(field, fof.EmbeddedDocumentField):
                    continue

                if not issubclass(field.document_type, fol.Label):
                    continue

                field_labels = _make_frame_labels(k, v, frame_number)
                for obj in field_labels.objects:
                    obj.frame_number = frame_number

                frame_labels.merge_labels(field_labels)

            labels.add_frame(frame_labels, overwrite=False)

        fps = etav.get_frame_rate(sample["filepath"])
        self.write_message(
            {
                "type": "video_data-%s" % _id,
                "frames": frames,
                "labels": labels.serialize(),
                "fps": fps,
            }
        )

    @classmethod
    def get_statistics_awaitables(cls, only=None):
        """Gets statistic awaitables that will send statistics to the relevant
        client(s) when executed

        Args:
            only (None): a client to restrict the messages to

        Returns:
            a list of coroutines
        """
        if StateHandler.state["dataset"] is None:
            return []
        state = fos.StateDescription.from_dict(StateHandler.state)
        if state.view is not None:
            view = state.view
        else:
            view = state.dataset
        awaitables = [cls.send_statistics(view, only=only)]

        awaitables.append(
            cls.send_statistics(view, filters=state.filters, only=only)
        )
        return awaitables

    @classmethod
    async def send_updates(cls, ignore=None, only=None):
        """Sends an update event to the all clients, exluding the ignore
        client, if it is not None.

        Args:
            ignore (None): a client to not send the update to
            only (None): a client to restrict the updates to
        """
        response = {"type": "update", "state": StateHandler.state}
        if only:
            only.write_message(response)
            return

        global _notebook_clients
        global _deactivated_clients
        active_handle = StateHandler.state["active_handle"]
        for client in cls.clients:
            if client in _notebook_clients:
                uuid = _notebook_clients[client]
                if uuid != active_handle and uuid not in _deactivated_clients:
                    _deactivated_clients.add(uuid)
                    client.write_message({"type": "deactivate"})
                    continue
            if client == ignore:
                continue
            client.write_message(response)

    @classmethod
    async def send_statistics(cls, view, filters=None, only=None):
        """Sends a statistics event given using the provided view to all App
        clients, unless an only client is provided in which case it is only
        sent to the that client.

        Args:
            view: a view
            filters (None): filter stages to append to the view
            only (None): a client to restrict the message to
        """
        base_view = view
        if view is not None and (filters is None or len(filters)):
            if filters is not None and len(filters):
                for stage in _make_filter_stages(view._dataset, filters):
                    view = view.add_stage(stage)
            aggs = fos.DatasetStatistics(view).aggregations
            stats = await view._async_aggregate(cls.sample_collection(), aggs)
            stats = [r.serialize(reflective=True) for r in stats]
        else:
            stats = []

        view = (
            base_view._serialize()
            if isinstance(base_view, fov.DatasetView)
            else []
        )
        message = {
            "type": "statistics",
            "stats": stats,
            "view": view,
            "filters": filters,
        }

        if only:
            only.write_message(message)
        else:
            global _notebook_clients
            active_handle = StateHandler.state["active_handle"]
            for client in StateHandler.app_clients:
                if (
                    active_handle
                    and _notebook_clients.get(client, None) != active_handle
                ):
                    continue
                client.write_message(message)

    @classmethod
    async def on_distributions(cls, self, group):
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

        for stage in _make_filter_stages(state.dataset, state.filters):
            view = view.add_stage(stage)

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
                cls.sample_collection(), aggregations
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
                cls.sample_collection(), foa.CountValues("tags")
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
                cls.sample_collection(), view, group
            )

        self.write_message({"type": "distributions", "results": results})


def _make_range_expression(f, args):
    expr = None
    if "range" in args:
        mn, mx = args["range"]
        none = args["none"]
        expr = (f >= mn) & (f <= mx)
        if args.get("none", False):
            expr |= ~f
    elif "none" in args:
        if not args["none"]:
            expr = f

    return expr


def _make_filter_stages(dataset, filters):
    field_schema = dataset.get_field_schema()
    if dataset.media_type == fom.VIDEO:
        frame_field_schema = dataset.get_frame_field_schema()
    else:
        frame_field_schema = None
    stages = []
    for path, args in filters.items():
        if path.startswith("frames."):
            schema = frame_field_schema
            field = schema[path[len("frames.") :]]
        else:
            schema = field_schema
            field = schema[path]

        if isinstance(field, fof.EmbeddedDocumentField):
            stage_cls = fosg.FilterField
            if issubclass(field.document_type, foa._LABELS):
                stage_cls = fosg.FilterLabels
            expr = _make_range_expression(F("confidence"), args)
            if "labels" in args:
                labels_expr = F("label").is_in(args["labels"])
                if expr is not None:
                    expr &= labels_expr
                else:
                    expr = labels_expr

            stages.append(stage_cls(path, expr))
        else:
            expr = _make_range_expression(F(path), args)
            stages.append(fosg.Match(expr))

    return stages


async def _get_distributions(coll, view, group):
    pipeline = deepcopy(DISTRIBUTION_PIPELINES[group])
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
        if not bounds[sub_pipeline]:
            continue
        field_bounds = bounds[sub_pipeline][0]
        mn = field_bounds["min"]
        mx = field_bounds["max"]

        # if min and max are equal, we artifically create a boundary
        # @todo alternative approach to scalar fields with only one value
        if mn == mx:
            if mn is None:
                mn = 0
            mx = mn + 1

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


class FileHandler(tornado.web.StaticFileHandler):
    def set_headers(self):
        super().set_headers()
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Headers", "x-requested-with")
        self.set_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.set_header("content-length", self.get_content_size())


class Application(tornado.web.Application):
    """FiftyOne Tornado Application"""

    def __init__(self, **settings):
        static_path = "C:/" if os.name == "nt" else "/"
        server_path = os.path.dirname(os.path.abspath(__file__))
        rel_web_path = "static"
        web_path = os.path.join(server_path, rel_web_path)
        handlers = [
            (r"/fiftyone", FiftyOneHandler),
            (r"/polling", PollingHandler),
            (r"/feedback", FeedbackHandler),
            (r"/filepath/(.*)", FileHandler, {"path": static_path},),
            (r"/notebook", NotebookHandler),
            (r"/stages", StagesHandler),
            (r"/state", StateHandler),
            (r"/reactivate", ReactivateHandler),
            (
                r"/(.*)",
                FileHandler,
                {"path": web_path, "default_filename": "index.html"},
            ),
        ]
        super().__init__(handlers, **settings)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=fo.config.default_app_port)
    args = parser.parse_args()
    app = Application(debug=foc.DEV_INSTALL)
    app.listen(args.port)
    tornado.ioloop.IOLoop.current().start()
