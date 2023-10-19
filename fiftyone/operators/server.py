"""
FiftyOne operator server.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import types
from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import JSONResponse, StreamingResponse

from fiftyone.server.decorators import route

from .executor import (
    execute_or_delegate_operator,
    resolve_type,
    resolve_placement,
    ExecutionContext,
    is_snapshot,  # teams-only
)
from .message import GeneratedMessage
from .permissions import PermissionedOperatorRegistry
from fiftyone.utils.decorators import route_requires_auth
from .registry import OperatorRegistry
from fiftyone.plugins.permissions import get_token_from_request


async def _get_operator_registry_for_route(
    RouteClass, request: Request, dataset_ids=None, is_list=False
):
    requires_authentication = route_requires_auth(RouteClass)
    if requires_authentication:
        if is_list:
            registry = await PermissionedOperatorRegistry.from_list_request(
                request
            )
        else:
            registry = await PermissionedOperatorRegistry.from_exec_request(
                request, dataset_ids
            )
    else:
        registry = OperatorRegistry()
    return registry


def resolve_dataset_name(request_params: dict):
    try:
        ctx = ExecutionContext(request_params)
        return ctx.dataset.head_name
    except:
        return request_params.get("dataset_name", None)


class ListOperators(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        dataset_name = data.get("dataset_name", None)
        dataset_ids = [dataset_name]
        registry = await _get_operator_registry_for_route(
            self.__class__, request, is_list=True, dataset_ids=dataset_ids
        )
        ctx = ExecutionContext()
        operators_as_json = [
            operator.to_json(ctx) for operator in registry.list_operators()
        ]
        for operator in operators_as_json:
            config = operator["config"]
            config["can_execute"] = registry.can_execute(operator["uri"])

        return {
            "operators": operators_as_json,
            "errors": registry.list_errors(),
        }


class ResolvePlacements(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        dataset_name = resolve_dataset_name(data)
        if dataset_name is None:
            raise ValueError("Dataset name must be provided")

        dataset_ids = [dataset_name]
        registry = await _get_operator_registry_for_route(
            ResolvePlacements, request, dataset_ids=dataset_ids
        )
        placements = []

        # teams-only
        dataset_raw_name = data.get("dataset_name", None)
        if is_snapshot(dataset_raw_name):
            return {"placements": placements}

        for operator in registry.list_operators():
            placement = resolve_placement(operator, data)
            if placement is not None:
                placements.append(
                    {
                        "operator_uri": operator.uri,
                        "placement": placement.to_json(),
                    }
                )

        return {"placements": placements}


class ExecuteOperator(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:

        user = request.get("user", None)
        dataset_name = resolve_dataset_name(data)
        dataset_ids = [dataset_name]
        operator_uri = data.get("operator_uri", None)
        if operator_uri is None:
            raise ValueError("Operator URI must be provided")

        registry = await _get_operator_registry_for_route(
            self.__class__, request, dataset_ids=dataset_ids
        )
        if registry.can_execute(operator_uri) is False:
            return create_permission_error(operator_uri)

        if registry.operator_exists(operator_uri) is False:
            error_detail = {
                "message": "Operator '%s' does not exist" % operator_uri
                or "None",
                "loading_errors": registry.list_errors(),
            }
            raise HTTPException(status_code=404, detail=error_detail)
        request_token = get_token_from_request(request)

        result = await execute_or_delegate_operator(
            operator_uri,
            data,
            request_token=request_token,
            user=(user.sub if user else None),
        )
        return result.to_json()


def create_response_generator(generator):
    for generated_message in generator:
        if isinstance(generated_message, GeneratedMessage):
            line = generated_message.to_json_line()
            yield line


async def create_response_async_generator(generator):
    async for generated_message in generator:
        if isinstance(generated_message, GeneratedMessage):
            line = generated_message.to_json_line()
            yield line


def create_permission_error(uri):
    message = "User does not have permission to execute operator '%s'" % uri
    return JSONResponse(
        {"error": {"message": message}},
        status_code=403,
    )


class ExecuteOperatorAsGenerator(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        user = request.get("user", None)
        dataset_name = resolve_dataset_name(data)
        dataset_ids = [dataset_name]
        operator_uri = data.get("operator_uri", None)
        if operator_uri is None:
            raise ValueError("Operator URI must be provided")

        registry = await _get_operator_registry_for_route(
            self.__class__, request, dataset_ids=dataset_ids
        )
        if registry.can_execute(operator_uri) is False:
            return create_permission_error(operator_uri)

        if registry.operator_exists(operator_uri) is False:
            error_detail = {
                "message": "Operator '%s' does not exist" % operator_uri
                or "None",
                "loading_errors": registry.list_errors(),
            }
            raise HTTPException(status_code=404, detail=error_detail)
        # request token is teams-only
        request_token = get_token_from_request(request)
        execution_result = await execute_or_delegate_operator(
            operator_uri,
            data,
            request_token=request_token,
            user=(user.sub if user else None),
        )
        if execution_result.is_generator:
            result = execution_result.result
            generator = (
                create_response_async_generator(result)
                if isinstance(result, types.AsyncGeneratorType)
                else create_response_generator(result)
            )
            return StreamingResponse(
                generator,
                media_type="application/json",
                headers={
                    "Cache-Control": "no-cache, no-transform",
                    "X-Accel-Buffering": "no",
                },
            )
        else:
            return execution_result.to_json()


class ResolveType(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        dataset_name = resolve_dataset_name(data)
        dataset_ids = [dataset_name]
        operator_uri = data.get("operator_uri", None)
        if operator_uri is None:
            raise ValueError("Operator URI must be provided")

        registry = await _get_operator_registry_for_route(
            self.__class__, request, dataset_ids=dataset_ids
        )
        if registry.can_execute(operator_uri) is False:
            return create_permission_error(operator_uri)

        if registry.operator_exists(operator_uri) is False:
            error_detail = {
                "message": "Operator '%s' does not exist" % operator_uri,
                "loading_errors": registry.list_errors(),
            }
            raise HTTPException(status_code=404, detail=error_detail)

        result = resolve_type(registry, operator_uri, data)
        return result.to_json() if result else {}


OperatorRoutes = [
    ("/operators", ListOperators),
    ("/operators/execute", ExecuteOperator),
    ("/operators/execute/generator", ExecuteOperatorAsGenerator),
    ("/operators/resolve-type", ResolveType),
    ("/operators/resolve-placements", ResolvePlacements),
]
