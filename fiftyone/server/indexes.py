"""
FiftyOne Server indexes.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from enum import Enum
import typing as t

import strawberry as gql

from fiftyone.core.collections import SampleCollection

_FRAMES_SLICE = len(SampleCollection._FRAMES_PREFIX)


@gql.enum
class IndexType(Enum):
    asc = "asc"
    desc = "desc"
    sphere = "2dsphere"
    text = "text"


@gql.type
class IndexFields:
    field: str
    type: IndexType


@gql.type
class Index:
    name: str
    key: t.List[IndexFields]
    unique: t.Optional[bool] = False


def from_dict(d: t.Dict[str, t.Dict[str, t.Any]]):
    frame = {}
    sample = {}
    for k, v in d.items():
        if k.startswith(SampleCollection._FRAMES_PREFIX):
            frame[k[_FRAMES_SLICE:]] = v
        else:
            sample[k] = v

    return _from_dict(sample), _from_dict(frame)


def _from_dict(d: t.Dict[str, t.Dict[str, t.Any]]):
    indexes: t.List[Index] = []
    for name, index in d.items():
        key = [_index_key_from_dict(*field) for field in index["key"]]
        indexes.append(
            Index(name=name, unique=index.get("unique", False), key=key)
        )

    return indexes


def _index_key_from_dict(
    field: str,
    type_: t.Union[
        t.Literal[-1], t.Literal[1], t.Literal["2dsphere"], t.Literal["text"]
    ],
):
    if type_ == 1:
        type_ = "asc"
    elif type_ == -1:
        type_ = "desc"

    return IndexFields(field=field, type=type_)
