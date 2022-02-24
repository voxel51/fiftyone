"""
FiftyOne Teams data

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t

from dataclasses import dataclass


@dataclass
class Key:
    alg: str
    kty: str
    use: str
    n: str
    e: str
    kid: str
    x5t: str
    x5c: t.List[str]


@dataclass
class JWKS:
    keys: t.List[Key]
