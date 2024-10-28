"""
FiftyOne operator permissions.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from .registry import OperatorRegistry
from fiftyone.plugins.permissions import ManagedOperators


# NOTE: if you are resolving a merge conflict
# fiftyone-teams: ManagedOperators class is defined in fiftyone.plugins.permissions
# fiftyone: ManagedOperators polyfilled here


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
