"""
FiftyOne delegated operator related unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio
import copy
import time
import unittest
from unittest import mock
from unittest.mock import patch

import bson
import pytest

from bson import ObjectId

from fiftyone import Dataset
from fiftyone.factory import (
    DelegatedOperationPagingParams,
    SortDirection,
    SortByField,
)
from fiftyone.operators.types import PipelineRunInfo
from fiftyone.operators import delegated
from fiftyone.operators.delegated import DelegatedOperationService
from fiftyone.operators.executor import (
    ExecutionContext,
    ExecutionResult,
    ExecutionRunState,
    PipelineExecutionContext,
)
from fiftyone.operators.types import Pipeline, PipelineStage
from fiftyone.factory.repos import (
    DelegatedOperationDocument,
    delegated_operation,
)
from fiftyone.operators.operator import Operator, OperatorConfig

TEST_DO_PREFIX = "@testVoxelFiftyOneDOSvc"


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
    result = {"executed": True}

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
        return self.result


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


class MockOperatorWithIO(MockOperator):
    def resolve_input(self, *args, **kwargs):
        return MockInputs()

    def resolve_output(self, *args, **kwargs):
        return MockOutputs()


class MockProgressiveOperatorWithOutputs(MockGeneratorOperator):
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

    def resolve_output(self, *args, **kwargs):
        return MockOutputs()


@patch(
    "fiftyone.operators.registry.OperatorRegistry.get_operator",
    return_value=MockOperator(),
)
class DelegatedOperationServiceTests(unittest.TestCase):
    _should_fail = False

    def setUp(self):
        self.mock_is_remote_service = patch.object(
            delegated_operation,
            "is_remote_service",
            return_value=False,
        ).start()

        self.mock_operator_exists = patch(
            "fiftyone.operators.registry.OperatorRegistry.operator_exists",
            return_value=True,
        ).start()
        self.docs_to_delete = []
        self.svc = DelegatedOperationService()

    def tearDown(self):
        self.delete_test_data()
        patch.stopall()

    def delete_test_data(self):
        self.svc._repo._collection.delete_many(
            {"operator": {"$regex": TEST_DO_PREFIX}}
        )

    @patch(
        "fiftyone.core.odm.utils.load_dataset",
    )
    def test_delegate_operation(self, mock_load_dataset, mock_get_operator):
        dataset_id = ObjectId()
        dataset_name = f"test_dataset_{dataset_id}"
        mock_load_dataset.return_value.name = dataset_name
        mock_load_dataset.return_value._doc.id = dataset_id

        pipeline = Pipeline(
            [
                PipelineStage(
                    name="one",
                    operator_uri="@test/op1",
                    num_distributed_tasks=5,
                    params={"foo": "bar"},
                ),
                PipelineStage(
                    name="two", operator_uri="@test/op2", always_run=True
                ),
            ]
        )
        doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/foo",
            label=mock_get_operator.return_value.config.label,
            delegation_target="foo",
            context=ExecutionContext(
                request_params={"foo": "bar", "dataset_name": dataset_name},
            ),
            pipeline=pipeline,
        )
        self.docs_to_delete.append(doc)
        self.assertIsNotNone(doc.queued_at)
        self.assertEqual(doc.label, "Mock Operator")
        self.assertEqual(doc.run_state, ExecutionRunState.QUEUED)
        self.assertEqual(doc.metadata, {})
        self.assertEqual(doc.pipeline, pipeline)

        doc2_metadata = {"inputs_schema": {}}
        doc2 = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/foo",
            delegation_target="foo",
            context=ExecutionContext(
                request_params={"foo": "bar", "dataset_name": dataset_name},
            ),
            metadata=doc2_metadata,
        )
        self.docs_to_delete.append(doc2)
        self.assertIsNotNone(doc2.queued_at)
        self.assertEqual(doc2.label, f"{TEST_DO_PREFIX}/operator/foo")
        self.assertEqual(doc2.run_state, ExecutionRunState.QUEUED)
        self.assertEqual(doc2.metadata, doc2_metadata)

    def test_list_operations(self, mock_get_operator):
        dataset_name = f"test_dataset_{ObjectId()}"
        dataset = Dataset(dataset_name, _create=True, persistent=True)
        dataset.save()
        dataset_id = dataset._doc.id

        self.delete_test_data()

        dataset_name2 = f"test_dataset_{ObjectId()}"
        dataset2 = Dataset(dataset_name2, _create=True, persistent=True)
        dataset2.save()
        dataset_id2 = dataset2._doc.id

        operator = f"{TEST_DO_PREFIX}/operator/foo"
        operator2 = f"{TEST_DO_PREFIX}/operator/bar"

        dynamic_docs = []
        static_docs = []

        # get all the existing counts of queued operations
        initial_queued = len(self.svc.get_queued_operations())
        initial_running = len(self.svc.get_running_operations())
        initial_scheduled = len(self.svc.get_scheduled_operations())
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
                delegation_target=f"delegation_target{i}",
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
            dynamic_docs.append(doc.id)

        for i in range(10):
            doc = self.svc.queue_operation(
                operator=operator2,
                label=mock_get_operator.return_value.name,
                delegation_target=f"delegation_target_2{i}",
                context=ExecutionContext(
                    request_params={
                        "foo": "bar",
                        "dataset_name": dataset_name2,
                        "dataset_id": str(dataset_id2),
                    },
                ),
            )
            self.docs_to_delete.append(doc)
            static_docs.append(doc.id)

        queued = self.svc.get_queued_operations()
        # dynamic + static docs should be queued
        self.assertEqual(
            len(queued), len(dynamic_docs) + len(static_docs) + initial_queued
        )

        queued = self.svc.get_queued_operations(dataset_name=dataset_name)
        # dataset_name corresponds to dynamic docs
        self.assertEqual(
            len(queued), len(dynamic_docs) + initial_dataset_queued
        )

        queued = self.svc.get_queued_operations(operator=operator)
        # operator corresponds to dynamic docs
        self.assertEqual(
            len(queued), len(dynamic_docs) + initial_operator_queued
        )

        # test set_running behavior
        for doc_id in dynamic_docs:
            self.svc.set_running(doc_id)

        queued = self.svc.get_queued_operations()
        # static docs should be `queued`
        self.assertEqual(len(queued), len(static_docs) + initial_queued)

        running = self.svc.get_running_operations()
        # dynamic docs should be `running`
        self.assertEqual(len(running), len(dynamic_docs) + initial_running)

        # test set_scheduled behavior
        for doc_id in dynamic_docs:
            self.svc.set_scheduled(doc_id)

        queued = self.svc.get_queued_operations()
        # static docs should be `queued`
        self.assertEqual(len(queued), len(static_docs) + initial_queued)

        scheduled = self.svc.get_scheduled_operations()
        # dynamic docs should be `scheduled`
        self.assertEqual(len(scheduled), len(dynamic_docs) + initial_scheduled)

        # test set_queued(id) behavior
        for doc_id in dynamic_docs:
            self.svc.set_queued(doc_id)

        queued = self.svc.get_queued_operations()
        # dynamic + static docs should be `queued`
        self.assertEqual(
            len(queued), len(dynamic_docs) + len(static_docs) + initial_queued
        )

        # test set_queued(id, current_state=...) behavior
        # set_queued(id, current_state=...) should only transition elements matching `current_state`

        subset_size = 4
        non_subset_size = len(dynamic_docs) - subset_size
        # transition a subset of docs to `scheduled`
        for doc_id in dynamic_docs[:subset_size]:
            self.svc.set_scheduled(doc_id)
        # transition the other dynamic docs to `running` (just not `scheduled` or `queued`)
        for doc_id in dynamic_docs[subset_size:]:
            self.svc.set_running(doc_id)

        scheduled = self.svc.get_scheduled_operations()
        # subset should be `scheduled`
        self.assertEqual(len(scheduled), subset_size + initial_scheduled)

        running = self.svc.get_running_operations()
        # non-subset should be `running`
        self.assertEqual(len(running), non_subset_size + initial_running)

        queued = self.svc.get_queued_operations()
        # static docs should be `queued`
        self.assertEqual(len(queued), len(static_docs) + initial_queued)

        return_values = []
        for doc_id in dynamic_docs:
            # attempt to transition from scheduled to queued
            return_values.append(
                self.svc.set_queued(
                    doc_id, required_state=ExecutionRunState.SCHEDULED
                )
            )

        # set_queued should return the updated doc if a transition occurred
        for result in return_values[:subset_size]:
            self.assertIsNotNone(result)
        # set_queued should return `None` if no transition occurred
        for result in return_values[subset_size:]:
            self.assertIsNone(result)

        queued = self.svc.get_queued_operations()
        # subset + static docs should be `queued`
        self.assertEqual(
            len(queued), subset_size + len(static_docs) + initial_queued
        )

        scheduled = self.svc.get_scheduled_operations()
        # only initial docs should still be `scheduled`
        self.assertEqual(len(scheduled), initial_scheduled)

        running = self.svc.get_running_operations()
        # non-subset should still be `running`
        self.assertEqual(len(running), non_subset_size + initial_running)

        dataset.delete()
        dataset2.delete()

    @patch(
        "fiftyone.core.odm.utils.load_dataset",
    )
    def test_set_run_states(self, mock_load_dataset, mock_get_operator):
        mock_inputs = MockInputs()
        mock_load_dataset.return_value = MockDataset()
        mock_get_operator.return_value = MockOperatorWithIO()
        doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/foo",
            label=mock_get_operator.return_value.name,
            delegation_target=f"test_target",
            context=ExecutionContext(
                request_params={"foo": "bar", "dataset_id": str(ObjectId())}
            ),
            metadata={"inputs_schema": mock_inputs.to_json()},
        )
        self.assertEqual(
            doc.metadata, {"inputs_schema": mock_inputs.to_json()}
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

    @patch(
        "fiftyone.core.odm.utils.load_dataset",
    )
    def test_sets_progress(self, mock_load_dataset, mock_get_operator):
        mock_load_dataset.return_value = MockDataset()
        mock_get_operator.return_value = MockOperator(sets_progress=True)

        doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/foo",
            delegation_target=f"test_target",
            context=ExecutionContext(
                request_params={"foo": "bar", "dataset_id": str(ObjectId())}
            ),
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, ExecutionRunState.QUEUED)

        results = self.svc.execute_queued_operations(
            delegation_target="test_target",
            monitor=False,
        )
        self.assertEqual(len(results), 1)
        self.assertIsNone(results[0].error)
        self.assertDictEqual(results[0].result, MockOperator.result)

        doc = self.svc.get(doc_id=doc.id)
        self.assertEqual(doc.run_state, ExecutionRunState.COMPLETED)
        self.assertIsNotNone(doc.status)
        self.assertEqual(doc.status.progress, 0.5)
        self.assertEqual(doc.status.label, "halfway there")
        self.assertIsNotNone(doc.status.updated_at)

    @patch(
        "fiftyone.core.odm.utils.load_dataset",
    )
    def test_full_run_success(self, mock_load_dataset, mock_get_operator):
        mock_load_dataset.return_value = MockDataset()
        doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/foo",
            label=mock_get_operator.return_value.name,
            delegation_target=f"test_target",
            context=ExecutionContext(
                request_params={"foo": "bar", "dataset_id": str(ObjectId())}
            ),
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, ExecutionRunState.QUEUED)

        results = self.svc.execute_queued_operations(
            delegation_target="test_target", monitor=False
        )
        self.assertEqual(len(results), 1)
        self.assertIsNone(results[0].error)
        self.assertDictEqual(results[0].result, MockOperator.result)

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
    def test_generator_run_success(self, mock_load_dataset, mock_get_operator):
        mock_load_dataset.return_value = MockDataset()
        mock_get_operator.return_value = MockGeneratorOperator()

        doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/generator_op",
            label=mock_get_operator.return_value.name,
            delegation_target=f"test_target_generator",
            context=ExecutionContext(
                request_params={"foo": "bar", "dataset_id": str(ObjectId())}
            ),
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, ExecutionRunState.QUEUED)

        results = self.svc.execute_queued_operations(
            delegation_target="test_target_generator", monitor=False
        )
        self.assertEqual(len(results), 1)
        self.assertIsNone(results[0].error)

        doc = self.svc.get(doc_id=doc.id)
        self.assertEqual(doc.run_state, ExecutionRunState.COMPLETED)
        self.assertIsNotNone(doc.started_at)
        self.assertIsNotNone(doc.queued_at)
        self.assertIsNotNone(doc.completed_at)
        self.assertIsNone(doc.result)
        self.assertIsNone(doc.failed_at)

    @patch(
        "fiftyone.core.odm.utils.load_dataset",
    )
    def test_generator_sets_progress(
        self, mock_load_dataset, mock_get_operator
    ):
        mock_load_dataset.return_value = MockDataset()
        mock_get_operator.return_value = MockGeneratorOperator(
            sets_progress=True
        )

        doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/foo",
            delegation_target=f"test_target",
            context=ExecutionContext(request_params={"foo": "bar"}),
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, ExecutionRunState.QUEUED)

        results = self.svc.execute_queued_operations(
            delegation_target="test_target", monitor=False
        )
        self.assertEqual(len(results), 1)
        self.assertIsNone(results[0].error)

        doc = self.svc.get(doc_id=doc.id)
        self.assertEqual(doc.run_state, ExecutionRunState.COMPLETED)
        self.assertIsNotNone(doc.status)
        self.assertEqual(doc.status.progress, 0.5)
        self.assertEqual(doc.status.label, "halfway there")
        self.assertIsNotNone(doc.status.updated_at)

    @patch(
        "fiftyone.core.odm.utils.load_dataset",
    )
    def test_updates_progress(self, mock_load_dataset, mock_get_operator):
        mock_inputs = MockInputs()
        mock_outputs = MockOutputs()
        mock_get_operator.return_value = MockProgressiveOperatorWithOutputs()
        mock_load_dataset.return_value = MockDataset()
        doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/foo",
            delegation_target=f"test_target",
            context=ExecutionContext(request_params={"foo": "bar"}),
            metadata={"inputs_schema": mock_inputs.to_json()},
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, ExecutionRunState.QUEUED)
        self.assertEqual(
            doc.metadata, {"inputs_schema": mock_inputs.to_json()}
        )

        with patch.object(
            DelegatedOperationService, "set_progress"
        ) as set_progress:
            self.svc.execute_operation(
                operation=doc, run_link="http://run.info", monitor=False
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
        self.assertEqual(
            doc.metadata,
            {
                "inputs_schema": mock_inputs.to_json(),
                "outputs_schema": mock_outputs.to_json(),
            },
        )

    def test_queued_state_required_to_execute(self, mock_get_operator):
        mock_inputs = MockInputs()
        operator = mock.MagicMock()
        mock_get_operator.return_value = operator
        doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/foo",
            delegation_target="test_target",
            context=ExecutionContext(request_params={"foo": "bar"}),
            metadata={"inputs_schema": mock_inputs.to_json()},
        )

        # Set it to running separately - execution not allowed now because
        #   it's running elsewhere.
        self.svc.set_running(doc.id)

        self.svc.execute_operation(doc, monitor=False)
        operator.execute.assert_not_called()

        doc = self.svc.get(doc_id=doc.id)
        self.assertEqual(doc.run_state, ExecutionRunState.RUNNING)

    @patch(
        "fiftyone.core.odm.utils.load_dataset",
    )
    def test_full_run_fail(self, mock_load_dataset, mock_get_operator):
        dataset_id = ObjectId()
        dataset_name = f"test_dataset_{dataset_id}"
        mock_load_dataset.return_value.name = dataset_name
        mock_load_dataset.return_value._doc.id = dataset_id
        mock_get_operator.return_value = MockOperator(success=False)

        ctx = ExecutionContext()
        ctx.request_params = {"foo": "bar"}
        doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/foo",
            label=mock_get_operator.return_value.name,
            delegation_target="test_target",
            context=ctx.serialize(),
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, ExecutionRunState.QUEUED)

        results = self.svc.execute_queued_operations(
            delegation_target="test_target", monitor=False
        )
        self.assertEqual(len(results), 1)
        self.assertIsNotNone(results[0].error)
        self.assertIsNone(results[0].result)

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
    def test_rerun_failed(self, mock_load_dataset, get_op_mock):
        dataset_id = ObjectId()
        dataset_name = f"test_dataset_{dataset_id}"
        mock_load_dataset.return_value.name = dataset_name
        mock_load_dataset.return_value._doc.id = dataset_id

        get_op_mock.return_value = MockOperator(success=False)

        ctx = ExecutionContext()
        ctx.request_params = {"foo": "bar"}
        doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/foo",
            label=get_op_mock.return_value.name,
            delegation_target="test_target",
            context=ctx.serialize(),
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, ExecutionRunState.QUEUED)

        results = self.svc.execute_queued_operations(
            delegation_target="test_target", monitor=False
        )
        self.assertEqual(len(results), 1)
        self.assertIsNotNone(results[0].error)
        self.assertIsNone(results[0].result)

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

        results = self.svc.execute_queued_operations(
            delegation_target="test_target", monitor=False
        )
        self.assertEqual(len(results), 1)
        self.assertIsNone(results[0].error)
        self.assertDictEqual(results[0].result, MockOperator.result)

        doc = self.svc.get(doc_id=rerun_doc.id)
        self.assertEqual(doc.run_state, ExecutionRunState.COMPLETED)

    def test_rerun_with_renamed_dataset(self, get_op_mock):
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
            operator=f"{TEST_DO_PREFIX}/operator/foo",
            label=get_op_mock.return_value.name,
            delegation_target="test_target",
            context=ctx.serialize(),
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, ExecutionRunState.QUEUED)

        # Execute once with original dataset name
        results = self.svc.execute_queued_operations(
            delegation_target="test_target", monitor=False
        )
        self.assertEqual(len(results), 1)
        self.assertIsNotNone(results[0].error)
        self.assertIsNone(results[0].result)

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

            results = self.svc.execute_queued_operations(
                delegation_target="test_target", monitor=False
            )
            self.assertEqual(len(results), 1)
            self.assertIsNone(results[0].error)
            self.assertDictEqual(results[0].result, MockOperator.result)

            doc = self.svc.get(doc_id=rerun_doc.id)
            self.assertEqual(doc.run_state, ExecutionRunState.COMPLETED)

        except:
            pytest.fail(
                "Should not fail when rerunning failed operation with renamed dataset"
            )
        finally:
            dataset.delete()

    def test_rerun_child_do_fail(self, mock_get_operator):
        mock_child_doc = mock.MagicMock(spec=DelegatedOperationDocument)
        mock_child_doc.parent_id = ObjectId()

        with patch.object(self.svc._repo, "get", return_value=mock_child_doc):
            with patch.object(
                self.svc._repo, "queue_operation", return_value=mock_child_doc
            ):
                with pytest.raises(ValueError):
                    _ = self.svc.rerun_operation("abc123")

    @patch(
        "fiftyone.core.odm.utils.load_dataset",
    )
    def test_execute_with_already_processing_op(
        self, mock_load_dataset, mock_get_operator
    ):
        mock_load_dataset.return_value = MockDataset()
        doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/foo",
            label=mock_get_operator.return_value.name,
            delegation_target=f"test_target",
            context=ExecutionContext(
                request_params={"foo": "bar", "dataset_id": str(ObjectId())}
            ),
        )
        self.docs_to_delete.append(doc)
        doc = self.svc.set_running(doc.id)
        result = self.svc.execute_operation(doc, monitor=False)
        changed_doc = self.svc.get(doc_id=doc.id)
        self.assertEqual(changed_doc.status, doc.status)
        self.assertIsNone(result)

    @patch("logging.handlers.QueueListener")
    @patch("multiprocessing.get_context")
    def test_execute_operation_monitor_success(
        self,
        mock_get_context,
        mock_listener,
        mock_get_operator,
    ):
        mock_process = mock.MagicMock()

        mock_process.is_alive.side_effect = [True, True, True, False, False]

        mock_context = mock.MagicMock()
        mock_context.Process.return_value = mock_process
        mock_context.Queue.return_value = mock.MagicMock()
        mock_get_context.return_value = mock_context

        doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/monitor_success",
            context=ExecutionContext(
                request_params={"dataset_id": str(ObjectId())}
            ),
        )
        self.docs_to_delete.append(doc)

        # First call returns running doc, second call returns completed doc
        running_doc = copy.deepcopy(doc)
        running_doc.run_state = ExecutionRunState.RUNNING

        completed_doc = copy.deepcopy(doc)
        completed_doc.run_state = ExecutionRunState.COMPLETED
        completed_doc.result = ExecutionResult(result={"executed": True})

        with patch.object(
            self.svc, "get", side_effect=[running_doc, completed_doc]
        ), patch(
            "fiftyone.operators.delegated._execute_operator_in_child_process"
        ), patch.object(
            self.svc._repo, "ping"
        ) as mock_ping:
            result = self.svc.execute_operation(
                operation=doc,
                log=False,
                monitor=True,
            )

            # Verify ping was called with the operation ID
            mock_ping.assert_called_once_with(doc.id)

        self.assertIsNotNone(result)
        self.assertIsNone(result.error)
        self.assertEqual(result.result, {"executed": True})

    @patch("psutil.Process")
    @patch("logging.handlers.QueueListener")
    @patch("multiprocessing.get_context")
    def test_execute_operation_monitor_external_fail(
        self,
        mock_get_context,
        mock_listener,
        mock_psutil_process,
        mock_get_operator,
    ):
        mock_process = mock.MagicMock()
        mock_process.pid = 12345

        mock_process.is_alive.side_effect = [
            True,  # 1st loop: while condition
            True,  # 1st loop: after join
            True,  # 2nd loop: while condition
            True,  # 2nd loop: after join
            False,  # after termination
        ]

        mock_context = mock.MagicMock()
        mock_context.Process.return_value = mock_process
        mock_context.Queue.return_value = mock.MagicMock()
        mock_get_context.return_value = mock_context

        mock_psutil_parent = mock.MagicMock()
        mock_psutil_process.return_value = mock_psutil_parent

        doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/monitor_external_fail",
            context=ExecutionContext(
                request_params={"dataset_id": str(ObjectId())}
            ),
        )
        self.docs_to_delete.append(doc)

        # We need two document states for our simulation
        running_doc = copy.deepcopy(doc)
        running_doc.run_state = ExecutionRunState.RUNNING

        failed_doc = copy.deepcopy(doc)
        failed_doc.run_state = ExecutionRunState.FAILED
        failed_doc.result = ExecutionResult(error="marked as failed by test")

        with patch.object(
            self.svc, "get", side_effect=[running_doc, failed_doc]
        ), patch("time.sleep", return_value=None), patch.object(
            self.svc._repo, "ping"
        ) as mock_ping:
            result = self.svc.execute_operation(
                operation=doc,
                log=False,
                monitor=True,
                check_interval_seconds=1,
            )

            # This assertion will now pass
            mock_ping.assert_called_once_with(doc.id)

        mock_psutil_process.assert_called_once_with(mock_process.pid)
        mock_psutil_parent.children.assert_called_once_with(recursive=True)
        mock_psutil_parent.terminate.assert_called_once()

        self.assertIsNotNone(result)
        self.assertIn("Operation marked as FAILED externally", result.error)

        mock_process.start.assert_called_once()
        self.assertGreaterEqual(mock_process.join.call_count, 2)

    @patch("logging.handlers.QueueListener")
    @patch("multiprocessing.get_context")
    def test_execute_operation_monitor_internal_fail(
        self,
        mock_get_context,
        mock_listener,
        mock_get_operator,
    ):
        mock_process = mock.MagicMock()
        mock_process.is_alive.side_effect = [
            True,
            True,  # Cycle 1
            True,
            True,  # Cycle 2
            False,
            False,  # Subsequent checks
        ]

        mock_context = mock.MagicMock()
        mock_context.Process.return_value = mock_process
        mock_context.Queue.return_value = mock.MagicMock()
        mock_get_context.return_value = mock_context

        doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/monitor_fail",
            context=ExecutionContext(
                request_params={"dataset_id": str(ObjectId())}
            ),
        )
        self.docs_to_delete.append(doc)

        # First call returns running doc, second call returns failed doc
        running_doc = copy.deepcopy(doc)
        running_doc.run_state = ExecutionRunState.RUNNING

        failed_doc = copy.deepcopy(doc)
        failed_doc.run_state = ExecutionRunState.FAILED
        failed_doc.result = ExecutionResult(
            error="MockOperator failed internally"
        )

        with patch.object(
            self.svc, "get", side_effect=[running_doc, failed_doc]
        ), patch(
            "fiftyone.operators.delegated._execute_operator_in_child_process"
        ), patch.object(
            self.svc._repo, "ping"
        ) as mock_ping, patch(
            "psutil.Process"
        ) as mock_psutil_process:
            mock_psutil_parent = mock.MagicMock()
            mock_psutil_process.return_value = mock_psutil_parent

            result = self.svc.execute_operation(
                operation=doc,
                log=False,
                monitor=True,
            )

            # Verify ping was called with the operation ID (before failure detected)
            mock_ping.assert_called_once_with(doc.id)

        self.assertIsNotNone(result)
        self.assertIsNotNone(result.error)
        self.assertIn("Operation FAILED (detected by monitor):", result.error)
        self.assertIn("MockOperator failed internally", result.error)

    @patch("logging.handlers.QueueListener")
    @patch("multiprocessing.get_context")
    def test_execute_operation_monitor_ping_exception(
        self,
        mock_get_context,
        mock_listener,
        mock_get_operator,
    ):
        """Test that monitoring handles ping exceptions gracefully"""
        mock_process = mock.MagicMock()
        mock_process.is_alive.side_effect = [True, True, False]
        mock_process.pid = 12345

        mock_context = mock.MagicMock()
        mock_context.Process.return_value = mock_process
        mock_context.Queue.return_value = mock.MagicMock()
        mock_get_context.return_value = mock_context

        doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/monitor_ping_fail",
            context=ExecutionContext(
                request_params={"dataset_id": str(ObjectId())}
            ),
        )
        self.docs_to_delete.append(doc)

        # Mock get to return running operation first time, then completed
        running_doc = copy.deepcopy(doc)
        running_doc.run_state = ExecutionRunState.RUNNING

        # Mock ping to raise an exception
        ping_exception = Exception("Database connection failed")

        with patch.object(self.svc, "get", return_value=running_doc), patch(
            "fiftyone.operators.delegated._execute_operator_in_child_process"
        ), patch.object(
            self.svc._repo, "ping", side_effect=ping_exception
        ), patch(
            "psutil.Process"
        ) as mock_psutil_process, patch(
            "time.sleep", return_value=None
        ):
            mock_psutil_parent = mock.MagicMock()
            mock_psutil_process.return_value = mock_psutil_parent

            result = self.svc.execute_operation(
                operation=doc, log=False, monitor=True
            )

            # Should terminate the process due to ping exception
            mock_psutil_process.assert_called_once_with(mock_process.pid)
            mock_psutil_parent.children.assert_called_once_with(recursive=True)
            mock_psutil_parent.terminate.assert_called_once()

        self.assertIsNotNone(result)
        self.assertIn("Error in monitoring loop", result.error)
        self.assertIn("Database connection failed", result.error)

    @patch("logging.handlers.QueueListener")
    @patch("multiprocessing.get_context")
    def test_execute_operation_monitor_get_exception(
        self,
        mock_get_context,
        mock_listener,
        mock_get_operator,
    ):
        """Test that monitoring handles get operation exceptions gracefully"""
        mock_process = mock.MagicMock()
        mock_process.is_alive.side_effect = [True, True, False]
        mock_process.pid = 12345

        mock_context = mock.MagicMock()
        mock_context.Process.return_value = mock_process
        mock_context.Queue.return_value = mock.MagicMock()
        mock_get_context.return_value = mock_context

        doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/monitor_get_fail",
            context=ExecutionContext(
                request_params={"dataset_id": str(ObjectId())}
            ),
        )
        self.docs_to_delete.append(doc)

        # Mock get to raise an exception
        get_exception = Exception("Failed to retrieve operation")

        with patch.object(self.svc, "get", side_effect=get_exception), patch(
            "fiftyone.operators.delegated._execute_operator_in_child_process"
        ), patch.object(self.svc._repo, "ping") as mock_ping, patch(
            "psutil.Process"
        ) as mock_psutil_process, patch(
            "time.sleep", return_value=None
        ):
            mock_psutil_parent = mock.MagicMock()
            mock_psutil_process.return_value = mock_psutil_parent

            result = self.svc.execute_operation(
                operation=doc, log=False, monitor=True
            )

            # Ping should not be called if get fails
            mock_ping.assert_not_called()

            # Should terminate the process due to get exception
            mock_psutil_process.assert_called_once_with(mock_process.pid)
            mock_psutil_parent.children.assert_called_once_with(recursive=True)
            mock_psutil_parent.terminate.assert_called_once()

        self.assertIsNotNone(result)
        self.assertIn("Error in monitoring loop", result.error)
        self.assertIn("Failed to retrieve operation", result.error)

    def test_execute_with_renamed_dataset(self, get_op_mock):
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
            operator=f"{TEST_DO_PREFIX}/operator/foo",
            label=get_op_mock.return_value.name,
            delegation_target="test_target",
            context=ctx.serialize(),
        )

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, ExecutionRunState.QUEUED)

        # Rename dataset
        dataset.name = f"renamed_dataset_{uid}"
        dataset.save()

        # Execute queued operation after saving the new dataset name
        try:
            results = self.svc.execute_queued_operations(
                delegation_target="test_target", monitor=False
            )
            self.assertEqual(len(results), 1)
            self.assertIsNone(results[0].error)
            self.assertDictEqual(results[0].result, MockOperator.result)

            doc = self.svc.get(doc_id=doc.id)
            self.assertEqual(doc.run_state, ExecutionRunState.COMPLETED)
        except:
            pytest.fail(
                "Should not fail when executing queued operation with renamed dataset"
            )
        finally:
            dataset.delete()

    @patch.object(delegated, "do_execute_operator")
    @patch.object(delegated, "prepare_operator_executor")
    def test_execute_with_pipeline_context(
        self, prepare_operator_mock, do_execute_mock, mock_get_operator
    ):
        with patch.object(self.svc, "get") as do_get_mock:
            parent_run_info = PipelineRunInfo(
                active=False,
                expected_children=[1, 1, 5],
                stage_index=2,
                child_errors={"child1": "error1", "child2": "error2"},
            )
            parent_id = ObjectId()
            pipeline = Pipeline(
                [
                    PipelineStage(operator_uri="@test/op1", name="one"),
                    PipelineStage(name="two", operator_uri="@test/op2"),
                    PipelineStage(
                        name="three",
                        operator_uri="@test/op3",
                        num_distributed_tasks=5,
                    ),
                ]
            )

            parent_do = DelegatedOperationDocument()
            parent_do.id = parent_id
            parent_do.pipeline = pipeline
            parent_do.pipeline_run_info = parent_run_info
            do_get_mock.return_value = parent_do

            child_do = DelegatedOperationDocument()
            child_do.id = bson.ObjectId()
            child_do.operator = "@test/op3"
            child_do.parent_id = parent_id
            ctx = ExecutionContext(
                request_params={"foo": "bar", "dataset_name": "dataset"},
            )
            child_do.context = ctx
            prepare_operator_mock.return_value = (
                mock_get_operator.return_value,
                None,
                ctx,
                None,
            )

            #####
            asyncio.run(self.svc._execute_operator(child_do))
            #####

            do_get_mock.assert_called_once_with(parent_id)
            pipeline_ctx = PipelineExecutionContext(
                parent_run_info.active,
                parent_run_info.stage_index,
                total_stages=len(pipeline.stages),
                num_distributed_tasks=pipeline.stages[
                    parent_run_info.stage_index
                ].num_distributed_tasks,
                pipeline_errors=parent_run_info.child_errors,
            )
            prepare_operator_mock.assert_called_once_with(
                operator_uri=child_do.operator,
                request_params=ctx.request_params,
                delegated_operation_id=child_do.id,
                set_progress=mock.ANY,
                pipeline_ctx=pipeline_ctx,
            )
            do_execute_mock.assert_called_once_with(
                mock_get_operator.return_value, ctx, exhaust=True
            )

    def test_paging_sorting(self, mock_get_operator):
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
            operator = f"{TEST_DO_PREFIX}/operator/test_{i}"
            for j in range(25):
                doc = self.svc.queue_operation(
                    operator=operator,
                    label=mock_get_operator.return_value.name,
                    delegation_target="test_target",
                    context=ExecutionContext(
                        request_params={
                            "foo": "bar",
                            "dataset_name": dataset_name,
                            "dataset_id:": str(dataset_id),
                        },
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
            operator=f"{TEST_DO_PREFIX}/operator/test_0",
            paging=DelegatedOperationPagingParams(skip=0, limit=100),
        )
        self.assertEqual(len(docs), 25)
        states = [doc.run_state for doc in docs]
        self.assertEqual(states, [ExecutionRunState.QUEUED] * 25)

        docs = self.svc.list_operations(
            operator=f"{TEST_DO_PREFIX}/operator/test_1",
            paging=DelegatedOperationPagingParams(skip=0, limit=100),
        )
        self.assertEqual(len(docs), 25)
        states = [doc.run_state for doc in docs]
        self.assertEqual(states, [ExecutionRunState.RUNNING] * 25)

        docs = self.svc.list_operations(
            operator=f"{TEST_DO_PREFIX}/operator/test_2",
            paging=DelegatedOperationPagingParams(skip=0, limit=100),
        )
        self.assertEqual(len(docs), 25)
        states = [doc.run_state for doc in docs]
        self.assertEqual(states, [ExecutionRunState.COMPLETED] * 25)

        docs = self.svc.list_operations(
            operator=f"{TEST_DO_PREFIX}/operator/test_3",
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
            operator=f"{TEST_DO_PREFIX}/operator/foo",
            label=mock_get_operator.return_value.name,
            delegation_target="test_target",
            context=ctx.serialize(),
        )

        self.docs_to_delete.append(doc)

        self.assertEqual(doc.dataset_id, dataset_id)

    @patch(
        "fiftyone.core.odm.utils.load_dataset",
    )
    def test_deletes_by_dataset_id(self, mock_load_dataset, mock_get_operator):
        dataset_id = ObjectId()
        dataset_name = f"test_dataset_{dataset_id}"
        mock_load_dataset.return_value.name = dataset_name
        mock_load_dataset.return_value._doc.id = dataset_id

        # create 100 docs, 25 of each state & for each user
        queued = []
        operator = f"{TEST_DO_PREFIX}/operator/test_{ObjectId}"
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
    def test_search(self, mock_load_dataset, mock_get_operator):
        dataset_id = ObjectId()
        dataset_name = f"test_dataset_{dataset_id}"
        mock_load_dataset.return_value.name = dataset_name
        mock_load_dataset.return_value._doc.id = dataset_id

        delegation_target = f"delegation_target{ObjectId()}"
        for i in range(4):
            operator = f"{TEST_DO_PREFIX}/operator/test_{i}"
            for j in range(25):
                doc = self.svc.queue_operation(
                    operator=operator,
                    label=f"test_{i}_{j}",
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

        paging = DelegatedOperationPagingParams(
            skip=0,
            limit=5000,
            sort_by=SortByField.QUEUED_AT,
            sort_direction=SortDirection.ASCENDING,
        )

        # test paging - get a page of everything
        docs = self.svc.list_operations(
            search={"operator/test": {"operator"}}, paging=paging
        )

        self.assertEqual(len(docs), 100)

        docs = self.svc.list_operations(
            search={"test_0": {"operator"}}, paging=paging
        )

        self.assertEqual(len(docs), 25)

        docs = self.svc.list_operations(
            search={"test_0": {"operator", "label"}}, paging=paging
        )

        self.assertEqual(len(docs), 25)

        doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/test/foo_baz",
            label=f"I am a label",
            delegation_target=delegation_target,
            context=ExecutionContext(
                request_params={
                    "foo": "bar",
                    "dataset_name": dataset_name,
                }
            ),
        )
        self.docs_to_delete.append(doc)

        doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/test/operator",
            label=f"foo_baz",
            delegation_target=delegation_target,
            context=ExecutionContext(
                request_params={
                    "foo": "bar",
                    "dataset_name": dataset_name,
                }
            ),
        )
        self.docs_to_delete.append(doc)

        docs = self.svc.list_operations(
            search={"foo_baz": {"operator", "label"}}, paging=paging
        )

        self.assertEqual(len(docs), 2)

        docs = self.svc.list_operations(
            search={"foo_baz": {"label"}}, paging=paging
        )

        self.assertEqual(len(docs), 1)

        docs = self.svc.list_operations(
            search={"foo_baz": {"operator"}}, paging=paging
        )

        self.assertEqual(len(docs), 1)

    @patch(
        "fiftyone.core.odm.utils.load_dataset",
    )
    def test_count(self, mock_load_dataset, mock_get_operator):
        dataset_id = ObjectId()
        dataset_name = f"test_dataset_{dataset_id}"
        mock_load_dataset.return_value.name = dataset_name
        mock_load_dataset.return_value._doc.id = dataset_id

        mock_get_operator.return_value = MockOperator()

        delegation_target = f"delegation_target{ObjectId()}"
        for i in range(4):
            operator = f"{TEST_DO_PREFIX}/operator/test_{i}"
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
            filters={"operator": f"{TEST_DO_PREFIX}/operator/test_0"},
        )
        self.assertEqual(docs, 25)

    @patch(
        "fiftyone.core.odm.utils.load_dataset",
    )
    def test_rename_operation(self, mock_load_dataset, mock_get_operator):
        dataset_id = ObjectId()
        dataset_name = f"test_dataset_{dataset_id}"
        mock_load_dataset.return_value.name = dataset_name
        mock_load_dataset.return_value._doc.id = dataset_id

        ctx = ExecutionContext()
        ctx.request_params = {"foo": "bar"}
        doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/foo",
            label=mock_get_operator.return_value.name,
            delegation_target="test_target",
            context=ctx.serialize(),
        )
        self.assertEqual(doc.label, mock_get_operator.return_value.name)

        self.docs_to_delete.append(doc)

        doc = self.svc.set_label(doc.id, "this is my delegated operation run.")
        self.assertEqual(doc.label, "this is my delegated operation run.")

        doc = self.svc.get(doc.id)
        self.assertEqual(doc.label, "this is my delegated operation run.")

    @patch(
        "fiftyone.core.odm.utils.load_dataset",
    )
    @pytest.mark.asyncio
    async def test_set_completed_in_async_context(
        self, mock_load_dataset, mock_get_operator
    ):
        dataset_id = ObjectId()
        dataset_name = f"test_dataset_{dataset_id}"
        mock_load_dataset.return_value.name = dataset_name
        mock_load_dataset.return_value._doc.id = dataset_id

        ctx = ExecutionContext()
        ctx.request_params = {"foo": "bar"}
        doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/foo",
            label=mock_get_operator.return_value.name,
            delegation_target="test_target",
            context=ctx.serialize(),
        )
        self.assertEqual(doc.label, mock_get_operator.return_value.name)

        self.docs_to_delete.append(doc)

        doc = self.svc.set_completed(doc_id=doc.id)
        self.assertEqual(doc.run_state, ExecutionRunState.COMPLETED)

    def test_queue_op_remote_service(self, mock_get_operator):
        self.mock_is_remote_service.return_value = True
        db = delegated_operation.MongoDelegatedOperationRepo()
        self.assertTrue(db.is_remote)
        dos = DelegatedOperationService(repo=db)
        ctx = ExecutionContext()
        ctx.request_params = {"foo": "bar"}

        #####
        doc = dos.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/foo",
            label=mock_get_operator.return_value.name,
            delegation_target="test_target",
            context=ctx.serialize(),
        )
        #####

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, ExecutionRunState.SCHEDULED)

    def test_set_queue_remote_service(self, mock_get_operator):
        self.mock_is_remote_service.return_value = True
        db = delegated_operation.MongoDelegatedOperationRepo()
        self.assertTrue(db.is_remote)
        dos = DelegatedOperationService(repo=db)

        op_id = bson.ObjectId()

        #####
        self.assertRaises(PermissionError, dos.set_queued, op_id)
        #####

    def test_queue_panel_delegated_op(self, mock_get_operator):
        """Queue DO that comes from a panel"""
        self.mock_is_remote_service.return_value = True
        db = delegated_operation.MongoDelegatedOperationRepo()
        dos = DelegatedOperationService(repo=db)
        ctx = ExecutionContext(
            request_params={
                "params": {
                    "panel_id": bson.ObjectId(),
                    "panel_state": {"foo2": "bar2"},
                }
            }
        )
        ctx.request_params = {"foo": "bar"}
        ctx.params = {
            "panel_id": bson.ObjectId(),
            "panel_state": {"foo2": "bar2"},
        }

        #####
        doc = dos.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/foo",
            label=mock_get_operator.return_value.name,
            delegation_target="test_target",
            context=ctx,
        )
        #####

        self.docs_to_delete.append(doc)
        self.assertEqual(doc.run_state, ExecutionRunState.SCHEDULED)

    @patch(
        "fiftyone.core.odm.utils.load_dataset",
    )
    def test_failed_exec_adds_child_error_to_parent(
        self, mock_load_dataset, mock_get_operator
    ):
        dataset_id = ObjectId()
        dataset_name = f"test_dataset_{dataset_id}"
        mock_load_dataset.return_value.name = dataset_name
        mock_load_dataset.return_value._doc.id = dataset_id
        mock_get_operator.return_value = MockOperator(success=False)

        pipeline = Pipeline(
            [
                PipelineStage(operator_uri="@test/op1", name="one"),
                PipelineStage(name="two", operator_uri="@test/op2"),
                PipelineStage(name="three", operator_uri="@test/op3"),
            ]
        )
        parent_doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/foo",
            label=mock_get_operator.return_value.config.label,
            delegation_target="foo",
            context=ExecutionContext(
                request_params={"foo": "bar", "dataset_name": dataset_name},
            ),
            pipeline=pipeline,
        )
        self.docs_to_delete.append(parent_doc)

        #####
        child_doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/foo",
            label=mock_get_operator.return_value.config.label,
            delegation_target="foo",
            context=ExecutionContext(
                request_params={"foo": "bar", "dataset_name": dataset_name},
            ),
        )
        self.docs_to_delete.append(child_doc)
        child_doc.parent_id = parent_doc.id
        self.svc.execute_operation(child_doc)
        #####

        updated_parent_do = self.svc.get(parent_doc.id)
        self.assertIn(
            str(child_doc.id), updated_parent_do.pipeline_run_info.child_errors
        )
        self.assertIn(
            "MockOperator failed",
            updated_parent_do.pipeline_run_info.child_errors[
                str(child_doc.id)
            ],
        )
