"""
Seekable, bounded reads over a byte-range fetcher.

The existing storage helpers are shaped for files this process can open: they
hand back whole files, which costs nothing on a disk and everything where
reaching a file is not free. This reads a range at a time instead, so a footer
or one row group costs its own bytes rather than the whole file's.

Buffering, seeking and read-ahead live here; how bytes are obtained is a
fetcher's business, so every caller sees one contract whatever is behind it.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import io
import logging
from typing import Optional

from fiftyone.core.storage.fetcher import Fetcher

logger = logging.getLogger(__name__)


class RangeReader(io.RawIOBase):
    """A seekable, read-only binary file object over an injected byte-range
    fetcher.

    Owns ONE implementation of buffering, seeking and read-ahead; how bytes are
    obtained is the fetcher's business (see :class:`Fetcher`). Nothing is
    written to disk and at most ``windows`` buffers are resident, so memory is
    bounded regardless of object size.

    Read-ahead is ALWAYS at least ``block_size``, however small the read that
    missed. ``index_block_size`` sizes only the opening probe of the summary
    at the file's tail.

    TWO windows, because an mcap is parsed from both ends and one window makes
    the head read evict the summary.

    Args:
        fetcher: a ``probe(tail) -> (total, data_start, data)`` /
            ``fetch(start, length) -> (data_start, data)`` provider
        block_size (4 MiB): read-ahead for a streaming read
        index_block_size (256 KiB): the opening probe of the summary section
            at the file's tail. Sized to hold a whole summary in one request —
            too small and it takes several, which is more round trips than the
            over-fetch it saves
        windows (2): how many fetched windows stay resident
    """

    def __init__(
        self,
        fetcher: "Fetcher",
        *,
        block_size: int = 4 * 1024 * 1024,
        index_block_size: int = 256 * 1024,
        windows: int = 2,
    ) -> None:
        super().__init__()
        self._fetcher = fetcher
        self._block = block_size
        # Never above the streaming block: a caller that asks for small reads
        # must not get MORE read-ahead on the index path than on the data path
        self._index_block = min(index_block_size, block_size)
        self._max_windows = max(1, windows)
        self._pos = 0
        #: ``[(start, data)]``, most recently used last
        self._windows = []
        self._size, seed_start, seed = fetcher.probe(self._index_block)
        # The probe's tail is not read-ahead on a guess: mcap opens by reading
        # the footer, so its first read is already resident
        if seed:
            self._windows.append((seed_start, seed))

    @property
    def stats(self) -> "tuple[int, int, float]":
        """``(requests, bytes, wait_s)`` — what this reader's fetching cost.
        Stays readable after the reader is closed/released."""
        f = self._fetcher
        return f.requests, f.bytes, f.wait_s

    # -- io.RawIOBase contract ------------------------------------------------

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def seek(self, offset: int, whence: int = io.SEEK_SET) -> int:
        if whence == io.SEEK_SET:
            target = offset
        elif whence == io.SEEK_CUR:
            target = self._pos + offset
        elif whence == io.SEEK_END:
            if self._size is None:
                raise OSError("cannot seek from end: object size unknown")
            target = self._size + offset
        else:
            raise ValueError(f"invalid whence {whence!r}")

        # A corrupt footer offset lands here; a negative position would go out
        # as a malformed Range header instead of an error.
        if target < 0:
            raise ValueError(f"negative seek position {target}")

        self._pos = target
        return self._pos

    def tell(self) -> int:
        return self._pos

    def readinto(self, b: bytearray) -> int:
        data = self.read(len(b))
        b[: len(data)] = data
        return len(data)

    def read(self, size: int = -1) -> bytes:
        if size is None or size < 0:
            size = (self._size - self._pos) if self._size is not None else -1
        if size == 0:
            return b""
        # The overwhelmingly common case — the request is a slice of a
        # resident window — returns that slice directly instead of paying
        # two copies through the accumulation path below
        if size > 0:
            piece = self._read_some(size)
            if len(piece) == size or not piece:
                return piece

        # Loop so a caller always gets the full request (or EOF), even if a
        # single fetch under-delivers
        out = bytearray(piece) if size > 0 else bytearray()
        remaining = (size - len(out)) if size and size > 0 else None
        while remaining is None or remaining > 0:
            piece = self._read_some(
                remaining if remaining is not None else self._block
            )
            if not piece:
                break
            out += piece
            if remaining is not None:
                remaining -= len(piece)
        return bytes(out)

    # -- range fetch + read-ahead cache --------------------------------------

    def _read_some(self, n: int) -> bytes:
        if self._size is not None:
            n = min(n, self._size - self._pos)
        if n <= 0:
            return b""

        # Any resident window that covers [pos, pos+n) answers without a request
        for i, (start, data) in enumerate(self._windows):
            if start <= self._pos and self._pos + n <= start + len(data):
                if i != len(self._windows) - 1:
                    self._windows.append(self._windows.pop(i))  # most recent

                off = self._pos - start
                out = data[off : off + n]
                self._pos += len(out)
                return out

        # ALWAYS at least one block. Measured on a real nuScenes scene (3
        # sampled camera topics): block read-ahead moved 497 MiB in 126
        # requests over 25.6s; request-sized/adaptive read-ahead moved the
        # SAME 473 MiB in 908 requests over 91.1s. The bytes are fixed by
        # the file — every sensor interleaves into shared compressed chunks,
        # so any scan traverses them all — and small read-ahead only
        # multiplies round trips over what the layout already costs
        fetch_len = max(n, self._block)
        if self._size is not None:
            fetch_len = min(fetch_len, self._size - self._pos)

        buf_start, data = self._fetcher.fetch(self._pos, fetch_len)
        self._windows.append((buf_start, data))
        del self._windows[: -self._max_windows]
        # A 200 (Range ignored) returns the whole object from 0, so the byte we
        # want lives at self._pos within it, not at 0
        off = self._pos - buf_start
        out = data[off : off + n]
        self._pos += len(out)
        return out

    def close(self) -> None:
        # mcap BORROWS this stream: SeekingReader.get_summary wraps it in a
        # short-lived StreamReader whose generator, when finalized, closes the
        # borrowed stream — before the chunk reads run. So close() must NOT
        # disable the reader; real teardown is release().
        pass

    def release(self) -> None:
        """Actually tear down: free the buffer and the fetcher's connections.
        Call once, after the mcap iteration is fully consumed."""
        self._windows.clear()
        try:
            self._fetcher.close()
        finally:
            super().close()
