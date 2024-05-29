"""
Airflow DAG that executes FiftyOne delegated operations in parallel.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
# pylint: disable=import-error
import logging
import re
from airflow.operators.python import task
from airflow.decorators import dag, task, task_group
from datetime import datetime, timedelta
from airflow.utils.dates import days_ago
from fiftyone.operators.delegated import DelegatedOperationService
from fiftyone.operators.orchestrator import OrchestratorService
from fiftyone.operators.executor import ExecutionRunState, ExecutionResult

logger = logging.getLogger(__name__)
dop_svc = DelegatedOperationService()
orch_svc = OrchestratorService()

# this will also be the dag id
instance_id = "execute-task-groups"


# task ids cannot have special characters, they must be alphanumeric or underscored.
def clean_task_id(task_id):
    return re.sub(r"\W+", "_", task_id)


@dag(
    start_date=days_ago(
        0
    ),  # this date cannot be in the fiture, or now, or it will not run
    catchup=False,
    schedule=timedelta(minutes=1),  # run every minute
    max_active_runs=1,
    tags=["cron", "fiftyone"],
    dag_id=instance_id,
)  # the unique name for this dag
def execute_task_groups():

    # first task, always executed, is updating the orchestrator (heartbeat)
    @task(task_id="register-orchestrator")
    def register_orchestrator():
        orch_svc.register(
            instance_id=instance_id,
            description="airflow, execution every minute",
        )

    # execute any queued tasks for this instance id, in a task group
    @task_group(group_id="execute-operations")
    def execute_operations(ops):
        for op in ops or []:
            dataset_name = (
                f"{op.context.dataset_name}_"
                if op.context.dataset_name
                else ""
            )
            task_name = f"{dataset_name}{op.operator}"
            task_id = clean_task_id(task_name)

            @task(task_id=task_id)
            def execute_operation(delegated_operation, **context):
                task_instance = context.get("task_instance", None)
                run_link = task_instance.log_url if task_instance else None
                dop_svc.execute_operation(
                    operation=delegated_operation, log=True, run_link=run_link
                )

            execute_operation(op)

    register_orchestrator()

    # pull any queued operations with this instance id as the delegation target
    queued_operations = dop_svc.list_operations(
        run_state=ExecutionRunState.QUEUED, delegation_target=instance_id
    )

    if queued_operations:
        # pass them to the task group for execution.
        execute_operations(queued_operations)


execute_task_groups()
