"""
FiftyOne feature flags.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Literal


FeatureFlag = Literal[
    "VFF_DYNAMIC_GROUP_ANNOTATION",
    "VFF_MULTIMODAL",
]
"""Enumeration of active feature flags."""
