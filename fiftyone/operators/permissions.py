"""
FiftyOne operator permissions.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from .registry import OperatorRegistry


class ManagedOperators(object):
    def __init__(self, managed_operators=None):
        self.managed_operators = managed_operators

    def has_operator(self, operator_uri):
        return True

    @classmethod
    async def for_request(cls, request, dataset_ids=None):
        return cls()


class PermissionedOperatorRegistry(OperatorRegistry):
    def __init__(self, managed_operators):
        self.managed_operators = managed_operators
        super().__init__()

    def can_execute(self, operator_uri):
        return self.managed_operators.has_operator(operator_uri)

    @classmethod
    async def from_list_request(cls, request, dataset_ids=None):
        return PermissionedOperatorRegistry(
            await ManagedOperators.for_request(
                request, dataset_ids=dataset_ids
            ),
        )

    @classmethod
    async def from_exec_request(cls, request, dataset_ids=None):
        return PermissionedOperatorRegistry(
            await ManagedOperators.for_request(
                request, dataset_ids=dataset_ids
            ),
        )
