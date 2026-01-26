"""
FiftyOne CPU count utility unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import unittest
from unittest.mock import patch, mock_open

import fiftyone.core.utils as fou


def create_mock_filesystem(file_dict):
    """Create a mock filesystem that returns content for specified paths.

    Args:
        file_dict: Dictionary mapping file paths to their contents

    Returns:
        A mock function that can be used with patch("builtins.open")
    """

    def mock_open_func(path, *args, **kwargs):
        if path in file_dict:
            return mock_open(read_data=file_dict[path])()
        raise FileNotFoundError(path)

    return mock_open_func


class ParseCpusetTests(unittest.TestCase):
    """Tests for _parse_cpuset helper function."""

    def test_single_cpu(self):
        self.assertEqual(fou._parse_cpuset("0"), 1)
        self.assertEqual(fou._parse_cpuset("5"), 1)

    def test_cpu_range(self):
        self.assertEqual(fou._parse_cpuset("0-3"), 4)
        self.assertEqual(fou._parse_cpuset("0-7"), 8)
        self.assertEqual(fou._parse_cpuset("4-7"), 4)

    def test_cpu_list(self):
        self.assertEqual(fou._parse_cpuset("0,2,4"), 3)
        self.assertEqual(fou._parse_cpuset("1,3,5,7"), 4)

    def test_mixed_range_and_list(self):
        self.assertEqual(fou._parse_cpuset("0-3,5,7"), 6)  # 0,1,2,3,5,7
        self.assertEqual(fou._parse_cpuset("0,2-4,6"), 5)  # 0,2,3,4,6
        self.assertEqual(fou._parse_cpuset("0-1,4-5,8"), 5)  # 0,1,4,5,8

    def test_whitespace_handling(self):
        self.assertEqual(fou._parse_cpuset("0-3\n"), 4)
        self.assertEqual(fou._parse_cpuset("  0-3  "), 4)


class GetCpuCountCgroupV2Tests(unittest.TestCase):
    """Tests for cgroup v2 quota detection."""

    @patch("sys.platform", "linux")
    @patch(
        "builtins.open",
        mock_open(read_data="200000 100000"),
    )
    def test_cgroup_v2_quota_2_cpus(self):
        result = fou.get_cpu_count()
        self.assertEqual(result, 2)

    @patch("sys.platform", "linux")
    @patch(
        "builtins.open",
        mock_open(read_data="50000 100000"),
    )
    def test_cgroup_v2_quota_fractional_returns_1(self):
        """500m CPU (0.5) should return 1 since you can't have < 1 worker."""

        result = fou.get_cpu_count()
        self.assertEqual(result, 1)

    @patch("sys.platform", "linux")
    @patch("os.sched_getaffinity", return_value={0, 1, 2, 3}, create=True)
    @patch("os.process_cpu_count", side_effect=AttributeError, create=True)
    @patch("builtins.open")
    def test_cgroup_v2_quota_unlimited_falls_through(
        self, mock_open, _mock_process, _mock_sched
    ):
        """'max' quota means unlimited, should fall through to other methods."""

        mock_files = {
            "/sys/fs/cgroup/cpu.max": "max 100000",
        }
        mock_open.side_effect = create_mock_filesystem(mock_files)

        result = fou.get_cpu_count()
        # Should fall through to sched_getaffinity
        self.assertEqual(result, 4)

    @patch("sys.platform", "linux")
    @patch("os.sched_getaffinity", return_value={0, 1, 2}, create=True)
    @patch("os.process_cpu_count", side_effect=AttributeError, create=True)
    @patch("builtins.open")
    def test_cgroup_v2_zero_period_falls_through(
        self, mock_open, _mock_process, _mock_sched
    ):
        """Zero period should fall through to avoid division by zero."""

        mock_files = {
            "/sys/fs/cgroup/cpu.max": "100000 0",
        }
        mock_open.side_effect = create_mock_filesystem(mock_files)

        result = fou.get_cpu_count()
        # Should fall through to sched_getaffinity
        self.assertEqual(result, 3)

    @patch("sys.platform", "linux")
    @patch(
        "builtins.open",
        mock_open(read_data="350000 100000"),
    )
    def test_cgroup_v2_quota_3_cpus(self):
        """Test 3.5 CPUs truncates to 3."""
        result = fou.get_cpu_count()
        self.assertEqual(result, 3)

    @patch("sys.platform", "linux")
    @patch(
        "builtins.open",
        mock_open(read_data="250000 100000"),
    )
    def test_cgroup_v2_quota_2_5_cpus(self):
        """Test 2.5 CPUs truncates to 2."""
        result = fou.get_cpu_count()
        self.assertEqual(result, 2)

    @patch("sys.platform", "linux")
    @patch(
        "builtins.open",
        mock_open(read_data="800000 100000"),
    )
    def test_cgroup_v2_quota_8_cpus(self):
        """Test 8 CPUs."""
        result = fou.get_cpu_count()
        self.assertEqual(result, 8)


