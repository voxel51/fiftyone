"""
FiftyOne delegated operations.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio
import logging
import traceback
import types as python_types
import fiftyone.core.utils as fou

from fiftyone.factory.repo_factory import RepositoryFactory
from fiftyone.factory import DelegatedOperationPagingParams
from fiftyone.operators.executor import (
    prepare_operator_executor,
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

    def queue_operation(self, operator, delegation_target=None, context=None):
        """Queues the given delegated operation for execution.

        Args:
            operator: the operator name
            delegation_target (None): an optional delegation target
            context (None): an
                :class:`fiftyone.operators.executor.ExecutionContext`

        Returns:
            a :class:`fiftyone.factory.repos.DelegatedOperationDocument`
        """
        return self._repo.queue_operation(
            operator=operator,
            delegation_target=delegation_target,
            context=context,
        )

    def set_running(self, doc_id):
        """Sets the given delegated operation to running state.

        Args:
            doc_id: the ID of the delegated operation

        Returns:
            a :class:`fiftyone.factory.repos.DelegatedOperationDocument`
        """
        return self._repo.update_run_state(
            _id=doc_id, run_state=ExecutionRunState.RUNNING
        )

    def set_completed(self, doc_id, result=None):
        """Sets the given delegated operation to completed state.

        Args:
            doc_id: the ID of the delegated operation
            result (None): the
                :class:`fiftyone.operators.executor.ExecutionResult` of the
                operation

        Returns:
            a :class:`fiftyone.factory.repos.DelegatedOperationDocument`
        """
        return self._repo.update_run_state(
            _id=doc_id, run_state=ExecutionRunState.COMPLETED, result=result
        )

    def set_failed(self, doc_id, result=None):
        """Sets the given delegated operation to failed state.

        Args:
            doc_id: the ID of the delegated operation
            result (None): the
                :class:`fiftyone.operators.executor.ExecutionResult` of the
                operation

        Returns:
            a :class:`fiftyone.factory.repos.DelegatedOperationDocument`
        """
        return self._repo.update_run_state(
            _id=doc_id, run_state=ExecutionRunState.FAILED, result=result
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
            try:
                if log:
                    logger.info(
                        "\nRunning operation %s (%s)", op.id, op.operator
                    )
                execution_result = asyncio.run(self._execute_operator(op))
                self.set_completed(doc_id=op.id, result=execution_result)
                if log:
                    logger.info("Operation %s complete", op.id)
            except:
                result = ExecutionResult(error=traceback.format_exc())
                self.set_failed(doc_id=op.id, result=result)
                if log:
                    logger.info("Operation %s failed\n%s", op.id, result.error)

    def count(self, filters=None, search=None):
        """Counts the delegated operations matching the given criteria.

        Args:
            filters (None): a filter dict
            search (None): a search term dict

        Returns:
            the number of matching operations
        """
        return self._repo.count(filters=filters, search=search)

    async def _execute_operator(self, doc):
        operator_uri = doc.operator
        context = doc.context
        context.request_params["run_doc"] = doc.id

        prepared = await prepare_operator_executor(
            operator_uri, context.request_params
        )

        # if a validation error happened during preparation,
        # only an ExecutionResult with an error is returned.
        # Raise it so the delegated operation is marked as a failure.
        if isinstance(prepared, ExecutionResult):
            raise prepared.to_exception()
        else:
            operator, _, ctx = prepared
            self.set_running(doc_id=doc.id)

            raw_result = await (
                operator.execute(ctx)
                if asyncio.iscoroutinefunction(operator.execute)
                else fou.run_sync_task(operator.execute, ctx)
            )

            is_generator = isinstance(
                raw_result, python_types.GeneratorType
            ) or isinstance(raw_result, python_types.AsyncGeneratorType)

            # if this is not a generator, return the result from execution
            if not is_generator:
                return raw_result

            # if it is a generator, exhaust it to ensure it is fully executed
            for _ in raw_result:
                pass
