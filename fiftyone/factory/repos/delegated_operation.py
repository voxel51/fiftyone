"""
Dataset run documents.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import datetime

import pymongo
from bson import ObjectId
from pymongo.database import Database


class DelegatedOperation:
    def __init__(
        self,
        operator: str = None,
        delegation_target: str = None,
        dataset_id: ObjectId = None,
        context: dict = None,
        view_stages: list = None,
    ):
        self.operator = operator
        self.delegation_target = delegation_target
        self.dataset_id = dataset_id
        self.context = context
        self.view_stages = view_stages
        self.queued_at = datetime.now()
        self.triggered_at = None
        self.started_at = None
        self.completed_at = None
        self.failed_at = None
        self.run_state = "queued"
        self.error_message = None
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
        self.context = doc["context"] if "context" in doc else None
        self.view_stages = doc["view_stages"] if "view_stages" in doc else None
        self.triggered_at = (
            doc["triggered_at"] if "triggered_at" in doc else None
        )
        self.started_at = doc["started_at"] if "started_at" in doc else None
        self.completed_at = (
            doc["completed_at"] if "completed_at" in doc else None
        )
        self.failed_at = doc["failed_at"] if "failed_at" in doc else None
        self.error_message = (
            doc["error_message"] if "error_message" in doc else None
        )

        # internal fields
        self.id = doc["_id"]
        self._doc = doc

        return self

    def to_pymongo(self) -> dict:
        dict = self.__dict__
        dict.pop("_doc")
        dict.pop("id")
        return dict


class DelegatedOperationRepo(object):
    """Base Class for a delegated operation repository."""

    def queue_operation(
        self,
        operator: str,
        delegation_target: str = None,
        dataset_id: ObjectId = None,
        context: dict = None,
        view_stages: list = None,
    ) -> DelegatedOperation:
        """Queue an operation to be executed by a delegated operator."""
        raise NotImplementedError("subclass must implement queue_operation()")

    def update_run_state(
        self, _id: ObjectId, run_state: str, error: str = None
    ) -> DelegatedOperation:
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

    def delete_operation(self, _id: ObjectId) -> DelegatedOperation:
        """Delete an operation."""
        raise NotImplementedError("subclass must implement delete_operation()")

    def get(self, _id: ObjectId) -> DelegatedOperation:
        """Get an operation by id."""
        raise NotImplementedError("subclass must implement get()")


class MongoDelegatedOperationRepo(DelegatedOperationRepo):
    def __init__(self, db: Database):
        self._db = db
        self._collection = self._db["delegated_ops"]

    def queue_operation(
        self,
        operator: str,
        delegation_target: str = None,
        dataset_id: ObjectId = None,
        context: dict = None,
        view_stages: list = None,
    ) -> DelegatedOperation:

        op = DelegatedOperation(
            operator=operator,
            delegation_target=delegation_target,
            dataset_id=dataset_id,
            context=context,
            view_stages=view_stages,
        )

        doc = self._collection.insert_one(op.to_pymongo())
        op.id = doc.inserted_id
        return op

    def update_run_state(
        self, _id: ObjectId, run_state: str, error: str = None
    ) -> DelegatedOperation:

        update = None
        if run_state == "completed":
            update = {
                "$set": {
                    "run_state": run_state,
                    "completed_at": datetime.utcnow(),
                }
            }
        elif run_state == "failed":
            update = {
                "$set": {
                    "run_state": run_state,
                    "failed_at": datetime.utcnow(),
                    "error_message": error,
                }
            }
        elif run_state == "running":
            update = {
                "$set": {
                    "run_state": run_state,
                    "started_at": datetime.utcnow(),
                }
            }
        elif run_state == "triggered":
            update = {
                "$set": {
                    "run_state": run_state,
                    "triggered_at": datetime.utcnow(),
                }
            }

        if update is None:
            raise ValueError("Invalid run_state: {}".format(run_state))

        doc = self._collection.find_one_and_update(
            filter={"_id": _id},
            update=update,
            return_document=pymongo.ReturnDocument.AFTER,
        )

        return DelegatedOperation().from_pymongo(doc)

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
        return [DelegatedOperation().from_pymongo(doc) for doc in docs]

    def delete_operation(self, _id: ObjectId) -> DelegatedOperation:
        doc = self._collection.find_one_and_delete(
            filter={"_id": _id}, return_document=pymongo.ReturnDocument.BEFORE
        )
        return DelegatedOperation().from_pymongo(doc)

    def get(self, _id: ObjectId) -> DelegatedOperation:
        doc = self._collection.find_one(filter={"_id": _id})
        return DelegatedOperation().from_pymongo(doc)
