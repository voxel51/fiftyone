"""
FiftyOne Tornado server.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio
import argparse
from collections import defaultdict
from datetime import date, datetime, timedelta
import math
import os
import traceback

import tornado.escape
import tornado.ioloop
import tornado.iostream
import tornado.options
import tornado.web
from tornado.web import HTTPError
import tornado.websocket

import eta.core.serial as etas

if os.environ.get("FIFTYONE_DISABLE_SERVICES", False):
    del os.environ["FIFTYONE_DISABLE_SERVICES"]

os.environ["FIFTYONE_SERVER"] = "1"

import fiftyone as fo
import fiftyone.core.aggregations as foa
import fiftyone.constants as foc
import fiftyone.core.clips as focl
from fiftyone.core.expressions import ViewField as F, _escape_regex_chars
import fiftyone.core.dataset as fod
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
from fiftyone.core.stages import _STAGES
import fiftyone.core.stages as fosg
import fiftyone.core.state as fos
import fiftyone.core.uid as fou
import fiftyone.core.utils as fout
import fiftyone.core.view as fov

from fiftyone.server.colorscales import ColorscalesHandler
from fiftyone.server.extended_view import get_extended_view, get_view_field
from fiftyone.server.json_util import convert, FiftyOneJSONEncoder
import fiftyone.server.utils as fosu


db = foo.get_async_db_conn()
_notebook_clients = {}
_deactivated_clients = set()
_DISCONNECT_TIMEOUT = 1  # seconds
_DEFAULT_NUM_HISTOGRAM_BINS = 25
_LIST_LIMIT = 200


class RequestHandler(tornado.web.RequestHandler):
    """"Base class for HTTP request handlers"""

    def set_default_headers(self, *args, **kwargs):
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Headers", "x-requested-with")
        self.set_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.set_header("x-colab-notebook-cache-control", "no-cache")

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
        uid, _ = fou.get_user_id()
        isfile = os.path.isfile(foc.TEAMS_PATH)
        if isfile:
            submitted = etas.load_json(foc.TEAMS_PATH)["submitted"]
        else:
            submitted = False

        return {
            "version": foc.VERSION,
            "user_id": uid,
            "do_not_track": fo.config.do_not_track,
            "teams": {"submitted": submitted, "minimized": isfile},
            "dev_install": foc.DEV_INSTALL or foc.RC_INSTALL,
        }


class NotebookHandler(RequestHandler):
    """Check that the requested handle exists on the server"""

    async def get(self):
        # pylint: disable=no-value-for-parameter
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
        # pylint: disable=no-value-for-parameter
        handle_id = self.get_argument("handleId")
        self.write(self.get_response(handle_id))

    @staticmethod
    def get_response(handle_id):
        """Returns on success

        Args:
            handle_id: a handle uuid
        """
        StateHandler.state["active_handle"] = handle_id
        global _deactivated_clients
        _deactivated_clients.discard(handle_id)
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


class FramesHandler(tornado.web.RequestHandler):
    """Frames stream requests"""

    def set_default_headers(self, *args, **kwargs):
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Headers", "x-requested-with")
        self.set_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.set_header("x-colab-notebook-cache-control", "no-cache")

    async def get(self):
        # pylint: disable=no-value-for-parameter
        sample_id = self.get_argument("sampleId", None)
        # pylint: disable=no-value-for-parameter
        start_frame = int(self.get_argument("frameNumber"))
        # pylint: disable=no-value-for-parameter
        frame_count = int(self.get_argument("frameCount"))

        if sample_id is None or start_frame is None:
            raise ValueError("error")

        end_frame = min(
            # pylint: disable=no-value-for-parameter
            int(self.get_argument("numFrames")) + start_frame,
            frame_count,
        )
        state = fos.StateDescription.from_dict(StateHandler.state)
        if state.view is not None:
            view = state.view
        elif state.dataset is not None:
            view = state.dataset

        view = fov.make_optimized_select_view(view, sample_id)
        view = view.set_field(
            "frames",
            F("frames").filter(
                (F("frame_number") >= start_frame)
                & (F("frame_number") <= end_frame)
            ),
        )

        frames = await foo.aggregate(
            StateHandler.sample_collection(), view._pipeline(frames_only=True)
        ).to_list(end_frame - start_frame + 1)
        convert(frames)
        self.write({"frames": frames, "range": [start_frame, end_frame]})


