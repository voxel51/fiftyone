"""Tests for synchronous-to-ASGI streaming bridges.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import threading

import pytest

from fiftyone.server.utils.streaming import (
    StreamingBridge,
    StreamingBridgeClosed,
)


@pytest.mark.asyncio
async def test_bridge_coalesces_chunks_and_counts_bytes():
    totals = []
    bridge = StreamingBridge(
        chunk_size=4, max_chunks=2, on_bytes_written=totals.append
    )

    async def consume():
        return [chunk async for chunk in bridge]

    def produce():
        bridge.sink.write(b"a")
        bridge.sink.write(b"bc")
        bridge.sink.write(b"defg")
        bridge.finish()

    consumer = asyncio.create_task(consume())
    await asyncio.to_thread(produce)

    chunks = await consumer
    assert chunks == [b"abcd", b"efg"]
    assert bridge.bytes_written == 7
    assert totals[-1] == 7
    assert bridge.wait(timeout=0)


@pytest.mark.asyncio
async def test_bounded_queue_backpressures_the_producer():
    bridge = StreamingBridge(chunk_size=2, max_chunks=1)
    finished = threading.Event()

    def produce():
        bridge.sink.write(b"abcdef")
        bridge.finish()
        finished.set()

    producer = threading.Thread(target=produce)
    producer.start()
    assert not finished.wait(timeout=0.05)

    body = b"".join([chunk async for chunk in bridge])
    producer.join(timeout=1)

    assert body == b"abcdef"
    assert finished.is_set()
    assert bridge.wait(timeout=0)


@pytest.mark.asyncio
async def test_producer_failure_aborts_the_iterator():
    bridge = StreamingBridge(chunk_size=2, max_chunks=1)
    bridge.sink.write(b"ab")
    bridge.abort(RuntimeError("producer failed"))

    with pytest.raises(RuntimeError, match="producer failed"):
        _ = [chunk async for chunk in bridge]


@pytest.mark.asyncio
async def test_closing_iterator_cancels_blocked_writes():
    bridge = StreamingBridge(chunk_size=2, max_chunks=1)
    stopped = threading.Event()

    def produce():
        try:
            bridge.sink.write(b"abcdefgh")
        except StreamingBridgeClosed:
            stopped.set()

    producer = threading.Thread(target=produce)
    producer.start()
    iterator = bridge.__aiter__()
    assert await iterator.__anext__() == b"ab"
    await iterator.aclose()
    producer.join(timeout=1)

    assert stopped.is_set()
    assert bridge.cancelled


def test_backpressure_callback_can_stop_blocked_writes():
    checks = []

    def stop():
        checks.append(True)
        raise RuntimeError("stop producer")

    bridge = StreamingBridge(
        chunk_size=2,
        max_chunks=1,
        on_backpressure=stop,
    )
    bridge.sink.write(b"ab")

    with pytest.raises(RuntimeError, match="stop producer"):
        bridge.sink.write(b"cd")

    assert checks == [True]
