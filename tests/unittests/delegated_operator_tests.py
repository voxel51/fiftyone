"""
FiftyOne delegated operator related unit tests.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest
from fiftyone.core.delegated_operation import DelegatedOperationService as dos
from bson import ObjectId


class DelegatedOperationServiceTests(unittest.TestCase):
    def setUp(self):
        self.docs_to_delete = []

    def tearDown(self):
        self.delete_test_data()

    def delete_test_data(self):
        for doc in self.docs_to_delete:
            doc.delete()
            print("Deleted delegated operation document %s" % doc.id)

    def test_delegate_operation(self):
        doc = dos.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            run_key="foo",
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
        # create a bunch of ops
        for i in range(10):
            doc = dos.queue_operation(
                operator=operator,
                run_key=f"run_key{i}",
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
                run_key=f"run_key_2{i}",
                dataset_id=dataset_id2,
                context={"foo": "bar"},
                view_stages=["foo", "bar"],
            )
            self.docs_to_delete.append(doc)

        queued = dos.get_queued_operations()
        self.assertEqual(len(queued), 20)

        queued = dos.get_queued_operations(dataset_id=dataset_id)
        self.assertEqual(len(queued), 10)

        queued = dos.get_queued_operations(operator=operator)
        self.assertEqual(len(queued), 10)

        for doc in docs_to_trigger:
            dos.set_triggered(doc)

        queued = dos.get_queued_operations()
        self.assertEqual(len(queued), 10)

        triggered = dos.list_operations(run_state="triggered")
        self.assertEqual(len(triggered), 10)

    def test_set_run_states(self):
        doc = dos.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            run_key=f"run_key_foo",
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
