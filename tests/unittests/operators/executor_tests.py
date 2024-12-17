import pytest
from unittest.mock import MagicMock, patch
from starlette.exceptions import HTTPException

import fiftyone.operators.types as types
from fiftyone.operators.operator import Operator
from fiftyone.operators.executor import (
    execute_or_delegate_operator,
    ExecutionResult,
    ExecutionContext,
)
from fiftyone.operators import OperatorConfig
import fiftyone.operators.builtin as builtin


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


# Force registration of the operator for testing
builtin.BUILTIN_OPERATORS.append(EchoOperator(_builtin=True))


@pytest.mark.asyncio
async def test_execute_or_delegate_operator():
    request_params = {
        "dataset_name": "test_dataset",
        "operator_uri": ECHO_URI,
        "params": {"message": "Hello, World!"},
    }

    result = await execute_or_delegate_operator(ECHO_URI, request_params)

    assert isinstance(result, ExecutionResult)
    json_result = result.to_json()
    assert json_result["result"]["message"] == "Hello, World!"
