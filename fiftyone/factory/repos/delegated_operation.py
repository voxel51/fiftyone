"""
Delegated Operation Repository

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import datetime
from typing import TypeVar, Any

import pymongo
from bson import ObjectId
from pymongo.collection import Collection

from fiftyone.factory.repos import DelegatedOperationDocument
from fiftyone.operators.executor import ExecutionResult, ExecutionContext

T = TypeVar("T", bound="DelegatedOperationDocument")


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
        run_state: str,
        result: ExecutionResult = None,
    ) -> DelegatedOperationDocument:
        """Update the run state of an operation."""
        raise NotImplementedError("subclass must implement update_run_state()")

    def get_queued_operations(self, operator: str = None, dataset_id=None):
        """Get all queued operations."""
        raise NotImplementedError(
            "subclass must implement get_queued_operations()"
        )

    def list_operations(
        self,
        operator: str = None,
        dataset_id=None,
        run_state: str = None,
        delegation_target: str = None,
        **kwargs: Any,
    ):
        """List all operations."""
        raise NotImplementedError("subclass must implement list_operations()")

    def delete_operation(self, _id: ObjectId) -> DelegatedOperationDocument:
        """Delete an operation."""
        raise NotImplementedError("subclass must implement delete_operation()")

    def get(self, _id: ObjectId) -> DelegatedOperationDocument:
        """Get an operation by id."""
        raise NotImplementedError("subclass must implement get()")


class MongoDelegatedOperationRepo(DelegatedOperationRepo):
    COLLECTION_NAME = "delegated_ops"

    _props = ["operator", "delegation_target", "dataset_id", "context"]

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
        for prop in self._props:
            setattr(op, prop, kwargs.get(prop))

        doc = self._collection.insert_one(op.to_pymongo())
        op.id = doc.inserted_id
        return DelegatedOperationDocument().from_pymongo(op.__dict__)

    def update_run_state(
        self,
        _id: ObjectId,
        run_state: str,
        result: ExecutionResult = None,
    ) -> DelegatedOperationDocument:

        update = None

        if run_state == "completed":
            update = {
                "$set": {
                    "run_state": run_state,
                    "completed_at": datetime.utcnow(),
                    "result": result.to_json() if result else None,
                }
            }
        elif run_state == "failed":
            update = {
                "$set": {
                    "run_state": run_state,
                    "failed_at": datetime.utcnow(),
                    "result": result.to_json() if result else None,
                }
            }
        elif run_state == "running":
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

    def get_queued_operations(self, operator: str = None, dataset_id=None):
        return self.list_operations(
            operator=operator, dataset_id=dataset_id, run_state="queued"
        )

    def list_operations(
        self,
        operator: str = None,
        dataset_id=None,
        run_state: str = None,
        delegation_target: str = None,
        **kwargs: Any,
    ):
        query = {}
        for arg in kwargs:
            query[arg] = kwargs[arg]
        if operator:
            query["operator"] = operator
        if dataset_id:
            query["dataset_id"] = dataset_id
        if run_state:
            query["run_state"] = run_state
        if delegation_target:
            query["delegation_target"] = delegation_target

        for arg in kwargs:
            query[arg] = kwargs[arg]

        docs = self._collection.find(query)
        return [DelegatedOperationDocument().from_pymongo(doc) for doc in docs]

    def delete_operation(self, _id: ObjectId) -> DelegatedOperationDocument:
        doc = self._collection.find_one_and_delete(
            filter={"_id": _id}, return_document=pymongo.ReturnDocument.BEFORE
        )
        return DelegatedOperationDocument().from_pymongo(doc)

    def get(self, _id: ObjectId) -> DelegatedOperationDocument:
        doc = self._collection.find_one(filter={"_id": _id})
        return DelegatedOperationDocument().from_pymongo(doc)
