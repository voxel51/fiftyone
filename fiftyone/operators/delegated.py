"""
FiftyOne delegated operations.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import logging
import logging.handlers
import multiprocessing
import os
import traceback
import psutil

from fiftyone.factory.repo_factory import RepositoryFactory
from fiftyone.factory import DelegatedOperationPagingParams
from fiftyone.operators.executor import (
    prepare_operator_executor,
    do_execute_operator,
    ExecutionResult,
    ExecutionRunState,
    resolve_type_with_context,
)


logger = logging.getLogger(__name__)


def _configure_child_logging(queue):
    """Configures logging in a child process to send logs to a queue.

    This function should be called at the start of the target function
    for any new process. It clears all existing handlers from the root
    logger and adds a QueueHandler.
    """
    root_logger = logging.getLogger("fiftyone")
    root_logger.handlers.clear()
    queue_handler = logging.handlers.QueueHandler(queue)
    root_logger.addHandler(queue_handler)


def _execute_operator_in_child_process(
    operation_id, log=False, log_queue=None
):
    """Worker function to be run in a separate 'spawned' process.

    This function receives a simple ID, not a complex object, to avoid
    serialization (pickling) errors. It instantiates its own service to create
    fresh resources and then fetches the operation document from the database.

    Args:
        operation_id: the string ID of the operation to execute
        log (False): the optional boolean flag to log the execution
        log_queue (None): a multiprocessing queue to send log records to
    """
    # On POSIX systems, become the session leader to take control of any
    # subprocesses. This allows the parent to terminate the entire process
    # group reliably.
    if hasattr(os, "setsid"):
        try:
            os.setsid()
        except Exception:
            pass

    if log_queue:
        _configure_child_logging(log_queue)

    logger = logging.getLogger(__name__)
    service = DelegatedOperationService()
    result = None

    try:
        operation = service.get(operation_id)
        if not operation:
            logger.error(
                "Operation %s not found in child process. Aborting.",
                operation_id,
            )
            return
        if log:
            logger.info(
                "\nRunning operation %s (%s) in child process",
                operation.id,
                operation.operator,
            )

        result = asyncio.run(service._execute_operator(operation))

        service.set_completed(doc_id=operation.id, result=result)
        if log:
            logger.info("Operation %s complete", operation.id)
    except Exception:
        result = ExecutionResult(error=traceback.format_exc())
        service.set_failed(doc_id=operation_id, result=result)
        if log:
            logger.error("Operation %s failed\n%s", operation_id, result.error)


class DelegatedOperationService(object):
    """Service for executing delegated operations."""

    def __init__(self, repo=None):
        if repo is None:
            repo = RepositoryFactory.delegated_operation_repo()

        self._repo = repo

    def queue_operation(
        self,
        operator,
        label=None,
        delegation_target=None,
        context=None,
        metadata=None,
    ):
        """Queues the given delegated operation for execution.

        Args:
            operator: the operator name
            delegation_target (None): an optional delegation target
            label (None): an optional label for the operation (will default to
                the operator if not supplied)
            context (None): an
                :class:`fiftyone.operators.executor.ExecutionContext`
            metadata (None): an optional metadata dict containing properties below:
                - inputs_schema: the schema of the operator's inputs
                - outputs_schema: the schema of the operator's outputs

        Returns:
            a :class:`fiftyone.factory.repos.DelegatedOperationDocument`
        """
        return self._repo.queue_operation(
            operator=operator,
            label=label if label else operator,
            delegation_target=delegation_target,
            context=context,
            metadata=metadata,
        )

    def set_progress(self, doc_id, progress):
        """Sets the progress of the given delegated operation.

        Args:
            doc_id: the ID of the delegated operation
            progress: the
                :class:`fiftyone.operators.executor.ExecutionProgress` of the
                operation

        Returns:
            a :class:`fiftyone.factory.repos.DelegatedOperationDocument`
        """
        return self._repo.update_progress(_id=doc_id, progress=progress)

    def set_running(
        self,
        doc_id,
        progress=None,
        run_link=None,
        log_path=None,
        required_state=None,
    ):
        """Sets the given delegated operation to running state.

        Args:
            doc_id: the ID of the delegated operation
            progress (None): an optional
                :class:`fiftyone.operators.executor.ExecutionProgress` of the
                operation
            run_link (None): an optional link to orchestrator-specific
                information about the operation
            log_path (None): an optional path to the log file for the operation
            required_state (None): an optional
                :class:`fiftyone.operators.executor.ExecutionRunState` required
                state of the operation. If provided, the update will only be
                performed if the referenced operation matches this state.

        Returns:
            a :class:`fiftyone.factory.repos.DelegatedOperationDocument` if the
                update was performed, else ``None``.
        """
        return self._repo.update_run_state(
            _id=doc_id,
            run_state=ExecutionRunState.RUNNING,
            run_link=run_link,
            log_path=log_path,
            progress=progress,
            required_state=required_state,
        )

    def set_scheduled(self, doc_id, required_state=None):
        """Sets the given delegated operation to scheduled state.
        Args:
            doc_id: the ID of the delegated operation
            required_state (None): an optional
                :class:`fiftyone.operators.executor.ExecutionRunState` required
                state of the operation. If provided, the update will only be
                performed if the referenced operation matches this state.

        Returns:
            a :class:`fiftyone.factory.repos.DelegatedOperationDocument` if the
                update was performed, else ``None``.
        """
        return self._repo.update_run_state(
            _id=doc_id,
            run_state=ExecutionRunState.SCHEDULED,
            required_state=required_state,
        )

    def set_queued(self, doc_id, required_state=None):
        """Sets the given delegated operation to queued state.

        Args:
            doc_id: the ID of the delegated operation
            required_state (None): an optional
                :class:`fiftyone.operators.executor.ExecutionRunState` required
                state of the operation. If provided, the update will only be
                performed if the referenced operation matches this state.

        Returns:
            a :class:`fiftyone.factory.repos.DelegatedOperationDocument` if the
                update was performed, else ``None``.
        """
        return self._repo.update_run_state(
            _id=doc_id,
            run_state=ExecutionRunState.QUEUED,
            required_state=required_state,
        )

    def set_completed(
        self,
        doc_id,
        result=None,
        progress=None,
        run_link=None,
        log_path=None,
        required_state=None,
    ):
        """Sets the given delegated operation to completed state.

        Args:
            doc_id: the ID of the delegated operation
            result (None): the
                :class:`fiftyone.operators.executor.ExecutionResult` of the
                operation
            progress (None): an optional
                :class:`fiftyone.operators.executor.ExecutionProgress` of the
                operation
            run_link (None): an optional link to orchestrator-specific
                information about the operation
            log_path (None): an optional path to the log file for the operation
            required_state (None): an optional
                :class:`fiftyone.operators.executor.ExecutionRunState` required
                state of the operation. If provided, the update will only be
                performed if the referenced operation matches this state.

        Returns:
            a :class:`fiftyone.factory.repos.DelegatedOperationDocument` if the
                update was performed, else ``None``.
        """

        return self._repo.update_run_state(
            _id=doc_id,
            run_state=ExecutionRunState.COMPLETED,
            result=result,
            progress=progress,
            run_link=run_link,
            log_path=log_path,
            required_state=required_state,
        )

    def set_failed(
        self,
        doc_id,
        result=None,
        progress=None,
        run_link=None,
        log_path=None,
        required_state=None,
    ):
        """Sets the given delegated operation to failed state.

        Args:
            doc_id: the ID of the delegated operation
            result (None): the
                :class:`fiftyone.operators.executor.ExecutionResult` of the
                operation
            progress (None): an optional
                :class:`fiftyone.operators.executor.ExecutionProgress` of the
                operation
            run_link (None): an optional link to orchestrator-specific
                information about the operation
            log_path (None): an optional path to the log file for the operation
            required_state (None): an optional
                :class:`fiftyone.operators.executor.ExecutionRunState` required
                state of the operation. If provided, the update will only be
                performed if the referenced operation matches this state.

        Returns:
            a :class:`fiftyone.factory.repos.DelegatedOperationDocument` if the
                update was performed, else ``None``.
        """
        return self._repo.update_run_state(
            _id=doc_id,
            run_state=ExecutionRunState.FAILED,
            result=result,
            run_link=run_link,
            log_path=log_path,
            progress=progress,
            required_state=required_state,
        )

    def set_pinned(self, doc_id, pinned=True):
        """Sets the pinned flag for the given delegated operation.

        Args:
            doc_id: the ID of the delegated operation
            pinned (True): the boolean pinned flag

        Returns:
            a :class:`fiftyone.factory.repos.DelegatedOperationDocument`
        """
        return self._repo.set_pinned(_id=doc_id, pinned=pinned)

    def set_label(self, doc_id, label):
        """Sets the pinned flag for the given delegated operation.

        Args:
            doc_id: the ID of the delegated operation
            label: the label to set

        Returns:
            a :class:`fiftyone.factory.repos.DelegatedOperationDocument`
        """
        return self._repo.set_label(_id=doc_id, label=label)

    def set_log_upload_error(self, doc_id, log_upload_error):
        """Sets the log upload error for the given delegated operation.

        Args:
            doc_id: the ID of the delegated operation
            log upload error: the error message if we failed to upload
            logs for the given delegated operation.

        Returns:
            a :class:`fiftyone.factory.repos.DelegatedOperationDocument`
        """
        return self._repo.set_log_upload_error(
            _id=doc_id, log_upload_error=log_upload_error
        )

    def set_log_size(self, doc_id, log_size):
        """Sets the log size for the given delegated operation.

        Args:
            doc_id: the ID of the delegated operation
            log size: the size of the log file for the given delegated operation.

        Returns:
            a :class:`fiftyone.factory.repos.DelegatedOperationDocument`
        """
        return self._repo.set_log_size(_id=doc_id, log_size=log_size)

    def delete_operation(self, doc_id):
        """Deletes the given delegated operation.

        Args:
            doc_id: the ID of the delegated operation

        Returns:
            a :class:`fiftyone.factory.repos.DelegatedOperationDocument`
        """
        return self._repo.delete_operation(_id=doc_id)

    def delete_for_dataset(self, dataset_id):
        """Deletes all delegated operations associated with the given dataset.

        Args:
            dataset_id: the ID of the dataset
        """
        return self._repo.delete_for_dataset(dataset_id=dataset_id)

    def rerun_operation(self, doc_id):
        """Reruns the specified delegated operation.

        Args:
            doc_id: the ID of the delegated operation

        Returns:
            a :class:`fiftyone.factory.repos.DelegatedOperationDocument`
        """
        doc = self._repo.get(_id=doc_id)
        if doc is None:
            raise ValueError(f"No delegated operation with {doc_id=} found")
        if doc.parent_id:
            raise ValueError("Cannot rerun a child delegated operation.")
        return self._repo.queue_operation(**doc.__dict__)

    def get_queued_operations(self, operator=None, dataset_name=None):
        """Returns all queued delegated operations.

        Args:
            operator (None): the optional name of the operator to return all
                the queued delegated operations for
            dataset_name (None): the optional name of the dataset to return all
                the queued delegated operations for

        Returns:
            a list of :class:`fiftyone.factory.repos.DelegatedOperationDocument`
        """
        return self._repo.get_queued_operations(
            operator=operator, dataset_name=dataset_name
        )

    def get_scheduled_operations(self, operator=None, dataset_name=None):
        """Returns all scheduled delegated operations.
        Args:
            operator (None): the optional name of the operator to return all
                the scheduled delegated operations for
            dataset_name (None): the optional name of the dataset to return all
                the scheduled delegated operations for
        Returns:
            a list of :class:`fiftyone.factory.repos.DelegatedOperationDocument`
        """
        return self._repo.get_scheduled_operations(
            operator=operator, dataset_name=dataset_name
        )

    def get_running_operations(self, operator=None, dataset_name=None):
        """Returns all running delegated operations.
        Args:
            operator (None): the optional name of the operator to return all
                the running delegated operations for
            dataset_name (None): the optional name of the dataset to return all
                the running delegated operations for
        Returns:
            a list of :class:`fiftyone.factory.repos.DelegatedOperationDocument`
        """
        return self._repo.get_running_operations(
            operator=operator, dataset_name=dataset_name
        )

    def get(self, doc_id):
        """Returns the delegated operation with the given ID.

        Args:
            doc_id: the ID of the delegated operation

        Returns:
            a :class:`fiftyone.factory.repos.DelegatedOperationDocument`
        """
        return self._repo.get(_id=doc_id)

    def list_operations(
        self,
        operator=None,
        dataset_name=None,
        dataset_id=None,
        run_state=None,
        delegation_target=None,
        paging=None,
        search=None,
        **kwargs,
    ):
        """Lists the delegated operations matching the given criteria.

        Args:
            operator (None): the optional name of the operator to return all
                the delegated operations for
            dataset_name (None): the optional name of the dataset to return all
                the delegated operations for
            dataset_id (None): the optional id of the dataset to return all the
                delegated operations for
            run_state (None): the optional run state of the delegated
                operations to return
            delegation_target (None): the optional delegation target of the
                delegated operations to return
            paging (None): optional
                :class:`fiftyone.factory.DelegatedOperationPagingParams`
            search (None): optional search term dict

        Returns:
            a list of :class:`fiftyone.factory.repos.DelegatedOperationDocument`
        """
        return self._repo.list_operations(
            operator=operator,
            dataset_name=dataset_name,
            dataset_id=dataset_id,
            run_state=run_state,
            delegation_target=delegation_target,
            paging=paging,
            search=search,
            **kwargs,
        )

    def execute_queued_operations(
        self,
        operator=None,
        delegation_target=None,
        dataset_name=None,
        limit=None,
        log=False,
        monitor=False,
        check_interval_seconds=60,
        **kwargs,
    ):
        """Executes queued delegated operations matching the given criteria.

        Args:
            operator (None): the optional name of the operator to execute all
                the queued delegated operations for
            delegation_target (None): the optional delegation target of the
                delegated operations to execute
            dataset_name (None): the optional name of the dataset to execute
                all the queued delegated operations for
            limit (None): the optional limit of the number of delegated
                operations to execute
            log (False): the optional boolean flag to log the execution of the
                delegated operations
            monitor (False): if we should monitor the state of the operator in a subprocess.
            check_interval_seconds (60): how many seconds to wait between polling operator status.
        """
        results = []
        if limit is not None:
            paging = DelegatedOperationPagingParams(limit=limit)
        else:
            paging = None

        queued_ops = self.list_operations(
            operator=operator,
            dataset_name=dataset_name,
            delegation_target=delegation_target,
            run_state=ExecutionRunState.QUEUED,
            paging=paging,
            **kwargs,
        )

        for op in queued_ops:
            results.append(
                self.execute_operation(
                    operation=op,
                    log=log,
                    monitor=monitor,
                    check_interval_seconds=check_interval_seconds,
                )
            )
        return results

    def count(self, filters=None, search=None):
        """Counts the delegated operations matching the given criteria.

        Args:
            filters (None): a filter dict
            search (None): a search term dict

        Returns:
            the number of matching operations
        """
        return self._repo.count(filters=filters, search=search)

    def execute_operation(
        self,
        operation,
        log=False,
        run_link=None,
        log_path=None,
        monitor=False,
        check_interval_seconds=60,
    ):
        """Executes the given delegated operation.

        Args:
            operation: the
                :class:`fiftyone.factory.repos.DelegatedOperationDocument`
            log (False): the optional boolean flag to log the execution of the
                delegated operations
            run_link (None): an optional link to orchestrator-specific
                information about the operation
            log_path (None): an optional path to the log file for the operation
            monitor (False): if we should monitor the state of the operator in a subprocess.
            check_interval_seconds (60): how many seconds to wait between polling operator status.
        """
        try:
            succeeded = (
                self.set_running(
                    doc_id=operation.id,
                    run_link=run_link,
                    log_path=log_path,
                    required_state=ExecutionRunState.QUEUED,
                )
                is not None
            )
            if not succeeded:
                if log:
                    logger.debug(
                        "Not executing operation %s (%s) which is "
                        "no longer in QUEUED state, or doesn't exist.",
                        operation.id,
                        operation.operator,
                    )
                return None

            if log:
                logger.info(
                    "\nRunning operation %s (%s)",
                    operation.id,
                    operation.operator,
                )

            if monitor:
                return self._execute_operation_multi_proc(
                    operation, log, check_interval_seconds
                )
            return self._execute_operation_sync(operation, log)
        except Exception as e:
            logger.exception("Uncaught exception when executing operator")
            err = ExecutionResult(error=traceback.format_exc())
            try:
                self.set_failed(doc_id=operation.id, result=err)
            except Exception:
                logger.exception(
                    "Failed to mark operation %s as FAILED", operation.id
                )
            return err

    def _execute_operation_sync(self, operation, log=False):
        """Executes an operation synchronously in the current process."""
        try:
            result = asyncio.run(self._execute_operator(operation))
            self.set_completed(doc_id=operation.id, result=result)
            if log:
                logger.info("Operation %s complete", operation.id)
        except Exception as e:
            logger.debug(
                "Uncaught exception when executing operator. Error=%s",
                e,
                exc_info=True,
            )
            result = ExecutionResult(error=traceback.format_exc())
            self.set_failed(doc_id=operation.id, result=result)
            if log:
                logger.info(
                    "Operation %s failed\n%s", operation.id, result.error
                )
        return result

    def _execute_operation_multi_proc(
        self, operation, log=False, check_interval_seconds=60
    ):
        """Executes an operation in a separate process and monitors it."""
        ctx = multiprocessing.get_context("spawn")
        log_queue = ctx.Queue()

        root_logger = logging.getLogger("fiftyone")
        listener = logging.handlers.QueueListener(
            log_queue, *root_logger.handlers
        )
        listener.start()

        result = None
        child_process = None
        try:
            child_process = ctx.Process(
                target=_execute_operator_in_child_process,
                args=(operation.id, log, log_queue),
            )
            child_process.start()

            result = self._monitor_operation(
                child_process, operation.id, check_interval_seconds
            )

            if not result:
                try:
                    final_doc = self.get(operation.id)
                except Exception as e:
                    logger.exception(
                        "Failed to fetch final doc for operation %s",
                        operation.id,
                    )
                    return ExecutionResult(error=f"Finalization error: {e}")
                raw = final_doc.result if final_doc else None
                if isinstance(raw, ExecutionResult):
                    result = raw
                elif isinstance(raw, dict):
                    result = ExecutionResult(
                        result=raw.get("result"),
                        error=raw.get("error"),
                        error_message=raw.get("error_message"),
                        delegated=raw.get("delegated", False),
                        outputs_schema=raw.get("outputs_schema"),
                    )
                else:
                    result = ExecutionResult()
        finally:
            listener.stop()
            if child_process and child_process.is_alive():
                self._terminate_child_process(
                    child_process, operation.id, "Executor shutting down"
                )

        return result

    def _monitor_operation(
        self, child_process, operation_id, check_interval_seconds=60
    ):
        """
        Monitors the child_process and operation state for failures.
        """
        while child_process.is_alive():
            child_process.join(timeout=check_interval_seconds)

            if not child_process.is_alive():
                return None

            try:
                op_doc = self.get(operation_id)
                if op_doc and op_doc.run_state == ExecutionRunState.FAILED:
                    err = None
                    res = getattr(op_doc, "result", None)
                    if isinstance(res, dict):
                        err = res.get("error")
                    else:
                        err = getattr(res, "error", None)

                    reason = (
                        "Operation marked as FAILED externally"
                        if not err or "marked as failed" in str(err).lower()
                        else f"Operation FAILED (detected by monitor): {err}"
                    )
                    self._terminate_child_process(
                        child_process, operation_id, reason
                    )
                    return ExecutionResult(error=reason)
                else:
                    logger.info("Pinging operation %s", operation_id)
                    self._repo.ping(operation_id)
            except Exception as e:
                reason = f"Error in monitoring loop: {e}"
                logger.error(
                    "Error in monitoring loop for operation %s: %s",
                    operation_id,
                    e,
                )
                self._terminate_child_process(
                    child_process, operation_id, reason
                )
                return ExecutionResult(error=reason)

    def _terminate_child_process(self, child_process, operation_id, reason):
        """
        Terminates a child process and its descendants using psutil.
        """
        pid = child_process.pid
        logger.warning(
            "Terminating process tree (PID: %d) for operation %s. Reason: %s",
            pid,
            operation_id,
            reason,
        )

        try:
            parent = psutil.Process(pid)
            children = parent.children(recursive=True)

            for child in children:
                try:
                    child.terminate()
                except psutil.NoSuchProcess:
                    pass

            _, alive = psutil.wait_procs(children, timeout=10)

            for p in alive:
                try:
                    p.kill()
                except psutil.NoSuchProcess:
                    pass
            try:
                parent.terminate()
                parent.wait(timeout=10)
                if parent.is_running():
                    parent.kill()
                    parent.wait(timeout=5)
            except psutil.NoSuchProcess:
                pass
        except psutil.NoSuchProcess:
            logger.info(
                "Process %d for op %s already terminated.", pid, operation_id
            )
        except Exception as e:
            logger.error(
                "Error during process tree termination for PID %d: %s", pid, e
            )

    async def _execute_operator(self, doc):
        operator_uri = doc.operator
        context = doc.context
        context.request_params["run_doc"] = doc.id

        if not context.request_params.get("dataset_id", None):
            # Pass the dataset_id so that the execution context can load the
            # dataset by id in case a dataset has been renamed since the task
            # was initially queued. However, don't overwrite it if it exists.
            context.request_params["dataset_id"] = doc.dataset_id

        prepared = await prepare_operator_executor(
            operator_uri=operator_uri,
            request_params=context.request_params,
            delegated_operation_id=doc.id,
            set_progress=self.set_progress,
        )

        if isinstance(prepared, ExecutionResult):
            raise prepared.to_exception()

        operator, _, ctx, __ = prepared

        result = await do_execute_operator(operator, ctx, exhaust=True)

        outputs_schema = None
        try:
            # Resolve output types now
            ctx.request_params["target"] = "outputs"
            ctx.request_params["results"] = result

            outputs = await resolve_type_with_context(operator, ctx)
            if outputs is not None:
                outputs_schema = outputs.to_json()
        except (AttributeError, Exception):
            logger.warning(
                "Failed to resolve output schema for the operation."
                + traceback.format_exc(),
            )

        execution_result = ExecutionResult(
            result=result, outputs_schema=outputs_schema
        )

        return execution_result
