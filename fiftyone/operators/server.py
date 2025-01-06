"""
FiftyOne operator server.

| Copyright 2017-2025, Voxel51, Inc.
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
    resolve_execution_options,
)
from .message import GeneratedMessage
from .permissions import PermissionedOperatorRegistry
from .utils import is_method_overridden
from .operator import Operator


def get_operators(registry: PermissionedOperatorRegistry):
    operators = registry.list_operators(type="operator")
    panels = registry.list_operators(type="panel")
    return operators + panels


class ListOperators(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        dataset_name = data.get("dataset_name", None)
        dataset_ids = [dataset_name]
        registry = await PermissionedOperatorRegistry.from_list_request(
            request, dataset_ids=dataset_ids
        )
        operators_as_json = []
        for operator in get_operators(registry):
            serialized_op = operator.to_json()
            config = serialized_op["config"]
            skip_input = not is_method_overridden(
                Operator, operator, "resolve_input"
            )
            skip_output = not is_method_overridden(
                Operator, operator, "resolve_output"
            )
            config["skip_input"] = skip_input
            config["skip_output"] = skip_output
            config["can_execute"] = registry.can_execute(serialized_op["uri"])
            operators_as_json.append(serialized_op)

        return {
            "operators": operators_as_json,
            "errors": registry.list_errors(),
        }


class ResolvePlacements(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        dataset_name = data.get("dataset_name", None)
        dataset_ids = [dataset_name]
        registry = await PermissionedOperatorRegistry.from_exec_request(
            request, dataset_ids=dataset_ids
        )
        placements = []
        for operator in get_operators(registry):
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
        dataset_name = data.get("dataset_name", None)
        dataset_ids = [dataset_name]
        operator_uri = data.get("operator_uri", None)
        if operator_uri is None:
            raise ValueError("Operator URI must be provided")

        registry = await PermissionedOperatorRegistry.from_exec_request(
            request, dataset_ids=dataset_ids
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

        result = await execute_or_delegate_operator(operator_uri, data)
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
        dataset_name = data.get("dataset_name", None)
        dataset_ids = [dataset_name]
        operator_uri = data.get("operator_uri", None)
        if operator_uri is None:
            raise ValueError("Operator URI must be provided")

        registry = await PermissionedOperatorRegistry.from_exec_request(
            request, dataset_ids=dataset_ids
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

        execution_result = await execute_or_delegate_operator(
            operator_uri, data
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
        dataset_name = data.get("dataset_name", None)
        dataset_ids = [dataset_name]
        operator_uri = data.get("operator_uri", None)
        if operator_uri is None:
            raise ValueError("Operator URI must be provided")

        registry = await PermissionedOperatorRegistry.from_exec_request(
            request, dataset_ids=dataset_ids
        )
        if registry.can_execute(operator_uri) is False:
            return create_permission_error(operator_uri)

        if registry.operator_exists(operator_uri) is False:
            error_detail = {
                "message": "Operator '%s' does not exist" % operator_uri,
                "loading_errors": registry.list_errors(),
            }
            raise HTTPException(status_code=404, detail=error_detail)

        result = await resolve_type(registry, operator_uri, data)
        return result.to_json() if result else {}


class ResolveExecutionOptions(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        dataset_name = data.get("dataset_name", None)
        dataset_ids = [dataset_name]
        operator_uri = data.get("operator_uri", None)
        if operator_uri is None:
            raise ValueError("Operator URI must be provided")

        registry = await PermissionedOperatorRegistry.from_exec_request(
            request, dataset_ids=dataset_ids
        )
        if registry.can_execute(operator_uri) is False:
            return create_permission_error(operator_uri)

        if registry.operator_exists(operator_uri) is False:
            error_detail = {
                "message": "Operator '%s' does not exist" % operator_uri,
                "loading_errors": registry.list_errors(),
            }
            raise HTTPException(status_code=404, detail=error_detail)

        result = await resolve_execution_options(registry, operator_uri, data)
        return result.to_dict() if result else {}


OperatorRoutes = [
    ("/operators", ListOperators),
    ("/operators/execute", ExecuteOperator),
    ("/operators/execute/generator", ExecuteOperatorAsGenerator),
    ("/operators/resolve-type", ResolveType),
    ("/operators/resolve-placements", ResolvePlacements),
    ("/operators/resolve-execution-options", ResolveExecutionOptions),
]
