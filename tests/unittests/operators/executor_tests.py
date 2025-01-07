"""
Unit tests for operators utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
import unittest.mock

from fiftyone.operators.executor import ExecutionContextUser
import pytest
from unittest.mock import patch

import fiftyone.operators.types as types
from fiftyone.operators.operator import Operator
from fiftyone.operators.executor import (
    execute_or_delegate_operator,
    ExecutionResult,
    ExecutionContext,
)
from fiftyone.operators import OperatorConfig


class TestOperatorExecutionContext(unittest.TestCase):
    def test_execution_context_user(self):
        user_dict = {
            "email": "testuser@voxel51.com",
            "id": "test_user",
            "name": "Test User",
            "role": "MEMBER",
            "dataset_permission": "MANAGE",
        }
        user_from_dict = ExecutionContextUser.from_dict(user_dict)
        user = ExecutionContextUser(
            email="testuser@voxel51.com",
            id="test_user",
            name="Test User",
            role="MEMBER",
            dataset_permission="MANAGE",
        )
        self.assertEqual(user_from_dict.serialize(), user_dict)
        self.assertEqual(user_from_dict.to_dict(), user_dict)
        self.assertEqual(user.serialize(), user_dict)
        self.assertEqual(user.to_dict(), user_dict)

    def test_execution_context(self):
        request_params = {
            "dataset_name": "test_dataset",
            "params": {"name": "Jon"},
            "view": [
                {
                    "_cls": "fiftyone.core.stages.Limit",
                    "kwargs": [["limit", 3]],
                }
            ],
            "selected": ["sample_id_one"],
        }
        user = ExecutionContextUser(
            email="testuser@voxel51.com",
            id="test_user",
            name="Test User",
            role="MEMBER",
            dataset_permission="MANAGE",
        )
        ctx = ExecutionContext(
            operator_uri="test_operator",
            request_params=request_params,
            user=user,
        )
        self.assertEqual(
            ctx.serialize(),
            {
                "params": request_params["params"],
                "request_params": request_params,
                "user": user.id,
            },
        )
        self.assertEqual(
            ctx.to_dict(),
            {
                "executor": None,
                "params": request_params["params"],
                "request_params": request_params,
                "user": user,
            },
        )
        self.assertEqual(ctx.user, user)
        self.assertEqual(ctx.params, request_params["params"])
        self.assertEqual(ctx.request_params, request_params)
        self.assertEqual(ctx.executor, None)
        self.assertEqual(ctx.user_id, user.id)
        self.assertEqual(ctx.delegated, False)
        self.assertEqual(ctx.dataset_name, request_params["dataset_name"])
        self.assertEqual(ctx.dataset_id, None)
        self.assertEqual(ctx.has_custom_view, True)
        self.assertEqual(ctx.selected, request_params["selected"])

        # delegated
        delegated_request_params = {
            **request_params,
            "delegated": True,
            "request_delegation": True,
            "delegation_target": "scheduler-one",
        }
        delegated_ctx = ExecutionContext(
            operator_uri="test_delegated_operator",
            request_params=delegated_request_params,
            user=user,
        )
        self.assertEqual(delegated_ctx.delegated, True)
        self.assertEqual(delegated_ctx.requesting_delegated_execution, True)
        self.assertEqual(delegated_ctx.delegation_target, "scheduler-one")


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
        return {
            "message": ctx.params.get("message", None),
            "user_name": ctx.user.name,
        }


@pytest.mark.asyncio
@patch("fiftyone.operators.registry.OperatorRegistry.list_operators")
async def test_execute_or_delegate_operator(list_operators):
    list_operators.return_value = [EchoOperator(_builtin=True)]

    mock_resolve_user_return = {"id": "123", "name": "test_user"}
    with unittest.mock.patch(
        "fiftyone.internal.api_requests.resolve_user",
        unittest.mock.AsyncMock(return_value=mock_resolve_user_return),
    ) as mock_resolve_user:
        request_params = {
            "dataset_name": "test_dataset",
            "operator_uri": ECHO_URI,
            "params": {"message": "Hello, World!"},
        }

        result = await execute_or_delegate_operator(ECHO_URI, request_params)

        assert isinstance(result, ExecutionResult)
        json_result = result.to_json()
        assert json_result["result"]["message"] == "Hello, World!"
        assert (
            json_result["result"]["user_name"]
            == mock_resolve_user_return["name"]
        )
        mock_resolve_user.assert_called_once()
