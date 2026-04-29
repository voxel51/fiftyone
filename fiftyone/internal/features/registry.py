"""
FiftyOne feature flag registry.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import functools
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


def require_feature(feature: FeatureFlag):
    """Decorator that gates a callable behind a feature flag.

    Raises ``RuntimeError`` when the flag is disabled, naming the flag so
    users know which env var to set.

    Args:
        feature: the feature name

    Example::

        @require_feature("VFF_ONTOLOGY_CA")
        def create_ontology(ontology):
            ontology.save()
    """

    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            if not is_feature_enabled(feature):
                raise RuntimeError(
                    f"This feature is gated behind the {feature} feature "
                    f"flag; set the {feature} env var to enable"
                )
            return func(*args, **kwargs)

        return wrapper

    return decorator
