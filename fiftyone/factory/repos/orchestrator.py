"""
FiftyOne orchestrator repository.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
from datetime import datetime
from typing import List, Any

from bson import ObjectId
import pymongo
from pymongo import IndexModel
from pymongo.collection import Collection

from fiftyone.factory import OrchestratorPagingParams
from fiftyone.factory.repos import OrchestratorDocument

logger = logging.getLogger(__name__)


class OrchestratorRepo:
    """Base class for an Orchestrator Repository"""

    def upsert(
        self,
        instance_id: str,
        description: str = None,
        available_operators: List[str] = None,
    ) -> OrchestratorDocument:
        raise NotImplementedError("subclass must implement upsert()")

    def get(
        self, instance_id: str = None, id: str = None
    ) -> OrchestratorDocument:
        raise NotImplementedError("subclass must implement get()")

    def deactivate(
        self, instance_id: str = None, id: str = None
    ) -> OrchestratorDocument:
        raise NotImplementedError("subclass must implement deactivate()")

    def count(self, filters: dict = None, search: dict = None) -> int:
        raise NotImplementedError("subclass must implement count()")

    def list(
        self,
        paging: OrchestratorPagingParams = None,
        search: dict = None,
        include_deactivated: bool = False,
        **kwargs: Any,
    ) -> List[OrchestratorDocument]:
        raise NotImplementedError("subclass must implement list()")

    def delete(
        self, instance_id: str = None, id: str = None
    ) -> OrchestratorDocument:
        raise NotImplementedError("subclass must implement delete()")


class MongoOrchestratorRepo(OrchestratorRepo):
    COLLECTION_NAME = "orchestrators"
    required_props = ["instance_id", "available_operators"]

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
        if "instance_id_1" not in index_names:
            indices_to_create.append(
                IndexModel(
                    [("instance_id", pymongo.ASCENDING)],
                    name="instance_id_1",
                )
            )
        if "updated_at_1" not in index_names:
            indices_to_create.append(
                IndexModel(
                    [("updated_at", pymongo.ASCENDING)], name="updated_at_1"
                )
            )

        if indices_to_create:
            self._collection.create_indexes(indices_to_create)

    def upsert(
        self,
        instance_id: str,
        description: str = None,
        available_operators: List[str] = None,
    ) -> OrchestratorDocument:
        """Creates or updates an orchestrator registration

        Args:
            instance_id: the instance identifier of the orchestrator. This must be unique to the DAG instance
                on the orchestrator
            description: the description of the orchestrator
            available_operators: the list of available operators on the orchestrator

        Returns:
            the :class:`OrchestratorDocument`
        """
        update = {
            "available_operators": available_operators,
            "description": description,
            "updated_at": datetime.utcnow(),
        }
        existing = self._collection.find_one({"instance_id": instance_id})
        if not existing:
            update["created_at"] = datetime.utcnow()
            update["instance_id"] = instance_id

        updated = self._collection.find_one_and_update(
            filter={"instance_id": instance_id},
            update={"$set": update},
            upsert=True,
            return_document=pymongo.ReturnDocument.AFTER,
        )
        return OrchestratorDocument().from_pymongo(updated)

    def get(
        self, instance_id: str = None, id: str = None
    ) -> OrchestratorDocument:
        """
        Get an orchestrator by instance identifier or identifier

        Args:
            instance_id: the instance identifier / name of the orchestrator
            id: the database identifier of the orchestrator

        Returns:
            the :class:`OrchestratorDocument`

        """
        if instance_id is None and id is None:
            raise ValueError("Must provide either instance_id or id")

        if instance_id is not None:
            doc = self._collection.find_one(
                filter={"instance_id": instance_id}
            )
            return OrchestratorDocument().from_pymongo(doc)

        _id = id
        # ensure the identifier is an object id
        if isinstance(_id, str):
            _id = ObjectId(_id)

        if not ObjectId.is_valid(_id):
            raise ValueError("id must be a valid ObjectId")

        doc = self._collection.find_one({"_id": _id})
        return OrchestratorDocument().from_pymongo(doc)

    def deactivate(
        self, instance_id: str = None, id: str = None
    ) -> OrchestratorDocument:
        """
        Deactivates an orchestrator by instance identifier or identifier

        Args:
            instance_id: the instance identifier / name of the orchestrator
            id: the database identifier of the orchestrator

        Returns:
            the :class:`OrchestratorDocument`

        """
        if instance_id is None and id is None:
            raise ValueError("Must provide either instance_id or id")

        if instance_id is not None:
            doc = self._collection.find_one_and_update(
                filter={"instance_id": instance_id},
                update={"$set": {"deactivated_at": datetime.utcnow()}},
                return_document=pymongo.ReturnDocument.AFTER,
            )
            return OrchestratorDocument().from_pymongo(doc)

        _id = id
        # ensure the identifier is an object id
        if isinstance(_id, str):
            _id = ObjectId(_id)

        if not ObjectId.is_valid(_id):
            raise ValueError("id must be a valid ObjectId")

        doc = self._collection.find_one_and_update(
            filter={"_id": _id},
            update={"$set": {"deactivated_at": datetime.utcnow()}},
            return_document=pymongo.ReturnDocument.AFTER,
        )
        return OrchestratorDocument().from_pymongo(doc)

    def count(self, filters: dict = None, search: dict = None) -> int:
        """
        Counts the orchestrators matching the given criteria.
        Args:
            filters:
            search:

        Returns:
            the number of matching documents
        """
        if filters is None:
            filters = {}
        if search is None:
            search = {}

        include_deactivated = filters.get("include_deactivated", False)

        query = self.build_query(search, include_deactivated)

        return self._collection.count_documents(query)

    def list(
        self,
        paging: OrchestratorPagingParams = None,
        search: dict = None,
        include_deactivated: bool = False,
        **kwargs: Any,
    ) -> List[OrchestratorDocument]:
        """
        Returns a list of orchestrators matching the given criteria.

        Args:
            paging: :class:`OrchestratorPagingParams`
            search: the search criteria
            include_deactivated: whether to include deactivated orchestrators
            **kwargs:

        Returns:
            a list of :class:`OrchestratorDocument`

        """

        if paging is None:
            paging = OrchestratorPagingParams()

        if search is None:
            search = {}

        query = self.build_query(search, include_deactivated)

        sort = [(paging.sort_by, paging.sort_direction)]
        docs = self._collection.find(
            query, sort=sort, skip=paging.skip, limit=paging.limit
        )
        return [OrchestratorDocument().from_pymongo(doc) for doc in docs]

    def build_query(self, search, include_deactivated: bool = False):
        query = {}
        for term in search:
            for field in search[term]:
                if field not in ("instance_id", "available_operators"):
                    raise ValueError("Invalid search field: {}".format(field))
                if field == "instance_id":
                    query[field] = {"$regex": term}
                if field == "available_operators":
                    query[field] = {"$regex": term}

        if not include_deactivated:
            # filter out any orchestrators where deactivated_at is not null
            query["deactivated_at"] = {"$exists": False}

        return query

    def delete(
        self, instance_id: str = None, id: str = None
    ) -> OrchestratorDocument:
        """
        Deletes an orchestrator by instance identifier or identifier
        Args:
            instance_id: the instance identifier / name of the orchestrator
            id: the database identifier of the orchestrator

        Returns:
            the :class:`OrchestratorDocument`

        """
        if instance_id is None and id is None:
            raise ValueError(
                "Must provide either instance_identifier or identifier"
            )

        if instance_id is not None:
            doc = self._collection.find_one_and_delete(
                filter={"instance_id": instance_id},
                return_document=pymongo.ReturnDocument.BEFORE,
            )

            return OrchestratorDocument().from_pymongo(doc)

        _id = id
        # ensure the identifier is an object id
        if isinstance(_id, str):
            _id = ObjectId(_id)

        if not ObjectId.is_valid(_id):
            raise ValueError("id must be a valid ObjectId")

        doc = self._collection.find_one_and_delete(
            filter={"_id": _id}, return_document=pymongo.ReturnDocument.BEFORE
        )
        return OrchestratorDocument().from_pymongo(doc)
