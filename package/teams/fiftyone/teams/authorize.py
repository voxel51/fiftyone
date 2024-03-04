"""
FiftyOne Teams authorization.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import re
import typing as t
from inspect import isclass

from starlette.endpoints import HTTPEndpoint, WebSocketEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse
from strawberry.field import StrawberryField as Field
import strawberry.permission as gqlp

from fiftyone.core.utils import to_slug
from fiftyone.internal.requests import make_request
from fiftyone.internal.util import get_api_url, get_token_from_request
from fiftyone.server.data import Info
from fiftyone.server.decorators import load_variables

from fiftyone.teams.authenticate import authenticate
from fiftyone.teams.routes import NEEDS_EDIT


_API_URL = get_api_url()
_CAN_EDIT = {"EDIT", "MANAGE"}
_CAN_VIEW = {"COMMENT", "EDIT", "MANAGE", "VIEW"}
_DATASET_PERMISSION_QUERY = """
query DatasetPermission($identifier: String!) {
    dataset(identifier: $identifier) {
        viewer {
          activePermission
        }
    }
}
"""
_GRAPHQL_FIELDS = {
    # mutations
    "set_color_scheme",
    "set_dataset_color_scheme",
    "set_sidebar_groups",
    "set_view",
    "create_saved_view",
    "delete_saved_view",
    "update_saved_view",
    "search_select_fields",
    # queries
    "aggregate",
    "dataset",
    "aggregations",
    "lightning",
    "colorscale",
    "config",
    "samples",
    "sample",
    "stage_definitions",
    "saved_views",
    "schema_for_view_stages",
}

_GRAPHQL_NEEDS_VIEWER = {
    # queries
    "aggregate": lambda v: v["dataset"],
    "dataset": lambda v: v["name"],
    "aggregations": lambda v: v["form"]["dataset"],
    "lightning": lambda v: v["input"]["dataset"],
    "samples": lambda v: v["dataset"],
    "sample": lambda v: v["dataset"],
    "saved_views": lambda v: v["name"],
    "schema_for_view_stages": lambda v: v["name"],
}

_GRAPHQL_NEEDS_EDITOR = {
    # mutations
    "set_dataset_color_scheme": lambda v: v["datasetName"],
    "set_sidebar_groups": lambda v: v["dataset"],
    "create_saved_view": lambda v: v["datasetName"],
    "delete_saved_view": lambda v: v["datasetName"],
    "update_saved_view": lambda v: v["datasetName"],
}


class IsAuthenticated(gqlp.BasePermission):
    message = "Unauthenticated request"

    async def has_permission(
        self, source: t.Any, info: Info, **kwargs: t.Dict
    ) -> bool:
        try:
            authenticate(get_token_from_request(info.context.request))
        except:
            return False

        return True


class IsAuthorized(gqlp.BasePermission):
    message = "Unauthorized request"

    async def has_permission(self, _, info: Info, **__) -> bool:
        # convert camel case field names to snake case
        pattern = re.compile(r"(?<!^)(?=[A-Z])")
        name = pattern.sub("_", info.field_name).lower()

        if name in _GRAPHQL_NEEDS_EDITOR:
            dataset_name = _GRAPHQL_NEEDS_EDITOR[name](info.variable_values)
        elif name in _GRAPHQL_NEEDS_VIEWER:
            dataset_name = _GRAPHQL_NEEDS_VIEWER[name](info.variable_values)
        else:
            raise ValueError("unexpected")

        return await _has_dataset_permission(
            get_token_from_request(info.context.request),
            dataset_name,
            edit=name in _GRAPHQL_NEEDS_EDITOR,
        )


class NotAllowed(gqlp.BasePermission):
    message = "Not Allowed"

    async def has_permission(self, *_, **__) -> bool:
        return False


def authorize(endpoint):
    def set_methods(methods):
        for method in methods:
            func = getattr(endpoint, method, None)

            if func:
                setattr(endpoint, method, _authorize_route(func))

        return endpoint

    if isclass(endpoint):
        setattr(endpoint, "requires_authentication", True)

    if isclass(endpoint) and issubclass(endpoint, HTTPEndpoint):
        return set_methods(["get", "post"])

    if isclass(endpoint) and issubclass(endpoint, WebSocketEndpoint):
        return set_methods(["on_connect", "on_receive", "on_disconnect"])

    return _authorize_route(endpoint)


def authorize_gql_class(query: t.Type[t.Any]) -> t.Type[t.Any]:
    fields: t.List[Field] = query._type_definition._fields
    for field in fields:
        if field.name not in _GRAPHQL_FIELDS:
            field.permission_classes = [NotAllowed]
            continue

        field.permission_classes = [IsAuthenticated]
        if (
            field.name in _GRAPHQL_NEEDS_EDITOR
            or field.name in _GRAPHQL_NEEDS_VIEWER
        ):
            field.permission_classes.append(IsAuthorized)

    return query


def _authorize_route(func):
    async def authorize_request(endpoint: HTTPEndpoint, request: Request):
        needs_edit_resolver = None
        for item in NEEDS_EDIT:
            if isinstance(endpoint, item):
                needs_edit_resolver = NEEDS_EDIT[item]
        variables = await load_variables(request)
        token = get_token_from_request(request)
        try:
            authenticate(token)
        except:
            return JSONResponse({"error": "Unauthorized"}, status_code=401)

        dataset_name = _get_dataset_name(variables)
        if dataset_name and not (
            await _has_dataset_permission(
                token,
                dataset_name,
                edit=needs_edit_resolver and needs_edit_resolver(variables),
            )
        ):
            return JSONResponse({"error": "Forbidden"}, status_code=403)

        if request.method == "GET":
            return await func(endpoint, request)

        return await func(endpoint, request, variables=variables)

    return authorize_request


def _get_dataset_name(variables):
    if "dataset" in variables:
        return variables["dataset"]

    if "datasetName" in variables:
        return variables["datasetName"]

    return None


async def _has_dataset_permission(token: str, dataset_name: str, edit=False):
    try:
        data = await make_request(
            f"{_API_URL}/graphql/v1",
            token,
            _DATASET_PERMISSION_QUERY,
            variables={"identifier": to_slug(dataset_name)},
        )
        permission = data["data"]["dataset"]["viewer"]["activePermission"]

        if edit:
            return permission in _CAN_EDIT

        return permission in _CAN_VIEW
    except:
        return False
