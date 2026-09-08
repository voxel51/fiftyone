"""Stdio capture utilities for operator worker processes.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import re
import threading


class LineFlushedStdio:
    """Replace tqdm-style \\r updates with \\n-terminated lines so the
    container runtime's line-delimited log pipeline flushes per tick.
    Progress lines are throttled to one emit per integer percent; totalless
    progress lines (which render no percent) to one per count doubling."""

    # The |bar| segment is optional: eta drops it (or renders an empty ||)
    # when the fixed-width fields exceed the terminal width, e.g. on runs
    # with 7-digit totals in non-tty containers.
    _PROGRESS_LINE_RE = re.compile(
        r"^.*?(\d+)%\s*(?:\|.*?\|)?\s*\d+/\d+\s*\[.*\]\s*$"
    )
    _PROGRESS_PREFIX_RE = re.compile(
        r".*?\d+%\s*(?:\|.*?\|)?\s*\d+/\d+\s*\[.*?\]"
    )
    _PCT_STEP = 1

    # A TOTALLESS bar renders no percentage to throttle on — its ticks are
    # a leading iteration count plus a braille spinner glyph, the token
    # such bars carry precisely so this pipeline can key on it.
    _SPINNER_LINE_RE = re.compile(r"^\s*(\d+)\s.*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]")

    def __init__(self, original):
        self._original = original
        self._buf = ""
        self._last_pct = -self._PCT_STEP
        self._last_count = -1
        self._next_count = 0
        self._lock = threading.Lock()

    def write(self, s):
        with self._lock:
            self._buf += s
            while True:
                i = -1
                for sep in ("\r", "\n"):
                    p = self._buf.find(sep)
                    if p >= 0 and (i < 0 or p < i):
                        i = p
                if i < 0:
                    break
                piece, self._buf = self._buf[:i], self._buf[i + 1 :]
                self._emit(piece)
        return len(s)

    def _emit(self, piece):
        if not piece.strip():
            return
        pm = self._PROGRESS_PREFIX_RE.match(piece)
        if pm is not None and pm.end() < len(piece):
            self._emit(piece[: pm.end()])
            self._emit(piece[pm.end() :])
            return
        m = self._PROGRESS_LINE_RE.match(piece)
        if m is not None:
            pct = int(m.group(1))
            # New bar (pct went down) resets so the first update logs.
            if pct < self._last_pct:
                self._last_pct = -self._PCT_STEP
            if pct - self._last_pct < self._PCT_STEP:
                return
            self._last_pct = pct
        sm = self._SPINNER_LINE_RE.match(piece)
        if sm is not None:
            count = int(sm.group(1))
            # New bar (count went down) resets so its first tick logs.
            if count < self._last_count:
                self._next_count = count
            self._last_count = count
            if count < self._next_count:
                return
            # Doubling keeps the line budget logarithmic when the total —
            # and so a percent — is unknowable.
            self._next_count = max(2 * count, 1)
        try:
            self._original.write(piece + "\n")
            self._original.flush()
        except OSError:
            pass

    def flush(self):
        # tqdm flushes after every \r tick; draining partials here would
        # emit the same progress line twice. Use drain() for end-of-op.
        try:
            self._original.flush()
        except OSError:
            pass

    def drain(self):
        """Emit any unterminated buffered text as a final line."""
        with self._lock:
            if self._buf.strip():
                self._emit(self._buf)
            self._buf = ""
        self.flush()

    def __getattr__(self, name):
        return getattr(self._original, name)
