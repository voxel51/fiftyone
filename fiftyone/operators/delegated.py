import asyncio
import logging
import traceback

from fiftyone.core.expressions import ObjectId
from fiftyone.factory import DelegatedOpPagingParams
from fiftyone.factory.repo_factory import RepositoryFactory
from fiftyone.factory.repos import DelegatedOperationDocument
from fiftyone.factory.repos.delegated_operation import (
    DelegatedOperationRepo,
)

from fiftyone.operators.executor import (
    prepare_operator_executor,
    ExecutionResult,
    ExecutionContext,
    ExecutionRunState,
)
from fiftyone.operators.types import List

logger = logging.getLogger(__name__)


class DelegatedOperationService:
    """Base class for delegated operations.

    Delegated operations are used to define custom operations that can be
    applied to datasets and views.

    """

    def __init__(self, repo: DelegatedOperationRepo = None):
        self._repo = (
            repo
            if repo is not None
            else RepositoryFactory.delegated_operation_repo()
        )

    def queue_operation(
        self,
        operator: str,
        delegation_target: str = None,
        context: ExecutionContext = None,
    ) -> DelegatedOperationDocument:
        """Returns a queued :class:`fiftyone.core.odm.DelegatedOperationDocument` instance for the operation.

        Returns:
            a :class:`fiftyone.core.odm.DelegatedOperationDocument`
        """

        return self._repo.queue_operation(
            operator=operator,
            delegation_target=delegation_target,
            context=context,
        )

    def set_running(self, doc_id: ObjectId) -> DelegatedOperationDocument:
        """
        Sets the :class:`fiftyone.core.odm.DelegatedOperationDocument` to running state.
        Args:
            doc_id: the id of the delegated operation document

        Returns:
            a :class:`fiftyone.core.odm.DelegatedOperationDocument`
        """
        return self._repo.update_run_state(
            _id=doc_id, run_state=ExecutionRunState.RUNNING
        )

    def set_completed(
        self, doc_id: ObjectId, result: ExecutionResult = None
    ) -> DelegatedOperationDocument:
        """
        Sets the :class:`fiftyone.core.odm.DelegatedOperationDocument` to completed state.
        Args:
            doc_id: the id of the delegated operation document
            result: the :class:`fiftyone.operators.ExecutionResult` result of the operation

        Returns:
            a :class:`fiftyone.core.odm.DelegatedOperationDocument`
        """
        return self._repo.update_run_state(
            _id=doc_id, run_state=ExecutionRunState.COMPLETED, result=result
        )

    def set_failed(
        self, doc_id: ObjectId, result: ExecutionResult
    ) -> DelegatedOperationDocument:
        """
        Sets the :class:`fiftyone.core.odm.DelegatedOperationDocument` to failed state.
        Args:
            doc_id: the id of the delegated operation document
            result: the :class:`fiftyone.operators.ExecutionResult` result of the operation

        Returns:
            a :class:`fiftyone.core.odm.DelegatedOperationDocument`
        """
        return self._repo.update_run_state(
            _id=doc_id, run_state=ExecutionRunState.FAILED, result=result
        )

    def set_pinned(
        self, doc_id: ObjectId, pinned: bool = True
    ) -> DelegatedOperationDocument:
        """
        Sets the :class:`fiftyone.core.odm.DelegatedOperationDocument` pinned flag.
        Args:
            doc_id: the id of the delegated operation document
            pinned: the boolean pinned flag

        Returns:
            a :class:`fiftyone.core.odm.DelegatedOperationDocument`
        """
        return self._repo.set_pinned(_id=doc_id, pinned=pinned)

    def delete_operation(self, doc_id: ObjectId) -> DelegatedOperationDocument:
        """
        Deletes the :class:`fiftyone.core.odm.DelegatedOperationDocument`
        Args:
            doc_id: the id of the delegated operation document

        Returns:
            a :class:`fiftyone.core.odm.DelegatedOperationDocument`
        """
        return self._repo.delete_operation(_id=doc_id)

    def delete_for_dataset(self, dataset_id: ObjectId):
        """
        Deletes all :class:`fiftyone.core.odm.DelegatedOperationDocument` for the dataset.
        Args:
            dataset_id: the id of the dataset to delete all the delegated operations for

        """
        return self._repo.delete_for_dataset(dataset_id=dataset_id)

    def rerun_operation(self, doc_id: ObjectId) -> DelegatedOperationDocument:
        """
        Reruns the :class:`fiftyone.core.odm.DelegatedOperationDocument`
        Args:
            doc_id: the id of the delegated operation document

        Returns:
            a :class:`fiftyone.core.odm.DelegatedOperationDocument`

        """
        doc = self._repo.get(_id=doc_id)
        return self._repo.queue_operation(**doc.__dict__)

    def get_queued_operations(
        self, operator: str = None, dataset_name: str = None
    ):
        """
        Returns all queued :class:`fiftyone.core.odm.DelegatedOperationDocument` .
        Args:
            operator: the optional name of the operator to return all the queued delegated operations for
            dataset_name: the optional name of the dataset to return all the queued delegated operations for

        Returns:

        """
        return self._repo.get_queued_operations(
            operator=operator, dataset_name=dataset_name
        )

    def get(self, doc_id: ObjectId) -> DelegatedOperationDocument:
        """
        Returns the :class:`fiftyone.core.odm.DelegatedOperationDocument` for the id.
        Args:
            doc_id: the id of the delegated operation document

        Returns:
            a :class:`fiftyone.core.odm.DelegatedOperationDocument`
        """
        return self._repo.get(_id=doc_id)

    def list_operations(
        self,
        operator: str = None,
        dataset_name: str = None,
        dataset_id: ObjectId = None,
        run_state: ExecutionRunState = None,
        delegation_target: str = None,
        run_by: str = None,
        paging: DelegatedOpPagingParams = None,
        **kwargs,
    ):
        """
        Returns a list of :class:`fiftyone.core.odm.DelegatedOperationDocument` .
        Args:
            operator: the optional name of the operator to return all the delegated operations for
            dataset_name: the optional name of the dataset to return all the delegated operations for
            dataset_id: the optional id of the dataset to return all the delegated operations for
            run_state: the optional run state of the delegated operations to return
            delegation_target: the optional delegation target of the delegated operations to return
            paging: the optional paging parameters
            **kwargs:

        Returns:
            a list of :class:`fiftyone.core.odm.DelegatedOperationDocument`
        """
        return self._repo.list_operations(
            operator=operator,
            dataset_name=dataset_name,
            dataset_id=dataset_id,
            run_state=run_state,
            delegation_target=delegation_target,
            run_by=run_by,
            paging=paging,
            **kwargs,
        )

    def execute_queued_operations(
        self,
        operator: str = None,
        delegation_target: str = None,
        dataset_name: str = None,
        limit: int = None,
        log: bool = False,
        **kwargs,
    ):
        """
        Executes all queued :class:`fiftyone.core.odm.DelegatedOperationDocument` .
        Args:
            operator: the optional name of the operator to execute all the queued delegated operations for
            delegation_target: the optional delegation target of the delegated operations to execute
            dataset_name: the optional name of the dataset to execute all the queued delegated operations for
            limit: the optional limit of the number of delegated operations to execute
            log: the optional boolean flag to log the execution of the delegated operations
            **kwargs:
        """
        paging = None
        if limit is not None:
            paging = DelegatedOpPagingParams(limit=limit)

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
                result = asyncio.run(self._execute_operator(op))
                self.set_completed(doc_id=op.id, result=result)
                if log:
                    logger.info("Operation %s complete", op.id)
            except Exception as e:
                result = ExecutionResult(error=traceback.format_exc())
                self.set_failed(doc_id=op.id, result=result)
                if log:
                    logger.info("Operation %s failed", op.id)

    async def _execute_operator(self, doc: DelegatedOperationDocument):
        operator_uri = doc.operator
        context = doc.context
        context.request_params["run_doc"] = doc.id

        prepared = prepare_operator_executor(
            operator_uri, context.request_params
        )

        if isinstance(prepared, ExecutionResult):
            self.set_failed(doc_id=doc.id, result=prepared)
        else:
            operator, _, ctx = prepared
            self.set_running(doc_id=doc.id)
            return operator.execute(ctx)
