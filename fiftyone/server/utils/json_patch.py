"""
Apply JSON patch to python objects.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc
import enum
import inspect
from typing import (
    Any,
    Callable,
    Generic,
    Iterable,
    Optional,
    TypeVar,
    Union,
    overload,
)

import jsonpointer


T = TypeVar("T")
V = TypeVar("V")
