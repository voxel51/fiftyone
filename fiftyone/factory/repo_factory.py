"""
FiftyOne repository factory.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from pymongo.database import Database

import fiftyone.core.odm as foo
from fiftyone.factory.repos.delegated_operation import (
    DelegatedOperationRepo,
    MongoDelegatedOperationRepo,
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
