"""
How one byte range of a file is obtained: the half of a ranged read that
depends on where the file lives.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import io
import time
from typing import Protocol, Tuple


class Fetcher(Protocol):
    """Obtains one range of a file's bytes; the half of a ranged read that
    depends on where the file is."""

    #: Read by :attr:`RangeReader.stats`, so part of the contract
    requests: int
    bytes: int
    wait_s: float

    def probe(self, tail: int) -> Tuple[int, int, bytes]:
        """``(total, start, data)`` for the file's last ``tail`` bytes."""

    def fetch(self, start: int, length: int) -> Tuple[int, bytes]:
        """``(start, data)`` for ``length`` bytes from ``start``."""

    def close(self) -> None:
        """Releases whatever obtaining bytes held open."""


class FileFetcher:
    """Byte ranges of a file this process can open directly."""

    def __init__(self, path: str) -> None:
        self.path = path
        self.requests = 0
        self.bytes = 0
        self.wait_s = 0.0

    def probe(self, tail: int) -> tuple[int, int, bytes]:
        started = time.perf_counter()
        with open(self.path, "rb") as handle:
            total = handle.seek(0, io.SEEK_END)
            start = max(0, total - tail)
            handle.seek(start)
            data = handle.read(total - start)

        self.wait_s += time.perf_counter() - started
        self.requests += 1
        self.bytes += len(data)
        return total, start, data

    def fetch(self, start: int, length: int) -> tuple[int, bytes]:
        started = time.perf_counter()
        with open(self.path, "rb") as handle:
            handle.seek(start)
            data = handle.read(length)

        self.wait_s += time.perf_counter() - started
        self.requests += 1
        self.bytes += len(data)
        return start, data

    def close(self) -> None:
        # Each read opens and closes its own handle
        pass
