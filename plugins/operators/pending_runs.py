"""
Pending runs operator.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from datetime import datetime, timedelta

import fiftyone.operators as foo
from fiftyone.factory import DelegatedOperationPagingParams
from fiftyone.operators.delegated import DelegatedOperationService
from fiftyone.operators.executor import ExecutionRunState

ACTIVE_STATES = [
    ExecutionRunState.SCHEDULED,
    ExecutionRunState.QUEUED,
    ExecutionRunState.RUNNING,
    ExecutionRunState.PROCESSING,
]
FAILED_WINDOW = timedelta(hours=1)
LIMIT = 20


class ListPendingRuns(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="list_pending_runs",
            label="List pending runs",
            unlisted=True,
        )

    def execute(self, ctx):
        operators = ctx.params.get("operators", [])
        stage_operators = ctx.params.get("stage_operators", [])
        service = DelegatedOperationService()
        query = dict(
            dataset_id=ctx.dataset._doc.id,
            paging=DelegatedOperationPagingParams(limit=LIMIT),
            **{
                "$or": [
                    {"operator": {"$in": operators}},
                    {"pipeline.stages.operator_uri": {"$in": stage_operators}},
                ]
            },
        )

        docs = service.list_operations(
            run_state={"$in": ACTIVE_STATES}, **query
        ) + service.list_operations(
            run_state=ExecutionRunState.FAILED,
            failed_at={"$gte": datetime.utcnow() - FAILED_WINDOW},
            **query,
        )

        parent_ids = {doc.parent_id for doc in docs}
        return [
            {
                "id": str(doc.id),
                "operator": doc.operator,
                "run_state": doc.run_state,
                "label": doc.label,
                "brain_key": (doc.context.params or {}).get("brain_key"),
            }
            for doc in docs
            if doc.id not in parent_ids
        ]
