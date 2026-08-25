"""Bounded bridges from synchronous producers to ASGI response bodies.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import queue
import threading


_END = object()


class StreamingBridge:
    """Provides a synchronous sink and an asynchronous byte iterator.

    The bounded queue applies backpressure to the producer. Closing an
    unfinished iterator cancels blocked and future writes.

    Args:
        chunk_size (262144): maximum emitted chunk size in bytes
        max_chunks (8): maximum number of queued chunks
        on_bytes_written (None): optional callback receiving total bytes
            accepted from the producer
    """

    def __init__(
        self,
        chunk_size=256 * 1024,
        max_chunks=8,
        on_bytes_written=None,
    ):
        if chunk_size <= 0:
            raise ValueError("chunk_size must be positive")
        if max_chunks <= 0:
            raise ValueError("max_chunks must be positive")
        self._queue = queue.Queue(maxsize=max_chunks)
        self._cancelled = threading.Event()
        self._producer_done = threading.Event()
        self._consumer_done = threading.Event()
        self._error = None
        self.sink = StreamingSink(
            self, chunk_size, on_bytes_written=on_bytes_written
        )

    @property
    def bytes_written(self):
        """Returns the number of bytes accepted from the producer."""

        return self.sink.tell()

    @property
    def cancelled(self):
        """Returns whether the consumer canceled the bridge."""

        return self._cancelled.is_set()

    def finish(self):
        """Flushes buffered bytes and cleanly finishes the iterator."""

        if self._producer_done.is_set():
            return
        self.sink.flush()
        self._put(_END)
        self._producer_done.set()

    def abort(self, error):
        """Aborts the iterator with a producer failure."""

        if self._producer_done.is_set():
            return
        self._error = error
        self._cancelled.set()
        self._discard_queued()
        self._put_terminal()
        self._producer_done.set()

    def cancel(self):
        """Cancels producer writes after consumer disconnection."""

        if self._consumer_done.is_set():
            return
        self._cancelled.set()
        self._discard_queued()
        self._put_terminal()
        self._producer_done.set()
        self._consumer_done.set()

    def wait(self, timeout=None):
        """Blocks until the consumer finishes or disconnects."""

        return self._consumer_done.wait(timeout=timeout)

    async def __aiter__(self):
        try:
            while True:
                item = await asyncio.to_thread(self._queue.get)
                if item is _END:
                    self._consumer_done.set()
                    if self._error is not None:
                        raise self._error
                    return
                yield item
        finally:
            if not self._consumer_done.is_set():
                self.cancel()

    def _put(self, item):
        while True:
            if self._cancelled.is_set():
                raise StreamingBridgeClosed("Streaming consumer disconnected")
            try:
                self._queue.put(item, timeout=0.1)
                return
            except queue.Full:
                continue

    def _discard_queued(self):
        while True:
            try:
                self._queue.get_nowait()
            except queue.Empty:
                return

    def _put_terminal(self):
        while True:
            try:
                self._queue.put_nowait(_END)
                return
            except queue.Full:
                self._discard_queued()


class StreamingSink:
    """Non-seekable synchronous binary sink owned by a streaming bridge."""

    def __init__(self, bridge, chunk_size, on_bytes_written=None):
        self._bridge = bridge
        self._chunk_size = chunk_size
        self._on_bytes_written = on_bytes_written
        self._buffer = bytearray()
        self._position = 0

    def writable(self):
        """Returns ``True`` because the sink accepts binary writes."""

        return True

    def seekable(self):
        """Returns ``False`` because streamed output cannot be rewound."""

        return False

    def tell(self):
        """Returns the total number of accepted bytes."""

        return self._position

    def write(self, value):
        """Writes bytes, blocking while the bounded queue is full."""

        data = memoryview(value)
        total = len(data)
        offset = 0
        initial_position = self._position
        try:
            while offset < total:
                available = self._chunk_size - len(self._buffer)
                length = min(available, total - offset)
                self._buffer.extend(data[offset : offset + length])
                offset += length
                self._position += length
                if len(self._buffer) == self._chunk_size:
                    self._emit_buffer()
        finally:
            if (
                self._on_bytes_written is not None
                and self._position != initial_position
            ):
                self._on_bytes_written(self._position)
        return total

    def flush(self):
        """Emits any coalesced partial chunk."""

        if self._buffer:
            self._emit_buffer()

    def _emit_buffer(self):
        chunk = bytes(self._buffer)
        self._bridge._put(chunk)
        self._buffer.clear()


class StreamingBridgeClosed(BrokenPipeError):
    """Raised in a producer after its streaming consumer disconnects."""
