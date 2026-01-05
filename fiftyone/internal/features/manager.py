"""
FiftyOne feature flag managers.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc

from .flags import FeatureFlag


class FeatureManager(abc.ABC):
    """Abstract base class for managing features."""

    @abc.abstractmethod
    def is_feature_enabled(self, feature: FeatureFlag) -> bool:
        """Returns whether the specified feature is enabled.

        Args:
            feature: the feature identifier

        Returns:
            (bool): True if the feature is enabled, else False
        """
