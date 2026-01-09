"""
FiftyOne operation execution tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import copy
import unittest
from unittest import mock

import bson
import pytest
from unittest.mock import patch

import fiftyone as fo
from fiftyone.operators import constants
import fiftyone.operators.types as types
from fiftyone.operators.delegated import DelegatedOperationService
from fiftyone.operators.operator import Operator, PipelineOperator
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
                "pipeline": None,
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
        ds = fo.Dataset()
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
                (constants.ViewTarget.CUSTOM_VIEW_TARGET, ds.limit(5)),
                ("TESTING_INVALID", view),
                (None, view),
            ]
            for target_view, expected_view in tests:
                request_params = {
                    "dataset_name": ds.name,
                    "dataset_id": str(ds._doc.id),
                    "params": {
                        "name": "Jon",
                        "view_target": target_view,
                        "custom_view_target": [
                            {
                                "_cls": "fiftyone.core.stages.Limit",
                                "kwargs": [["limit", 5]],
                            }
                        ],
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
        return OperatorConfig(name="echo", allow_delegated_execution=True)

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


@pytest.mark.asyncio
@patch("fiftyone.operators.registry.OperatorRegistry.list_operators")
async def test_delegate_operator(list_operators):
    list_operators.return_value = [EchoOperator(_builtin=True)]

    request_params = {
        "dataset_name": "test_dataset",
        "operator_uri": ECHO_URI,
        "params": {"message": "Hello, World!"},
        "request_delegation": True,
    }
    result = await execute_or_delegate_operator(ECHO_URI, request_params)
    assert isinstance(result, ExecutionResult)
    assert result.delegated is True
    dos = DelegatedOperationService()
    assert dos.get(result.result["id"]) is not None
    dos.delete_operation(result.result["id"])


@patch("fiftyone.operators.registry.OperatorRegistry.list_operators")
class TestPipeline:
    PREFIX = "@voxel51/operators/"

    def record_request_params(self, *args, **kwargs):
        self.calls.append(copy.deepcopy(args[0].request_params))

    @pytest.fixture(name="setup_operators", autouse=True)
    def fixture_setup_operators(self):
        self.calls = []
        operators = []
        for i in range(3):
            cfg = mock.MagicMock()
            cfg.name = f"op{i}"
            operator = type(
                f"Operator{i}",
                (Operator,),
                {
                    "config": cfg,
                    "execute": mock.MagicMock(
                        side_effect=self.record_request_params
                    ),
                },
            )(_builtin=True)
            operators.append(operator)

        cfg = mock.MagicMock()
        cfg.name = "pipeline"
        pipeline_operator = type(
            "PipelineOperator",
            (PipelineOperator,),
            {
                "config": cfg,
                "resolve_pipeline": mock.MagicMock(),
            },
        )(_builtin=True)
        return pipeline_operator, operators

    @pytest.mark.asyncio
    async def test_execute_pipeline(self, list_operators, setup_operators):
        pipeline = types.Pipeline()
        pipeline.stage(
            self.PREFIX + "op0",
            name="stage1",
            params={"message": "Hello from pipeline!"},
        )
        pipeline.stage(self.PREFIX + "op1", name="stage2", params={})

        pipeline_operator, operators = setup_operators
        list_operators.return_value = [pipeline_operator] + operators
        pipeline_operator.resolve_pipeline.return_value = pipeline

        #####
        result = await execute_or_delegate_operator(
            operator_uri=self.PREFIX + "pipeline",
            request_params={
                "dataset_name": "test_dataset",
            },
        )
        #####

        pipeline_operator.resolve_pipeline.assert_called_once()
        operators[0].execute.assert_called_once()
        params = self.calls[0]
        assert params["dataset_name"] == "test_dataset"
        assert params["params"] == {"message": "Hello from pipeline!"}

        operators[1].execute.assert_called_once()
        params = self.calls[1]
        assert params["dataset_name"] == "test_dataset"
        assert params["params"] == {}

        assert isinstance(result, ExecutionResult)
        assert result.error is None

    @pytest.mark.asyncio
    async def test_execute_pipeline_fail(
        self, list_operators, setup_operators
    ):
        pipeline = types.Pipeline()
        pipeline.stage(
            self.PREFIX + "op0",
            name="stage1",
            params={"message": "Hello from pipeline!"},
        )
        pipeline.stage(self.PREFIX + "op1", name="stage2", params={})

        pipeline_operator, operators = setup_operators
        list_operators.return_value = [pipeline_operator] + operators
        pipeline_operator.resolve_pipeline.return_value = pipeline
        the_error = ValueError("Operator failed")
        operators[0].execute.side_effect = the_error

        #####
        result = await execute_or_delegate_operator(
            operator_uri=self.PREFIX + "pipeline",
            request_params={
                "dataset_name": "test_dataset",
            },
        )
        #####

        pipeline_operator.resolve_pipeline.assert_called_once()
        operators[0].execute.assert_called_once()

        operators[1].execute.assert_not_called()

        assert isinstance(result, ExecutionResult)
        assert result.error is not None
        assert result.error_message.startswith(
            "Failed to execute pipeline stage[0]:"
        )

    @pytest.mark.asyncio
    async def test_execute_pipeline_operator_no_exist(
        self, list_operators, setup_operators
    ):
        pipeline = types.Pipeline()
        pipeline.stage(
            self.PREFIX + "op0",
            name="stage1",
            params={"message": "Hello from pipeline!"},
        )
        pipeline.stage(
            self.PREFIX + "op51", name="stage-doesnt-exist", params={}
        )

        pipeline_operator, operators = setup_operators
        list_operators.return_value = [pipeline_operator] + operators
        pipeline_operator.resolve_pipeline.return_value = pipeline

        #####
        result = await execute_or_delegate_operator(
            operator_uri=self.PREFIX + "pipeline",
            request_params={
                "dataset_name": "test_dataset",
            },
        )
        #####

        pipeline_operator.resolve_pipeline.assert_called_once()
        operators[0].execute.assert_called_once()

        operators[1].execute.assert_not_called()

        assert isinstance(result, ExecutionResult)
        assert result.error is not None
        assert (
            f"Pipeline stage[1] operator '{self.PREFIX}op51' does not exist"
            in result.error_message
        )

    @pytest.mark.asyncio
    async def test_execute_pipeline_operator_fail_always_run(
        self, list_operators, setup_operators
    ):
        pipeline = types.Pipeline()
        pipeline.stage(
            self.PREFIX + "op0",
            name="stage1",
            params={"message": "Hello from pipeline!"},
        )
        pipeline.stage(self.PREFIX + "op11", name="stage2", params={})
        pipeline.stage(
            self.PREFIX + "op2",
            name="stage3",
            params={"should_always_run": True},
            always_run=True,
        )

        pipeline_operator, operators = setup_operators
        list_operators.return_value = [pipeline_operator] + operators
        pipeline_operator.resolve_pipeline.return_value = pipeline
        operators[0].execute.side_effect = ValueError("Operator failed")

        #####
        result = await execute_or_delegate_operator(
            operator_uri=self.PREFIX + "pipeline",
            request_params={
                "dataset_name": "test_dataset",
            },
        )
        #####

        pipeline_operator.resolve_pipeline.assert_called_once()
        operators[0].execute.assert_called_once()

        # Skips second operator but runs the third due to always_run=True
        operators[1].execute.assert_not_called()

        operators[2].execute.assert_called_once()
        params = self.calls[-1]
        assert params["dataset_name"] == "test_dataset"
        assert params["params"] == {"should_always_run": True}

        assert isinstance(result, ExecutionResult)
        assert result.error is not None
        assert (
            "Failed to execute pipeline stage[0]: Operator failed"
            in result.error_message
        )
