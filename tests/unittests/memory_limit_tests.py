"""
FiftyOne memory limit utility unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest
from unittest.mock import patch

import fiftyone.core.utils as fou


_GiB = 1024**3
_PAGE = 4096


def _mock_fs(file_dict):
    """Returns a ``builtins.open`` replacement serving ``file_dict`` and
    raising ``FileNotFoundError`` for anything else."""
    from unittest.mock import mock_open

    def _open(path, *args, **kwargs):
        if path in file_dict:
            return mock_open(read_data=file_dict[path])()
        raise FileNotFoundError(path)

    return _open


def _sysconf(total_bytes):
    """``os.sysconf`` stand-in reporting ``total_bytes`` of physical RAM."""
    values = {"SC_PAGE_SIZE": _PAGE, "SC_PHYS_PAGES": total_bytes // _PAGE}

    def _fn(name):
        return values[name]

    return _fn


class GetMemoryLimitTests(unittest.TestCase):
    def test_cgroup_v2_limit(self):
        with patch("sys.platform", "linux"), patch(
            "os.sysconf", side_effect=_sysconf(8 * _GiB)
        ), patch(
            "builtins.open",
            _mock_fs({"/sys/fs/cgroup/memory.max": str(2 * _GiB)}),
        ):
            self.assertEqual(fou.get_memory_limit(), 2 * _GiB)

    def test_cgroup_v2_max_falls_through_to_physical(self):
        with patch("sys.platform", "linux"), patch(
            "os.sysconf", side_effect=_sysconf(8 * _GiB)
        ), patch(
            "builtins.open", _mock_fs({"/sys/fs/cgroup/memory.max": "max"})
        ):
            self.assertEqual(fou.get_memory_limit(), 8 * _GiB)

    def test_cgroup_v1_limit(self):
        # v2 file absent -> falls back to v1.
        with patch("sys.platform", "linux"), patch(
            "os.sysconf", side_effect=_sysconf(8 * _GiB)
        ), patch(
            "builtins.open",
            _mock_fs(
                {"/sys/fs/cgroup/memory/memory.limit_in_bytes": str(3 * _GiB)}
            ),
        ):
            self.assertEqual(fou.get_memory_limit(), 3 * _GiB)

    def test_cgroup_v1_unlimited_sentinel_falls_through(self):
        sentinel = str(fou._CGROUP_V1_MEMORY_UNLIMITED)
        with patch("sys.platform", "linux"), patch(
            "os.sysconf", side_effect=_sysconf(8 * _GiB)
        ), patch(
            "builtins.open",
            _mock_fs(
                {"/sys/fs/cgroup/memory/memory.limit_in_bytes": sentinel}
            ),
        ):
            self.assertEqual(fou.get_memory_limit(), 8 * _GiB)

    def test_cgroup_above_physical_is_capped(self):
        with patch("sys.platform", "linux"), patch(
            "os.sysconf", side_effect=_sysconf(8 * _GiB)
        ), patch(
            "builtins.open",
            _mock_fs({"/sys/fs/cgroup/memory.max": str(16 * _GiB)}),
        ):
            self.assertEqual(fou.get_memory_limit(), 8 * _GiB)

    def test_non_linux_uses_physical(self):
        with patch("sys.platform", "darwin"), patch(
            "os.sysconf", side_effect=_sysconf(8 * _GiB)
        ), patch("builtins.open", _mock_fs({})):
            self.assertEqual(fou.get_memory_limit(), 8 * _GiB)

    def test_undeterminable_returns_none(self):
        with patch("sys.platform", "linux"), patch(
            "os.sysconf", side_effect=OSError
        ), patch("builtins.open", _mock_fs({})):
            self.assertIsNone(fou.get_memory_limit())


if __name__ == "__main__":
    unittest.main()
