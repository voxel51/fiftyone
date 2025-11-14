"""
FiftyOne feature flag environment manager.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os

from .manager import FeatureManager


class EnvironmentFeatureManager(FeatureManager):
    """
    A :class:`FeatureManager` implementation which uses environment variables
    as feature flags.
    """

    def is_feature_enabled(self, feature: str) -> bool:
        return os.environ.get(self._to_env_var(feature)) is not None

    @staticmethod
    def _to_env_var(feature: str) -> str:
        return feature.replace("-", "_").upper()
