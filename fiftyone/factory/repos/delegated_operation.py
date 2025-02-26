"""
FiftyOne delegated operation repository.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
from datetime import datetime
from typing import Any, List

import pymongo
from bson import ObjectId
from pymongo import IndexModel
from pymongo.collection import Collection

from fiftyone.internal.util import is_remote_service
from fiftyone.factory import DelegatedOperationPagingParams
from fiftyone.factory.repos import DelegatedOperationDocument
from fiftyone.operators.executor import (
    ExecutionContext,
    ExecutionProgress,
    ExecutionResult,
    ExecutionRunState,
)

logger = logging.getLogger(__name__)


class DelegatedOperationRepo(object):
    """Base Class for a delegated operation repository."""

    def queue_operation(
        self,
        **kwargs: Any,
    ) -> DelegatedOperationDocument:
        """Queue an operation to be executed by a delegated operator."""
        raise NotImplementedError("subclass must implement queue_operation()")

    def update_run_state(
        self,
        _id: ObjectId,
        run_state: ExecutionRunState,
        result: ExecutionResult = None,
        run_link: str = None,
        log_path: str = None,
        progress: ExecutionProgress = None,
        required_state: ExecutionRunState = None,
    ) -> DelegatedOperationDocument:
        """Update the run state of an operation."""
        raise NotImplementedError("subclass must implement update_run_state()")

    def update_progress(
        self,
        _id: ObjectId,
        progress: ExecutionProgress,
    ) -> DelegatedOperationDocument:
        """Update the progress of an operation."""
        raise NotImplementedError("subclass must implement update_progress()")

    def get_queued_operations(
        self, operator: str = None, dataset_name=None
    ) -> List[DelegatedOperationDocument]:
        """Get all queued operations."""
        raise NotImplementedError(
            "subclass must implement get_queued_operations()"
        )

    def get_scheduled_operations(
        self, operator: str = None, dataset_name=None
    ) -> List[DelegatedOperationDocument]:
        """Get all scheduled operations."""
        raise NotImplementedError(
            "subclass must implement get_scheduled_operations()"
        )

    def get_running_operations(
        self, operator: str = None, dataset_name=None
    ) -> List[DelegatedOperationDocument]:
        """Get all running operations."""
        raise NotImplementedError(
            "subclass must implement get_running_operations()"
        )

    def list_operations(
        self,
        operator: str = None,
        dataset_name: str = None,
        dataset_id: ObjectId = None,
        run_state: ExecutionRunState = None,
        delegation_target: str = None,
        pinned: bool = None,
        paging: DelegatedOperationPagingParams = None,
        search: dict = None,
        **kwargs: Any,
    ) -> List[DelegatedOperationDocument]:
        """List all operations."""
        raise NotImplementedError("subclass must implement list_operations()")

    def delete_operation(self, _id: ObjectId) -> DelegatedOperationDocument:
        """Delete an operation."""
        raise NotImplementedError("subclass must implement delete_operation()")

    def delete_for_dataset(self, dataset_id: ObjectId):
        """Delete an operation."""
        raise NotImplementedError("subclass must implement delete_operation()")

    def set_pinned(
        self, _id: ObjectId, pinned: bool = True
    ) -> DelegatedOperationDocument:
        """Sets the pinned flag on / off."""
        raise NotImplementedError("subclass must implement set_pinned()")

    def set_label(
        self, _id: ObjectId, label: str
    ) -> DelegatedOperationDocument:
        """Sets the label for the delegated operation."""
        raise NotImplementedError("subclass must implement set_label()")

    def set_log_upload_error(
        self, _id: ObjectId, log_upload_error: str
    ) -> DelegatedOperationDocument:
        """Sets the log upload error for the delegated operation."""
        raise NotImplementedError(
            "subclass must implement set_log_upload_error()"
        )

    def get(self, _id: ObjectId) -> DelegatedOperationDocument:
        """Get an operation by id."""
        raise NotImplementedError("subclass must implement get()")

    def count(self, filters: dict = None, search: dict = None) -> int:
        """Count all operations."""
        raise NotImplementedError("subclass must implement count()")


class MongoDelegatedOperationRepo(DelegatedOperationRepo):
    COLLECTION_NAME = "delegated_ops"

    required_props = ["operator", "delegation_target", "context", "label"]

    def __init__(self, collection: Collection = None):
        self._collection = (
            collection if collection is not None else self._get_collection()
        )
        self.is_remote = is_remote_service()
        self._create_indexes()

    def _get_collection(self) -> Collection:
        import fiftyone.core.odm as foo

        database: pymongo.database.Database = foo.get_db_conn()
        return database[self.COLLECTION_NAME]

    def _create_indexes(self):
        indices = self._collection.list_indexes()
        index_names = [index["name"] for index in indices]
        indices_to_create = []
        if "operator_1" not in index_names:
            indices_to_create.append(
                IndexModel(
                    [("operator", pymongo.ASCENDING)], name="operator_1"
                )
            )
        if "updated_at_1" not in index_names:
            indices_to_create.append(
                IndexModel(
                    [("updated_at", pymongo.ASCENDING)], name="updated_at_1"
                )
            )
        if "run_state_1" not in index_names:
            indices_to_create.append(
                IndexModel(
                    [("run_state", pymongo.ASCENDING)], name="run_state_1"
                )
            )

        if "dataset_id_1" not in index_names:
            indices_to_create.append(
                IndexModel(
                    [("dataset_id", pymongo.ASCENDING)], name="dataset_id_1"
                )
            )

        if indices_to_create:
            self._collection.create_indexes(indices_to_create)

    def queue_operation(self, **kwargs: Any) -> DelegatedOperationDocument:
        op = DelegatedOperationDocument(is_remote=self.is_remote)
        for prop in self.required_props:
            if prop not in kwargs:
                raise ValueError("Missing required property '%s'" % prop)
            setattr(op, prop, kwargs.get(prop))

        delegation_target = kwargs.get("delegation_target", None)
        if delegation_target:
            setattr(op, "delegation_target", delegation_target)

        metadata = kwargs.get("metadata", None)
        if metadata:
            setattr(op, "metadata", metadata)
        else:
            setattr(op, "metadata", {})

        context = None
        if isinstance(op.context, dict):
            context = ExecutionContext(
                request_params=op.context.get("request_params", {})
            )
        elif isinstance(op.context, ExecutionContext):
            context = op.context
        if not op.dataset_id:
            # For consistency, set the dataset_id using the
            # ExecutionContext.dataset
            # rather than calling load_dataset() on a potentially stale
            # dataset_name in the request_params
            try:
                op.dataset_id = context.dataset._doc.id
            except:
                # If we can't resolve the dataset_id, it is possible the
                # dataset doesn't exist (deleted/being created). However,
                # it's also possible that future operators can run
                # dataset-less, so don't raise an error here and just log it
                # in case we need to debug later.
                logger.debug("Could not resolve dataset_id for operation. ")
        elif op.dataset_id:
            # If the dataset_id is provided, we set it in the request_params
            # to ensure that the operation is executed on the correct dataset
            context.request_params["dataset_id"] = str(op.dataset_id)
            context.request_params["dataset_name"] = context.dataset.name

        op.context = context
        doc = self._collection.insert_one(op.to_pymongo())
        op.id = doc.inserted_id
        return DelegatedOperationDocument().from_pymongo(op.__dict__)

    def set_pinned(
        self, _id: ObjectId, pinned: bool = True
    ) -> DelegatedOperationDocument:
        doc = self._collection.find_one_and_update(
            filter={"_id": _id},
            update={"$set": {"pinned": pinned}},
            return_document=pymongo.ReturnDocument.AFTER,
        )
        return DelegatedOperationDocument().from_pymongo(doc)

    def set_label(
        self, _id: ObjectId, label: str
    ) -> DelegatedOperationDocument:
        doc = self._collection.find_one_and_update(
            filter={"_id": _id},
            update={"$set": {"label": label}},
            return_document=pymongo.ReturnDocument.AFTER,
        )
        return DelegatedOperationDocument().from_pymongo(doc)

    def set_log_upload_error(
        self, _id: ObjectId, log_upload_error: str
    ) -> DelegatedOperationDocument:
        doc = self._collection.find_one_and_update(
            filter={"_id": _id},
            update={"$set": {"log_upload_error": log_upload_error}},
            return_document=pymongo.ReturnDocument.AFTER,
        )
        return DelegatedOperationDocument().from_pymongo(doc)

    def update_run_state(
        self,
        _id: ObjectId,
        run_state: ExecutionRunState,
        result: ExecutionResult = None,
        run_link: str = None,
        log_path: str = None,
        progress: ExecutionProgress = None,
        required_state: ExecutionRunState = None,
    ) -> DelegatedOperationDocument:
        update = None

        execution_result = result
        if result is not None and not isinstance(result, ExecutionResult):
            execution_result = ExecutionResult(result=result)

        execution_result_json = (
            execution_result.to_json() if execution_result else None
        )
        outputs_schema = (
            execution_result_json.pop("outputs_schema", None)
            if execution_result_json
            else None
        )

        if run_state == ExecutionRunState.COMPLETED:
            update = {
                "$set": {
                    "run_state": run_state,
                    "completed_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                    "result": execution_result_json,
                }
            }

            if outputs_schema:
                update["$set"]["metadata.outputs_schema"] = (
                    outputs_schema or {}
                )

        elif run_state == ExecutionRunState.FAILED:
            update = {
                "$set": {
                    "run_state": run_state,
                    "failed_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                    "result": execution_result_json,
                }
            }
        elif run_state == ExecutionRunState.RUNNING:
            update = {
                "$set": {
                    "run_state": run_state,
                    "started_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                }
            }
        elif run_state == ExecutionRunState.SCHEDULED:
            update = {
                "$set": {
                    "run_state": run_state,
                    "scheduled_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                }
            }
        elif run_state == ExecutionRunState.QUEUED:
            update = {
                "$set": {
                    "run_state": run_state,
                    "queued_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                }
            }

        if run_link is not None:
            update["$set"]["run_link"] = run_link

        if log_path is not None:
            update["$set"]["log_path"] = log_path

        if update is None:
            raise ValueError("Invalid run_state: {}".format(run_state))

        if progress is not None:
            update["$set"]["status"] = progress
            update["$set"]["status"]["updated_at"] = datetime.utcnow()

        collection_filter = {"_id": _id}
        if required_state is not None:
            collection_filter["run_state"] = required_state

        doc = self._collection.find_one_and_update(
            filter=collection_filter,
            update=update,
            return_document=pymongo.ReturnDocument.AFTER,
        )

        return (
            DelegatedOperationDocument().from_pymongo(doc)
            if doc is not None
            else None
        )

    def update_progress(
        self,
        _id: ObjectId,
        progress: ExecutionProgress,
    ) -> DelegatedOperationDocument:
        execution_progress = progress
        if not isinstance(progress, ExecutionProgress):
            if isinstance(progress, dict):
                execution_progress = ExecutionProgress(**progress)
            else:
                raise ValueError("Invalid progress: {}".format(progress))

        if not execution_progress or (
            execution_progress.progress is None
            and not execution_progress.label
        ):
            raise ValueError("Invalid progress: {}".format(execution_progress))

        update = {
            "$set": {
                "status": {
                    "progress": execution_progress.progress,
                    "label": execution_progress.label,
                    "updated_at": datetime.utcnow(),
                },
            }
        }

        doc = self._collection.find_one_and_update(
            filter={"_id": _id},
            update=update,
            return_document=pymongo.ReturnDocument.AFTER,
        )

        return DelegatedOperationDocument().from_pymongo(doc)

    def get_queued_operations(
        self,
        operator: str = None,
        dataset_name: ObjectId = None,
    ) -> List[DelegatedOperationDocument]:
        return self.list_operations(
            operator=operator,
            dataset_name=dataset_name,
            run_state=ExecutionRunState.QUEUED,
        )

    def get_scheduled_operations(
        self,
        operator: str = None,
        dataset_name: ObjectId = None,
    ) -> List[DelegatedOperationDocument]:
        return self.list_operations(
            operator=operator,
            dataset_name=dataset_name,
            run_state=ExecutionRunState.SCHEDULED,
        )

    def get_running_operations(
        self,
        operator: str = None,
        dataset_name: ObjectId = None,
    ) -> List[DelegatedOperationDocument]:
        return self.list_operations(
            operator=operator,
            dataset_name=dataset_name,
            run_state=ExecutionRunState.RUNNING,
        )

    def list_operations(
        self,
        operator: str = None,
        dataset_name: str = None,
        dataset_id: ObjectId = None,
        run_state: ExecutionRunState = None,
        delegation_target: str = None,
        pinned: bool = None,
        paging: DelegatedOperationPagingParams = None,
        search: dict = None,
        **kwargs: Any,
    ) -> List[DelegatedOperationDocument]:
        query = {}
        if operator:
            query["operator"] = operator
        if pinned is not None:
            query["pinned"] = pinned
        if dataset_name:
            query["context.request_params.dataset_name"] = dataset_name
        if run_state:
            query["run_state"] = run_state
        if delegation_target:
            query["delegation_target"] = delegation_target
        if dataset_id:
            query["dataset_id"] = dataset_id

        for arg in kwargs:
            query[arg] = kwargs[arg]

        if paging is None:
            # force a limit of 1000 if no paging supplied
            paging = DelegatedOperationPagingParams(limit=1000)
        elif isinstance(paging, dict):
            paging = DelegatedOperationPagingParams(**paging)

        if search:
            query.update(self._extract_search_query(search))

        docs = self._collection.find(query)
        if paging.sort_by:
            docs = docs.sort(paging.sort_by, paging.sort_direction)
        if paging.skip:
            docs = docs.skip(paging.skip)
        if paging.limit:
            docs = docs.limit(paging.limit)

        return [DelegatedOperationDocument().from_pymongo(doc) for doc in docs]

    def delete_operation(self, _id: ObjectId) -> DelegatedOperationDocument:
        doc = self._collection.find_one_and_delete(
            filter={"_id": _id}, return_document=pymongo.ReturnDocument.BEFORE
        )
        if doc:
            return DelegatedOperationDocument().from_pymongo(doc)

    def delete_for_dataset(self, dataset_id: ObjectId):
        self._collection.delete_many(filter={"dataset_id": dataset_id})

    def get(self, _id: ObjectId) -> DelegatedOperationDocument:
        doc = self._collection.find_one(filter={"_id": _id})
        return DelegatedOperationDocument().from_pymongo(doc)

    def count(self, filters: dict = None, search: dict = None) -> int:
        if filters is None and search is not None:
            filters = {}
        query = filters

        if "dataset_name" in query:
            query["context.request_params.dataset_name"] = query[
                "dataset_name"
            ]
            del query["dataset_name"]
        if search:
            query.update(self._extract_search_query(search))

        return self._collection.count_documents(filter=query)

    def _extract_search_query(self, search):
        if search:
            or_query = {"$or": []}
            for term in search:
                for field in search[term]:
                    if field not in (
                        "operator",
                        "delegated_operation",
                        "label",
                    ):
                        raise ValueError(
                            "Invalid search field: {}".format(field)
                        )
                    or_query["$or"].append({field: {"$regex": term}})
            return or_query
