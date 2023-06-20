"""
Dataset run documents.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import datetime

import pymongo
from bson import ObjectId, json_util
from pymongo.collection import Collection
from fiftyone.operators.executor import ExecutionResult, ExecutionContext


class DelegatedOperationDocument(object):
    def __init__(
        self,
        operator: str = None,
        delegation_target: str = None,
        dataset_id: ObjectId = None,
        context: dict = None,
    ):
        self.operator = operator
        self.delegation_target = delegation_target
        self.dataset_id = dataset_id
        self.context = (
            context.__dict__
            if isinstance(context, ExecutionContext)
            else context
        )
        self.run_state = "queued"  # default to queued state on create
        self.queued_at = datetime.utcnow()
        self.started_at = None
        self.completed_at = None
        self.failed_at = None
        self.result = None
        self.id = None
        self._doc = None

    def from_pymongo(self, doc: dict):
        # required fields
        self.operator = doc["operator"]
        self.queued_at = doc["queued_at"]
        self.run_state = doc["run_state"]

        # optional fields
        self.delegation_target = (
            doc["delegation_target"] if "delegation_target" in doc else None
        )
        self.dataset_id = doc["dataset_id"] if "dataset_id" in doc else None
        self.started_at = doc["started_at"] if "started_at" in doc else None
        self.completed_at = (
            doc["completed_at"] if "completed_at" in doc else None
        )
        self.failed_at = doc["failed_at"] if "failed_at" in doc else None

        if "context" in doc and "request_params" in doc["context"]:
            self.context = (
                ExecutionContext(
                    request_params=doc["context"]["request_params"]
                )
                if "context" in doc
                else None
            )

        if "result" in doc and doc["result"] is not None:

            res = ExecutionResult()
            if "result" in doc["result"]:
                res.result = doc["result"]["result"]
            if "error" in doc["result"]:
                res.error = doc["result"]["error"]

            if res.result or res.error:
                self.result = res

        # internal fields
        self.id = doc["_id"]
        self._doc = doc

        return self

    def to_pymongo(self) -> dict:
        d = self.__dict__
        d.pop("_doc")
        d.pop("id")
        return d


class DelegatedOperationRepo(object):
    """Base Class for a delegated operation repository."""

    def queue_operation(
        self,
        operator: str,
        delegation_target: str = None,
        dataset_id: ObjectId = None,
        context: ExecutionContext = None,
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

    def queue_operation(
        self,
        operator: str,
        delegation_target: str = None,
        dataset_id: ObjectId = None,
        context: ExecutionContext = None,
    ) -> DelegatedOperationDocument:

        op = DelegatedOperationDocument(
            operator=operator,
            delegation_target=delegation_target,
            dataset_id=dataset_id,
            context=context,
        )

        doc = self._collection.insert_one(op.to_pymongo())
        op.id = doc.inserted_id
        return op

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
