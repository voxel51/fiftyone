"""
FiftyOne operator server.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .registry import list_operators, operator_exists, get_operator
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from fiftyone.server.decorators import route
from .executor import execute_operator
from .loader import list_module_errors
from starlette.exceptions import HTTPException


class ListOperators(HTTPEndpoint):
    @route
    async def get(self, request: Request, data: dict):
        operators_as_json = [
            operator.to_json() for operator in list_operators()
        ]
        return {"operators": operators_as_json, "errors": list_module_errors()}


class ExecuteOperator(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        operator_name = data.get("operator_name", None)
        if operator_name is None:
            raise ValueError("Operator name must be provided")
        if operator_exists(operator_name) is False:
            erroDetail = {
                "message": "Operator '%s' does not exist" % operator_name,
                "loading_errors": list_module_errors(),
            }
            raise HTTPException(status_code=404, detail=erroDetail)
        result = execute_operator(operator_name, data)
        json = result.to_json()
        if result.error is not None:
            print(result.error)
            raise HTTPException(status_code=500, detail=json)
        return json


OperatorRoutes = [
    ("/operators", ListOperators),
    ("/operators/execute", ExecuteOperator),
]
