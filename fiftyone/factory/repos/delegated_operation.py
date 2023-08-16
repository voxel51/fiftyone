"""
FiftyOne Delegated Operation Repository
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import datetime
from typing import Any, List

import pymongo
from bson import ObjectId
from pymongo.collection import Collection

from fiftyone.factory import (
    DelegatedOpPagingParams,
    SortByField,
    SortDirection,
)
from fiftyone.factory.repos import DelegatedOperationDocument
from fiftyone.operators.executor import ExecutionResult, ExecutionRunState
import fiftyone.core.dataset as fod


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
    ) -> DelegatedOperationDocument:
        """Update the run state of an operation."""
        raise NotImplementedError("subclass must implement update_run_state()")

    def get_queued_operations(self, operator: str = None, dataset_name=None):
        """Get all queued operations."""
        raise NotImplementedError(
            "subclass must implement get_queued_operations()"
        )

    def list_operations(
        self,
        operator: str = None,
        dataset_name: str = None,
        dataset_id: ObjectId = None,
        run_state: ExecutionRunState = None,
        delegation_target: str = None,
        run_by: str = None,
        paging: DelegatedOpPagingParams = None,
        search: dict = None,
        pinned: bool = None,
        **kwargs: Any,
    ):
        """List all operations."""
        raise NotImplementedError("subclass must implement list_operations()")

    def delete_operation(self, _id: ObjectId) -> DelegatedOperationDocument:
        """Delete an operation."""
        raise NotImplementedError("subclass must implement delete_operation()")

    def delete_for_dataset(
        self, dataset_id: ObjectId
    ) -> List[DelegatedOperationDocument]:
        """Delete an operation."""
        raise NotImplementedError("subclass must implement delete_operation()")

    def set_pinned(
        self, _id: ObjectId, pinned: bool = True
    ) -> DelegatedOperationDocument:
        """Sets the pinned flag on / off."""
        raise NotImplementedError("subclass must implement toggle_pinned()")

    def get(self, _id: ObjectId) -> DelegatedOperationDocument:
        """Get an operation by id."""
        raise NotImplementedError("subclass must implement get()")

    def count(self, filters, search) -> int:
        """Count all operations."""
        raise NotImplementedError("subclass must implement count()")


class MongoDelegatedOperationRepo(DelegatedOperationRepo):
    COLLECTION_NAME = "delegated_ops"

    required_props = ["operator", "delegation_target", "context"]

    def __init__(self, collection: Collection = None):
        self._collection = (
            collection if collection is not None else self._get_collection()
        )

    def _get_collection(self) -> Collection:
        import fiftyone.core.odm as foo
        import fiftyone as fo

        db_client: pymongo.mongo_client.MongoClient = foo.get_db_client()
        database = db_client[fo.config.database_name]
        return database[self.COLLECTION_NAME]

    def queue_operation(self, **kwargs: Any) -> DelegatedOperationDocument:
        op = DelegatedOperationDocument()
        for prop in self.required_props:
            if prop not in kwargs:
                raise ValueError("Missing required property '%s'" % prop)
            setattr(op, prop, kwargs.get(prop))

        dataset_name = None
        if isinstance(op.context, dict):
            dataset_name = op.context.get("request_params", {}).get(
                "dataset_name"
            )
        elif "dataset_name" in op.context.request_params:
            dataset_name = op.context.request_params["dataset_name"]

        if dataset_name and not op.dataset_id:
            dataset = fod.load_dataset(dataset_name)
            op.dataset_id = dataset._doc.id

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

    def update_run_state(
        self,
        _id: ObjectId,
        run_state: ExecutionRunState,
        result: ExecutionResult = None,
    ) -> DelegatedOperationDocument:

        update = None

        execution_result = result
        if result is not None and not isinstance(result, ExecutionResult):
            execution_result = ExecutionResult(result=result)

        if run_state == ExecutionRunState.COMPLETED:
            update = {
                "$set": {
                    "run_state": run_state,
                    "completed_at": datetime.utcnow(),
                    "result": execution_result.to_json()
                    if execution_result
                    else None,
                }
            }
        elif run_state == ExecutionRunState.FAILED:
            update = {
                "$set": {
                    "run_state": run_state,
                    "failed_at": datetime.utcnow(),
                    "result": execution_result.to_json()
                    if execution_result
                    else None,
                }
            }
        elif run_state == ExecutionRunState.RUNNING:
            update = {
                "$set": {
                    "run_state": run_state,
                    "started_at": datetime.utcnow(),
                }
            }

        if update is None:
            raise ValueError("Invalid run_state: {}".format(run_state))

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
    ):
        return self.list_operations(
            operator=operator,
            dataset_name=dataset_name,
            run_state=ExecutionRunState.QUEUED,
        )

    def list_operations(
        self,
        operator: str = None,
        dataset_name: str = None,
        dataset_id: ObjectId = None,
        run_state: ExecutionRunState = None,
        delegation_target: str = None,
        run_by: str = None,
        pinned: bool = None,
        paging: DelegatedOpPagingParams = None,
        search: dict = None,
        **kwargs: Any,
    ):
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
        if run_by:
            query["context.user"] = run_by
        if dataset_id:
            query["dataset_id"] = dataset_id

        for arg in kwargs:
            query[arg] = kwargs[arg]

        if not paging:
            paging = DelegatedOpPagingParams(limit=1000)

        if isinstance(paging, dict):
            paging = DelegatedOpPagingParams(**paging)

        if not isinstance(paging.sort_by, SortByField):
            paging.sort_by = SortByField(paging.sort_by)

        if not isinstance(paging.sort_direction, SortDirection):
            paging.sort_direction = SortDirection(paging.sort_direction)

        if search:
            for term in search:
                for field in search[term]:
                    if field not in ["operator", "delegated_operation"]:
                        raise ValueError(
                            "Invalid search field: {}".format(field)
                        )
                    query[field] = {"$regex": term}

        if paging:
            docs = (
                self._collection.find(query)
                .skip(paging.skip)
                .limit(paging.limit)
                .sort(paging.sort_by.value, paging.sort_direction.value)
            )
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

    def count(self, filters=None, search=None) -> int:
        if filters is None and search is not None:
            filters = {}

        query = filters

        if "dataset_name" in query:
            query["context.request_params.dataset_name"] = query[
                "dataset_name"
            ]
            del query["dataset_name"]
        if "run_by" in query:
            query["context.user"] = query["run_by"]
            del query["run_by"]

        if search:
            for term in search:
                for field in search[term]:
                    if field not in ["operator", "delegated_operation"]:
                        raise ValueError(
                            "Invalid search field: {}".format(field)
                        )
                    query[field] = {"$regex": term}

        return self._collection.count_documents(filter=query)
