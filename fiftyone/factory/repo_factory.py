"""
FiftyOne Server

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from fiftyone.factory.repos.delegated_operation import (
    DelegatedOperationRepo,
    MongoDelegatedOperationRepo,
)
import fiftyone.core.odm as foo
import fiftyone as fo

db_client = foo.get_db_client()
db = db_client[fo.config.database_name]


class RepositoryFactory:

    repos = {}

    @staticmethod
    def delegated_operation_repo() -> DelegatedOperationRepo:
        if "delegated_op" not in RepositoryFactory.repos:
            RepositoryFactory.repos[
                "delegated_op"
            ] = MongoDelegatedOperationRepo(db=db)

        return RepositoryFactory.repos["delegated_op"]
