"""
FiftyOne Server state.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import date, datetime, timedelta
import math
import tornado.web
import tornado.websocket

import fiftyone.core.aggregations as foa
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
import fiftyone.core.state as fos
import fiftyone.core.view as fov
import fiftyone.core.utils as fou

from fiftyone.server.view import get_extended_view
import fiftyone.server.routes.notebook as fosn
import fiftyone.server.utils as fosu


_deactivated_clients = set()
_DEFAULT_NUM_HISTOGRAM_BINS = 25
LIST_LIMIT = 25

_app_clients = set()
_clients = set()
_state = fos.StateDescription().serialize()

def get_state():
    return _state

def set_state():
    return _state

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

    prev_state = fos.StateDescription().serialize()

    @staticmethod
    async def on_capture(self, src, width):
        _write_message(
            {
                "type": "capture",
                "handle": fosn.get_notebook(self),
                "src": src,
                "width": width,
            }
        )

    @staticmethod
    async def on_as_app(self, notebook=False, handle=None, ignore=None):
        """Event for registering a client as an App."""
        if isinstance(self, StateHandler):
            StateHandler.app_clients.add(self)

        if isinstance(self, StateHandler) and notebook:
            fosn.set_notebook(self, handle)

    @staticmethod
    async def on_refresh(self, polling_client=None):
        """Event for refreshing an App client."""
        state = fos.StateDescription.from_dict(StateHandler.state)
        state.refresh = not state.refresh
        StateHandler.state = state.serialize()

        if polling_client:
            PollingHandler.clients[polling_client].update({"update"})
        else:
            await self.send_updates(only=self)

    @staticmethod
    async def on_update(caller, state, ignore_polling_client=None):
        """Event for state updates. Sends an update message to all active
        clients, and statistics messages to active App clients.

        Args:
            state: a serialized :class:`fiftyone.core.state.StateDescription`
        """
        StateHandler.state = fos.StateDescription.from_dict(state).serialize()
        active_handle = state.get("active_handle", None)
        global _deactivated_clients
        _deactivated_clients.discard(active_handle)

        # ignore deactivated notebook cells
        if (
            active_handle
            and fosn.get_notebook(caller)
            and fosn.get_notebook(caller) != active_handle
        ):
            return

        for client, events in PollingHandler.clients.items():
            if fosn.get_notebook(client):
                uuid = fosn.get_notebook(client)

                # deactivate the last active colab cell
                if uuid != active_handle:
                    events.clear()
                    _deactivated_clients.add(uuid)
                    events.add("deactivate")
                    continue

            events.update({"update"})

        await StateHandler.send_updates(),

    @classmethod
    async def on_distributions(cls, self, group, limit=200, filters=None):
        state = fos.StateDescription.from_dict(StateHandler.state)
        results = None
        if state.view is not None:
            view = state.view
        elif state.dataset is not None:
            view = state.dataset
        else:
            results = []

        view = get_extended_view(view, filters)

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
            aggs = [foa.CountValues("tags", _first=limit)]
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

                if fosu.meets_type(field, (fof.BooleanField, fof.StringField)):
                    return field.name

                return None

            aggs, fields = _count_values(filter, view)

            (
                hist_aggs,
                hist_fields,
                ticks,
                nonfinites,
            ) = await _numeric_histograms(view, view.get_field_schema())
            aggs.extend(hist_aggs)
            fields.extend(hist_fields)
            results = await _gather_results(aggs, fields, view, ticks)
            for result, nonfinites in zip(
                results[-len(hist_aggs) :], nonfinites
            ):
                data = result["data"]
                if data and data[-1]["key"] == "None":
                    data[-1]["count"] -= sum(
                        map(lambda v: v["count"], nonfinites)
                    )

                data.extend(nonfinites)

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
    global _deactivated_clients
    active_handle = StateHandler.state["active_handle"]

    filtered = []

    for client in clients:
        if fosn.get_notebook(client):
            uuid = fosn.get_notebook(client)
            if uuid != active_handle and uuid not in _deactivated_clients:
                _deactivated_clients.add(uuid)
                client.write_message({"type": "deactivate"})

            if uuid != active_handle:
                continue

        filtered.append(client)

    return filtered


def _create_histogram_key(field, start, end):
    if isinstance(field, (fof.DateField, fof.DateTimeField)):
        return fou.datetime_to_timestamp(start + ((end - start) / 2))

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
        fosu.meets_type(field, fof.IntField)
        and len(data) == _DEFAULT_NUM_HISTOGRAM_BINS
    ):
        for bin_ in data:
            bin_["edges"] = [math.ceil(e) for e in bin_["edges"]]
            bin_["key"] = math.ceil(bin_["key"])
    elif fosu.meets_type(field, fof.IntField):
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
                    "%s%s" % (prefix, path), _first=LIST_LIMIT, _asc=False
                )
            )

    return aggregations, fields


def _numeric_bounds(paths):
    return [
        foa.Bounds(path, safe=True, _count_nonfinites=True) for path in paths
    ]


async def _numeric_histograms(view, schema, prefix=""):
    paths = []
    fields = []
    numerics = (fof.IntField, fof.FloatField, fof.DateField, fof.DateTimeField)
    for name, field in schema.items():
        if prefix != "" and name == "frame_number":
            continue

        if fosu.meets_type(field, numerics):
            paths.append("%s%s" % (prefix, name))
            fields.append(field)

    aggs = _numeric_bounds(paths)
    bounds = await view._async_aggregate(aggs)
    aggregations = []
    ticks = []
    nonfinites = []
    for result, field, path in zip(bounds, fields, paths):
        range_ = result.pop("bounds")
        result = [{"key": k, "count": v} for k, v in result.items() if v > 0]
        nonfinites.append(result)
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

        if fosu.meets_type(field, fof.IntField):
            delta = range_[1] - range_[0]
            range_ = (range_[0] - 0.5, range_[1] + 0.5)
            if delta < _DEFAULT_NUM_HISTOGRAM_BINS:
                bins = delta + 1
                num_ticks = 0

        ticks.append(num_ticks)
        aggregations.append(foa.HistogramValues(path, bins=bins, range=range_))

    return aggregations, fields, ticks, nonfinites
