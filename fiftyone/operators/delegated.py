"""
FiftyOne delegated operations.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio
import logging
import traceback

from fiftyone.factory.repo_factory import RepositoryFactory
from fiftyone.factory import DelegatedOperationPagingParams
from fiftyone.operators.executor import (
    prepare_operator_executor,
    do_execute_operator,
    ExecutionResult,
    ExecutionRunState,
)


logger = logging.getLogger(__name__)


class DelegatedOperationService(object):
    """Service for executing delegated operations."""

    def __init__(self, repo=None):
        if repo is None:
            repo = RepositoryFactory.delegated_operation_repo()

        self._repo = repo

    def queue_operation(
        self, operator, label=None, delegation_target=None, context=None
    ):
        """Queues the given delegated operation for execution.

        Args:
            operator: the operator name
            delegation_target (None): an optional delegation target
            label (None): an optional label for the operation (will default to
                the operator if not supplied)
            context (None): an
                :class:`fiftyone.operators.executor.ExecutionContext`

        Returns:
            a :class:`fiftyone.factory.repos.DelegatedOperationDocument`
        """
        return self._repo.queue_operation(
            operator=operator,
            label=label if label else operator,
            delegation_target=delegation_target,
            context=context,
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

    def set_running(self, doc_id, progress=None, run_link=None):
        """Sets the given delegated operation to running state.

        Args:
            doc_id: the ID of the delegated operation
            progress (None): an optional
                :class:`fiftyone.operators.executor.ExecutionProgress` of the
                operation
            run_link (None): an optional link to orchestrator-specific
                information about the operation

        Returns:
            a :class:`fiftyone.factory.repos.DelegatedOperationDocument`
        """
        return self._repo.update_run_state(
            _id=doc_id,
            run_state=ExecutionRunState.RUNNING,
            run_link=run_link,
            progress=progress,
        )

    def set_completed(
        self,
        doc_id,
        result=None,
        progress=None,
        run_link=None,
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

        Returns:
            a :class:`fiftyone.factory.repos.DelegatedOperationDocument`
        """
        return self._repo.update_run_state(
            _id=doc_id,
            run_state=ExecutionRunState.COMPLETED,
            result=result,
            progress=progress,
            run_link=run_link,
        )

    def set_failed(
        self,
        doc_id,
        result=None,
        progress=None,
        run_link=None,
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

        Returns:
            a :class:`fiftyone.factory.repos.DelegatedOperationDocument`
        """
        return self._repo.update_run_state(
            _id=doc_id,
            run_state=ExecutionRunState.FAILED,
            result=result,
            run_link=run_link,
            progress=progress,
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
        """
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
            self.execute_operation(operation=op, log=log)

    def count(self, filters=None, search=None):
        """Counts the delegated operations matching the given criteria.

        Args:
            filters (None): a filter dict
            search (None): a search term dict

        Returns:
            the number of matching operations
        """
        return self._repo.count(filters=filters, search=search)

    def execute_operation(self, operation, log=False, run_link=None):
        """Executes the given delegated operation.

        Args:
            operation: the
                :class:`fiftyone.factory.repos.DelegatedOperationDocument`
            log (False): the optional boolean flag to log the execution of the
                delegated operations
            run_link (None): an optional link to orchestrator-specific
                information about the operation
        """
        try:
            self.set_running(doc_id=operation.id, run_link=run_link)
            if log:
                logger.info(
                    "\nRunning operation %s (%s)",
                    operation.id,
                    operation.operator,
                )

            result = asyncio.run(self._execute_operator(operation))

            self.set_completed(doc_id=operation.id, result=result)
            if log:
                logger.info("Operation %s complete", operation.id)
        except:
            result = ExecutionResult(error=traceback.format_exc())

            self.set_failed(doc_id=operation.id, result=result)
            if log:
                logger.info(
                    "Operation %s failed\n%s", operation.id, result.error
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

        operator, _, ctx = prepared
        return await do_execute_operator(operator, ctx, exhaust=True)