class PageHandler(tornado.web.RequestHandler):
    """Page requests

    Args:
        page: the page number
        page_length (20): the number of items to return
    """

    def set_default_headers(self, *args, **kwargs):
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Headers", "x-requested-with")
        self.set_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.set_header("x-colab-notebook-cache-control", "no-cache")

    async def get(self):
        # pylint: disable=no-value-for-parameter
        page = int(self.get_argument("page", 1))
        page_length = int(self.get_argument("page_length", 20))

        state = fos.StateDescription.from_dict(StateHandler.state)
        if state.view is not None:
            view = state.view
        elif state.dataset is not None:
            view = state.dataset
        else:
            self.write({"results": [], "more": False})
            return

        view = get_extended_view(view, state.filters, count_labels_tags=True)
        if view.media_type == fom.VIDEO:
            if isinstance(view, focl.ClipsView):
                expr = F("frame_number") == F("$support")[0]
            else:
                expr = F("frame_number") == 1

            view = view.set_field("frames", F("frames").filter(expr))

        view = view.skip((page - 1) * page_length)

        samples = await foo.aggregate(
            StateHandler.sample_collection(),
            view._pipeline(attach_frames=True, detach_frames=False),
        ).to_list(page_length + 1)
        convert(samples)

        more = False
        if len(samples) > page_length:
            samples = samples[:page_length]
            more = page + 1

        results = [{"sample": s} for s in samples]
        metadata = {}

        for r in results:
            filepath = r["sample"]["filepath"]
            if filepath not in metadata:
                metadata[filepath] = fosu.read_metadata(
                    filepath, r["sample"].get("metadata", None)
                )

            r.update(metadata[filepath])

        self.write({"results": results, "more": more})


