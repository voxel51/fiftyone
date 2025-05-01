"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import bz2
import codecs
import lzma
import lz4
import pickle
import zlib
from typing import Any, Union

import dill
import lz4.frame


def pickle_fn(value: Any) -> bytes:
    try:
        pickled = pickle.dumps(value)
    except Exception:  # pylint: disable=broad-except
        pickled = dill.dumps(value)
    return pickled


def pickle_decode_fn(value: bytes) -> Any:
    try:
        unpickled = pickle.loads(value)
    except Exception:  # pylint: disable=broad-except
        unpickled = dill.loads(value)

    return unpickled


def bz2_fn(value: bytes) -> bytes:
    return bz2.compress(value)


def bz2_decode_fn(value: bytes) -> bytes:
    return bz2.decompress(value)


def lzma_fn(value: bytes) -> bytes:
    return lzma.compress(value)


def lzma_decode_fn(value: bytes) -> bytes:
    return lzma.decompress(value)


def zlib_fn(value: bytes) -> bytes:
    return zlib.compress(value)


def zlib_decode_fn(value: bytes) -> bytes:
    return zlib.decompress(value)


def lz4_fn(value: bytes) -> bytes:
    return lz4.frame.compress(value)


def lz4_decode_fn(value: bytes) -> bytes:
    return lz4.frame.decompress(value)


def base64_fn(value: bytes) -> bytes:
    return codecs.encode(value, "base64")


def base64_decode_fn(value: bytes) -> bytes:
    return codecs.decode(value, "base64")


def str_fn(value: Union[bytes, str]) -> str:
    if not isinstance(value, bytes):
        return value
    return value if isinstance(value, str) else value.decode()


def str_decode_fn(value: str) -> bytes:
    if not isinstance(value, str):
        return value
    return value.encode()


encoding_registry = {
    "base64": (base64_fn, base64_decode_fn),
    "bz2": (bz2_fn, bz2_decode_fn),
    "lzma": (lzma_fn, lzma_decode_fn),
    "lz4": (lz4_fn, lz4_decode_fn),
    "pickle": (pickle_fn, pickle_decode_fn),
    "str": (str_fn, str_decode_fn),
    "zlib": (zlib_fn, zlib_decode_fn),
}


def encode(encoding: str, value: Any):
    try:
        return encoding_registry[encoding][0](value)
    except KeyError as e:
        raise ValueError(f"Invalid encoding '{encoding}'") from e


def decode(encoding: str, value: Any):
    try:
        return encoding_registry[encoding][1](value)
    except KeyError as e:
        raise ValueError(f"Invalid encoding '{encoding}'") from e


def apply_encoding(
    value: Any, content_encodings: list[str] = None
) -> Union[bytes, str]:
    if not content_encodings:
        content_encodings = []
    for encoding in content_encodings:
        try:
            value = encode(encoding, value)
        except KeyError:
            raise ValueError(f"Invalid encoding '{encoding}'")
    return value


def apply_decoding(
    value: Union[bytes, str], content_encodings: list[str] = None
) -> Any:
    if not content_encodings:
        content_encodings = []

    if isinstance(value, str):
        value = value.encode()

    for encoding in content_encodings[::-1]:
        try:
            value = decode(encoding, value)
        except KeyError:
            raise ValueError(f"Invalid encoding '{encoding}'")
    return value
