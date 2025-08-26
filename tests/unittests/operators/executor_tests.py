import unittest

import bson
import pytest
from unittest.mock import patch

import fiftyone as fo
from fiftyone.operators import constants
import fiftyone.operators.types as types
from fiftyone.operators.operator import Operator
from fiftyone.operators.executor import (
    execute_or_delegate_operator,
    ExecutionResult,
    ExecutionContext,
)
from fiftyone.operators import OperatorConfig


class TestOperatorExecutionContext(unittest.TestCase):
    def test_execution_context(self):
        request_params = {
            "dataset_name": "test_dataset",
            "params": {
                "name": "Jon",
                "target_view": constants.ViewTarget.CURRENT_VIEW,
            },
            "view": [
                {
                    "_cls": "fiftyone.core.stages.Limit",
                    "kwargs": [["limit", 3]],
                }
            ],
            "selected": ["sample_id_one"],
            "num_distributed_tasks": 5,
        }
        ctx = ExecutionContext(
            operator_uri="test_operator",
            request_params=request_params,
        )
        self.assertDictEqual(
            ctx.serialize(),
            {
                "params": request_params["params"],
                "request_params": request_params,
            },
        )
        self.assertDictEqual(
            ctx.to_dict(),
            {
                "executor": None,
                "params": request_params["params"],
                "request_params": request_params,
                "user": None,
            },
        )
        self.assertDictEqual(ctx.params, request_params["params"])
        self.assertDictEqual(ctx.request_params, request_params)
        self.assertEqual(ctx.executor, None)
        self.assertEqual(ctx.delegated, False)
        self.assertEqual(ctx.dataset_name, request_params["dataset_name"])
        self.assertEqual(ctx.dataset_id, None)
        self.assertEqual(ctx.has_custom_view, True)
        self.assertEqual(ctx.selected, request_params["selected"])
        self.assertIsNone(ctx.num_distributed_tasks)

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
        )
        self.assertEqual(delegated_ctx.delegated, True)
        self.assertEqual(delegated_ctx.requesting_delegated_execution, True)
        self.assertEqual(delegated_ctx.delegation_target, "scheduler-one")
        self.assertIsNone(delegated_ctx.num_distributed_tasks)

    def test_target_view(self):
        ds = fo.Dataset(persistent=True)
        view = ds.limit(3)
        selected = bson.ObjectId()
        selected_label = bson.ObjectId()
        try:
            tests = [
                (constants.ViewTarget.CURRENT_VIEW, view),
                (constants.ViewTarget.DATASET, ds),
                (constants.ViewTarget.DATASET_VIEW, ds.view()),
                (
                    constants.ViewTarget.SELECTED_SAMPLES,
                    view.select([selected]),
                ),
                ("TESTING_DEFAULT", ds),
                (None, ds),
            ]
            for target_view, expected_view in tests:
                request_params = {
                    "dataset_name": ds.name,
                    "dataset_id": str(ds._doc.id),
                    "params": {
                        "name": "Jon",
                        "view_target": target_view,
                    },
                    "view": [
                        {
                            "_cls": "fiftyone.core.stages.Limit",
                            "kwargs": [["limit", 3]],
                        }
                    ],
                    "selected": [selected],
                    "selected_labels": [selected_label],
                }
                ctx = ExecutionContext(
                    operator_uri="test_operator",
                    request_params=request_params,
                )
                target = ctx.target_view()
                self.assertEqual(target, expected_view)
        finally:
            ds.delete()


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
