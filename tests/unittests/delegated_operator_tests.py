"""
FiftyOne delegated operator related unit tests.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest
from unittest.mock import patch

from fiftyone.core.delegated_operation import DelegatedOperationService as dos
from bson import ObjectId

from fiftyone.operators import Operator, OperatorConfig


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
        return


class DelegatedOperationServiceTests(unittest.TestCase):
    def setUp(self):
        self.docs_to_delete = []

    def tearDown(self):
        self.delete_test_data()

    def delete_test_data(self):
        for doc in self.docs_to_delete:
            doc.delete()

    def test_delegate_operation(self):
        doc = dos.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            delegation_target="foo",
            dataset_id=ObjectId(),
            context={"foo": "bar"},
            view_stages=["foo", "bar"],
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

        docs_to_trigger = []

        # get all the existing counts of queued operations
        initial_queued = len(dos.get_queued_operations())
        initial_triggered = len(dos.list_operations(run_state="triggered"))
        initial_dataset_queued = len(
            dos.get_queued_operations(dataset_id=dataset_id)
        )
        initial_operator_queued = len(
            dos.get_queued_operations(operator=operator)
        )

        # create a bunch of ops
        for i in range(10):
            doc = dos.queue_operation(
                operator=operator,
                delegation_target=f"delegation_target{i}",
                dataset_id=dataset_id,
                context={"foo": "bar"},
                view_stages=["foo", "bar"],
            )
            self.docs_to_delete.append(doc)
            # pylint: disable=no-member
            docs_to_trigger.append(doc.id)

        for i in range(10):
            doc = dos.queue_operation(
                operator=operator2,
                delegation_target=f"delegation_target_2{i}",
                dataset_id=dataset_id2,
                context={"foo": "bar"},
                view_stages=["foo", "bar"],
            )
            self.docs_to_delete.append(doc)

        queued = dos.get_queued_operations()
        self.assertEqual(len(queued), 20 + initial_queued)

        queued = dos.get_queued_operations(dataset_id=dataset_id)
        self.assertEqual(len(queued), 10 + initial_dataset_queued)

        queued = dos.get_queued_operations(operator=operator)
        self.assertEqual(len(queued), 10 + initial_operator_queued)

        for doc in docs_to_trigger:
            dos.set_triggered(doc)

        queued = dos.get_queued_operations()
        self.assertEqual(len(queued), 10 + initial_queued)

        triggered = dos.list_operations(run_state="triggered")
        self.assertEqual(len(triggered), 10 + initial_triggered)

    def test_set_run_states(self):
        doc = dos.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            delegation_target=f"test_target",
            dataset_id=ObjectId(),
            context={"foo": "bar"},
            view_stages=["foo", "bar"],
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, "queued")

        # pylint: disable=no-member
        doc = dos.set_triggered(doc_id=doc.id)
        self.assertEqual(doc.run_state, "triggered")

        doc = dos.set_running(doc_id=doc.id)
        self.assertEqual(doc.run_state, "started")

        doc = dos.set_completed(doc_id=doc.id)
        self.assertEqual(doc.run_state, "completed")

        doc = dos.set_failed(doc_id=doc.id, error=ValueError("oops!"))
        self.assertEqual(doc.run_state, "failed")
        self.assertIsNotNone(doc.error_message)

    @patch(
        "fiftyone.operators.registry.OperatorRegistry.operator_exists",
        return_value=True,
    )
    @patch(
        "fiftyone.operators.registry.OperatorRegistry.get_operator",
        return_value=MockOperator(),
    )
    def test_full_run_success(self, *args, **kwargs):
        doc = dos.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            delegation_target=f"test_target",
            dataset_id=ObjectId(),
            context={"request_params": {"foo": "bar"}},
            view_stages=["foo", "bar"],
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, "queued")

        dos.execute_queued_operations(delegation_target="test_target")

        doc = dos.get(doc_id=doc["id"])
        self.assertEqual(doc.run_state, "completed")
        self.assertIsNotNone(doc.started_at)
        self.assertIsNotNone(doc.queued_at)
        self.assertIsNotNone(doc.triggered_at)
        self.assertIsNotNone(doc.completed_at)

        self.assertIsNone(doc.error_message)
        self.assertIsNone(doc.failed_at)

    @patch(
        "fiftyone.operators.registry.OperatorRegistry.operator_exists",
        return_value=True,
    )
    @patch(
        "fiftyone.operators.registry.OperatorRegistry.get_operator",
        return_value=MockOperator(success=False),
    )
    def test_full_run_fail(self, *args, **kwargs):
        doc = dos.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            delegation_target=f"test_target",
            dataset_id=ObjectId(),
            context={"request_params": {"foo": "bar"}},
            view_stages=["foo", "bar"],
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, "queued")

        dos.execute_queued_operations(delegation_target="test_target")

        doc = dos.get(doc_id=doc["id"])
        self.assertEqual(doc.run_state, "failed")
        self.assertIsNotNone(doc.started_at)
        self.assertIsNotNone(doc.queued_at)
        self.assertIsNotNone(doc.triggered_at)
        self.assertIsNone(doc.completed_at)

        self.assertIsNotNone(doc["error_message"])
        self.assertEqual(doc.error_message, "MockOperator failed")
        self.assertIsNotNone(doc.failed_at)
