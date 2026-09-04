"""
How a range of one file's bytes is obtained.

The half of a ranged read that differs by where a file is. An installation
that can reach files this process cannot open supplies its own fetcher;
:class:`FileFetcher` covers the ones it can.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import io
import time
from typing import Protocol, Tuple


class Fetcher(Protocol):
    """How a range of one file's bytes is obtained.

    The half of a ranged read that differs by where the file is. An
    installation that can reach files this process cannot open supplies its
    own; :class:`FileFetcher` covers the ones it can.
    """

    def probe(self, tail: int) -> Tuple[int, int, bytes]:
        """``(total, start, data)`` for the file's last ``tail`` bytes."""

    def fetch(self, start: int, length: int) -> Tuple[int, bytes]:
        """``(start, data)`` for ``length`` bytes from ``start``."""


class FileFetcher:
    """Byte ranges from a file this process can open directly.

    The fetcher for files this process can open. Seeks are cheap here, but
    the reads stay bounded all the same: a caller that wanted the whole object
    would have asked for it.
    """

    def __init__(self, path: str) -> None:
        self.path = path
        #: Kept for parity with the remote fetcher, whose cost a caller cares
        #: about. A local read still counts, so one contract reports both.
        self.requests = 0
        self.bytes = 0
        self.wait_s = 0.0

    def probe(self, tail: int) -> tuple[int, int, bytes]:
        """``(total, start, data)`` for the file's last ``tail`` bytes."""
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
