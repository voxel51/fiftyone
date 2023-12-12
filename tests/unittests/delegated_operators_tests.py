"""
FiftyOne delegated operator related unit tests.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import time
import unittest
from unittest import mock
from unittest.mock import patch

import pytest

import fiftyone
from bson import ObjectId

from fiftyone import Dataset
from fiftyone.factory import (
    DelegatedOperationPagingParams,
    SortDirection,
    SortByField,
)
from fiftyone.operators.delegated import DelegatedOperationService
from fiftyone.operators.executor import (
    ExecutionContext,
    ExecutionResult,
    ExecutionRunState,
    ExecutionProgress,
)
from fiftyone.operators.operator import Operator, OperatorConfig


class MockOperator(Operator):
    def __init__(self, success=True, sets_progress=False, **kwargs):
        self.success = success
        self.sets_progress = sets_progress
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
        return ExecutionResult(result={"executed": True})


class MockGeneratorOperator(Operator):
    def __init__(self, success=True, sets_progress=False, **kwargs):
        self.success = success
        self.sets_progress = sets_progress
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

        yield {"executed": True}


class MockProgressiveOperator(MockGeneratorOperator):
    def __init__(self, success=True, **kwargs):
        self.success = success
        self.sets_progress = True
        super().__init__(**kwargs)

    def execute(self, ctx):
        if not self.success:
            raise Exception("MockOperator failed")

        for x in range(10):
            ctx.set_progress(x / 10, f"progress {x}")
            yield {"executed": True}
            time.sleep(0.1)


@patch(
    "fiftyone.operators.registry.OperatorRegistry.operator_exists",
    return_value=True,
)
@patch(
    "fiftyone.operators.registry.OperatorRegistry.get_operator",
    return_value=MockOperator(),
)
class DelegatedOperationServiceTests(unittest.TestCase):
    _should_fail = False

    def setUp(self):
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
    def test_delegate_operation(
        self, mock_load_dataset, mock_get_operator, mock_operator_exists
    ):
        dataset_id = ObjectId()
        dataset_name = f"test_dataset_{dataset_id}"
        mock_load_dataset.return_value.name = dataset_name
        mock_load_dataset.return_value._doc.id = dataset_id
        doc = self.svc.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            label=mock_get_operator.return_value.config.label,
            delegation_target="foo",
            context=ExecutionContext(
                request_params={"foo": "bar", "dataset_name": dataset_name},
            ),
        )
        self.docs_to_delete.append(doc)
        self.assertIsNotNone(doc.queued_at)
        self.assertEqual(doc.label, "Mock Operator")
        self.assertEqual(doc.run_state, ExecutionRunState.QUEUED)

        doc2 = self.svc.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            delegation_target="foo",
            context=ExecutionContext(
                request_params={"foo": "bar", "dataset_name": dataset_name},
            ),
        )
        self.docs_to_delete.append(doc2)
        self.assertIsNotNone(doc2.queued_at)
        self.assertEqual(doc2.label, "@voxelfiftyone/operator/foo")
        self.assertEqual(doc2.run_state, ExecutionRunState.QUEUED)

    def test_list_queued_operations(
        self, mock_get_operator, mock_operator_exists
    ):
        dataset_name = f"test_dataset_{ObjectId()}"
        dataset = Dataset(dataset_name, _create=True, persistent=True)
        dataset.save()
        dataset_id = dataset._doc.id

        self.delete_test_data()

        dataset_name2 = f"test_dataset_{ObjectId()}"
        dataset2 = Dataset(dataset_name2, _create=True, persistent=True)
        dataset2.save()
        dataset_id2 = dataset2._doc.id

        operator = "@voxelfiftyone/operator/foo"
        operator2 = "@voxelfiftyone/operator/bar"

        docs_to_run = []

        # get all the existing counts of queued operations
        initial_queued = len(self.svc.get_queued_operations())
        initial_running = len(
            self.svc.list_operations(run_state=ExecutionRunState.RUNNING)
        )
        initial_dataset_queued = len(
            self.svc.get_queued_operations(dataset_name=dataset_name)
        )
        initial_operator_queued = len(
            self.svc.get_queued_operations(operator=operator)
        )

        # create a bunch of ops
        for i in range(10):
            doc = self.svc.queue_operation(
                operator=operator,
                label=mock_get_operator.return_value.name,
                # delegation_target=f"delegation_target{i}",
                context=ExecutionContext(
                    request_params={
                        "foo": "bar",
                        "dataset_name": dataset_name,
                        "dataset_id": str(dataset_id),
                    },
                ),
            )
            self.docs_to_delete.append(doc)
            # pylint: disable=no-member
            docs_to_run.append(doc.id)

        for i in range(10):
            doc = self.svc.queue_operation(
                operator=operator2,
                label=mock_get_operator.return_value.name,
                # delegation_target=f"delegation_target_2{i}",
                context=ExecutionContext(
                    request_params={
                        "foo": "bar",
                        "dataset_name": dataset_name2,
                        "dataset_id": str(dataset_id2),
                    },
                ),
            )
            self.docs_to_delete.append(doc)

        queued = self.svc.get_queued_operations()
        self.assertEqual(len(queued), 20 + initial_queued)

        queued = self.svc.get_queued_operations(dataset_name=dataset_name)
        self.assertEqual(len(queued), 10 + initial_dataset_queued)

        queued = self.svc.get_queued_operations(operator=operator)
        self.assertEqual(len(queued), 10 + initial_operator_queued)

        for doc in docs_to_run:
            self.svc.set_running(doc)

        queued = self.svc.get_queued_operations()
        self.assertEqual(len(queued), 10 + initial_queued)

        running = self.svc.list_operations(run_state=ExecutionRunState.RUNNING)
        self.assertEqual(len(running), 10 + initial_running)

        dataset.delete()
        dataset2.delete()

    def test_set_run_states(self, mock_get_operator, mock_operator_exists):
        doc = self.svc.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            label=mock_get_operator.return_value.name,
            delegation_target=f"test_target",
            context=ExecutionContext(request_params={"foo": "bar"}),
        )

        original_updated_at = doc.updated_at

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, ExecutionRunState.QUEUED)
        time.sleep(0.1)

        doc = self.svc.set_running(doc_id=doc.id)
        self.assertEqual(doc.run_state, ExecutionRunState.RUNNING)
        self.assertNotEqual(doc.updated_at, original_updated_at)
        original_updated_at = doc.updated_at
        time.sleep(0.1)

        doc = self.svc.set_completed(doc_id=doc.id)
        self.assertEqual(doc.run_state, ExecutionRunState.COMPLETED)
        self.assertNotEqual(doc.updated_at, original_updated_at)
        original_updated_at = doc.updated_at
        time.sleep(0.1)

        doc = self.svc.set_failed(
            doc_id=doc.id,
            result=ExecutionResult(error=str(ValueError("oops!"))),
        )
        self.assertEqual(doc.run_state, ExecutionRunState.FAILED)
        self.assertIsNotNone(doc.result.error)
        self.assertNotEqual(doc.updated_at, original_updated_at)

    def test_sets_progress(self, mock_get_operator, mock_operator_exists):
        mock_get_operator.return_value = MockOperator(sets_progress=True)

        doc = self.svc.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            delegation_target=f"test_target",
            context=ExecutionContext(request_params={"foo": "bar"}),
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, ExecutionRunState.QUEUED)

        self.svc.execute_queued_operations(delegation_target="test_target")

        doc = self.svc.get(doc_id=doc.id)
        self.assertEqual(doc.run_state, ExecutionRunState.COMPLETED)
        self.assertIsNotNone(doc.status)
        self.assertEqual(doc.status.progress, 0.5)
        self.assertEqual(doc.status.label, "halfway there")
        self.assertIsNotNone(doc.status.updated_at)

    def test_full_run_success(self, mock_get_operator, mock_operator_exists):
        doc = self.svc.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            label=mock_get_operator.return_value.name,
            delegation_target=f"test_target",
            context=ExecutionContext(request_params={"foo": "bar"}),
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, ExecutionRunState.QUEUED)

        self.svc.execute_queued_operations(delegation_target="test_target")

        doc = self.svc.get(doc_id=doc.id)
        self.assertEqual(doc.run_state, ExecutionRunState.COMPLETED)
        self.assertIsNotNone(doc.started_at)
        self.assertIsNotNone(doc.queued_at)
        self.assertIsNotNone(doc.completed_at)

        self.assertIsNone(doc.result.error)
        self.assertIsNone(doc.failed_at)

        self.assertEqual(doc.result.result, {"executed": True})

    def test_generator_run_success(
        self, mock_get_operator, mock_operator_exists
    ):

        mock_get_operator.return_value = MockGeneratorOperator()

        doc = self.svc.queue_operation(
            operator="@voxelfiftyone/operator/generator_op",
            label=mock_get_operator.return_value.name,
            delegation_target=f"test_target_generator",
            context=ExecutionContext(request_params={"foo": "bar"}),
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, ExecutionRunState.QUEUED)

        self.svc.execute_queued_operations(
            delegation_target="test_target_generator"
        )

        doc = self.svc.get(doc_id=doc.id)
        self.assertEqual(doc.run_state, ExecutionRunState.COMPLETED)
        self.assertIsNotNone(doc.started_at)
        self.assertIsNotNone(doc.queued_at)
        self.assertIsNotNone(doc.completed_at)
        self.assertIsNone(doc.result)
        self.assertIsNone(doc.failed_at)

    def test_generator_sets_progress(
        self, mock_get_operator, mock_operator_exists
    ):
        mock_get_operator.return_value = MockGeneratorOperator(
            sets_progress=True
        )

        doc = self.svc.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            delegation_target=f"test_target",
            context=ExecutionContext(request_params={"foo": "bar"}),
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, ExecutionRunState.QUEUED)

        self.svc.execute_queued_operations(delegation_target="test_target")

        doc = self.svc.get(doc_id=doc.id)
        self.assertEqual(doc.run_state, ExecutionRunState.COMPLETED)
        self.assertIsNotNone(doc.status)
        self.assertEqual(doc.status.progress, 0.5)
        self.assertEqual(doc.status.label, "halfway there")
        self.assertIsNotNone(doc.status.updated_at)

    def test_updates_progress(self, mock_get_operator, mock_operator_exists):
        mock_get_operator.return_value = MockProgressiveOperator()

        doc = self.svc.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            delegation_target=f"test_target",
            context=ExecutionContext(request_params={"foo": "bar"}),
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, ExecutionRunState.QUEUED)

        with patch.object(
            DelegatedOperationService, "set_progress"
        ) as set_progress:
            self.svc.execute_operation(
                operation=doc, run_link="http://run.info"
            )
            self.assertEqual(set_progress.call_count, 10)
            for x in range(10):
                call = set_progress.call_args_list[x]
                self.assertEqual(call.args[0], doc.id)
                self.assertEqual(call.args[1].progress, x / 10)
                self.assertEqual(call.args[1].label, f"progress {x}")

        doc = self.svc.get(doc_id=doc.id)
        self.assertEqual(doc.run_state, ExecutionRunState.COMPLETED)
        self.assertEqual(doc.run_link, "http://run.info")

    @patch(
        "fiftyone.core.odm.utils.load_dataset",
    )
    def test_full_run_fail(
        self, mock_load_dataset, mock_get_operator, mock_operator_exists
    ):
        dataset_id = ObjectId()
        dataset_name = f"test_dataset_{dataset_id}"
        mock_load_dataset.return_value.name = dataset_name
        mock_load_dataset.return_value._doc.id = dataset_id
        mock_get_operator.return_value = MockOperator(success=False)

        ctx = ExecutionContext()
        ctx.request_params = {"foo": "bar"}
        doc = self.svc.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            label=mock_get_operator.return_value.name,
            delegation_target=f"test_target",
            context=ctx.serialize(),
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, ExecutionRunState.QUEUED)

        self.svc.execute_queued_operations(delegation_target="test_target")

        doc = self.svc.get(doc_id=doc.id)
        self.assertEqual(doc.run_state, ExecutionRunState.FAILED)
        self.assertIsNotNone(doc.started_at)
        self.assertIsNotNone(doc.queued_at)
        self.assertIsNone(doc.completed_at)

        self.assertIsNotNone(doc.result)
        self.assertTrue("Exception: MockOperator failed" in doc.result.error)
        self.assertIsNotNone(doc.failed_at)

    @patch(
        "fiftyone.core.odm.utils.load_dataset",
    )
    def test_rerun_failed(
        self, mock_load_dataset, get_op_mock, op_exists_mock
    ):
        dataset_id = ObjectId()
        dataset_name = f"test_dataset_{dataset_id}"
        mock_load_dataset.return_value.name = dataset_name
        mock_load_dataset.return_value._doc.id = dataset_id

        get_op_mock.return_value = MockOperator(success=False)

        ctx = ExecutionContext()
        ctx.request_params = {"foo": "bar"}
        doc = self.svc.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            label=get_op_mock.return_value.name,
            delegation_target=f"test_target",
            context=ctx.serialize(),
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, ExecutionRunState.QUEUED)

        self.svc.execute_queued_operations(delegation_target="test_target")

        doc = self.svc.get(doc_id=doc.id)
        self.assertEqual(doc.run_state, ExecutionRunState.FAILED)

        # set the mock back to a successful operation
        get_op_mock.return_value = MockOperator()

        rerun_doc = self.svc.rerun_operation(doc.id)
        self.docs_to_delete.append(rerun_doc)
        self.assertNotEqual(doc.id, rerun_doc.id)
        self.assertIsNotNone(rerun_doc.delegation_target)
        self.assertEqual(rerun_doc.delegation_target, doc.delegation_target)
        self.assertEqual(rerun_doc.run_state, ExecutionRunState.QUEUED)
        self.assertIsNotNone(rerun_doc.queued_at)
        self.assertIsNone(rerun_doc.started_at)
        self.assertIsNone(rerun_doc.completed_at)
        self.assertIsNone(rerun_doc.result)

        self.svc.execute_queued_operations(delegation_target="test_target")

        doc = self.svc.get(doc_id=rerun_doc.id)
        self.assertEqual(doc.run_state, ExecutionRunState.COMPLETED)

    def test_rerun_with_renamed_dataset(self, get_op_mock, op_exists_mock):
        # setup
        uid = str(ObjectId())
        dataset_name = f"test_dataset_{uid}"
        dataset = Dataset(dataset_name, _create=True, persistent=True)
        dataset.save()

        get_op_mock.return_value = MockOperator(success=False)

        ctx = ExecutionContext(
            request_params={
                "dataset_id": str(dataset._doc.id),
                "dataset_name": dataset.name,
            }
        )
        # Queue operation using original dataset name
        doc = self.svc.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            label=get_op_mock.return_value.name,
            delegation_target=f"test_target",
            context=ctx.serialize(),
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, ExecutionRunState.QUEUED)

        # Execute once with original dataset name
        self.svc.execute_queued_operations(delegation_target="test_target")
        doc = self.svc.get(doc_id=doc.id)
        self.assertEqual(doc.run_state, ExecutionRunState.FAILED)

        # set the mock back to a successful operation
        get_op_mock.return_value = MockOperator()

        # Rename dataset and save
        dataset.name = f"renamed_dataset_{uid}"
        dataset.save()

        try:
            # Rerun failed operation after the dataset is renamed
            rerun_doc = self.svc.rerun_operation(doc.id)
            self.docs_to_delete.append(rerun_doc)
            self.assertNotEqual(doc.id, rerun_doc.id)
            self.assertIsNotNone(rerun_doc.delegation_target)
            self.assertEqual(
                rerun_doc.delegation_target, doc.delegation_target
            )
            self.assertEqual(rerun_doc.run_state, ExecutionRunState.QUEUED)
            self.assertIsNotNone(rerun_doc.queued_at)
            self.assertIsNone(rerun_doc.started_at)
            self.assertIsNone(rerun_doc.completed_at)
            self.assertIsNone(rerun_doc.result)

            self.svc.execute_queued_operations(delegation_target="test_target")

            doc = self.svc.get(doc_id=rerun_doc.id)
            self.assertEqual(doc.run_state, ExecutionRunState.COMPLETED)

        except:
            pytest.fail(
                "Should not fail when rerunning failed operation with renamed dataset"
            )
        finally:
            dataset.delete()

    def test_execute_with_renamed_dataset(self, get_op_mock, op_exists_mock):
        # setup
        uid = str(ObjectId())
        dataset_name = f"test_dataset_{uid}"
        dataset = Dataset(dataset_name, _create=True, persistent=True)
        dataset.save()

        get_op_mock.return_value = MockOperator(success=True)

        ctx = ExecutionContext(
            request_params={
                "dataset_id": str(dataset._doc.id),
                "dataset_name": dataset.name,
            }
        )
        # Queue operation using original dataset name
        doc = self.svc.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            label=get_op_mock.return_value.name,
            delegation_target=f"test_target",
            context=ctx.serialize(),
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, ExecutionRunState.QUEUED)

        # Rename dataset
        dataset.name = f"renamed_dataset_{uid}"
        dataset.save()

        # Execute queued operation after saving the new dataset name
        try:
            self.svc.execute_queued_operations(delegation_target="test_target")
            doc = self.svc.get(doc_id=doc.id)
            self.assertEqual(doc.run_state, ExecutionRunState.COMPLETED)
        except:
            pytest.fail(
                "Should not fail when executing queued operation with renamed dataset"
            )
        finally:
            dataset.delete()

    def test_paging_sorting(self, mock_get_operator, mock_operator_exists):
        dataset_name = f"test_dataset_{ObjectId()}"
        dataset = Dataset(dataset_name, _create=True, persistent=True)
        dataset.save()
        dataset_id = dataset._doc.id

        # create 100 docs, 25 of each state & for each user
        queued = []
        running = []
        completed = []
        failed = []
        for i in range(4):
            operator = f"@voxelfiftyone/operator/test_{i}"
            for j in range(25):
                doc = self.svc.queue_operation(
                    operator=operator,
                    label=mock_get_operator.return_value.name,
                    context=ExecutionContext(
                        request_params={
                            "foo": "bar",
                            "dataset_name": dataset_name,
                            "dataset_id:": str(dataset_id),
                        }
                    ),
                )
                time.sleep(
                    0.01
                )  # ensure that the queued_at times are different
                self.docs_to_delete.append(doc)
                if i == 0:
                    queued.append(doc)
                elif i == 1:
                    running.append(doc)
                elif i == 2:
                    completed.append(doc)
                elif i == 3:
                    failed.append(doc)

        for doc in running:
            self.svc.set_running(doc.id)

        for doc in completed:
            self.svc.set_completed(doc.id)

        for doc in failed:
            self.svc.set_failed(doc.id, result=ExecutionResult(error="failed"))

        # test paging - get a page of everything
        docs = self.svc.list_operations(
            dataset_name=dataset_name,
            paging=DelegatedOperationPagingParams(
                skip=0,
                limit=25,
                sort_by=SortByField.QUEUED_AT,
                sort_direction=SortDirection.DESCENDING,
            ),
        )

        self.assertEqual(len(docs), 25)
        self.assertEqual(docs[0].id, failed[24].id)

        docs = self.svc.list_operations(
            dataset_name=dataset_name,
            paging=DelegatedOperationPagingParams(
                skip=0,
                limit=1000,
                sort_by=SortByField.UPDATED_AT,
                sort_direction=SortDirection.DESCENDING,
            ),
        )

        self.assertEqual(len(docs), 100)
        self.assertEqual(docs[0].id, failed[24].id)

        docs = self.svc.list_operations(
            dataset_name=dataset_name,
            paging=DelegatedOperationPagingParams(
                skip=0,
                limit=1,
                sort_by=SortByField.QUEUED_AT,
                sort_direction=SortDirection.ASCENDING,
            ),
        )

        self.assertEqual(len(docs), 1)
        self.assertEqual(docs[0].id, queued[0].id)

        docs = self.svc.list_operations(
            operator=f"@voxelfiftyone/operator/test_0",
            paging=DelegatedOperationPagingParams(skip=0, limit=100),
        )
        self.assertEqual(len(docs), 25)
        states = [doc.run_state for doc in docs]
        self.assertEqual(states, [ExecutionRunState.QUEUED] * 25)

        docs = self.svc.list_operations(
            operator=f"@voxelfiftyone/operator/test_1",
            paging=DelegatedOperationPagingParams(skip=0, limit=100),
        )
        self.assertEqual(len(docs), 25)
        states = [doc.run_state for doc in docs]
        self.assertEqual(states, [ExecutionRunState.RUNNING] * 25)

        docs = self.svc.list_operations(
            operator=f"@voxelfiftyone/operator/test_2",
            paging=DelegatedOperationPagingParams(skip=0, limit=100),
        )
        self.assertEqual(len(docs), 25)
        states = [doc.run_state for doc in docs]
        self.assertEqual(states, [ExecutionRunState.COMPLETED] * 25)

        docs = self.svc.list_operations(
            operator=f"@voxelfiftyone/operator/test_3",
            paging=DelegatedOperationPagingParams(skip=0, limit=100),
        )
        self.assertEqual(len(docs), 25)
        states = [doc.run_state for doc in docs]
        self.assertEqual(states, [ExecutionRunState.FAILED] * 25)

        # test paging - page through all the queued ops
        docs = [0]
        pages = 0
        limit = 7
        total = 0
        while len(docs) > 0:
            docs = self.svc.list_operations(
                dataset_name=dataset_name,
                run_state=ExecutionRunState.QUEUED,
                paging=DelegatedOperationPagingParams(
                    skip=pages * limit,
                    limit=limit,
                    sort_by=SortByField.QUEUED_AT,
                    sort_direction=SortDirection.DESCENDING,
                ),
            )
            total += len(docs)
            if len(docs) > 0:
                pages += 1

        self.assertEqual(pages, 4)
        self.assertEqual(total, 25)
        dataset.delete()

    @patch(
        "fiftyone.core.odm.utils.load_dataset",
    )
    def test_gets_dataset_id_from_name(
        self, mock_load_dataset, mock_get_operator, *args
    ):
        dataset_id = ObjectId()
        dataset_name = f"test_dataset_{dataset_id}"
        mock_load_dataset.return_value.name = dataset_name
        mock_load_dataset.return_value._doc.id = dataset_id

        ctx = ExecutionContext()
        ctx.request_params = {"foo": "bar", "dataset_name": dataset_name}
        doc = self.svc.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            label=mock_get_operator.return_value.name,
            delegation_target=f"test_target",
            context=ctx.serialize(),
        )

        self.docs_to_delete.append(doc)

        self.assertEqual(doc.dataset_id, dataset_id)

    @patch(
        "fiftyone.core.odm.utils.load_dataset",
    )
    def test_deletes_by_dataset_id(
        self, mock_load_dataset, mock_get_operator, mock_operator_exists
    ):
        dataset_id = ObjectId()
        dataset_name = f"test_dataset_{dataset_id}"
        mock_load_dataset.return_value.name = dataset_name
        mock_load_dataset.return_value._doc.id = dataset_id

        # create 100 docs, 25 of each state & for each user
        queued = []
        operator = f"@voxelfiftyone/operator/test_{ObjectId}"
        for i in range(25):
            doc = self.svc.queue_operation(
                operator=operator,
                label=mock_get_operator.return_value.name,
                context=ExecutionContext(
                    request_params={
                        "foo": "bar",
                        "dataset_name": dataset_name,
                    }
                ),
            )
            time.sleep(0.01)  # ensure that the queued_at times are different
            self.docs_to_delete.append(doc)
            queued.append(doc)

        ops = self.svc.list_operations(
            dataset_name=dataset_name,
            paging=DelegatedOperationPagingParams(
                skip=0,
                limit=100,
                sort_by=SortByField.QUEUED_AT,
                sort_direction=SortDirection.DESCENDING,
            ),
        )

        self.assertEqual(len(ops), 25)

        self.svc.delete_for_dataset(dataset_id=dataset_id)

        ops = self.svc.list_operations(
            dataset_name=dataset_name,
            paging=DelegatedOperationPagingParams(
                skip=0,
                limit=100,
                sort_by=SortByField.QUEUED_AT,
                sort_direction=SortDirection.DESCENDING,
            ),
        )

        self.assertEqual(len(ops), 0)

    @patch(
        "fiftyone.core.odm.utils.load_dataset",
    )
    def test_search(
        self, mock_load_dataset, mock_get_operator, mock_operator_exists
    ):
        dataset_id = ObjectId()
        dataset_name = f"test_dataset_{dataset_id}"
        mock_load_dataset.return_value.name = dataset_name
        mock_load_dataset.return_value._doc.id = dataset_id

        delegation_target = f"delegation_target{ObjectId()}"
        for i in range(4):
            operator = f"@voxelfiftyone/operator/test_{i}"
            for j in range(25):
                doc = self.svc.queue_operation(
                    operator=operator,
                    label=mock_get_operator.return_value.name,
                    delegation_target=delegation_target,
                    context=ExecutionContext(
                        request_params={
                            "foo": "bar",
                            "dataset_name": dataset_name,
                        }
                    ),
                )
                time.sleep(
                    0.01
                )  # ensure that the queued_at times are different
                self.docs_to_delete.append(doc)

        # test paging - get a page of everything
        docs = self.svc.list_operations(
            search={"operator/test": {"operator"}},
            paging=DelegatedOperationPagingParams(
                skip=0,
                limit=5000,
                sort_by=SortByField.QUEUED_AT,
                sort_direction=SortDirection.DESCENDING,
            ),
        )

        self.assertEqual(len(docs), 100)

        docs = self.svc.list_operations(
            search={"test_0": {"operator"}},
            paging=DelegatedOperationPagingParams(
                skip=0,
                limit=5000,
                sort_by=SortByField.QUEUED_AT,
                sort_direction=SortDirection.ASCENDING,
            ),
        )

        self.assertEqual(len(docs), 25)

    @patch(
        "fiftyone.core.odm.utils.load_dataset",
    )
    def test_count(
        self, mock_load_dataset, mock_get_operator, mock_operator_exists
    ):
        dataset_id = ObjectId()
        dataset_name = f"test_dataset_{dataset_id}"
        mock_load_dataset.return_value.name = dataset_name
        mock_load_dataset.return_value._doc.id = dataset_id

        mock_get_operator.return_value = MockOperator()

        delegation_target = f"delegation_target{ObjectId()}"
        for i in range(4):
            operator = f"@voxelfiftyone/operator/test_{i}"
            for j in range(25):
                doc = self.svc.queue_operation(
                    operator=operator,
                    delegation_target=delegation_target,
                    label=mock_get_operator.return_value.name,
                    context=ExecutionContext(
                        request_params={
                            "foo": "bar",
                            "dataset_name": dataset_name,
                        }
                    ),
                )
                time.sleep(
                    0.01
                )  # ensure that the queued_at times are different
                self.docs_to_delete.append(doc)

        # test paging - get a page of everything
        docs = self.svc.count(
            search={"operator/test": {"operator"}},
        )

        self.assertEqual(docs, 100)

        docs = self.svc.count(
            search={"test_0": {"operator"}},
        )

        self.assertEqual(docs, 25)

        docs = self.svc.count(
            filters={"operator": f"@voxelfiftyone/operator/test_0"},
        )
        self.assertEqual(docs, 25)

    @patch(
        "fiftyone.core.odm.utils.load_dataset",
    )
    def test_rename_operation(
        self, mock_load_dataset, mock_get_operator, mock_operator_exists
    ):
        dataset_id = ObjectId()
        dataset_name = f"test_dataset_{dataset_id}"
        mock_load_dataset.return_value.name = dataset_name
        mock_load_dataset.return_value._doc.id = dataset_id

        ctx = ExecutionContext()
        ctx.request_params = {"foo": "bar"}
        doc = self.svc.queue_operation(
            operator="@voxelfiftyone/operator/foo",
            label=mock_get_operator.return_value.name,
            delegation_target=f"test_target",
            context=ctx.serialize(),
        )
        self.assertEquals(doc.label, mock_get_operator.return_value.name)

        self.docs_to_delete.append(doc)

        doc = self.svc.set_label(doc.id, "this is my delegated operation run.")
        self.assertEquals(doc.label, "this is my delegated operation run.")

        doc = self.svc.get(doc.id)
        self.assertEquals(doc.label, "this is my delegated operation run.")