class GetCpuCountCgroupErrorTests(unittest.TestCase):
    """Tests for cgroup error handling."""

    @patch("sys.platform", "linux")
    @patch("os.sched_getaffinity", return_value={0, 1}, create=True)
    @patch("os.process_cpu_count", side_effect=AttributeError, create=True)
    @patch("builtins.open")
    def test_cgroup_file_permission_error(
        self, mock_open, _mock_process, _mock_sched
    ):
        """PermissionError should fall back to other methods."""

        mock_open.side_effect = PermissionError("Access denied")

        result = fou.get_cpu_count()
        # Should fall through to sched_getaffinity
        self.assertEqual(result, 2)

    @patch("sys.platform", "linux")
    @patch("os.sched_getaffinity", return_value={0, 1, 2}, create=True)
    @patch("os.process_cpu_count", side_effect=AttributeError, create=True)
    @patch("builtins.open")
    def test_cgroup_malformed_content(
        self, mock_open, _mock_process, _mock_sched
    ):
        """Malformed cgroup content should fall back to other methods."""

        mock_files = {
            "/sys/fs/cgroup/cpu.max": "invalid",
        }
        mock_open.side_effect = create_mock_filesystem(mock_files)

        result = fou.get_cpu_count()
        # Should fall through to sched_getaffinity
        self.assertEqual(result, 3)


class GetCpuCountCgroupV1Tests(unittest.TestCase):
    """Tests for cgroup v1 quota detection."""

    @patch("sys.platform", "linux")
    @patch("builtins.open")
    def test_cgroup_v1_quota_2_cpus(self, mock_open):
        mock_files = {
            "/sys/fs/cgroup/cpu/cpu.cfs_quota_us": "200000",
            "/sys/fs/cgroup/cpu/cpu.cfs_period_us": "100000",
        }
        mock_open.side_effect = create_mock_filesystem(mock_files)

        result = fou.get_cpu_count()
        self.assertEqual(result, 2)

    @patch("sys.platform", "linux")
    @patch("os.sched_getaffinity", return_value={0, 1}, create=True)
    @patch("os.process_cpu_count", side_effect=AttributeError, create=True)
    @patch("builtins.open")
    def test_cgroup_v1_quota_unlimited_falls_through(
        self, mock_open, _mock_process, _mock_sched
    ):
        """quota=-1 means unlimited in cgroup v1."""

        mock_files = {
            "/sys/fs/cgroup/cpu/cpu.cfs_quota_us": "-1",
            "/sys/fs/cgroup/cpu/cpu.cfs_period_us": "100000",
        }
        mock_open.side_effect = create_mock_filesystem(mock_files)

        result = fou.get_cpu_count()
        # Should fall through to sched_getaffinity
        self.assertEqual(result, 2)


class GetCpuCountCpusetTests(unittest.TestCase):
    """Tests for cpuset detection."""

    @patch("sys.platform", "linux")
    @patch("builtins.open")
    def test_cgroup_v2_cpuset_only(self, mock_open):
        """When only cpuset is set (no quota), return cpuset count."""

        mock_files = {
            "/sys/fs/cgroup/cpuset.cpus.effective": "0-3",
        }
        mock_open.side_effect = create_mock_filesystem(mock_files)

        result = fou.get_cpu_count()
        self.assertEqual(result, 4)

    @patch("sys.platform", "linux")
    @patch("builtins.open")
    def test_cgroup_v2_cpuset_fallback(self, mock_open):
        """Falls back to cpuset.cpus when cpuset.cpus.effective not found."""

        mock_files = {
            "/sys/fs/cgroup/cpuset.cpus": "0,2,4,6",
        }
        mock_open.side_effect = create_mock_filesystem(mock_files)

        result = fou.get_cpu_count()
        self.assertEqual(result, 4)

    @patch("sys.platform", "linux")
    @patch("builtins.open")
    def test_cgroup_v1_cpuset(self, mock_open):
        """Test cgroup v1 cpuset detection."""

        mock_files = {
            "/sys/fs/cgroup/cpuset/cpuset.cpus": "0-1",
        }
        mock_open.side_effect = create_mock_filesystem(mock_files)

        result = fou.get_cpu_count()
        self.assertEqual(result, 2)


