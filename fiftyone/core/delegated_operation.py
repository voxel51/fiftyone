from datetime import datetime
from bson import ObjectId
from fiftyone.core.odm.delegated_operation import DelegatedOperationDocument
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

    @staticmethod
    def queue_operation(
        operator: str,
        delegation_target: str = None,
        dataset_id: ObjectId = None,
        context: dict = None,
        view_stages: list = None,
    ) -> DelegatedOperationDocument:
        """Returns a queued :class:`fiftyone.core.odm.DelegatedOperationDocument` instance
        for the operation.

        Returns:
            a :class:`fiftyone.core.odm.DelegatedOperationDocument`
        """
        op = DelegatedOperationDocument(
            operator=operator,
            delegation_target=delegation_target,
            dataset_id=dataset_id,
            context=context,
            view_stages=view_stages,
            queued_at=datetime.now(),
            run_state="queued",
        )
        doc = op.save()
        return doc

    @staticmethod
    def set_triggered(doc_id: ObjectId) -> DelegatedOperationDocument:
        return DelegatedOperationService._set_run_state(
            doc_id=doc_id, run_state="triggered"
        )

    @staticmethod
    def set_running(doc_id: ObjectId) -> DelegatedOperationDocument:
        return DelegatedOperationService._set_run_state(
            doc_id=doc_id, run_state="started"
        )

    @staticmethod
    def set_completed(doc_id: ObjectId) -> DelegatedOperationDocument:
        return DelegatedOperationService._set_run_state(
            doc_id=doc_id, run_state="completed"
        )

    @staticmethod
    def set_failed(doc_id: ObjectId, error=None) -> DelegatedOperationDocument:
        return DelegatedOperationService._set_run_state(
            doc_id=doc_id, run_state="failed", error=error
        )

    @staticmethod
    def delete_op():
        pass

    @staticmethod
    def get_queued_operations(operator: str = None, dataset_id=None):
        queued_ops = DelegatedOperationService.list_operations(
            operator=operator, dataset_id=dataset_id, run_state="queued"
        )
        return queued_ops

    @staticmethod
    def list_operations(
        operator: str = None,
        dataset_id: ObjectId = None,
        run_state: str = None,
        delegation_target: str = None,
    ):
        query = {}
        if operator:
            query["operator"] = operator
        if dataset_id:
            query["dataset_id"] = dataset_id
        if run_state:
            query["run_state"] = run_state
        if delegation_target:
            query["delegation_target"] = delegation_target
        # pylint: disable=no-member
        return DelegatedOperationDocument.objects(**query)

    @staticmethod
    def get(
        doc_id: str,
    ) -> DelegatedOperationDocument:
        # pylint: disable=no-member
        return DelegatedOperationDocument.objects.with_id(doc_id)

    @staticmethod
    def _set_run_state(
        doc_id: ObjectId, run_state: str, error=None
    ) -> DelegatedOperationDocument:
        _id = doc_id
        if isinstance(_id, str):
            _id = ObjectId(_id)

        # pylint: disable=no-member
        doc = DelegatedOperationDocument.objects.with_id(_id)

        doc.run_state = run_state
        if run_state == "started":
            doc.started_at = datetime.now()
        elif run_state == "completed":
            doc.completed_at = datetime.now()
        elif run_state == "failed":
            doc.failed_at = datetime.now()
            doc.error_message = str(error)
        elif run_state == "triggered":
            doc.triggered_at = datetime.now()
        else:
            raise ValueError(f"Invalid run state: {run_state}")

        return doc.save()

    @staticmethod
    def execute_queued_operations(
        operator: str = None,
        delegation_target: str = None,
        dataset_id: ObjectId = None,
    ):
        queued_ops = DelegatedOperationService.list_operations(
            operator=operator,
            dataset_id=dataset_id,
            delegation_target=delegation_target,
            run_state="queued",
        )

        for op in queued_ops:
            print(op)
            DelegatedOperationService.set_triggered(op.id)
            result = asyncio.run(
                DelegatedOperationService._execute_operator(op)
            )

    @staticmethod
    async def _execute_operator(doc: DelegatedOperationDocument):
        operator_uri = doc["operator"]
        print(f"operator: {operator_uri}")
        context = doc["context"]
        context["request_params"]["run_doc"] = doc["id"]
        (operator, executor, ctx) = foe.prepare_operator_executor(
            operator_uri, context["request_params"]
        )
        DelegatedOperationService.set_running(doc["id"])
        try:
            result = operator.execute(ctx)
            DelegatedOperationService.set_completed(doc["id"])
            print(f"result: {result}")
            return result
        except Exception as e:
            DelegatedOperationService.set_failed(doc.id, error=e)
            # raise e
