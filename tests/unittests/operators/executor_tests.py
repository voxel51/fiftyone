import pytest
from unittest.mock import patch

import fiftyone.operators.types as types
from fiftyone.operators.operator import Operator
from fiftyone.operators.executor import (
    execute_or_delegate_operator,
    ExecutionResult,
)
from fiftyone.operators import OperatorConfig


ECHO_URI = "@voxel51/operators/echo"


class EchoOperator(Operator):
    @property
    def config(self):
        return OperatorConfig(name="echo")

    def resolve_input(self, ctx):
        inputs = types.Object()
        inputs.str("message")
        return types.Property(inputs)

    def execute(self, ctx):
        return {"message": ctx.params.get("message", None)}


@pytest.mark.asyncio
@patch("fiftyone.operators.registry.OperatorRegistry.list_operators")
async def test_execute_or_delegate_operator(list_operators):
    list_operators.return_value = [EchoOperator(_builtin=True)]

    request_params = {
        "dataset_name": "test_dataset",
        "operator_uri": ECHO_URI,
        "params": {"message": "Hello, World!"},
    }

    result = await execute_or_delegate_operator(ECHO_URI, request_params)

    assert isinstance(result, ExecutionResult)
    json_result = result.to_json()
    assert json_result["result"]["message"] == "Hello, World!"
