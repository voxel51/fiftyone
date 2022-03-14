"""
FiftyOne Server state

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import dataclass
import typing as t

import fiftyone.core.state as fos


T = t.TypeVar("T")


@dataclass
class Event(t.Generic[T]):
    data: T


class Update(Event):
    data: fos.StateDescription


@dataclass
class CaptureData:
    pass


class Capture(Event):
    data: CaptureData
