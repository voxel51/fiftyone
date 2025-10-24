"""
FiftyOne feature flag registry.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import get_args, List

from .environment_manager import EnvironmentFeatureManager
from .flags import FeatureFlag
from .manager import FeatureManager


class FeatureRegistry(FeatureManager):
    """Registry for tracking conditional features."""

    def __init__(self, feature_manager: FeatureManager):
        self._feature_manager = feature_manager
        self._known_features = get_args(FeatureFlag)

    def is_feature_enabled(self, feature: FeatureFlag) -> bool:
        return (
            feature in self._known_features
            and self._feature_manager.is_feature_enabled(feature)
        )


_registry = FeatureRegistry(EnvironmentFeatureManager())


def list_enabled_features() -> List[FeatureFlag]:
    """List the enabled features.

    Returns:
        List of enabled features
    """
    return [
        feature
        for feature in _registry._known_features
        if is_feature_enabled(feature)
    ]


def get_feature_manager() -> FeatureManager:
    """Get the default feature manager.

    Returns:
        :class:`FeatureManager` instance
    """
    return _registry


def is_feature_enabled(feature: FeatureFlag) -> bool:
    """Return whether the specified feature is enabled.

    This is a convenience method which leverages the default feature manager.

    Args:
        feature: the feature name

    Returns
        True if the feature is enabled, else False
    """
    return get_feature_manager().is_feature_enabled(feature)
