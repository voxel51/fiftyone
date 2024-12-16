import pytest
from unittest.mock import MagicMock, patch
from starlette.exceptions import HTTPException

from fiftyone.operators.operator import Operator
from fiftyone.operators.executor import (
    execute_or_delegate_operator,
    ExecutionResult,
    ExecutionContext,
)
from fiftyone.operators import OperatorConfig


class EchoOperator(Operator):
    @property
    def config(self):
        return OperatorConfig(name="echo")

    @property
    def uri(self):
        return "@testing/plugin/echo"

    def execute(self, ctx):
        return {"message": ctx.params.get("message", None)}


@pytest.mark.asyncio
@patch("fiftyone.operators.executor.OperatorRegistry")
async def test_execute_or_delegate_operator_with_global_mock(
    mock_registry_cls,
):
    test_op = EchoOperator()
    mock_registry = MagicMock()
    mock_registry.can_execute.return_value = True
    mock_registry.operator_exists.return_value = True
    mock_registry.get_operator.return_value = test_op
    mock_registry_cls.return_value = mock_registry

    request_params = {
        "dataset_name": "test_dataset",
        "operator_uri": test_op.uri,
        "params": {"message": "Hello, World!"},
    }

    result = await execute_or_delegate_operator(test_op.uri, request_params)

    assert isinstance(result, ExecutionResult)
    json_result = result.to_json()
    assert json_result["result"]["message"] == "Hello, World!"
