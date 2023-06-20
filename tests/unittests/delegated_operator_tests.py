"""
FiftyOne delegated operator related unit tests.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest
from unittest.mock import patch

from bson import ObjectId

from fiftyone.operators.executor import ExecutionContext, ExecutionResult
from fiftyone.operators.operator import Operator, OperatorConfig
from fiftyone.operators.delegated import DelegatedOperation


class MockOperator(Operator):
    def __init__(self, success=True, **kwargs):
        self.success = success
        super().__init__(**kwargs)

    @property
    def config(self):
        return OperatorConfig(
            name="mock_operator",
            label="mock_operator",
            should_delegate=True,
            disable_schema_validation=True,
        )

    def resolve_input(self, *args, **kwargs):
        return

    def execute(self, ctx):
        if not self.success:
            raise Exception("MockOperator failed")
        return ExecutionResult(result={"executed": True})


class DelegatedOperationServiceTests(unittest.TestCase):
    def setUp(self):
        self.docs_to_delete = []
        self.svc = DelegatedOperation()

    def tearDown(self):
        self.delete_test_data()

    def delete_test_data(self):
        for doc in self.docs_to_delete:
            self.svc.delete_operation(doc_id=doc.id)

    def test_delegate_operation(self):
        doc = self.svc.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            delegation_target="foo",
            dataset_id=ObjectId(),
            context=ExecutionContext(request_params={"foo": "bar"}),
        )
        self.docs_to_delete.append(doc)
        self.assertIsNotNone(doc.queued_at)
        self.assertEqual(doc.run_state, "queued")

    def test_list_queued_operations(self):
        self.delete_test_data()

        dataset_id = ObjectId()
        dataset_id2 = ObjectId()

        operator = "@voxelfiftyone/operator/foo"
        operator2 = "@voxelfiftyone/operator/bar"

        docs_to_run = []

        # get all the existing counts of queued operations
        initial_queued = len(self.svc.get_queued_operations())
        initial_running = len(self.svc.list_operations(run_state="running"))
        initial_dataset_queued = len(
            self.svc.get_queued_operations(dataset_id=dataset_id)
        )
        initial_operator_queued = len(
            self.svc.get_queued_operations(operator=operator)
        )

        # create a bunch of ops
        for i in range(10):
            doc = self.svc.queue_operation(
                operator=operator,
                # delegation_target=f"delegation_target{i}",
                dataset_id=dataset_id,
                context=ExecutionContext(request_params={"foo": "bar"}),
            )
            self.docs_to_delete.append(doc)
            # pylint: disable=no-member
            docs_to_run.append(doc.id)

        for i in range(10):
            doc = self.svc.queue_operation(
                operator=operator2,
                # delegation_target=f"delegation_target_2{i}",
                dataset_id=dataset_id2,
                context=ExecutionContext(request_params={"foo": "bar"}),
            )
            self.docs_to_delete.append(doc)

        queued = self.svc.get_queued_operations()
        self.assertEqual(len(queued), 20 + initial_queued)

        queued = self.svc.get_queued_operations(dataset_id=dataset_id)
        self.assertEqual(len(queued), 10 + initial_dataset_queued)

        queued = self.svc.get_queued_operations(operator=operator)
        self.assertEqual(len(queued), 10 + initial_operator_queued)

        for doc in docs_to_run:
            self.svc.set_running(doc)

        queued = self.svc.get_queued_operations()
        self.assertEqual(len(queued), 10 + initial_queued)

        running = self.svc.list_operations(run_state="running")
        self.assertEqual(len(running), 10 + initial_running)

    def test_set_run_states(self):
        doc = self.svc.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            delegation_target=f"test_target",
            dataset_id=ObjectId(),
            context=ExecutionContext(request_params={"foo": "bar"}),
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, "queued")

        doc = self.svc.set_running(doc_id=doc.id)
        self.assertEqual(doc.run_state, "running")

        doc = self.svc.set_completed(doc_id=doc.id)
        self.assertEqual(doc.run_state, "completed")

        doc = self.svc.set_failed(
            doc_id=doc.id,
            result=ExecutionResult(error=str(ValueError("oops!"))),
        )
        self.assertEqual(doc.run_state, "failed")
        self.assertIsNotNone(doc.result.error)

    @patch(
        "fiftyone.operators.registry.OperatorRegistry.operator_exists",
        return_value=True,
    )
    @patch(
        "fiftyone.operators.registry.OperatorRegistry.get_operator",
        return_value=MockOperator(),
    )
    def test_full_run_success(self, *args, **kwargs):
        doc = self.svc.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            delegation_target=f"test_target",
            dataset_id=ObjectId(),
            context=ExecutionContext(request_params={"foo": "bar"}),
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, "queued")

        self.svc.execute_queued_operations(delegation_target="test_target")

        doc = self.svc.get(doc_id=doc.id)
        self.assertEqual(doc.run_state, "completed")
        self.assertIsNotNone(doc.started_at)
        self.assertIsNotNone(doc.queued_at)
        self.assertIsNotNone(doc.completed_at)

        self.assertIsNone(doc.result.error)
        self.assertIsNone(doc.failed_at)

        self.assertEqual(doc.result.result, {"executed": True})

    @patch(
        "fiftyone.operators.registry.OperatorRegistry.operator_exists",
        return_value=True,
    )
    @patch(
        "fiftyone.operators.registry.OperatorRegistry.get_operator",
        return_value=MockOperator(success=False),
    )
    def test_full_run_fail(self, *args, **kwargs):
        ctx = ExecutionContext()
        ctx.request_params = {"foo": "bar"}
        doc = self.svc.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            delegation_target=f"test_target",
            dataset_id=ObjectId(),
            context=ctx.serialize(),
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, "queued")

        self.svc.execute_queued_operations(delegation_target="test_target")

        doc = self.svc.get(doc_id=doc.id)
        self.assertEqual(doc.run_state, "failed")
        self.assertIsNotNone(doc.started_at)
        self.assertIsNotNone(doc.queued_at)
        self.assertIsNone(doc.completed_at)

        self.assertIsNotNone(doc.result)
        self.assertTrue("Exception: MockOperator failed" in doc.result.error)
        self.assertIsNotNone(doc.failed_at)