class GetCpuCountQuotaAndCpusetTests(unittest.TestCase):
    """Tests for combined quota and cpuset limits."""

    @patch("sys.platform", "linux")
    @patch("builtins.open")
    def test_quota_more_restrictive_than_cpuset(self, mock_open):
        """When quota < cpuset, return quota."""

        mock_files = {
            "/sys/fs/cgroup/cpu.max": "200000 100000",  # 2 CPUs
            "/sys/fs/cgroup/cpuset.cpus.effective": "0-7",  # 8 CPUs
        }
        mock_open.side_effect = create_mock_filesystem(mock_files)

        result = fou.get_cpu_count()
        self.assertEqual(result, 2)

    @patch("sys.platform", "linux")
    @patch("builtins.open")
    def test_cpuset_more_restrictive_than_quota(self, mock_open):
        """When cpuset < quota, return cpuset."""

        mock_files = {
            "/sys/fs/cgroup/cpu.max": "400000 100000",  # 4 CPUs
            "/sys/fs/cgroup/cpuset.cpus.effective": "0-1",  # 2 CPUs
        }
        mock_open.side_effect = create_mock_filesystem(mock_files)

        result = fou.get_cpu_count()
        self.assertEqual(result, 2)


class GetCpuCountFallbackTests(unittest.TestCase):
    """Tests for fallback methods when cgroups are not available."""

    @patch("sys.platform", "darwin")  # Non-Linux to skip cgroups
    @patch("os.process_cpu_count", return_value=8, create=True)
    def test_uses_process_cpu_count(self, _mock_process):
        """Should use os.process_cpu_count() when available (Python 3.13+)."""

        result = fou.get_cpu_count()
        self.assertEqual(result, 8)

    @patch("sys.platform", "darwin")  # Non-Linux to skip cgroups
    @patch("os.sched_getaffinity", return_value={0, 1, 2, 3}, create=True)
    @patch("os.process_cpu_count", return_value=None, create=True)
    def test_process_cpu_count_returns_none(self, _mock_process, _mock_sched):
        """When process_cpu_count returns None, fall back to sched_getaffinity."""

        result = fou.get_cpu_count()
        self.assertEqual(result, 4)

    @patch("sys.platform", "darwin")  # Non-Linux to skip cgroups
    @patch("os.sched_getaffinity", return_value={0, 1, 2, 3}, create=True)
    @patch("os.process_cpu_count", side_effect=AttributeError, create=True)
    def test_falls_back_to_sched_getaffinity(self, _mock_process, _mock_sched):
        """When process_cpu_count not available, try sched_getaffinity."""

        result = fou.get_cpu_count()
        self.assertEqual(result, 4)

    @patch("sys.platform", "darwin")  # Non-Linux to skip cgroups
    @patch("multiprocessing.cpu_count", return_value=4)
    @patch("os.sched_getaffinity", side_effect=OSError, create=True)
    @patch("os.process_cpu_count", side_effect=AttributeError, create=True)
    def test_falls_back_to_multiprocessing(
        self, _mock_process, _mock_sched, _mock_cpu_count
    ):
        """When other methods fail, use multiprocessing.cpu_count()."""

        result = fou.get_cpu_count()
        self.assertEqual(result, 4)

    @patch("sys.platform", "darwin")  # Non-Linux to skip cgroups
    @patch("multiprocessing.cpu_count", side_effect=NotImplementedError)
    @patch("os.sched_getaffinity", side_effect=OSError, create=True)
    @patch("os.process_cpu_count", side_effect=AttributeError, create=True)
    def test_all_methods_fail_returns_1(
        self, _mock_process, _mock_sched, _mock_cpu_count
    ):
        """When all methods fail, return 1 as fallback."""

        result = fou.get_cpu_count()
        self.assertEqual(result, 1)

    @patch("sys.platform", "linux")
    @patch("os.sched_getaffinity", return_value={0, 1, 2, 3}, create=True)
    @patch("os.process_cpu_count", side_effect=AttributeError, create=True)
    @patch("builtins.open")
    def test_linux_no_cgroups_uses_sched_getaffinity(
        self, mock_open, _mock_process, _mock_sched
    ):
        """Linux without cgroups should use sched_getaffinity."""

        mock_open.side_effect = create_mock_filesystem({})

        result = fou.get_cpu_count()
        self.assertEqual(result, 4)


class GetCpuCountWindowsTests(unittest.TestCase):
    """Tests for Windows platform."""

    @patch("sys.platform", "win32")
    @patch("multiprocessing.cpu_count", return_value=8)
    @patch("os.sched_getaffinity", side_effect=AttributeError, create=True)
    @patch("os.process_cpu_count", side_effect=AttributeError, create=True)
    def test_windows_uses_cpu_count(
        self, _mock_process, _mock_sched, _mock_cpu_count
    ):
        """Windows should skip cgroups and use cpu_count."""

        result = fou.get_cpu_count()
        self.assertEqual(result, 8)


if __name__ == "__main__":
    unittest.main()
