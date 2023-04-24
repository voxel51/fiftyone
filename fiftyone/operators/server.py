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
from .executor import execute_operator, resolve_type, resolve_placement
from starlette.exceptions import HTTPException


class ListOperators(HTTPEndpoint):
    @route
    async def get(self, request: Request, data: dict):
        registry = OperatorRegistry()
        operators_as_json = [
            operator.to_json() for operator in registry.list_operators()
        ]
        return {"operators": operators_as_json, "errors": registry.list_errors()}

class ResolvePlacements(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        registry = OperatorRegistry()
        placements = []
        for operator in registry.list_operators():
            placement = resolve_placement(operator, data)
            if placement is not None:
                placements.append({
                    "operator_name": operator.name,
                    "placement": placement.to_json(),
                })
        return {"placements": placements}

class ExecuteOperator(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        operator_name = data.get("operator_name", None)
        if operator_name is None:
            raise ValueError("Operator name must be provided")
        registry = OperatorRegistry()
        if registry.operator_exists(operator_name) is False:
            erroDetail = {
                "message": "Operator '%s' does not exist" % operator_name,
                "loading_errors": registry.list_errors(),
            }
            raise HTTPException(status_code=404, detail=erroDetail)
        result = execute_operator(operator_name, data)
        json = result.to_json()
        if result.error is not None:
            print(result.error)
            raise HTTPException(status_code=500, detail=json)
        return json

class ResolveType(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        operator_name = data.get("operator_name", None)
        target_type = data.get("type", None)
        if operator_name is None:
            raise ValueError("Operator name must be provided")
        registry = OperatorRegistry()
        if registry.operator_exists(operator_name) is False:
            erroDetail = {
                "message": "Operator '%s' does not exist" % operator_name,
                "loading_errors": registry.list_errors(),
            }
            raise HTTPException(status_code=404, detail=erroDetail)
        result = resolve_type(registry, operator_name, data)
        return result.to_json()


OperatorRoutes = [
    ("/operators", ListOperators),
    ("/operators/execute", ExecuteOperator),
    ("/operators/resolve-type", ResolveType),
    ("/operators/resolve-placements", ResolvePlacements),
]
