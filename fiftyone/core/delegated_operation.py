from datetime import datetime
from bson import ObjectId
from fiftyone.core.odm.delegated_operation import DelegatedOperationDocument


class DelegatedOperationService(object):
    """Base class for delegated operations.

    Delegated operations are used to define custom operations that can be
    applied to datasets and views.

    Delegated operations are defined by subclassing this class and
    implementing the :meth:`get_pipeline_stage` method.

    """

    @staticmethod
    def queue_operation(
        operator, run_key, dataset_id=None, context=None, view_stages=None
    ) -> DelegatedOperationDocument:
        """Returns a queued :class:`fiftyone.core.odm.DelegatedOperationDocument` instance
        for the operation.

        Returns:
            a :class:`fiftyone.core.odm.DelegatedOperationDocument`
        """
        op = DelegatedOperationDocument(
            operator=operator,
            run_key=run_key,
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
        print(f"Found {len(queued_ops)} queued operations")
        return queued_ops

    @staticmethod
    def list_operations(operator=None, dataset_id=None, run_state=None):
        query = {}
        if operator:
            query["operator"] = operator
        if dataset_id:
            query["dataset_id"] = dataset_id
        if run_state:
            query["run_state"] = run_state
        # pylint: disable=no-member
        return DelegatedOperationDocument.objects(**query)

    @staticmethod
    def get(
        doc_id: str = None, run_key: str = None
    ) -> DelegatedOperationDocument:
        if doc_id is None and run_key is None:
            raise ValueError("Must specify either doc_id or run_key")
        if doc_id:
            # pylint: disable=no-member
            return DelegatedOperationDocument.objects.with_id(doc_id)

        if run_key:
            # pylint: disable=no-member
            return DelegatedOperationDocument.objects(run_key=run_key).first()

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
