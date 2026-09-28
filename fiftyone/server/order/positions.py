"""
FiftyOne Server order positions and tokens.

Positions and tokens are opaque to clients: base64 BSON, so sort values keep
their types (dates, ids, ``"1"`` against ``1``).

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import base64
import binascii
from dataclasses import dataclass
import typing as t
import zlib

import bson

from fiftyone.server.order.backend import BadPosition, OrderExpired, OrderSpec

ITEM = "i"
GAP = "g"
START = "s"

TOKEN_VERSION = 1


@dataclass(frozen=True)
class Key:
    """A place in the order. ``ITEM`` is a sample; ``GAP`` is the place just
    before the sample, so a forward page from it starts at that sample;
    ``START`` is the start of the order."""

    kind: str
    rank: int
    id: t.Any
    segment: int = 1
    value: t.Any = None


def _encode(doc: dict, compress: bool = False) -> str:
    raw = bson.encode(doc)
    if compress:
        raw = zlib.compress(raw)
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _decode(value: str, compress: bool = False) -> dict:
    padded = value + "=" * (-len(value) % 4)
    raw = base64.urlsafe_b64decode(padded.encode())
    if compress:
        raw = zlib.decompress(raw)
    return bson.decode(raw)


def encode_key(key: Key) -> str:
    return _encode(
        {
            "k": key.kind,
            "r": key.rank,
            "i": key.id,
            "s": key.segment,
            "v": key.value,
        }
    )


def decode_key(position: str) -> Key:
    try:
        d = _decode(position)
        key = Key(
            kind=d["k"],
            rank=int(d["r"]),
            id=d["i"],
            segment=int(d["s"]),
            value=d.get("v"),
        )
    except (
        binascii.Error,
        bson.errors.BSONError,
        KeyError,
        TypeError,
        ValueError,
    ) as err:
        raise BadPosition("invalid position") from err

    if key.kind not in (ITEM, GAP, START) or key.segment not in (0, 1):
        raise BadPosition("invalid position")

    return key


def encode_token(spec: OrderSpec, version: str) -> str:
    return _encode(
        {"t": TOKEN_VERSION, "spec": spec.to_dict(), "ver": version},
        compress=True,
    )


def decode_token(token: str) -> t.Tuple[OrderSpec, str]:
    try:
        d = _decode(token, compress=True)
        if d.get("t") != TOKEN_VERSION:
            raise OrderExpired("order token is from another version")

        return OrderSpec.from_dict(d["spec"]), d["ver"]
    except OrderExpired:
        raise
    except (
        binascii.Error,
        bson.errors.BSONError,
        zlib.error,
        KeyError,
        TypeError,
        ValueError,
    ) as err:
        raise OrderExpired("invalid order token") from err
