"""
FiftyOne delegated operator related unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import copy
import logging
import logging.handlers
import multiprocessing
import time
import unittest
from unittest import mock
from unittest.mock import patch

import bson
from bson import ObjectId
import pytest

from fiftyone import Dataset
from fiftyone.factory import (
    DelegatedOperationPagingParams,
    SortByField,
    SortDirection,
)
from fiftyone.factory.repos import (
    DelegatedOperationDocument,
    delegated_operation,
)
from fiftyone.operators import delegated
from fiftyone.operators.delegated import DelegatedOperationService
from fiftyone.operators.executor import (
    ExecutionContext,
    ExecutionResult,
    ExecutionRunState,
    PipelineExecutionContext,
)
from fiftyone.operators.delegated import _capture_stdout_to_logging
from fiftyone.operators.operator import Operator, OperatorConfig
from fiftyone.operators.types import Pipeline, PipelineRunInfo, PipelineStage

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


class MockLoggingOperator(Operator):
    """Operator that exercises all logging paths."""

    result = {"executed": True}

    @property
    def config(self):
        return OperatorConfig(
            name="mock_logging_operator",
            label="Mock Logging Operator",
            disable_schema_validation=True,
        )

    def resolve_input(self, *args, **kwargs):
        return

    def resolve_delegation(self, ctx) -> bool:
        return True

    def execute(self, ctx):
        import fiftyone as fo

        op_logger = logging.getLogger("fiftyone.test_operator")
        op_logger.info("operator info")
        op_logger.debug("operator debug")
        op_logger.error("operator error")
        try:
            raise ValueError("operator exception")
        except ValueError:
            op_logger.exception("operator caught exception")
        print("operator print")
        with fo.ProgressBar(total=3, quiet=False) as pb:
            for _ in pb(range(3)):
                pass
        return self.result


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
class DelegatedOperationAsyncServiceTests(unittest.IsolatedAsyncioTestCase):
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

    @patch("fiftyone.core.odm.load_dataset")
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

    @patch("fiftyone.core.odm.load_dataset")
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

    @patch("fiftyone.core.odm.load_dataset")
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

    @patch("fiftyone.core.odm.load_dataset")
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

    @patch("fiftyone.core.odm.load_dataset")
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

    @patch("fiftyone.core.odm.load_dataset")
    def test_execute_operation_captures_all_logs(
        self, mock_load_dataset, mock_get_operator
    ):
        mock_load_dataset.return_value = MockDataset()
        mock_get_operator.return_value = MockLoggingOperator()

        test_cases = [
            (logging.DEBUG, {"debug", "info", "error", "exception"}),
            (logging.INFO, {"info", "error", "exception"}),
            (logging.WARNING, {"error", "exception"}),
        ]

        for fo_level, expected_tags in test_cases:
            with self.subTest(fo_level=logging.getLevelName(fo_level)):
                handler = _RecordingHandler()
                fo_logger = logging.getLogger("fiftyone")
                root_logger = logging.getLogger()
                fo_logger.addHandler(handler)
                root_logger.addHandler(handler)
                orig_fo_level = fo_logger.level
                orig_root_level = root_logger.level
                fo_logger.setLevel(fo_level)
                root_logger.setLevel(logging.DEBUG)

                try:
                    doc = self.svc.queue_operation(
                        operator=f"{TEST_DO_PREFIX}/operator/logging_op",
                        label=mock_get_operator.return_value.config.label,
                        delegation_target=f"test_target_logging_{fo_level}",
                        context=ExecutionContext(
                            request_params={
                                "foo": "bar",
                                "dataset_id": str(ObjectId()),
                            }
                        ),
                    )
                    self.docs_to_delete.append(doc)

                    results = self.svc.execute_queued_operations(
                        delegation_target=f"test_target_logging_{fo_level}",
                        monitor=False,
                    )
                    self.assertEqual(len(results), 1)
                    self.assertIsNone(results[0].error)
                finally:
                    fo_logger.removeHandler(handler)
                    root_logger.removeHandler(handler)
                    fo_logger.setLevel(orig_fo_level)
                    root_logger.setLevel(orig_root_level)

                messages = [r.getMessage() for r in handler.records]
                level_name = logging.getLevelName(fo_level)

                # Logger calls at or above the level must be present
                if "debug" in expected_tags:
                    self.assertIn("operator debug", messages)
                else:
                    self.assertNotIn("operator debug", messages)

                if "info" in expected_tags:
                    self.assertIn("operator info", messages)
                else:
                    self.assertNotIn("operator info", messages)

                if "error" in expected_tags:
                    self.assertIn("operator error", messages)

                if "exception" in expected_tags:
                    exc_records = [
                        r
                        for r in handler.records
                        if r.exc_info
                        and "operator caught exception" in r.getMessage()
                    ]
                    self.assertTrue(len(exc_records) >= 1)

                # print() is tee'd at INFO, so filtered at WARNING+
                has_print = any("operator print" in m for m in messages)
                if fo_level <= logging.INFO:
                    self.assertTrue(
                        has_print,
                        f"print() not captured at {level_name}: {messages}",
                    )
                else:
                    self.assertFalse(
                        has_print,
                        f"print() should be filtered at {level_name}",
                    )

                # progress bar 100% via eta logger (always captured
                # since root logger stays at DEBUG)
                self.assertTrue(
                    any("100%" in m for m in messages),
                    f"No progress bar at {level_name}: {messages}",
                )

    def test_execute_operation_multi_proc_forwards_child_logs(
        self, mock_get_operator
    ):
        """_execute_operation_multi_proc forwards child process log
        records through QueueListener to the fiftyone logger's handlers.

        Uses a real multiprocessing.Queue but a mock child process that
        puts records on the queue, since spawned processes don't inherit
        test mocks for operator registration."""
        doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/mp_log_fwd",
            delegation_target="test_mp_log_fwd",
            context=ExecutionContext(
                request_params={"dataset_id": str(ObjectId())}
            ),
        )
        self.docs_to_delete.append(doc)

        handler = _RecordingHandler()
        fo_logger = logging.getLogger("fiftyone")
        fo_logger.addHandler(handler)
        orig_fo_level = fo_logger.level
        fo_logger.setLevel(logging.DEBUG)

        real_queue = multiprocessing.Queue()

        # Records the child would put on the queue
        child_records = [
            logging.LogRecord(
                "fiftyone.child", logging.INFO, "", 0, "child info", (), None
            ),
            logging.LogRecord(
                "fiftyone.child", logging.DEBUG, "", 0, "child debug", (), None
            ),
            logging.LogRecord(
                "fiftyone.child", logging.ERROR, "", 0, "child error", (), None
            ),
            logging.LogRecord(
                "fiftyone.child.tee",
                logging.INFO,
                "",
                0,
                "child print output",
                (),
                None,
            ),
        ]

        def fake_start():
            """Simulate the child writing records to the queue."""
            for rec in child_records:
                real_queue.put(rec)

        mock_process = mock.MagicMock()
        mock_process.is_alive.return_value = False

        mock_context = mock.MagicMock()
        mock_context.Queue.return_value = real_queue
        mock_context.Process.return_value = mock_process
        mock_process.start.side_effect = fake_start

        completed_doc = copy.deepcopy(doc)
        completed_doc.run_state = ExecutionRunState.COMPLETED
        completed_doc.result = ExecutionResult(result={"executed": True})

        try:
            with patch(
                "multiprocessing.get_context", return_value=mock_context
            ), patch.object(self.svc, "get", return_value=completed_doc):
                result = self.svc.execute_operation(
                    operation=doc,
                    log=False,
                    monitor=True,
                    check_interval_seconds=1,
                )
        finally:
            fo_logger.removeHandler(handler)
            fo_logger.setLevel(orig_fo_level)

        self.assertIsNotNone(result)
        messages = [r.getMessage() for r in handler.records]

        # All records from the child must have been forwarded
        self.assertTrue(
            any("child info" in m for m in messages),
            f"child info not forwarded: {messages}",
        )
        self.assertTrue(
            any("child debug" in m for m in messages),
            f"child debug not forwarded: {messages}",
        )
        self.assertTrue(
            any("child error" in m for m in messages),
            f"child error not forwarded: {messages}",
        )
        self.assertTrue(
            any("child print output" in m for m in messages),
            f"child print not forwarded: {messages}",
        )

    @patch("fiftyone.core.odm.load_dataset")
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

    @patch("fiftyone.core.odm.load_dataset")
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

    @patch("fiftyone.core.odm.load_dataset")
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

    @patch("fiftyone.core.odm.load_dataset")
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

    @patch("fiftyone.core.odm.load_dataset")
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
        mock_child_doc.rerunnable = False

        # test non-rerunnable child DO
        with patch.object(self.svc._repo, "get", return_value=mock_child_doc):
            with patch.object(
                self.svc._repo, "queue_operation", return_value=mock_child_doc
            ):
                with pytest.raises(
                    ValueError, match="not marked as rerunnable"
                ):
                    _ = self.svc.rerun_operation("abc123")

        mock_child_doc.rerunnable = True
        mock_child_doc.parent_id = ObjectId()
        # test parent_id not supported
        with patch.object(self.svc._repo, "get", side_effect=mock_child_doc):
            with patch.object(
                self.svc._repo, "queue_operation", return_value=mock_child_doc
            ):
                with pytest.raises(
                    ValueError, match="Rerunning pipeline child operations"
                ):
                    _ = self.svc.rerun_operation("abc123")

    @patch("fiftyone.core.odm.load_dataset")
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

        # psutil.Process may be called more than once (metrics collection
        # + termination), but it must always be called with the child PID.
        mock_psutil_process.assert_any_call(mock_process.pid)
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

    @patch.object(delegated, "do_execute_pipeline")
    @patch.object(delegated, "prepare_operator_executor")
    def test_execute_pipeline(
        self, prepare_operator_mock, do_execute_mock, mock_get_operator
    ):
        with patch.object(self.svc, "get") as do_get_mock:
            pipeline_id = ObjectId()
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

            pipeline_do = DelegatedOperationDocument()
            pipeline_do.id = pipeline_id
            pipeline_do.pipeline = pipeline
            do_get_mock.return_value = pipeline_do
            do_execute_mock.return_value = None

            request_params = {
                "foo": "bar",
                "dataset_name": "dataset",
                "dataset_id": None,
                "run_doc": pipeline_id,
                "target": "outputs",
                "results": None,
            }
            ctx = ExecutionContext(
                request_params=copy.deepcopy(request_params),
            )
            pipeline_do.context = ctx
            prepare_operator_mock.return_value = (
                mock_get_operator.return_value,
                None,
                ctx,
                None,
            )

            #####
            asyncio.run(self.svc._execute_operator(pipeline_do))
            #####

            prepare_operator_mock.assert_called_once_with(
                operator_uri=pipeline_do.operator,
                request_params=request_params,
                delegated_operation_id=pipeline_do.id,
                set_progress=mock.ANY,
                pipeline_ctx=None,
            )
            do_execute_mock.assert_called_once_with(pipeline, ctx)

    @patch.object(delegated, "do_execute_pipeline")
    @patch.object(delegated, "prepare_operator_executor")
    def test_execute_pipeline_error(
        self, prepare_operator_mock, do_execute_mock, mock_get_operator
    ):
        with patch.object(self.svc, "get") as do_get_mock:
            pipeline_id = ObjectId()
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

            pipeline_do = DelegatedOperationDocument()
            pipeline_do.id = pipeline_id
            pipeline_do.pipeline = pipeline
            do_get_mock.return_value = pipeline_do
            do_execute_mock.return_value = (
                ValueError("Pipeline execution failed"),
                "Pipeline execution failed",
            )

            request_params = {
                "foo": "bar",
                "dataset_name": "dataset",
                "dataset_id": None,
                "run_doc": pipeline_id,
                "target": "outputs",
                "results": None,
            }
            ctx = ExecutionContext(
                request_params=copy.deepcopy(request_params),
            )
            pipeline_do.context = ctx
            prepare_operator_mock.return_value = (
                mock_get_operator.return_value,
                None,
                ctx,
                None,
            )

            #####
            result = asyncio.run(self.svc._execute_operator(pipeline_do))
            assert (
                result.error_message
                and "Pipeline execution failed" in result.error_message
            )
            #####

            prepare_operator_mock.assert_called_once_with(
                operator_uri=pipeline_do.operator,
                request_params=request_params,
                delegated_operation_id=pipeline_do.id,
                set_progress=mock.ANY,
                pipeline_ctx=None,
            )
            do_execute_mock.assert_called_once_with(pipeline, ctx)

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

    @patch("fiftyone.core.odm.load_dataset")
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

    @patch("fiftyone.core.odm.load_dataset")
    def test_deletes_by_dataset_id(self, mock_load_dataset, mock_get_operator):
        dataset_id = ObjectId()
        dataset_name = f"test_dataset_{dataset_id}"
        mock_load_dataset.return_value.name = dataset_name
        mock_load_dataset.return_value._doc.id = dataset_id

        # create 25 docs
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
            self.docs_to_delete.append(doc)

        # Initial check
        ops = self.svc.list_operations(dataset_name=dataset_name)
        self.assertEqual(len(ops), 25)

        self.svc.delete_for_dataset(dataset_id=dataset_id)

        ops = self.svc.list_operations(
            dataset_name=dataset_name, include_archived=True
        )
        self.assertEqual(len(ops), 0)

    def test_archive_operation(self, mock_get_operator):
        doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/operator/archive_test",
            label="archive_test",
            context=ExecutionContext(request_params={"foo": "bar"}),
        )
        self.docs_to_delete.append(doc)

        # Archive it
        self.svc.archive_operation(doc.id)

        # Check hidden
        ops = self.svc.list_operations(
            operator=f"{TEST_DO_PREFIX}/operator/archive_test"
        )
        self.assertEqual(len(ops), 0)

        # Check visible
        ops = self.svc.list_operations(
            operator=f"{TEST_DO_PREFIX}/operator/archive_test",
            include_archived=True,
        )
        self.assertEqual(len(ops), 1)
        self.assertTrue(ops[0].archived)

    @patch("fiftyone.core.odm.load_dataset")
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

    @patch("fiftyone.core.odm.load_dataset")
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

    @patch("fiftyone.core.odm.load_dataset")
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


@patch(
    "fiftyone.operators.registry.OperatorRegistry.get_operator",
    return_value=MockOperator(),
)
class TestPipelineRequestParamsOverrides(unittest.TestCase):
    """Tests for the request_params_overrides feature in pipelines."""

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

    def test_pipeline_stage_overrides_view_name(self, mock_get_operator):
        """Test that request_params_overrides correctly overrides view_name per stage."""
        from fiftyone.operators import executor as exec_module

        # Track the contexts seen during execution
        contexts_seen = []

        async def mock_do_execute_operator(operator, ctx, exhaust=False):
            # Capture the context at this point
            contexts_seen.append(copy.deepcopy(ctx.request_params))
            return None

        with patch.object(
            exec_module,
            "do_execute_operator",
            side_effect=mock_do_execute_operator,
        ):
            pipeline = Pipeline(
                [
                    PipelineStage(
                        operator_uri="@test/op1",
                        name="stage_one",
                        request_params_overrides={
                            "view_name": "filtered_view"
                        },
                    ),
                    PipelineStage(
                        operator_uri="@test/op2",
                        name="stage_two",
                        request_params_overrides={"view_name": "other_view"},
                    ),
                ]
            )

            ctx = ExecutionContext(
                request_params={
                    "dataset_name": "test_dataset",
                    "view_name": "original_view",
                }
            )

            # Execute the pipeline
            asyncio.run(exec_module.do_execute_pipeline(pipeline, ctx))

        # Verify we executed both stages
        self.assertEqual(len(contexts_seen), 2)

        # First stage should have view_name overridden to "filtered_view"
        self.assertEqual(contexts_seen[0].get("view_name"), "filtered_view")

        # Second stage should have view_name overridden to "other_view"
        self.assertEqual(contexts_seen[1].get("view_name"), "other_view")

    def test_pipeline_stage_overrides_multiple_params(self, mock_get_operator):
        """Test that request_params_overrides can override multiple parameters."""
        from fiftyone.operators import executor as exec_module

        contexts_seen = []

        async def mock_do_execute_operator(operator, ctx, exhaust=False):
            contexts_seen.append(copy.deepcopy(ctx.request_params))
            return None

        with patch.object(
            exec_module,
            "do_execute_operator",
            side_effect=mock_do_execute_operator,
        ):
            pipeline = Pipeline(
                [
                    PipelineStage(
                        operator_uri="@test/op1",
                        name="stage_one",
                        params={"stage_param": "value1"},
                        request_params_overrides={
                            "view_name": "special_view",
                            "filters": {"field": "value"},
                            "custom_field": "custom_value",
                        },
                    ),
                ]
            )

            ctx = ExecutionContext(
                request_params={
                    "dataset_name": "test_dataset",
                    "view_name": "default_view",
                }
            )

            asyncio.run(exec_module.do_execute_pipeline(pipeline, ctx))

        self.assertEqual(len(contexts_seen), 1)

        # Verify overrides were applied
        self.assertEqual(contexts_seen[0].get("view_name"), "special_view")
        self.assertEqual(contexts_seen[0].get("filters"), {"field": "value"})
        self.assertEqual(contexts_seen[0].get("custom_field"), "custom_value")

        # Verify params were set correctly (not overridden by request_params_overrides)
        self.assertEqual(
            contexts_seen[0].get("params"), {"stage_param": "value1"}
        )

    def test_pipeline_stage_without_overrides(self, mock_get_operator):
        """Test that stages without overrides work normally."""
        from fiftyone.operators import executor as exec_module

        contexts_seen = []

        async def mock_do_execute_operator(operator, ctx, exhaust=False):
            contexts_seen.append(copy.deepcopy(ctx.request_params))
            return None

        with patch.object(
            exec_module,
            "do_execute_operator",
            side_effect=mock_do_execute_operator,
        ):
            pipeline = Pipeline(
                [
                    PipelineStage(
                        operator_uri="@test/op1",
                        name="stage_one",
                        params={"stage_param": "value1"}
                        # No request_params_overrides
                    ),
                ]
            )

            ctx = ExecutionContext(
                request_params={
                    "dataset_name": "test_dataset",
                    "view_name": "default_view",
                }
            )

            asyncio.run(exec_module.do_execute_pipeline(pipeline, ctx))

        self.assertEqual(len(contexts_seen), 1)

        # Verify original request params were preserved
        self.assertEqual(contexts_seen[0].get("view_name"), "default_view")
        self.assertEqual(contexts_seen[0].get("dataset_name"), "test_dataset")
        self.assertEqual(
            contexts_seen[0].get("params"), {"stage_param": "value1"}
        )

    def test_pipeline_stage_overrides_dont_affect_params(
        self, mock_get_operator
    ):
        """Test that request_params_overrides doesn't override the params field."""
        from fiftyone.operators import executor as exec_module

        contexts_seen = []

        async def mock_do_execute_operator(operator, ctx, exhaust=False):
            contexts_seen.append(copy.deepcopy(ctx.request_params))
            return None

        with patch.object(
            exec_module,
            "do_execute_operator",
            side_effect=mock_do_execute_operator,
        ):
            pipeline = Pipeline(
                [
                    PipelineStage(
                        operator_uri="@test/op1",
                        name="stage_one",
                        params={"correct_param": "correct_value"},
                        request_params_overrides={
                            "params": {
                                "wrong_param": "wrong_value"
                            },  # Should be ignored
                            "view_name": "special_view",
                        },
                    ),
                ]
            )

            ctx = ExecutionContext(
                request_params={
                    "dataset_name": "test_dataset",
                }
            )

            asyncio.run(exec_module.do_execute_pipeline(pipeline, ctx))

        self.assertEqual(len(contexts_seen), 1)

        # Verify params came from stage.params, not from overrides
        # The implementation applies request_params_overrides first, then sets params from stage.params
        # So the final params should be from stage.params
        self.assertEqual(
            contexts_seen[0].get("params"), {"correct_param": "correct_value"}
        )

        # But view_name should still be overridden
        self.assertEqual(contexts_seen[0].get("view_name"), "special_view")

    def test_pipeline_stage_overrides_are_not_cumulative(
        self, mock_get_operator
    ):
        """Test that overrides from one stage do NOT carry forward to the next stage."""
        from fiftyone.operators import executor as exec_module

        contexts_seen = []

        async def mock_do_execute_operator(operator, ctx, exhaust=False):
            contexts_seen.append(copy.deepcopy(ctx.request_params))
            return None

        with patch.object(
            exec_module,
            "do_execute_operator",
            side_effect=mock_do_execute_operator,
        ):
            pipeline = Pipeline(
                [
                    PipelineStage(
                        operator_uri="@test/op1",
                        name="stage_one",
                        request_params_overrides={
                            "view_name": "view_from_stage1",
                            "field1": "value1",
                        },
                    ),
                    PipelineStage(
                        operator_uri="@test/op2",
                        name="stage_two",
                        request_params_overrides={"field2": "value2"}
                        # view_name should NOT carry forward from stage 1
                    ),
                ]
            )

            ctx = ExecutionContext(
                request_params={
                    "dataset_name": "test_dataset",
                    "view_name": "original_view",
                }
            )

            asyncio.run(exec_module.do_execute_pipeline(pipeline, ctx))

        # Should be called twice (once per stage)
        self.assertEqual(len(contexts_seen), 2)

        # First stage should have its overrides applied to the base params
        self.assertEqual(contexts_seen[0].get("view_name"), "view_from_stage1")
        self.assertEqual(contexts_seen[0].get("field1"), "value1")
        self.assertIsNone(contexts_seen[0].get("field2"))

        # Second stage should start fresh from base params, NOT accumulate stage 1's overrides
        self.assertEqual(
            contexts_seen[1].get("view_name"), "original_view"
        )  # Back to original!
        self.assertIsNone(
            contexts_seen[1].get("field1")
        )  # Stage 1's override NOT carried over
        self.assertEqual(contexts_seen[1].get("field2"), "value2")

    def test_pipeline_stage_overrides_reset_each_stage(
        self, mock_get_operator
    ):
        """Test that each stage starts with the original base request params."""
        from fiftyone.operators import executor as exec_module

        contexts_seen = []

        async def mock_do_execute_operator(operator, ctx, exhaust=False):
            contexts_seen.append(copy.deepcopy(ctx.request_params))
            return None

        with patch.object(
            exec_module,
            "do_execute_operator",
            side_effect=mock_do_execute_operator,
        ):
            pipeline = Pipeline(
                [
                    PipelineStage(
                        operator_uri="@test/op1",
                        name="stage_one",
                        params={"param1": "value1"},
                        request_params_overrides={
                            "view_name": "custom_view_1",
                            "custom_field": "custom_1",
                        },
                    ),
                    PipelineStage(
                        operator_uri="@test/op2",
                        name="stage_two",
                        params={"param2": "value2"},
                        request_params_overrides={
                            "view_name": "custom_view_2",
                        }
                        # custom_field should NOT be present here
                    ),
                    PipelineStage(
                        operator_uri="@test/op3",
                        name="stage_three",
                        params={"param3": "value3"},
                        # No overrides - should get original base params
                    ),
                ]
            )

            ctx = ExecutionContext(
                request_params={
                    "dataset_name": "test_dataset",
                    "view_name": "original_view",
                }
            )

            asyncio.run(exec_module.do_execute_pipeline(pipeline, ctx))

        self.assertEqual(len(contexts_seen), 3)

        # Stage 1: has its own overrides
        self.assertEqual(contexts_seen[0].get("view_name"), "custom_view_1")
        self.assertEqual(contexts_seen[0].get("custom_field"), "custom_1")
        self.assertEqual(contexts_seen[0].get("params"), {"param1": "value1"})

        # Stage 2: starts fresh, only has its own overrides
        self.assertEqual(contexts_seen[1].get("view_name"), "custom_view_2")
        self.assertIsNone(
            contexts_seen[1].get("custom_field")
        )  # NOT carried over from stage 1
        self.assertEqual(contexts_seen[1].get("params"), {"param2": "value2"})

        # Stage 3: no overrides, gets original base params
        self.assertEqual(contexts_seen[2].get("view_name"), "original_view")
        self.assertIsNone(contexts_seen[2].get("custom_field"))
        self.assertEqual(contexts_seen[2].get("params"), {"param3": "value3"})

    def test_pipeline_stage_serialization_with_overrides(
        self, mock_get_operator
    ):
        """Test that request_params_overrides serializes and deserializes correctly."""
        pipeline = Pipeline(
            [
                PipelineStage(
                    operator_uri="@test/op1",
                    name="stage_one",
                    params={"param1": "value1"},
                    request_params_overrides={
                        "view_name": "filtered_view",
                        "filters": {"field": "value"},
                    },
                ),
                PipelineStage(
                    operator_uri="@test/op2",
                    name="stage_two",
                    # No overrides
                ),
            ]
        )

        # Serialize to JSON
        json_repr = pipeline.to_json()

        # Verify structure
        self.assertEqual(len(json_repr["stages"]), 2)
        self.assertEqual(
            json_repr["stages"][0]["request_params_overrides"],
            {"view_name": "filtered_view", "filters": {"field": "value"}},
        )
        self.assertIsNone(
            json_repr["stages"][1].get("request_params_overrides")
        )

        # Deserialize from JSON
        restored_pipeline = Pipeline.from_json(json_repr)

        # Verify restoration
        self.assertEqual(len(restored_pipeline.stages), 2)
        self.assertEqual(
            restored_pipeline.stages[0].request_params_overrides,
            {"view_name": "filtered_view", "filters": {"field": "value"}},
        )
        self.assertIsNone(restored_pipeline.stages[1].request_params_overrides)

    def test_pipeline_stage_creation_with_overrides(self, mock_get_operator):
        """Test creating pipeline stages with request_params_overrides."""
        # Test using stage() method
        pipeline = Pipeline()
        stage1 = pipeline.stage(
            operator_uri="@test/op1",
            name="stage_one",
            params={"param1": "value1"},
            request_params_overrides={"view_name": "custom_view"},
        )

        self.assertEqual(
            stage1.request_params_overrides, {"view_name": "custom_view"}
        )
        self.assertEqual(
            pipeline.stages[0].request_params_overrides,
            {"view_name": "custom_view"},
        )

    def test_pipeline_stage_accepts_extra_kwargs(self, mock_get_operator):
        """Test that PipelineStage accepts and discards extra kwargs for forward compatibility."""
        # This should not raise an error
        stage = PipelineStage(
            operator_uri="@test/op1",
            name="test_stage",
            unknown_future_field="some_value",
            another_unknown_field={"nested": "data"},
        )

        self.assertEqual(stage.operator_uri, "@test/op1")
        self.assertEqual(stage.name, "test_stage")
        # Unknown fields should be silently discarded
        self.assertFalse(hasattr(stage, "unknown_future_field"))

    def test_pipeline_accepts_extra_kwargs(self, mock_get_operator):
        """Test that Pipeline accepts and discards extra kwargs for forward compatibility."""
        # This should not raise an error
        pipeline = Pipeline(
            stages=[PipelineStage(operator_uri="@test/op1")],
            unknown_future_field="some_value",
        )

        self.assertEqual(len(pipeline.stages), 1)
        # Unknown fields should be silently discarded
        self.assertFalse(hasattr(pipeline, "unknown_future_field"))

    @patch("fiftyone.core.odm.load_dataset")
    def test_queue_operation_with_pipeline_overrides(
        self, mock_load_dataset, mock_get_operator
    ):
        """Test that queuing an operation with a pipeline containing overrides works."""
        dataset_id = ObjectId()
        dataset_name = f"test_dataset_{dataset_id}"
        mock_load_dataset.return_value.name = dataset_name
        mock_load_dataset.return_value._doc.id = dataset_id

        pipeline = Pipeline(
            [
                PipelineStage(
                    name="filter_stage",
                    operator_uri="@test/filter_op",
                    params={"threshold": 0.5},
                    request_params_overrides={"view_name": "filtered_samples"},
                ),
                PipelineStage(
                    name="export_stage",
                    operator_uri="@test/export_op",
                    params={"format": "json"},
                    request_params_overrides={
                        "dataset_name": "export_dataset"
                    },
                ),
            ]
        )

        doc = self.svc.queue_operation(
            operator=f"{TEST_DO_PREFIX}/pipeline/with_overrides",
            label="Pipeline with Request Overrides",
            delegation_target="test_target",
            context=ExecutionContext(
                request_params={"dataset_name": dataset_name},
            ),
            pipeline=pipeline,
        )

        self.docs_to_delete.append(doc)
        self.assertIsNotNone(doc.pipeline)
        self.assertEqual(len(doc.pipeline.stages), 2)

        # Verify first stage overrides
        self.assertEqual(
            doc.pipeline.stages[0].request_params_overrides,
            {"view_name": "filtered_samples"},
        )

        # Verify second stage overrides
        self.assertEqual(
            doc.pipeline.stages[1].request_params_overrides,
            {"dataset_name": "export_dataset"},
        )


