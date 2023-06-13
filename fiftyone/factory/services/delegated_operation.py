from bson import ObjectId
from fiftyone.factory.repos.delegated_operation import (
    DelegatedOperation,
    DelegatedOperationRepo,
)
import fiftyone.core.utils as fou

foe = fou.lazy_import("fiftyone.operators.executor")
import asyncio


class DelegatedOperationService(object):
    """Base class for delegated operations.

    Delegated operations are used to define custom operations that can be
    applied to datasets and views.

    Delegated operations are defined by subclassing this class and
    implementing the :meth:`get_pipeline_stage` method.

    """

    def __init__(self, repo: DelegatedOperationRepo):
        self._repo = repo

    def queue_operation(
        self,
        operator: str,
        delegation_target: str = None,
        dataset_id: ObjectId = None,
        context: dict = None,
    ) -> DelegatedOperation:
        """Returns a queued :class:`fiftyone.core.odm.DelegatedOperationDocument` instance
        for the operation.

        Returns:
            a :class:`fiftyone.core.odm.DelegatedOperationDocument`
        """

        doc = self._repo.queue_operation(
            operator=operator,
            delegation_target=delegation_target,
            dataset_id=dataset_id,
            context=context,
        )
        return doc

    def set_running(self, doc_id: ObjectId) -> DelegatedOperation:
        return self._repo.update_run_state(_id=doc_id, run_state="running")

    def set_completed(
        self, doc_id: ObjectId, results: dict = None
    ) -> DelegatedOperation:
        return self._repo.update_run_state(_id=doc_id, run_state="completed")

    def set_failed(
        self, doc_id: ObjectId, error: str = None
    ) -> DelegatedOperation:
        return self._repo.update_run_state(
            _id=doc_id, run_state="failed", error=error
        )

    def delete_operation(self, doc_id: ObjectId) -> DelegatedOperation:
        return self._repo.delete_operation(_id=doc_id)

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
        run_state: str = None,
        delegation_target: str = None,
    ):
        return self._repo.list_operations(
            operator=operator,
            dataset_id=dataset_id,
            run_state=run_state,
            delegation_target=delegation_target,
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
            run_state="queued",
        )

        for op in queued_ops:
            print(op)
            result = asyncio.run(self._execute_operator(op))

    async def _execute_operator(self, doc: DelegatedOperation):
        operator_uri = doc.operator
        print(f"operator: {operator_uri}")
        context = doc.context
        context["request_params"]["run_doc"] = doc.id
        (operator, executor, ctx) = foe.prepare_operator_executor(
            operator_uri, context["request_params"]
        )
        self.set_running(doc_id=doc.id)
        try:
            result = operator.execute(ctx)
            self.set_completed(doc_id=doc.id)
            print(f"result: {result}")
            return result
        except Exception as e:
            self.set_failed(doc_id=doc.id, error=str(e))
