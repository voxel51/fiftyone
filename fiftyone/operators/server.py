"""
FiftyOne operator server.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import json
import types
import typing

from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import JSONResponse, StreamingResponse

from fiftyone.server.decorators import route
from . import OperatorRegistry
from .executor import (
    ExecutionContext,
    execute_or_delegate_operator,
    resolve_placement,
    resolve_type,
)
from .message import GeneratedMessage
from .permissions import PermissionedOperatorRegistry


__REGISTRY: typing.Union[
    OperatorRegistry, PermissionedOperatorRegistry, None
] = None


class ListOperators(HTTPEndpoint):
    @route
    async def get(self, request: Request, data: dict):
        registry = await PermissionedOperatorRegistry.from_list_request(
            request
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
        dataset_name, operator_uri = _parse_dataset_and_operator(data)

        # Since resolve_placements is called first in any operator's execution
        # pipeline, we get the registry here so that we know when
        # resolve_type and execute are called, the executed operators are
        # the same as the ones that were resolved and triggered on the client
        global __REGISTRY
        __REGISTRY = await _get_registry(request, dataset_name=dataset_name)

        placements = []
        for operator in __REGISTRY.list_operators():
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
        dataset_name, operator_uri = _parse_dataset_and_operator(data)
        _check_registry_permissions(operator_uri)

        result = await execute_or_delegate_operator(operator_uri, data)
        # Reset the registry after execution
        global __REGISTRY
        __REGISTRY = None
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
        dataset_name, operator_uri = _parse_dataset_and_operator(data)
        _check_registry_permissions(operator_uri)

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
        dataset_name, operator_uri = _parse_dataset_and_operator(data)

        global __REGISTRY
        _check_registry_permissions(operator_uri)

        result = resolve_type(__REGISTRY, operator_uri, data)
        return result.to_json() if result else {}


def _parse_dataset_and_operator(
    data: typing.Dict[str, str], error_if_none=True
) -> typing.Tuple[typing.Union[str, None], typing.Union[str, None]]:
    dataset_name = data.get("dataset_name", None)
    operator_uri = data.get("operator_uri", None)
    if error_if_none and (None in [dataset_name, operator_uri]):
        #  Since operators can only be executed within the context of a
        #  dataset,
        #  for most cases, both the dataset name and operator URI are required
        raise ValueError("Dataset name and operator URI must be provided")
    return dataset_name, operator_uri


async def _get_registry(
    request,
    dataset_name: typing.Optional[str] = None,
    operator_uri: typing.Optional[str] = None,
) -> typing.Union[OperatorRegistry, PermissionedOperatorRegistry]:
    """
    Get the operator registry for the given request. Should be called only
    once in the operator execution pipeline when the client resolves the
    available operators in the UI.
    """
    # For listing all operators known to the filesystem, dataset_name
    # and operator_uri may be None
    if not any([dataset_name, operator_uri]):
        return await PermissionedOperatorRegistry.from_list_request(request)
    else:
        registry = await PermissionedOperatorRegistry.from_exec_request(
            request, dataset_ids=[dataset_name]
        )

    if operator_uri:
        _check_registry_permissions(operator_uri)

    return registry


def _check_registry_permissions(operator_uri) -> None:
    global __REGISTRY
    if __REGISTRY is None:
        # This should never happen, but just in case, raise an error rather
        # than fail silently so that we can debug
        raise ValueError(
            "check registry called before registry was " "initialised"
        )
    if __REGISTRY.operator_exists(operator_uri) is False:
        error_detail = {
            "message": "Operator '%s' does not exist" % operator_uri,
            "loading_errors": __REGISTRY.list_errors(),
        }
        raise HTTPException(status_code=404, detail=json.dumps(error_detail))


OperatorRoutes = [
    ("/operators", ListOperators),
    ("/operators/execute", ExecuteOperator),
    ("/operators/execute/generator", ExecuteOperatorAsGenerator),
    ("/operators/resolve-type", ResolveType),
    ("/operators/resolve-placements", ResolvePlacements),
]
