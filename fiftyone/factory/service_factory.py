"""
FiftyOne Server

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from fiftyone.factory.repo_factory import RepositoryFactory
from fiftyone.factory.services.delegated_operation import (
    DelegatedOperationService,
)


class ServiceFactory:

    services = {}

    @staticmethod
    def delegated_operation() -> DelegatedOperationService:
        if "delegated_op" not in ServiceFactory.services:
            ServiceFactory.services[
                "delegated_op"
            ] = DelegatedOperationService(
                repo=RepositoryFactory.delegated_operation_repo()
            )

        return ServiceFactory.services["delegated_op"]
