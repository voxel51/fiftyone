"""Tests for LineFlushedStdio progress bar normalization + throttling."""

import io
import sys

import pytest

import fiftyone.core.utils as fou
from fiftyone.operators.logging_utils import LineFlushedStdio


def _bar(pct, n, total=100):
    return f"\r {pct:3d}%|{'#' * (pct // 10):<10}| {n}/{total} [00:00<00:00, 1.00it/s]"


def _eta_barless(pct, n, total=1885099):
    # eta omits the |bar| when the fixed-width fields exceed the terminal
    # width, e.g. 7-digit totals in non-tty containers
    return f"\r{pct}%    {n}/{total} [7.4m elapsed, 14.8h remaining, 33.9 samples/s]"


def _eta_totalless(count, msgs):
    # a totalless bar renders no percent; the braille spinner glyph is the
    # token its ticks carry for the throttle to key on
    return f"\r {count} episode(s) ⠴ {msgs} message(s); 02:14 elapsed [] "


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

    def test_barless_progress_within_same_percent_is_throttled(
        self, tee, sink
    ):
        for n in range(15488, 16064, 64):
            tee.write(_eta_barless(1, n))
        tee.drain()

        lines = [l for l in sink.getvalue().splitlines() if l.strip()]
        assert len(lines) == 1
        assert lines[0].startswith("1%")
        assert "15488/1885099" in lines[0]

    def test_barless_progress_emits_each_integer_percent(self, tee, sink):
        tee.write(_eta_barless(1, 15488))
        tee.write(_eta_barless(1, 16064))
        tee.write(_eta_barless(2, 37702))
        tee.write(_eta_barless(2, 38000))
        tee.drain()

        lines = [l for l in sink.getvalue().splitlines() if l.strip()]
        pcts = [int(l.split("%", 1)[0].strip()) for l in lines]
        assert pcts == [1, 2]

    def test_empty_bar_progress_is_throttled(self, tee, sink):
        # zero-width bar renders as || with no glyphs between the pipes
        for n in (100, 200, 300):
            tee.write(f"\r  1% ||{n}/1885099 [1m elapsed, 2h remaining]")
        tee.drain()

        lines = [l for l in sink.getvalue().splitlines() if l.strip()]
        assert len(lines) == 1

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

    def test_totalless_progress_is_throttled_to_count_doublings(
        self, tee, sink
    ):
        for count in range(0, 1001):
            tee.write(_eta_totalless(count, count * 64))
        tee.drain()

        # the run's true final state arrives via eta's close-time log
        # record, which carries no leading bare count and is never gated
        lines = [l for l in sink.getvalue().splitlines() if l.strip()]
        counts = [int(l.split()[0]) for l in lines]
        assert counts == [0, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512]

    def test_totalless_progress_resets_on_new_bar(self, tee, sink):
        tee.write(_eta_totalless(512, 1000))
        tee.write(_eta_totalless(513, 1001))
        tee.write(_eta_totalless(3, 10))
        tee.drain()

        lines = [l for l in sink.getvalue().splitlines() if l.strip()]
        counts = [int(l.split()[0]) for l in lines]
        assert counts == [512, 3]

    def test_spinnerless_lines_with_leading_numbers_are_not_throttled(
        self, tee, sink
    ):
        for n in (1, 2, 3):
            tee.write(f"2026-08-16 18:04:34 INFO {n} thing(s) processed\n")

        assert len(sink.getvalue().splitlines()) == 3

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