def _child_process_logging_worker(log_queue):
    """Worker that exercises all logging paths in a spawned child."""
    import fiftyone as fo
    from fiftyone.operators.delegated import (
        _capture_stdout_to_logging,
        _configure_child_logging,
    )

    _configure_child_logging(log_queue)
    child_logger = logging.getLogger(__name__)

    with _capture_stdout_to_logging():
        child_logger.info("child info message")
        child_logger.debug("child debug message")
        child_logger.error("child error message")
        try:
            raise ValueError("child exception")
        except ValueError:
            child_logger.exception("child caught exception")
        print("child print output")
        with fo.ProgressBar(total=3, quiet=False) as pb:
            for _ in pb(range(3)):
                pass


class _RecordingHandler(logging.Handler):
    """A logging handler that stores records in a list."""

    def __init__(self):
        super().__init__()
        self.records = []

    def emit(self, record):
        self.records.append(record)


class TestCaptureStdoutToLogging(unittest.TestCase):
    """Tests for _TeeStream and _capture_stdout_to_logging.

    The recording handler is attached to the Python root logger so it
    captures records from all loggers (fiftyone, eta, etc.), matching
    what a real file/queue handler would see in production.
    """

    def setUp(self):
        self.handler = _RecordingHandler()
        # Add to fiftyone logger so the tee discovers it, and to the
        # root logger so eta/third-party output is also captured.
        self.fo_logger = logging.getLogger("fiftyone")
        self.root_logger = logging.getLogger()
        self.fo_logger.addHandler(self.handler)
        self.root_logger.addHandler(self.handler)
        self.orig_root_level = self.root_logger.level
        self.root_logger.setLevel(logging.DEBUG)

    def tearDown(self):
        self.fo_logger.removeHandler(self.handler)
        self.root_logger.removeHandler(self.handler)
        self.root_logger.setLevel(self.orig_root_level)

    def _messages(self):
        return [r.getMessage() for r in self.handler.records]

    def test_all_output_captured_respects_level(self):
        """logger.info/debug/error, exception, print(), and
        fo.ProgressBar output are all captured, and the fiftyone
        logging level controls which records reach the logs."""
        import fiftyone as fo

        test_cases = [
            (logging.DEBUG, {"debug", "info", "error", "exception"}),
            (logging.INFO, {"info", "error", "exception"}),
            (logging.WARNING, {"error", "exception"}),
        ]

        for fo_level, expected_tags in test_cases:
            with self.subTest(fo_level=logging.getLevelName(fo_level)):
                self.handler.records.clear()
                self.fo_logger.setLevel(fo_level)

                test_logger = logging.getLogger("fiftyone.test")

                with _capture_stdout_to_logging():
                    test_logger.info("info message")
                    test_logger.debug("debug message")
                    test_logger.error("error message")
                    try:
                        raise ValueError("test exception")
                    except ValueError:
                        test_logger.exception("caught exception")
                    print("print output")
                    with fo.ProgressBar(total=5, quiet=False) as pb:
                        for _ in pb(range(5)):
                            pass

                messages = self._messages()

                # Logger calls at or above the level must be present
                if "debug" in expected_tags:
                    self.assertIn("debug message", messages)
                else:
                    self.assertNotIn("debug message", messages)

                if "info" in expected_tags:
                    self.assertIn("info message", messages)
                else:
                    self.assertNotIn("info message", messages)

                if "error" in expected_tags:
                    self.assertIn("error message", messages)

                if "exception" in expected_tags:
                    exc_records = [
                        r for r in self.handler.records if r.exc_info
                    ]
                    self.assertTrue(len(exc_records) >= 1)

                # print() is tee'd at INFO level, so it respects the
                # fiftyone logging level like any other INFO record.
                has_print = any("print output" in m for m in messages)
                if fo_level <= logging.INFO:
                    self.assertTrue(
                        has_print,
                        f"print() not captured at {logging.getLevelName(fo_level)}",
                    )
                else:
                    self.assertFalse(
                        has_print,
                        f"print() should be filtered at {logging.getLevelName(fo_level)}",
                    )

                # progress bar 100% via eta logger (always captured
                # since root logger stays at DEBUG)
                self.assertTrue(
                    any("100%" in m for m in messages),
                    f"No progress bar at {logging.getLevelName(fo_level)}: {messages}",
                )

    def test_child_process_all_output_captured(self):
        """All output types from a spawned child process are captured."""
        ctx = multiprocessing.get_context("spawn")
        log_queue = ctx.Queue()

        listener = logging.handlers.QueueListener(log_queue, self.handler)
        listener.start()

        try:
            proc = ctx.Process(
                target=_child_process_logging_worker,
                args=(log_queue,),
            )
            proc.start()
            proc.join(timeout=30)
        finally:
            listener.stop()

        messages = self._messages()

        # logger calls from child
        self.assertTrue(any("child info message" in m for m in messages))
        self.assertTrue(any("child debug message" in m for m in messages))
        self.assertTrue(any("child error message" in m for m in messages))
        self.assertTrue(any("child caught exception" in m for m in messages))

        # print() from child via tee + QueueHandler
        self.assertTrue(
            any("child print output" in m for m in messages),
            f"print() from child not captured: {messages}",
        )

        # progress bar from child
        self.assertTrue(
            any("100%" in m for m in messages),
            f"No progress bar completion from child: {messages}",
        )