class TeamsHandler(RequestHandler):
    """Returns whether the teams button should be minimized"""

    def post(self):
        submitted = self.get_argument("submitted", "") == "true"
        etas.write_json({"submitted": submitted}, foc.TEAMS_PATH)


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

            if event in {
                "distinct",
                "distributions",
                "get_video_data",
                "all_tags",
                "selected_statistics",
                "tag_modal",
                "modal_statistics",
                "tag_statistics",
            }:
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
            await StateHandler.send_statistics(
                view, extended=False, filters=state.filters, only=self
            )

        elif event == "extended_statistics":
            await StateHandler.send_statistics(
                view, extended=True, filters=state.filters, only=self
            )

    def write_message(self, message):
        message = StateHandler.dumps(message)
        self.write(message)


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
        if state.view is not None:
            dataset = state.view._dataset
        else:
            dataset = state.dataset

        return db[dataset._sample_collection_name]

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
        _write_message(
            {"type": "update", "state": StateHandler.state}, only=self
        )

    def on_close(self):
        """On close, remove the client from the active clients set, and
        active App clients set (if applicable).
        """
        StateHandler.clients.remove(self)
        StateHandler.app_clients.discard(self)

        async def close_wait():
            await asyncio.sleep(_DISCONNECT_TIMEOUT)
            if not StateHandler.app_clients:
                _write_message({"type": "close"}, session=True)

        tornado.ioloop.IOLoop.current().add_callback(close_wait)

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
    async def on_capture(self, src, width):
        global _notebook_clients
        _write_message(
            {
                "type": "capture",
                "handle": _notebook_clients[self],
                "src": src,
                "width": width,
            }
        )

    @staticmethod
    async def on_as_app(self, notebook=False, handle=None, ignore=None):
        """Event for registering a client as an App."""
        if isinstance(self, StateHandler):
            StateHandler.app_clients.add(self)

        global _notebook_clients
        if isinstance(self, StateHandler) and notebook:
            _notebook_clients[self] = handle

        if not isinstance(self, StateHandler):
            return

        awaitables = self.get_statistics_awaitables(only=self)
        asyncio.gather(*awaitables)

    @staticmethod
    async def on_refresh(self, polling_client=None):
        """Event for refreshing an App client."""
        state = fos.StateDescription.from_dict(StateHandler.state)
        state.refresh = not state.refresh
        StateHandler.state = state.serialize()

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
        """Event for updating state filters. Sends an extended dataset
        statistics message to active App clients.

        Args:
            filters: a :class:`dict` mapping field path to a serialized
                :class:fiftyone.core.stages.Stage`
        """
        state = fos.StateDescription.from_dict(StateHandler.state)
        state.filters = filters
        state.selected_labels = []
        state.selected = []
        if state.view is not None:
            view = state.view
        else:
            view = state.dataset

        StateHandler.state = state.serialize()
        for clients in PollingHandler.clients.values():
            clients.update({"extended_statistics"})

        await self.send_statistics(view, filters=filters, extended=True)

    @staticmethod
    async def on_update(caller, state, ignore_polling_client=None):
        """Event for state updates. Sends an update message to all active
        clients, and statistics messages to active App clients.

        Args:
            state: a serialized :class:`fiftyone.core.state.StateDescription`
        """
        StateHandler.state = fos.StateDescription.from_dict(state).serialize()
        active_handle = state["active_handle"]
        global _notebook_clients
        global _deactivated_clients
        _deactivated_clients.discard(active_handle)

        # ignore deactivated notebook cells
        if (
            active_handle
            and caller in _notebook_clients
            and _notebook_clients[caller] != active_handle
        ):
            return

        for client, events in PollingHandler.clients.items():
            if client in _notebook_clients:
                uuid = _notebook_clients[client]

                # deactivate the last active colab cell
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
    async def on_set_selection(self, _ids):
        """Event for setting the selected
        :class:`fiftyone.core.samples.Sample` _ids

        Args:
            _ids: a list of sample _id
        """
        StateHandler.state["selected"] = _ids
        await self.send_updates(ignore=self)

    @staticmethod
    async def on_clear_selection(self):
        """Event for clearing the currently selected sample _ids.

        Sends state updates to all active clients.
        """
        StateHandler.state["selected"] = []
        await self.send_updates(ignore=self)

    @staticmethod
    async def on_set_selected_labels(self, selected_labels):
        """Event for setting the entire selected objects list.

        Args:
            selected_labels: a list of selected labels
        """
        if not isinstance(selected_labels, list):
            raise TypeError("selected_labels must be a list")

        StateHandler.state["selected_labels"] = selected_labels
        await self.send_updates(ignore=self)

    @staticmethod
    async def on_set_dataset(self, dataset_name):
        """Event for setting the current dataset by name.

        Args:
            dataset_name: the dataset name
        """
        dataset = fod.load_dataset(dataset_name)
        config = fos.StateDescription.from_dict(StateHandler.state).config
        active_handle = StateHandler.state["active_handle"]
        StateHandler.state = fos.StateDescription(
            dataset=dataset, config=config, active_handle=active_handle
        ).serialize()
        await self.on_update(self, StateHandler.state)

    @staticmethod
    async def on_tag(
        caller, changes, target_labels=False, active_labels=None,
    ):
        state = fos.StateDescription.from_dict(StateHandler.state)
        if state.view is not None:
            view = state.view
        else:
            view = state.dataset

        view = get_extended_view(view, state.filters)
        if state.selected:
            view = view.select(state.selected)

        if target_labels:
            fosu.change_label_tags(view, changes, label_fields=active_labels)
        else:
            fosu.change_sample_tags(view, changes)

        StateHandler.state["refresh"] = not state.refresh
        for clients in PollingHandler.clients.values():
            clients.update({"update"})

        await StateHandler.on_update(caller, StateHandler.state)

    @staticmethod
    async def on_all_tags(caller, sample_id=None):
        state = fos.StateDescription.from_dict(StateHandler.state)
        if state.view is not None:
            view = state.view._dataset
        else:
            view = state.dataset

        if view is None:
            label = []
            sample = []
        else:
            (_, tag_aggs,) = fos.DatasetStatistics.get_label_aggregations(view)
            results = await view._async_aggregate(
                [foa.Distinct("tags")] + tag_aggs,
            )
            sample = results[0]

            label = set()
            for result in results[1:]:
                label |= set(result.keys())

        _write_message(
            {"type": "all_tags", "sample": sample, "label": label}, only=caller
        )

    @staticmethod
    async def on_modal_statistics(caller, sample_id, uuid, filters=None):
        state = fos.StateDescription.from_dict(StateHandler.state)
        if state.view is not None:
            view = state.view
        else:
            view = state.dataset

        if filters is not None:
            view = get_extended_view(
                view, filters, count_labels_tags=False, only_matches=False
            )

        view = view.select(sample_id)

        aggregations = fos.DatasetStatistics(view, filters).aggregations

        results = await view._async_aggregate(aggregations)
        convert(results)

        data = []
        for agg, result in zip(aggregations, results):
            data.append(
                {
                    "_CLS": agg.__class__.__name__,
                    "name": agg.field_name,
                    "result": result,
                }
            )

        message = {"type": "modal_statistics", "stats": data, "uuid": uuid}

        _write_message(message, app=True, only=caller)

    @staticmethod
    async def on_save_filters(caller, add_stages=[], with_selected=False):
        state = fos.StateDescription.from_dict(StateHandler.state)
        if state.view is not None:
            view = state.view
        else:
            view = state.dataset

        view = get_extended_view(view, state.filters)

        if with_selected:
            if state.selected:
                view = view.select(state.selected)
            elif state.selected_labels:
                view = view.select_labels(state.selected_labels)

        for d in add_stages:
            stage = fosg.ViewStage._from_dict(d)
            view = view.add_stage(stage)

        state.selected = []
        state.selected_labels = []
        state.view = view
        state.filters = {}

        await StateHandler.on_update(caller, state.serialize())

    @staticmethod
    async def on_tag_modal(
        caller,
        changes,
        sample_id=None,
        labels=False,
        filters={},
        active_labels=[],
        frame_number=None,
    ):
        state = fos.StateDescription.from_dict(StateHandler.state)
        if state.view is not None:
            view = state.view
        else:
            view = state.dataset

        sample_ids = [sample_id]
        view = get_extended_view(view, filters)

        if labels:
            if state.selected_labels:
                labels = state.selected_labels
                sample_ids = list({label["sample_id"] for label in labels})
                tag_view = view.select_labels(labels=labels)
            else:
                tag_view = view.select(sample_id)

            fosu.change_label_tags(
                tag_view, changes, label_fields=active_labels
            )
        else:
            tag_view = view.select(sample_id)
            fosu.change_sample_tags(tag_view, changes)

        for clients in PollingHandler.clients.values():
            clients.update({"extended_statistics", "statistics"})

        if isinstance(caller, PollingHandler):
            await StateHandler.send_samples(
                sample_id, sample_ids, current_frame=frame_number, only=caller
            )

        awaitables = [
            StateHandler.send_samples(
                sample_id, sample_ids, current_frame=frame_number
            )
        ]
        awaitables += StateHandler.get_statistics_awaitables()

        asyncio.gather(*awaitables)

    @staticmethod
    async def on_tag_statistics(
        caller,
        active_labels=[],
        filters={},
        sample_id=None,
        uuid=None,
        labels=False,
    ):
        state = fos.StateDescription.from_dict(StateHandler.state)
        if state.view is not None:
            view = state.view
        else:
            view = state.dataset

        view = get_extended_view(view, filters)

        if state.selected_labels and labels:
            view = view.select_labels(state.selected_labels)
        elif sample_id:
            view = view.select(sample_id)
        elif state.selected:
            view = view.select(state.selected)

        if labels:
            view = view.select_fields(active_labels)
            (
                count_aggs,
                tag_aggs,
            ) = fos.DatasetStatistics.get_label_aggregations(view)
            results = await view._async_aggregate(count_aggs + tag_aggs)

            count = sum(results[: len(count_aggs)])
            tags = defaultdict(int)
            for result in results[len(count_aggs) :]:
                for tag, num in result.items():
                    tags[tag] += num
        else:
            tags = view.count_values("tags")
            count = sum(tags.values())

        _write_message(
            {
                "type": "tag_statistics",
                "count": count,
                "tags": tags,
                "uuid": uuid,
            },
            only=caller,
        )

    @classmethod
    async def send_samples(
        cls, sample_id, sample_ids, current_frame=None, only=None
    ):
        state = fos.StateDescription.from_dict(StateHandler.state)
        if state.view is not None:
            view = state.view
        else:
            view = state.dataset

        view = get_extended_view(view, state.filters, count_labels_tags=True)
        view = fov.make_optimized_select_view(view, sample_ids)

        if view.media_type == fom.VIDEO and current_frame is not None:
            default_filter = F("frame_number") == 1
            current_filter = F("frame_number").is_in([current_frame, 1])
            filter_frames = lambda f: F("frames").filter(f)
            expr = F.if_else(
                F(view._get_db_fields_map()["id"]).to_string() == sample_id,
                filter_frames(current_filter),
                filter_frames(default_filter),
            )
            view = view.set_field("frames", expr)

        samples = await foo.aggregate(
            StateHandler.sample_collection(),
            view._pipeline(attach_frames=True, detach_frames=False),
        ).to_list(len(sample_ids))
        convert(samples)

        _write_message(
            {"type": "samples_update", "samples": samples}, app=True, only=only
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

        return [
            cls.send_statistics(
                view, extended=False, filters=state.filters, only=only,
            ),
            cls.send_statistics(
                view, extended=True, filters=state.filters, only=only
            ),
        ]

    @classmethod
    async def send_updates(cls, ignore=None, only=None):
        """Sends an update event to the all clients, exluding the ignore
        client, if it is not None.

        Args:
            ignore (None): a client to not send the update to
            only (None): a client to restrict the updates to
        """
        _write_message(
            {"type": "update", "state": StateHandler.state},
            ignore=ignore,
            only=only,
        )

    @classmethod
    async def send_statistics(
        cls, view, extended=False, filters=None, only=None
    ):
        """Sends a statistics event given using the provided view to all App
        clients, unless an only client is provided in which case it is only
        sent to the that client.

        Args:
            view: a view
            extended (False): whether to apply the extended view filters
            filters (None): filter stages to append to the view
            only (None): a client to restrict the message to
        """
        base_view = view
        data = []
        if view is not None and (not extended or filters):
            if extended:
                view = get_extended_view(view, filters)

            aggregations = fos.DatasetStatistics(view, filters).aggregations
            results = await view._async_aggregate(aggregations)
            convert(results)

            for agg, result in zip(aggregations, results):
                data.append(
                    {
                        "_CLS": agg.__class__.__name__,
                        "name": agg.field_name,
                        "result": result,
                    }
                )

        view = (
            base_view._serialize()
            if isinstance(base_view, fov.DatasetView)
            else []
        )

        message = {
            "type": "statistics",
            "stats": data,
            "view": view,
            "filters": filters,
            "extended": extended,
        }

        _write_message(message, app=True, only=only)

    @classmethod
    async def on_count_values(
        cls,
        self,
        path,
        uuid=None,
        selected=[],
        search="",
        asc=False,
        count=True,
        limit=_LIST_LIMIT,
        sample_id=None,
    ):
        state = fos.StateDescription.from_dict(StateHandler.state)
        if state.view is not None:
            view = state.view
        elif state.dataset is not None:
            view = state.dataset

        view = _get_search_view(view, path, search, selected)

        if sample_id is not None:
            view = view.select(sample_id)

        sort_by = "count" if count else "_id"

        count, first = await view._async_aggregate(
            foa.CountValues(path, _first=limit, _asc=asc, _sort_by=sort_by)
        )

        message = {
            "type": "count_values",
            "count": count,
            "results": first,
            "uuid": uuid,
        }
        _write_message(message, app=True, only=self)

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
            view = state.dataset
        else:
            results = []

        view = get_extended_view(view, state.filters)

        if group == "label tags" and results is None:

            def filter(field):
                path = _label_filter(field)

                if path is not None:
                    path = "%s.tags" % path

                return path

            aggs, fields = _count_values(filter, view)
            results = await _gather_results(aggs, fields, view)

        elif group == "labels" and results is None:

            def filter(field):
                path = _label_filter(field)

                if path is not None:
                    path = "%s.label" % path

                return path

            aggs, fields = _count_values(filter, view)
            results = await _gather_results(aggs, fields, view)

        elif group == "sample tags" and results is None:
            aggs = [foa.CountValues("tags", _first=_LIST_LIMIT)]
            try:
                fields = [view.get_field_schema()["tags"]]
                results = await _gather_results(aggs, fields, view)
            except:
                results = []

        elif results is None:

            def filter(field):
                if field.name in {"tags", "filepath"} or field.name.startswith(
                    "_"
                ):
                    return None

                if fos._meets_type(field, (fof.BooleanField, fof.StringField)):
                    return field.name

                return None

            aggs, fields = _count_values(filter, view)

            hist_aggs, hist_fields, ticks = await _numeric_histograms(
                view, view.get_field_schema()
            )
            aggs.extend(hist_aggs)
            fields.extend(hist_fields)
            results = await _gather_results(aggs, fields, view, ticks)

        results = sorted(results, key=lambda i: i["name"])
        _write_message(
            {"type": "distributions", "results": results}, only=self
        )


def _label_filter(field):
    path = None
    if isinstance(field, fof.EmbeddedDocumentField) and issubclass(
        field.document_type, fol.Label
    ):
        path = field.name
        if issubclass(field.document_type, fol._HasLabelList):
            path = "%s.%s" % (path, field.document_type._LABEL_LIST_FIELD,)

    return path


def _get_search_view(view, path, search, selected):
    search = _escape_regex_chars(search)

    fields_map = view._get_db_fields_map()
    if search == "" and not selected:
        return view

    if "." in path:
        fields = path.split(".")
        if view.media_type == fom.VIDEO and fields[0] == "frames":
            field = ".".join(fields[:2])
        else:
            field = fields[0]

        vf = F("label")
        meth = lambda expr: view.filter_labels(field, expr)
    else:
        vf = get_view_field(fields_map, path)
        meth = view.match

    if search != "" and selected:
        expr = vf.re_match(search) & ~vf.is_in(selected)
    elif search != "":
        expr = vf.re_match(search)
    elif selected:
        expr = ~vf.is_in(selected)

    return meth(expr)


def _write_message(message, app=False, session=False, ignore=None, only=None):
    clients = StateHandler.app_clients if app else StateHandler.clients
    clients = _filter_deactivated_clients(clients)

    if only:
        only.write_message(message)
        return

    for client in clients:
        if session and client in StateHandler.app_clients:
            continue

        if client == ignore:
            continue

        client.write_message(message)


def _filter_deactivated_clients(clients):
    global _notebook_clients
    global _deactivated_clients
    active_handle = StateHandler.state["active_handle"]

    filtered = []

    for client in clients:
        if client in _notebook_clients:
            uuid = _notebook_clients[client]
            if uuid != active_handle and uuid not in _deactivated_clients:
                _deactivated_clients.add(uuid)
                client.write_message({"type": "deactivate"})

            if uuid != active_handle:
                continue

        filtered.append(client)

    return filtered


def _create_histogram_key(field, start, end):
    if isinstance(field, (fof.DateField, fof.DateTimeField)):
        return fout.datetime_to_timestamp(start + ((end - start) / 2))

    return round((start + end) / 2, 4)


def _parse_histogram_values(result, field):
    counts, edges, other = result
    data = sorted(
        [
            {
                "key": _create_histogram_key(field, k, edges[idx + 1]),
                "count": v,
                "edges": (k, edges[idx + 1]),
            }
            for idx, (k, v) in enumerate(zip(edges, counts))
        ],
        key=lambda i: i["key"],
    )
    if (
        fos._meets_type(field, fof.IntField)
        and len(data) == _DEFAULT_NUM_HISTOGRAM_BINS
    ):
        for bin_ in data:
            bin_["edges"] = [math.ceil(e) for e in bin_["edges"]]
            bin_["key"] = math.ceil(bin_["key"])
    elif fos._meets_type(field, fof.IntField):
        for bin_ in data:
            del bin_["edges"]

    if other > 0:
        data.append({"key": "None", "count": other})

    return data


def _parse_count_values(result, field):
    return sorted(
        [{"key": k, "count": v} for k, v in result[1]],
        key=lambda i: i["count"],
        reverse=True,
    )


async def _gather_results(aggs, fields, view, ticks=None):
    response = await view._async_aggregate(aggs)

    sorters = {
        foa.HistogramValues: _parse_histogram_values,
        foa.CountValues: _parse_count_values,
    }

    results = []
    for idx, (result, agg) in enumerate(zip(response, aggs)):
        field = fields[idx]
        try:
            type_ = field.document_type.__name__
            cls = field.document_type
        except:
            type_ = field.__class__.__name__
            cls = None

        name = agg.field_name
        if cls and issubclass(cls, fol.Label):
            if view.media_type == fom.VIDEO and name.startswith(
                view._FRAMES_PREFIX
            ):
                name = "".join(name.split(".")[:2])
            else:
                name = name.split(".")[0]

        data = sorters[type(agg)](result, field)
        result_ticks = 0
        if type(agg) == foa.HistogramValues:
            result_ticks = ticks.pop(0)
            if result_ticks is None:
                result_ticks = []
                step = max(len(data) // 4, 1)
                for i in range(0, len(data), step):
                    result_ticks.append(data[i]["key"])

                if result[2] > 0 and len(data) and data[-1]["key"] != "None":
                    result_ticks.append("None")

        if data:
            results.append(
                {
                    "data": data,
                    "name": name,
                    "ticks": result_ticks,
                    "type": type_,
                }
            )

    return results


def _count_values(f, view):
    aggregations = []
    fields = []
    schemas = [(view.get_field_schema(), "")]
    if view.media_type == fom.VIDEO:
        schemas.append((view.get_frame_field_schema(), view._FRAMES_PREFIX))

    for schema, prefix in schemas:
        for field in schema.values():
            path = f(field)
            if path is None:
                continue

            fields.append(field)
            aggregations.append(
                foa.CountValues(
                    "%s%s" % (prefix, path), _first=_LIST_LIMIT, _asc=False
                )
            )

    return aggregations, fields


def _numeric_bounds(paths):
    return [foa.Bounds(path) for path in paths]


async def _numeric_histograms(view, schema, prefix=""):
    paths = []
    fields = []
    numerics = (fof.IntField, fof.FloatField, fof.DateField, fof.DateTimeField)
    for name, field in schema.items():
        if prefix != "" and name == "frame_number":
            continue

        if fos._meets_type(field, numerics):
            paths.append("%s%s" % (prefix, name))
            fields.append(field)

    aggs = _numeric_bounds(paths)
    bounds = await view._async_aggregate(aggs)
    aggregations = []
    ticks = []
    for range_, field, path in zip(bounds, fields, paths):
        bins = _DEFAULT_NUM_HISTOGRAM_BINS
        num_ticks = None
        if range_[0] == range_[1]:
            bins = 1
            if range_[0] is None:
                range_ = [0, 1]

        if isinstance(range_[1], datetime):
            range_ = (range_[0], range_[1] + timedelta(milliseconds=1))
        elif isinstance(range_[1], date):
            range_ = (range_[0], range_[1] + timedelta(days=1))
        else:
            range_ = (range_[0], range_[1] + 1e-6)

        if fos._meets_type(field, fof.IntField):
            delta = range_[1] - range_[0]
            range_ = (range_[0] - 0.5, range_[1] + 0.5)
            if delta < _DEFAULT_NUM_HISTOGRAM_BINS:
                bins = delta + 1
                num_ticks = 0

        ticks.append(num_ticks)
        aggregations.append(foa.HistogramValues(path, bins=bins, range=range_))

    return aggregations, fields, ticks


class FileHandler(tornado.web.StaticFileHandler):
    def set_headers(self):
        super().set_headers()
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Headers", "x-requested-with")
        self.set_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.set_header("content-length", self.get_content_size())
        self.set_header("x-colab-notebook-cache-control", "no-cache")

    def get_content_type(self):
        if self.absolute_path.endswith(".js"):
            return "text/javascript"

        return super().get_content_type()


class MediaHandler(FileHandler):
    @classmethod
    def get_absolute_path(cls, root, path):
        if os.name != "nt":
            path = os.path.join("/", path)

        return path

    def validate_absolute_path(self, root, absolute_path):
        if os.path.isdir(absolute_path) and self.default_filename is not None:
            if not self.request.path.endswith("/"):
                self.redirect(self.request.path + "/", permanent=True)
                return None

            absolute_path = os.path.join(absolute_path, self.default_filename)
        if not os.path.exists(absolute_path):
            raise HTTPError(404)

        if not os.path.isfile(absolute_path):
            raise HTTPError(403, "%s is not a file", self.path)

        return absolute_path


class Application(tornado.web.Application):
    """FiftyOne Tornado Application"""

    def __init__(self, **settings):
        server_path = os.path.dirname(os.path.abspath(__file__))
        rel_web_path = "static"
        web_path = os.path.join(server_path, rel_web_path)
        handlers = [
            (r"/colorscales", ColorscalesHandler),
            (r"/fiftyone", FiftyOneHandler),
            (r"/frames", FramesHandler),
            (r"/filepath/(.*)", MediaHandler, {"path": ""},),
            (r"/notebook", NotebookHandler),
            (r"/page", PageHandler),
            (r"/polling", PollingHandler),
            (r"/reactivate", ReactivateHandler),
            (r"/stages", StagesHandler),
            (r"/state", StateHandler),
            (r"/teams", TeamsHandler),
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
    parser.add_argument(
        "--address", type=str, default=fo.config.default_app_address
    )
    args = parser.parse_args()
    app = Application(debug=foc.DEV_INSTALL)
    app.listen(args.port, address=args.address)
    tornado.ioloop.IOLoop.current().start()
