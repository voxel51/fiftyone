"""
FiftyOne operator server.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .registry import OperatorRegistry
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from fiftyone.server.decorators import route
from .executor import (
    execute_operator,
    resolve_type,
    resolve_placement,
    ExecutionContext,
)
from starlette.exceptions import HTTPException
from starlette.responses import StreamingResponse
from .message import GeneratedMessage
from .permissions import PermissionedOperatorRegistry


class ListOperators(HTTPEndpoint):
    @route
    async def get(self, request: Request, data: dict):
        registry = PermissionedOperatorRegistry.from_list_request(request)
        ctx = ExecutionContext()
        operators_as_json = [
            operator.to_json(ctx) for operator in registry.list_operators()
        ]
        return {
            "operators": operators_as_json,
            "errors": registry.list_errors(),
        }


class ResolvePlacements(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        registry = PermissionedOperatorRegistry.from_exec_request(request)
        placements = []
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
        operator_uri = data.get("operator_uri", None)
        if operator_uri is None:
            raise ValueError("Operator URI must be provided")
        registry = PermissionedOperatorRegistry.from_exec_request(request)
        if registry.operator_exists(operator_uri) is False:
            erroDetail = {
                "message": "Operator '%s' does not exist" % operator_uri
                or "None",
                "loading_errors": registry.list_errors(),
            }
            raise HTTPException(status_code=404, detail=erroDetail)
        result = execute_operator(operator_uri, data)
        json = result.to_json()
        if result.error is not None:
            print(result.error)
            raise HTTPException(status_code=500, detail=json)
        return json


async def create_response_generator(generator):
    async for generated_message in generator:
        if isinstance(generated_message, GeneratedMessage):
            line = generated_message.to_json_line()
            yield line


class ExecuteOperatorAsGenerator(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        operator_uri = data.get("operator_uri", None)
        if operator_uri is None:
            raise ValueError("Operator URI must be provided")
        registry = PermissionedOperatorRegistry.from_exec_request(request)
        if registry.operator_exists(operator_uri) is False:
            erroDetail = {
                "message": "Operator '%s' does not exist" % operator_uri
                or "None",
                "loading_errors": registry.list_errors(),
            }
            raise HTTPException(status_code=404, detail=erroDetail)

        execution_result = execute_operator(operator_uri, data)
        if execution_result.is_generator:
            generator = create_response_generator(execution_result.result)
            return StreamingResponse(
                generator,
                media_type="application/json",
                headers={
                    "Cache-Control": "no-cache, no-transform",
                    "X-Accel-Buffering": "no",
                },
            )
        else:
            json = execution_result.to_json()
            if execution_result.error is not None:
                print(execution_result.error)
                raise HTTPException(status_code=500, detail=json)
            return json


class ResolveType(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        operator_uri = data.get("operator_uri", None)
        target_type = data.get("type", None)
        if operator_uri is None:
            raise ValueError("Operator URI must be provided")
        registry = PermissionedOperatorRegistry.from_exec_request(request)
        if registry.operator_exists(operator_uri) is False:
            erroDetail = {
                "message": "Operator '%s' does not exist" % operator_uri,
                "loading_errors": registry.list_errors(),
            }
            raise HTTPException(status_code=404, detail=erroDetail)
        result = resolve_type(registry, operator_uri, data)
        if result:
            return result.to_json()
        else:
            return {}


OperatorRoutes = [
    ("/operators", ListOperators),
    ("/operators/execute", ExecuteOperator),
    ("/operators/execute/generator", ExecuteOperatorAsGenerator),
    ("/operators/resolve-type", ResolveType),
    ("/operators/resolve-placements", ResolvePlacements),
]
