"""
FiftyOne Server indexes.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from enum import Enum
import typing as t

import strawberry as gql

from fiftyone.core.collections import SampleCollection


_FRAMES_SLICE = len(SampleCollection._FRAMES_PREFIX)
_WILDCARD_PROJECTION = "wildcardProjection"


@gql.enum
class IndexType(Enum):
    asc = "asc"
    desc = "desc"


@gql.type
class IndexFields:
    field: str
    type: IndexType


@gql.type
class WildcardProjection:
    fields: t.List[str]
    inclusion: bool


@gql.type
class Index:
    name: str
    key: t.List[IndexFields]
    unique: t.Optional[bool] = False
    wildcard_projection: t.Optional[WildcardProjection] = None


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
        if index.get("in_progress", False):
            continue

        key = [_index_key_from_dict(*field) for field in index["key"]]
        if None in key:
            continue

        wildcard_projection = None
        # if a global '$**' wildcard index is present, specific fields may be
        # defined
        # https://www.mongodb.com/docs/manual/core/indexes/index-types/index-wildcard/create-wildcard-index-multiple-fields/#restrictions
        if _WILDCARD_PROJECTION in index:
            wildcard_projection = WildcardProjection(
                fields=sorted([f for f in index[_WILDCARD_PROJECTION]]),
                inclusion=set(index[_WILDCARD_PROJECTION].values()).pop() > 0,
            )

        indexes.append(
            Index(
                name=name,
                unique=index.get("unique", False),
                key=key,
                wildcard_projection=wildcard_projection,
            )
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
    else:
        # ignore 2dsphere/text keys
        return None

    return IndexFields(field=field, type=type_)
