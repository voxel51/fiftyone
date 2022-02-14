"""
FiftyOne Server /values route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone.core.aggregations as foa
from fiftyone.core.expressions import ViewField as F, _escape_regex_chars
import fiftyone.core.media as fom
import fiftyone.core.state as fos

from fiftyone.server.decorators import route
from fiftyone.server.routes.state import LIST_LIMIT, StateHandler
from fiftyone.server.view import get_view_field

class Values(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        path = data["path"]
        uuid = data["uuid"]
        selected = data["selected"]
        search = data["search"]
        asc = data["asc"]
        count = data["count"]
        limit = data["limit", LIST_LIMIT]
        sample_id = data.get("sample_id", None)

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

        return {
            "type": "count_values",
            "count": count,
            "results": first,
            "uuid": uuid,
        }


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

