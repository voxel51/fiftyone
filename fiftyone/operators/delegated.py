import asyncio
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


class DelegatedOperation(object):
    """Base class for delegated operations.

    Delegated operations are used to define custom operations that can be
    applied to datasets and views.

    Delegated operations are defined by subclassing this class and
    implementing the :meth:`get_pipeline_stage` method.

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
        dataset_id: ObjectId = None,
        context: ExecutionContext = None,
    ) -> DelegatedOperationDocument:
        """Returns a queued :class:`fiftyone.core.odm.DelegatedOperationDocument` instance
        for the operation.

        Returns:
            a :class:`fiftyone.core.odm.DelegatedOperationDocument`
        """

        # TODO:
        # pull secret values out of context before storing,
        # leave secrets keys so we know what to grab
        # back from secrets manager on execute

        return self._repo.queue_operation(
            operator=operator,
            delegation_target=delegation_target,
            dataset_id=dataset_id,
            context=context,
        )

    def set_running(self, doc_id: ObjectId) -> DelegatedOperationDocument:
        return self._repo.update_run_state(
            _id=doc_id, run_state=ExecutionRunState.RUNNING
        )

    def set_completed(
        self, doc_id: ObjectId, result: ExecutionResult = None
    ) -> DelegatedOperationDocument:
        return self._repo.update_run_state(
            _id=doc_id, run_state=ExecutionRunState.COMPLETED, result=result
        )

    def set_failed(
        self, doc_id: ObjectId, result: ExecutionResult
    ) -> DelegatedOperationDocument:
        return self._repo.update_run_state(
            _id=doc_id, run_state=ExecutionRunState.FAILED, result=result
        )

    def delete_operation(self, doc_id: ObjectId) -> DelegatedOperationDocument:
        return self._repo.delete_operation(_id=doc_id)

    def rerun_operation(self, doc_id: ObjectId) -> DelegatedOperationDocument:
        doc = self._repo.get(_id=doc_id)
        return self._repo.queue_operation(**doc.__dict__)

    def get_queued_operations(self, operator: str = None, dataset_id=None):
        return self._repo.get_queued_operations(
            operator=operator, dataset_id=dataset_id
        )

    def get(self, doc_id: ObjectId):
        return self._repo.get(_id=doc_id)

    def list_operations(
        self,
        operator: str = None,
        dataset_id: ObjectId = None,
        run_state: ExecutionRunState = None,
        delegation_target: str = None,
        run_by: str = None,
        paging: DelegatedOpPagingParams = None,
        **kwargs,
    ):
        return self._repo.list_operations(
            operator=operator,
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
        dataset_id: ObjectId = None,
    ):

        queued_ops = self.list_operations(
            operator=operator,
            dataset_id=dataset_id,
            delegation_target=delegation_target,
            run_state=ExecutionRunState.QUEUED,
        )

        for op in queued_ops:
            try:
                # TODO:
                # attach secrets to context
                # pull keys out of context and retrieve from secrets manager
                # for execution

                result = asyncio.run(self._execute_operator(op))
                self.set_completed(doc_id=op.id, result=result)
            except Exception as e:
                result = ExecutionResult(error=traceback.format_exc())
                self.set_failed(doc_id=op.id, result=result)

    async def _execute_operator(self, doc: DelegatedOperationDocument):
        operator_uri = doc.operator
        context = doc.context
        context.request_params["run_doc"] = doc.id
        (operator, executor, ctx) = prepare_operator_executor(
            operator_name=operator_uri, request_params=context.request_params
        )
        self.set_running(doc_id=doc.id)
        return operator.execute(ctx)
