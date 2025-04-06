"""
FiftyOne operator permissions.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from .registry import OperatorRegistry
from fiftyone.plugins.permissions import ManagedOperators, ManagedPlugins
from fiftyone.plugins.managed import build_managed_plugin_contexts


# NOTE: if you are resolving a merge conflict
# fiftyone-teams: ManagedOperators class is defined in fiftyone.plugins.permissions
# fiftyone: ManagedOperators polyfilled here


class PermissionedOperatorRegistry(OperatorRegistry):
    def __init__(self, managed_operators, managed_plugins):
        self.managed_operators = managed_operators
        self.managed_plugins = managed_plugins
        super().__init__()

    def _build_plugin_contexts(self):
        return build_managed_plugin_contexts(
            self._enabled,
            self.managed_plugins,
        )

    def can_execute(self, operator_uri):
        return self.managed_operators.has_operator(operator_uri)

    @classmethod
    async def from_list_request(cls, request, dataset_ids=None):
        return PermissionedOperatorRegistry(
            await ManagedOperators.for_request(
                request, dataset_ids=dataset_ids
            ),
            await ManagedPlugins.for_request(request),
        )

    @classmethod
    async def from_exec_request(cls, request, dataset_ids=None):
        return PermissionedOperatorRegistry(
            await ManagedOperators.for_request(
                request, dataset_ids=dataset_ids
            ),
            await ManagedOperators.for_request(request),
        )
