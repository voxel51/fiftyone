"""
FiftyOne delegated operations orchestrators.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
from datetime import datetime
from typing import List, Any
from fiftyone.factory.repo_factory import RepositoryFactory
from fiftyone.factory import OrchestratorPagingParams
from fiftyone.factory.repos import OrchestratorDocument
from fiftyone.factory.repos.orchestrator import OrchestratorRepo
from fiftyone.operators import OperatorRegistry

logger = logging.getLogger(__name__)


class OrchestratorService:
    """Service for managing Orchestrators which run delegated operations"""

    def __init__(self, repo: OrchestratorRepo = None):
        if repo is None:
            repo = RepositoryFactory.orchestrator_repo()
        self._repo = repo

    def register(
        self, instance_identifier: str, description: str
    ) -> OrchestratorDocument:
        """Registers a new orchestrator to run delegated operations

        Args:
            instance_identifier: the instance identifier of the orchestrator. This must be unique to the DAG instance
                on the orchestrator
            description: the description of the orchestrator

        Returns:
            the orchestrator document
        """
        available_operators = [
            x.uri for x in OperatorRegistry().list_operators()
        ]
        # get the plugins
        return self._repo.upsert(
            instance_identifier=instance_identifier,
            description=description,
            available_operators=available_operators,
        )

    def deactivate(
        self, instance_identifier: str = None, identifier: str = None
    ) -> OrchestratorDocument:
        """Deactivates an orchestrator

        Args:
            instance_identifier: the instance identifier / unique name of the orchestrator
            identifier: the database identifier of the orchestrator

        Returns:
            the orchestrator document
        """
        return self._repo.deactivate(instance_identifier, identifier)

    def get(
        self, instance_identifier: str = None, identifier: str = None
    ) -> OrchestratorDocument:
        """Gets an orchestrator

        Args:
            instance_identifier: the instance identifier / unique name of the orchestrator
            identifier: the database identifier of the orchestrator

        Returns:
            the orchestrator document
        """
        return self._repo.get(instance_identifier, identifier)

    def count(self, filters=None, search=None):
        """Counts the orchestrators matching the given criteria.

        Args:
            filters (None): a filter dict
            search (None): a search term dict

        Returns:
            the number of matching operations
        """
        return self._repo.count(filters=filters, search=search)

    def list(
        self,
        paging: OrchestratorPagingParams = None,
        search: dict = None,
        include_deactivated: bool = False,
        **kwargs: Any
    ) -> List[OrchestratorDocument]:
        """Returns a list of orchestrators matching the given criteria.

        Args:
            paging (None): an OrchestratorPagingParams instance
            search (None): a search term dict
            include_deactivated (False): whether to include deactivated orchestrators
            **kwargs: additional keyword arguments for the underlying list() method

        Returns:
            a list of OrchestratorDocument instances
        """
        return self._repo.list(
            paging=paging,
            search=search,
            include_deactivated=include_deactivated,
            **kwargs
        )

    def delete(
        self, instance_identifier: str = None, identifier: str = None
    ) -> OrchestratorDocument:
        """Deletes an orchestrator by instance identifier or identifier

        Args:
            instance_identifier: the instance identifier / name of the orchestrator
            identifier: the database identifier of the orchestrator

        Returns:
            the OrchestratorDocument
        """
        return self._repo.delete(instance_identifier, identifier)
