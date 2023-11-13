"""
FiftyOne repository factory.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import pymongo
from pymongo.database import Database

import fiftyone as fo
import fiftyone.core.odm as foo
from fiftyone.factory.repos.delegated_operation import (
    DelegatedOperationRepo,
    MongoDelegatedOperationRepo,
)
from fiftyone.factory.repos.orchestrator import (
    OrchestratorRepo,
    MongoOrchestratorRepo,
)

db_client: pymongo.mongo_client.MongoClient = foo.get_db_client()
db: Database = db_client[fo.config.database_name]


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
                collection=db[MongoDelegatedOperationRepo.COLLECTION_NAME]
            )

        return RepositoryFactory.repos[
            MongoDelegatedOperationRepo.COLLECTION_NAME
        ]

    @staticmethod
    def orchestrator_repo() -> OrchestratorRepo:
        if (
            MongoOrchestratorRepo.COLLECTION_NAME
            not in RepositoryFactory.repos
        ):
            RepositoryFactory.repos[
                MongoOrchestratorRepo.COLLECTION_NAME
            ] = MongoOrchestratorRepo(
                collection=db[MongoOrchestratorRepo.COLLECTION_NAME]
            )

        return RepositoryFactory.repos[MongoOrchestratorRepo.COLLECTION_NAME]
