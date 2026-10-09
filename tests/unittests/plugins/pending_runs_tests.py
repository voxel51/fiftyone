"""
Pending runs operator unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

from bson import ObjectId

from fiftyone.factory.repos import delegated_operation
from fiftyone.operators.delegated import DelegatedOperationService
from fiftyone.operators.executor import ExecutionContext, ExecutionRunState
from fiftyone.operators.types import Pipeline, PipelineStage

from plugins.operators.pending_runs import ListPendingRuns

PREFIX = "@testPendingRuns"
VIZ = f"{PREFIX}/compute_visualization"
STAGE = f"{PREFIX}/stage_operator"
PARENT = f"{PREFIX}/parent_pipeline"


class ListPendingRunsTests(unittest.TestCase):
    def setUp(self):
        patch.object(
            delegated_operation, "is_remote_service", return_value=False
        ).start()
        patch(
            "fiftyone.operators.registry.OperatorRegistry.operator_exists",
            return_value=True,
        ).start()
        self.svc = DelegatedOperationService()
        self.dataset_id = ObjectId()

    def tearDown(self):
        self.svc._repo._collection.delete_many(
            {"operator": {"$regex": PREFIX}}
        )
        patch.stopall()

    def _queue(self, operator, dataset_id=None, state=None, **kwargs):
        dataset_id = dataset_id or self.dataset_id
        with patch("fiftyone.core.odm.load_dataset") as load:
            load.return_value.name = str(dataset_id)
            load.return_value._doc.id = dataset_id
            doc = self.svc.queue_operation(
                operator=operator,
                label=operator,
                delegation_target="t",
                context=ExecutionContext(
                    request_params={
                        "dataset_name": str(dataset_id),
                        "params": {"brain_key": "bk"},
                    }
                ),
                **kwargs,
            )

        if state:
            self.svc._repo._collection.update_one(
                {"_id": doc.id},
                {"$set": {"run_state": state, "failed_at": datetime.utcnow()}},
            )

        return doc

    def _run(self, operators, stage_operators=()):
        ctx = SimpleNamespace(
            dataset=SimpleNamespace(_doc=SimpleNamespace(id=self.dataset_id)),
            params={
                "operators": list(operators),
                "stage_operators": list(stage_operators),
            },
        )
        return ListPendingRuns().execute(ctx)

    def test_matches_operator_and_dataset(self):
        mine = self._queue(VIZ)
        self._queue(VIZ, dataset_id=ObjectId())
        self._queue(STAGE)

        runs = self._run([VIZ])
        self.assertEqual([r["id"] for r in runs], [str(mine.id)])
        self.assertEqual(runs[0]["brain_key"], "bk")
        self.assertEqual(runs[0]["run_state"], ExecutionRunState.QUEUED)

    def test_excludes_completed_and_old_failures(self):
        self._queue(VIZ, state=ExecutionRunState.COMPLETED)
        old = self._queue(VIZ, state=ExecutionRunState.FAILED)
        self.svc._repo._collection.update_one(
            {"_id": old.id},
            {"$set": {"failed_at": datetime.utcnow() - timedelta(days=1)}},
        )
        recent = self._queue(VIZ, state=ExecutionRunState.FAILED)

        runs = self._run([VIZ])
        self.assertEqual([r["id"] for r in runs], [str(recent.id)])

    def test_pipeline_parent_by_stage(self):
        relevant = self._queue(
            PARENT, pipeline=Pipeline([PipelineStage(operator_uri=STAGE)])
        )
        self._queue(
            PARENT,
            pipeline=Pipeline([PipelineStage(operator_uri=f"{PREFIX}/meta")]),
        )

        runs = self._run([], [STAGE])
        self.assertEqual([r["id"] for r in runs], [str(relevant.id)])

    def test_parent_dropped_once_child_active(self):
        parent = self._queue(
            PARENT, pipeline=Pipeline([PipelineStage(operator_uri=STAGE)])
        )
        child = self._queue(STAGE)
        self.svc._repo._collection.update_one(
            {"_id": child.id}, {"$set": {"parent_id": parent.id}}
        )

        runs = self._run([STAGE], [STAGE])
        self.assertEqual([r["id"] for r in runs], [str(child.id)])
