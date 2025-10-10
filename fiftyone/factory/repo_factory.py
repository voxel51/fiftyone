"""
FiftyOne repository factory.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Optional

from bson import ObjectId
from pymongo.database import Database

import fiftyone.core.odm as foo
from fiftyone.factory.repos.delegated_operation import (
    DelegatedOperationRepo,
    MongoDelegatedOperationRepo,
)
from fiftyone.factory.repos.execution_store import (
    ExecutionStoreRepo,
    MongoExecutionStoreRepo,
)
from fiftyone.operators.store.notification_service import (
    ChangeStreamNotificationService,
)

_db: Database = None


def _get_db():
    global _db
    if _db is None:
        _db = foo.get_db_conn()
    return _db


class RepositoryFactory(object):
    repos = {}

    @staticmethod
    def delegated_operation_repo() -> DelegatedOperationRepo:
        if (
            MongoDelegatedOperationRepo.COLLECTION_NAME
            not in RepositoryFactory.repos
        ):
            RepositoryFactory.repos[
                MongoDelegatedOperationRepo.COLLECTION_NAME
            ] = MongoDelegatedOperationRepo(
                collection=_get_db()[
                    MongoDelegatedOperationRepo.COLLECTION_NAME
                ]
            )

        return RepositoryFactory.repos[
            MongoDelegatedOperationRepo.COLLECTION_NAME
        ]

    @staticmethod
    def execution_store_repo(
        dataset_id: Optional[ObjectId] = None,
        collection_name: Optional[str] = None,
        notification_service: Optional[ChangeStreamNotificationService] = None,
    ) -> ExecutionStoreRepo:
        final_collection_name = (
            collection_name
            if collection_name
            else MongoExecutionStoreRepo.COLLECTION_NAME
        )
        es_repo_key = f"{final_collection_name}-{dataset_id}"

        if es_repo_key not in RepositoryFactory.repos:
            RepositoryFactory.repos[es_repo_key] = MongoExecutionStoreRepo(
                collection=_get_db()[final_collection_name],
                dataset_id=dataset_id,
                notification_service=notification_service,
            )

        return RepositoryFactory.repos[es_repo_key]
