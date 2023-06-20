"""
FiftyOne Server

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from fiftyone.factory.repo_factory import RepositoryFactory
from fiftyone.operators.delegated import DelegatedOperation


class ServiceFactory:

    services = {}

    @staticmethod
    def delegated_operation() -> DelegatedOperation:
        if "delegated_op" not in ServiceFactory.services:
            ServiceFactory.services["delegated_op"] = DelegatedOperation(
                repo=RepositoryFactory.delegated_operation_repo()
            )

        return ServiceFactory.services["delegated_op"]
