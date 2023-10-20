"""
FiftyOne delegated operation repository.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import datetime
from typing import Any, List

from bson import ObjectId
import pymongo
from pymongo import IndexModel
from pymongo.collection import Collection

import fiftyone.core.dataset as fod
from fiftyone.factory import DelegatedOperationPagingParams
from fiftyone.factory.repos import DelegatedOperationDocument
from fiftyone.operators import OperatorRegistry
from fiftyone.operators.executor import ExecutionResult, ExecutionRunState


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

    def get_queued_operations(
        self, operator: str = None, dataset_name=None
    ) -> List[DelegatedOperationDocument]:
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
        raise NotImplementedError("subclass must implement toggle_pinned()")

    def get(self, _id: ObjectId) -> DelegatedOperationDocument:
        """Get an operation by id."""
        raise NotImplementedError("subclass must implement get()")

    def count(self, filters: dict = None, search: dict = None) -> int:
        """Count all operations."""
        raise NotImplementedError("subclass must implement count()")


class MongoDelegatedOperationRepo(DelegatedOperationRepo):
    COLLECTION_NAME = "delegated_ops"

    required_props = ["operator", "delegation_target", "context"]

    def __init__(self, collection: Collection = None):
        self._collection = (
            collection if collection is not None else self._get_collection()
        )

        self._create_indexes()

    def _get_collection(self) -> Collection:
        import fiftyone.core.odm as foo
        import fiftyone as fo

        db_client: pymongo.mongo_client.MongoClient = foo.get_db_client()
        database = db_client[fo.config.database_name]
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

        if indices_to_create:
            self._collection.create_indexes(indices_to_create)

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
                    "updated_at": datetime.utcnow(),
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
                    "updated_at": datetime.utcnow(),
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
                    "updated_at": datetime.utcnow(),
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
    ) -> List[DelegatedOperationDocument]:
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
            for term in search:
                for field in search[term]:
                    if field not in ("operator", "delegated_operation"):
                        raise ValueError(
                            "Invalid search field: {}".format(field)
                        )
                    query[field] = {"$regex": term}

        docs = self._collection.find(query)
        if paging.sort_by:
            docs = docs.sort(paging.sort_by, paging.sort_direction)
        if paging.skip:
            docs = docs.skip(paging.skip)
        if paging.limit:
            docs = docs.limit(paging.limit)

        registry = OperatorRegistry()
        return [
            DelegatedOperationDocument().from_pymongo(doc, registry=registry)
            for doc in docs
        ]

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
        if search:
            for term in search:
                for field in search[term]:
                    if field not in ("operator", "delegated_operation"):
                        raise ValueError(
                            "Invalid search field: {}".format(field)
                        )
                    filters[field] = {"$regex": term}

        return self._collection.count_documents(filter=filters)
