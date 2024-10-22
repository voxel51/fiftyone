"""
FiftyOne continual delegated executor related unit tests.
| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import time
import unittest
import multiprocessing
import os
import signal
from unittest import mock
from unittest.mock import patch

import fiftyone
from bson import ObjectId

from fiftyone.operators.delegated import DelegatedOperationService
from fiftyone.operators.executor import (
    ExecutionContext,
    ExecutionRunState,
)
from fiftyone.operators.operator import Operator, OperatorConfig
from fiftyone.operators.delegated_executors.continual import ContinualExecutor


class MockDataset:
    def __init__(self, **kwargs):
        self.name = kwargs.get("name", "test_dataset")
        self._doc = mock.MagicMock()
        self._doc.id = kwargs.get("id", ObjectId())

    def save(self):
        pass

    def delete(self):
        pass


class MockInputs:
    def to_json(self):
        return {"inputs": {"type": "string"}}


class MockOutputs:
    def to_json(self):
        return {"outputs": {"type": "string"}}


class MockOperator(Operator):
    def __init__(
        self, success=True, sets_progress=False, sleep_time=0, **kwargs
    ):
        self.success = success
        self.sets_progress = sets_progress
        self.sleep_time = sleep_time
        super().__init__(**kwargs)

    @property
    def config(self):
        return OperatorConfig(
            name="mock_operator",
            label="Mock Operator",
            disable_schema_validation=True,
        )

    def resolve_input(self, *args, **kwargs):
        return

    def resolve_delegation(self, ctx) -> bool:
        return True

    def execute(self, ctx):
        if not self.success:
            raise Exception("MockOperator failed")

        if self.sets_progress:
            ctx.set_progress(0.5, "halfway there")
        time.sleep(self.sleep_time)
        return {"executed": True}


@patch(
    "fiftyone.operators.executor.resolve_operation_user",
    return_value=None,
)
@patch(
    "fiftyone.operators.registry.OperatorRegistry.operator_exists",
    return_value=True,
)
@patch(
    "fiftyone.operators.registry.OperatorRegistry.get_operator",
    return_value=MockOperator(sleep_time=3),
)
def start_executor(
    mock_get_operator, mock_operator_exists, mock_resolve_operation_user
):
    executor = ContinualExecutor()
    signal.signal(signal.SIGTERM, executor.signal_handler)
    executor.start()


@patch(
    "fiftyone.operators.executor.resolve_operation_user",
    return_value=None,
)
@patch(
    "fiftyone.operators.registry.OperatorRegistry.operator_exists",
    return_value=True,
)
@patch(
    "fiftyone.operators.registry.OperatorRegistry.get_operator",
    return_value=MockOperator(),
)
class ContinualExecutorTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        multiprocessing.set_start_method("fork", force=True)
        self.docs_to_delete = []
        self.svc = DelegatedOperationService()

    def tearDown(self):
        self.delete_test_data()

    def delete_test_data(self):
        with patch.object(
            fiftyone.operators.registry.OperatorRegistry, "operator_exists"
        ) as operator_exists:
            with patch.object(
                fiftyone.operators.registry.OperatorRegistry, "get_operator"
            ) as get_operator:
                operator_exists.return_value = True
                get_operator.return_value = MockOperator()
                for doc in self.docs_to_delete:
                    self.svc.delete_operation(doc_id=doc.id)

    @patch(
        "fiftyone.core.odm.utils.load_dataset",
    )
    def test_executes_without_interruption(
        self,
        mock_load_dataset,
        mock_get_operator,
        mock_operator_exists,
        mock_resolve_operation_user,
    ):
        mock_load_dataset.return_value = MockDataset()
        doc = self.svc.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            label=mock_get_operator.return_value.name,
            delegation_target=f"test_target_continual",
            context=ExecutionContext(
                request_params={"foo": "bar", "dataset_id": str(ObjectId())}
            ),
        )
        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, ExecutionRunState.QUEUED)

        process = multiprocessing.Process(target=start_executor)
        process.start()
        time.sleep(5)
        self.assertTrue(process.is_alive())
        print(f"Sending SIGTERM to daemon with PID {process.pid}")
        os.kill(process.pid, signal.SIGTERM)
        process.join()
        self.assertFalse(process.is_alive())

        doc = self.svc.get(doc_id=doc.id)
        self.assertEqual(doc.run_state, ExecutionRunState.COMPLETED)
        self.assertIsNotNone(doc.started_at)
        self.assertIsNotNone(doc.queued_at)
        self.assertIsNotNone(doc.completed_at)

        self.assertIsNone(doc.result.error)
        self.assertIsNone(doc.failed_at)

        self.assertEqual(doc.result.result, {"executed": True})

    @patch(
        "fiftyone.core.odm.utils.load_dataset",
    )
    def test_executes_with_interruption(
        self,
        mock_load_dataset,
        mock_get_operator,
        mock_operator_exists,
        mock_resolve_operation_user,
    ):
        mock_load_dataset.return_value = MockDataset()
        doc = self.svc.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            label=mock_get_operator.return_value.name,
            delegation_target=f"test_target_continual",
            context=ExecutionContext(
                request_params={
                    "foo": "bar",
                    "dataset_id": str(ObjectId()),
                }
            ),
        )
        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, ExecutionRunState.QUEUED)

        process = multiprocessing.Process(target=start_executor)
        process.start()
        time.sleep(1)
        self.assertTrue(process.is_alive())
        print(f"Sending SIGTERM to daemon with PID {process.pid}")
        os.kill(process.pid, signal.SIGTERM)
        process.join()
        self.assertFalse(process.is_alive())

        doc = self.svc.get(doc_id=doc.id)
        self.assertEqual(doc.run_state, ExecutionRunState.FAILED)
        self.assertIsNotNone(doc.started_at)
        self.assertIsNotNone(doc.queued_at)
        self.assertIsNotNone(doc.result.error)
        self.assertIsNotNone(doc.failed_at)
