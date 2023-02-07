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
from .loader import load_from_dir
from .executor import execute_operator


class ListOperators(HTTPEndpoint):
    @route
    async def get(self, request: Request, data: dict):
        load_from_dir()
        operators_as_json = [
            operator.to_json() for operator in list_operators()
        ]
        return {"operators": operators_as_json}


class ExecuteOperator(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        load_from_dir()
        operator_name = data.get("operator_name", None)
        if operator_name is None:
            raise ValueError("Operator name must be provided")
        if operator_exists(operator_name) is False:
            raise ValueError("Operator '%s' does not exist" % operator_name)
        result = execute_operator(operator_name, data)
        return result.to_json()


OperatorRoutes = [
    ("/operators", ListOperators),
    ("/operators/execute", ExecuteOperator),
]
