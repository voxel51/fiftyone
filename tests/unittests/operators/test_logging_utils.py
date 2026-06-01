"""
FiftyOne operator logging utils tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import io
import sys

import pytest

import fiftyone.core.utils as fou
from fiftyone.operators.logging_utils import LineFlushedStdio


def _bar(pct, n, total=100):
    return f"\r {pct:3d}%|{'#' * (pct // 10):<10}| {n}/{total} [00:00<00:00, 1.00it/s]"


class TestLineFlushedStdio:
    @pytest.fixture
    def sink(self):
        return io.StringIO()

    @pytest.fixture
    def tee(self, sink):
        return LineFlushedStdio(sink)

    def test_progress_bar_emits_each_integer_percent(self, tee, sink):
        for pct in range(0, 101):
            tee.write(_bar(pct, pct))
        tee.drain()

        lines = [l for l in sink.getvalue().splitlines() if l.strip()]
        assert len(lines) == 101
        for i, line in enumerate(lines):
            assert f" {i:3d}%|" in line

    def test_progress_bar_within_same_percent_is_throttled(self, tee, sink):
        for n in range(50, 60):
            tee.write(_bar(42, n))
        tee.drain()

        lines = [l for l in sink.getvalue().splitlines() if l.strip()]
        assert len(lines) == 1
        assert " 42%|" in lines[0]
        assert "50/100" in lines[0]

    def test_progress_bar_resets_on_new_bar(self, tee, sink):
        tee.write(_bar(90, 90))
        tee.write(_bar(91, 91))
        tee.write(_bar(0, 0))
        tee.write(_bar(1, 1))
        tee.drain()

        lines = [l for l in sink.getvalue().splitlines() if l.strip()]
        pcts = [int(line.split("%")[0].strip()) for line in lines]
        assert pcts == [90, 91, 0, 1]

    def test_carriage_return_becomes_newline(self, tee, sink):
        tee.write("first\rsecond\rthird\n")

        assert sink.getvalue().splitlines() == ["first", "second", "third"]

    def test_fo_progress_bar_is_throttled(self, tee, sink, monkeypatch):
        monkeypatch.setattr(sys, "stdout", tee)
        total = 200
        with fou.ProgressBar(
            total=total, progress=True, max_fps=1e9, max_width=80
        ) as pb:
            for _ in range(total):
                pb.update()
        tee.drain()

        lines = [l for l in sink.getvalue().splitlines() if l.strip()]
        assert (
            len(lines) <= 105
        ), f"throttling failed: {len(lines)} lines for {total} updates"
        pcts = [int(l.split("%", 1)[0].strip()) for l in lines]
        assert pcts == sorted(pcts)
        assert max(pcts) >= 99

    def test_non_progress_lines_are_not_throttled(self, tee, sink):
        tee.write("hello\n")
        tee.write("hello\n")
        tee.write("hello\n")

        assert sink.getvalue().splitlines() == ["hello", "hello", "hello"]

    def test_progress_prefix_split_emits_tail_as_own_line(self, tee, sink):
        tee.write(
            "  10%|##        | 10/100 [00:00<00:00, 1.00it/s]some extra\n"
        )
        tee.drain()

        lines = [l for l in sink.getvalue().splitlines() if l.strip()]
        assert any("10%|" in l for l in lines)
        assert any("some extra" in l for l in lines)

    def test_drain_emits_unterminated_buffer(self, tee, sink):
        tee.write("partial line with no terminator")
        assert sink.getvalue() == ""
        tee.drain()
        assert sink.getvalue().splitlines() == [
            "partial line with no terminator"
        ]

    def test_flush_does_not_drain_buffer(self, tee, sink):
        tee.write(_bar(50, 50))
        tee.flush()
        assert sink.getvalue() == ""
