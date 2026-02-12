"""Unit tests for FiftyOne storage module - Local filesystem only.

These tests do NOT require cloud credentials or network access.
They test local path utilities, file operations, and serialization.

This file is suitable for the FiftyOne open source repository which
only supports local filesystem operations.

Usage:
    pytest tests/unittests/storage_tests.py -v

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import shutil
import tempfile
import zipfile

import pytest

import fiftyone.core.storage as fos


@pytest.fixture(name="temp_dir")
def fixture_temp_dir():
    tmpdir = tempfile.mkdtemp(prefix="fiftyone_test_")
    yield tmpdir
    shutil.rmtree(tmpdir, ignore_errors=True)


class TestAbspath:
    """Test abspath() function for local paths."""

    def test_abspath_already_absolute(self):
        # Use os.path.abspath to get a platform-appropriate absolute path
        abs_path = os.path.abspath(os.path.join("absolute", "path"))
        assert fos.abspath(abs_path) == abs_path

    def test_abspath_relative_path(self):
        result = fos.abspath(os.path.join("relative", "path"))
        assert os.path.isabs(result)


class TestArchiveOperations:
    """Test make_archive() and extract_archive() functions."""

    def test_extract_archive_default_outdir(self, temp_dir):
        # Create a zip file
        archive_path = os.path.join(temp_dir, "test.zip")
        with zipfile.ZipFile(archive_path, "w") as zf:
            zf.writestr("test.txt", "content")

        # Extract with default outdir (None) - should extract to archive's directory
        fos.extract_archive(archive_path)

        assert os.path.exists(os.path.join(temp_dir, "test.txt"))

    def test_extract_archive_with_cleanup(self, temp_dir):
        # Create a zip file
        archive_path = os.path.join(temp_dir, "test.zip")
        extract_dir = os.path.join(temp_dir, "extracted")
        with zipfile.ZipFile(archive_path, "w") as zf:
            zf.writestr("test.txt", "content")

        # Extract with cleanup=True
        fos.extract_archive(archive_path, extract_dir, cleanup=True)

        assert os.path.exists(os.path.join(extract_dir, "test.txt"))
        assert not os.path.exists(archive_path)

    def test_extract_archive_zip(self, temp_dir):
        # Create a zip file
        archive_path = os.path.join(temp_dir, "test.zip")
        extract_dir = os.path.join(temp_dir, "extracted")
        with zipfile.ZipFile(archive_path, "w") as zf:
            zf.writestr("test.txt", "content")

        fos.extract_archive(archive_path, extract_dir)

        assert os.path.exists(os.path.join(extract_dir, "test.txt"))
        with open(os.path.join(extract_dir, "test.txt"), "r") as f:
            assert f.read() == "content"

    @pytest.mark.parametrize(
        "archive_name",
        [
            pytest.param("test.zip", id="zip"),
            pytest.param("test.tar.gz", id="tar_gz"),
        ],
    )
    def test_make_archive(self, temp_dir, archive_name):
        # Create source directory with files
        src_dir = os.path.join(temp_dir, "source")
        os.makedirs(src_dir)
        with open(os.path.join(src_dir, "file.txt"), "w") as f:
            f.write("content")

        archive_path = os.path.join(temp_dir, archive_name)
        fos.make_archive(src_dir, archive_path)

        assert os.path.exists(archive_path)

    def test_make_archive_with_cleanup(self, temp_dir):
        src_dir = os.path.join(temp_dir, "source")
        os.makedirs(src_dir)
        with open(os.path.join(src_dir, "file.txt"), "w") as f:
            f.write("content")

        archive_path = os.path.join(temp_dir, "test.zip")
        fos.make_archive(src_dir, archive_path, cleanup=True)

        assert os.path.exists(archive_path)
        assert not os.path.exists(src_dir)


class TestBatchOperations:
    """Test batch file operations: copy_files, move_files, delete_files, read_files."""

    def test_copy_files(self, temp_dir):
        # Create source files
        src_paths = []
        for i in range(3):
            path = os.path.join(temp_dir, f"src_{i}.txt")
            with open(path, "w") as f:
                f.write(f"content {i}")
            src_paths.append(path)

        dst_paths = [os.path.join(temp_dir, f"dst_{i}.txt") for i in range(3)]

        fos.copy_files(src_paths, dst_paths)

        for i, dst in enumerate(dst_paths):
            assert os.path.exists(dst)
            with open(dst, "r") as f:
                assert f.read() == f"content {i}"
        # Source files should still exist
        for src in src_paths:
            assert os.path.exists(src)

    def test_delete_files(self, temp_dir):
        paths = []
        for i in range(3):
            path = os.path.join(temp_dir, f"delete_{i}.txt")
            with open(path, "w") as f:
                f.write(f"content {i}")
            paths.append(path)

        fos.delete_files(paths)

        for path in paths:
            assert not os.path.exists(path)

    def test_move_files(self, temp_dir):
        src_paths = []
        for i in range(3):
            path = os.path.join(temp_dir, f"src_{i}.txt")
            with open(path, "w") as f:
                f.write(f"content {i}")
            src_paths.append(path)

        dst_paths = [
            os.path.join(temp_dir, f"moved_{i}.txt") for i in range(3)
        ]

        fos.move_files(src_paths, dst_paths)

        for i, dst in enumerate(dst_paths):
            assert os.path.exists(dst)
            with open(dst, "r") as f:
                assert f.read() == f"content {i}"
        # Source files should no longer exist
        for src in src_paths:
            assert not os.path.exists(src)

    def test_read_files(self, temp_dir):
        paths = []
        for i in range(3):
            path = os.path.join(temp_dir, f"file_{i}.txt")
            with open(path, "w") as f:
                f.write(f"content {i}")
            paths.append(path)

        contents = fos.read_files(paths)

        assert len(contents) == 3
        for i, content in enumerate(contents):
            assert content == f"content {i}"

    def test_read_files_binary(self, temp_dir):
        paths = []
        for i in range(3):
            path = os.path.join(temp_dir, f"file_{i}.bin")
            with open(path, "wb") as f:
                f.write(bytes([i, i + 1, i + 2]))
            paths.append(path)

        contents = fos.read_files(paths, binary=True)

        assert len(contents) == 3
        for i, content in enumerate(contents):
            assert content == bytes([i, i + 1, i + 2])


class TestCopyDir:
    """Test copy_dir() function."""

    def test_copy_dir(self, temp_dir):
        # Create source directory with files
        src_dir = os.path.join(temp_dir, "src")
        os.makedirs(src_dir)
        with open(os.path.join(src_dir, "file1.txt"), "w") as f:
            f.write("content 1")
        os.makedirs(os.path.join(src_dir, "subdir"))
        with open(os.path.join(src_dir, "subdir", "file2.txt"), "w") as f:
            f.write("content 2")

        dst_dir = os.path.join(temp_dir, "dst")

        fos.copy_dir(src_dir, dst_dir)

        assert os.path.exists(os.path.join(dst_dir, "file1.txt"))
        assert os.path.exists(os.path.join(dst_dir, "subdir", "file2.txt"))
        # Source should still exist
        assert os.path.exists(src_dir)

    def test_copy_dir_overwrite(self, temp_dir):
        # Create source directory
        src_dir = os.path.join(temp_dir, "src")
        os.makedirs(src_dir)
        with open(os.path.join(src_dir, "new.txt"), "w") as f:
            f.write("new content")

        # Create existing destination with different content
        dst_dir = os.path.join(temp_dir, "dst")
        os.makedirs(dst_dir)
        with open(os.path.join(dst_dir, "old.txt"), "w") as f:
            f.write("old content")

        fos.copy_dir(src_dir, dst_dir, overwrite=True)

        assert os.path.exists(os.path.join(dst_dir, "new.txt"))
        assert not os.path.exists(os.path.join(dst_dir, "old.txt"))


class TestEnsureLocal:
    """Test ensure_local() function."""

    @pytest.mark.parametrize(
        "path",
        [
            pytest.param(
                os.path.join(os.sep, "already", "local", "path.txt"),
                id="absolute",
            ),
            pytest.param(
                os.path.join("relative", "path", "to", "file.txt"),
                id="relative",
            ),
            pytest.param("~/path/to/file.txt", id="tilde"),
        ],
    )
    def test_ensure_local_does_not_raise(self, path):
        # Should not raise for local paths
        fos.ensure_local(path)


class TestFileSystemDetection:
    """Test get_file_system() correctly identifies local paths."""

    @pytest.mark.parametrize(
        "path,expected",
        [
            pytest.param(
                os.path.join(os.sep, "local", "path"),
                fos.FileSystem.LOCAL,
                id="local_absolute",
            ),
            pytest.param(
                os.path.join("relative", "path"),
                fos.FileSystem.LOCAL,
                id="local_relative",
            ),
            pytest.param("", fos.FileSystem.LOCAL, id="local_empty"),
            pytest.param(".", fos.FileSystem.LOCAL, id="local_dot"),
            pytest.param("~/documents", fos.FileSystem.LOCAL, id="local_home"),
        ],
    )
    def test_get_file_system(self, path, expected):
        assert fos.get_file_system(path) == expected


class TestGetBucketName:
    """Test get_bucket_name() function for local paths."""

    def test_get_bucket_name_local(self):
        path = os.path.join(os.sep, "local", "path")
        assert fos.get_bucket_name(path) == ""


class TestGetGlobRoot:
    """Test get_glob_root() function for local paths."""

    def test_get_glob_root_local_path(self):
        glob_patt = os.path.join(os.sep, "local", "path", "*.txt")
        expected_root = os.path.join(os.sep, "local", "path")
        root, found_special = fos.get_glob_root(glob_patt)
        assert root == expected_root
        assert found_special is True


class TestIsabs:
    """Test isabs() function for local paths."""

    def test_isabs_absolute_path(self):
        # Construct a platform-appropriate absolute path
        abs_path = os.path.abspath(os.path.join("absolute", "path"))
        assert fos.isabs(abs_path) is True

    def test_isabs_relative_path(self):
        assert fos.isabs(os.path.join("relative", "path")) is False

    def test_isabs_tilde_not_absolute(self):
        assert fos.isabs("~/path") is False


class TestIsLocal:
    """Test is_local() function."""

    @pytest.mark.parametrize(
        "path,expected",
        [
            pytest.param(
                os.path.join(os.sep, "local", "path"), True, id="absolute"
            ),
            pytest.param(
                os.path.join("relative", "path"), True, id="relative"
            ),
            pytest.param("~/documents", True, id="home"),
        ],
    )
    def test_is_local(self, path, expected):
        assert fos.is_local(path) is expected


class TestJoin:
    """Test join() function for local path concatenation."""

    def test_join_empty_components(self):
        base = os.path.join(os.sep, "local")
        joined = fos.join(base, "", "file.txt")
        assert "file.txt" in joined

    def test_join_local(self):
        base = os.path.join(os.sep, "local")
        expected = os.path.join(base, "path", "file.txt")
        assert fos.join(base, "path", "file.txt") == expected


class TestListAvailableFileSystems:
    """Test list_available_file_systems() function."""

    def test_includes_local(self):
        available = fos.list_available_file_systems()
        assert fos.FileSystem.LOCAL in available

    def test_returns_list(self):
        available = fos.list_available_file_systems()
        assert isinstance(available, list)


class TestListBuckets:
    """Test list_buckets() function."""

    def test_list_buckets(self):
        from unittest.mock import patch
        import eta.core.utils as etau

        mock_subdirs = ["bucket1", "bucket2", "bucket3"]
        with patch.object(etau, "list_subdirs", return_value=mock_subdirs):
            result = fos.list_buckets(fos.FileSystem.LOCAL)

        assert result == mock_subdirs

    def test_list_buckets_abs_paths(self):
        from unittest.mock import patch
        import eta.core.utils as etau

        mock_subdirs = ["/bucket1", "/bucket2"]
        with patch.object(etau, "list_subdirs", return_value=mock_subdirs):
            result = fos.list_buckets(fos.FileSystem.LOCAL, abs_paths=True)

        assert result == mock_subdirs


class TestLocalFileOperations:
    """Test file operations on local filesystem."""

    def test_copy_file(self, temp_dir):
        src = os.path.join(temp_dir, "source.txt")
        dst = os.path.join(temp_dir, "dest.txt")

        with open(src, "w") as f:
            f.write("test content")

        fos.copy_file(src, dst)
        assert os.path.exists(dst)
        with open(dst, "r") as f:
            assert f.read() == "test content"

    def test_delete_file(self, temp_dir):
        path = os.path.join(temp_dir, "to_delete.txt")
        with open(path, "w") as f:
            f.write("delete me")

        fos.delete_file(path)
        assert not os.path.exists(path)

    def test_ensure_basedir(self, temp_dir):
        path = os.path.join(temp_dir, "new_dir", "file.txt")
        fos.ensure_basedir(path)
        assert os.path.isdir(os.path.dirname(path))

    def test_ensure_dir(self, temp_dir):
        path = os.path.join(temp_dir, "new_dir")
        fos.ensure_dir(path)
        assert os.path.isdir(path)

    def test_ensure_empty_dir_raises_if_exists(self, temp_dir):
        dir_path = os.path.join(temp_dir, "existing_dir")
        os.makedirs(dir_path)
        with open(os.path.join(dir_path, "existing.txt"), "w") as f:
            f.write("existing")

        with pytest.raises(ValueError, match=f"not empty"):
            fos.ensure_empty_dir(dir_path)

    def test_ensure_empty_dir_creates_new(self, temp_dir):
        dir_path = os.path.join(temp_dir, "new_empty_dir")

        fos.ensure_empty_dir(dir_path)

        assert os.path.isdir(dir_path)
        assert len(os.listdir(dir_path)) == 0

    def test_exists_false(self, temp_dir):
        path = os.path.join(temp_dir, "nonexistent.txt")
        assert fos.exists(path) is False

    def test_exists_true(self, temp_dir):
        path = os.path.join(temp_dir, "existing.txt")
        with open(path, "w") as f:
            f.write("content")
        assert fos.exists(path) is True

    def test_glob_matches(self, temp_dir):
        for i in range(3):
            with open(os.path.join(temp_dir, f"file_{i}.txt"), "w") as f:
                f.write(f"content {i}")

        matches = fos.get_glob_matches(os.path.join(temp_dir, "*.txt"))

        assert len(matches) == 3
        assert all(m.endswith(".txt") for m in matches)

    def test_isdir_false_for_file(self, temp_dir):
        path = os.path.join(temp_dir, "file.txt")
        with open(path, "w") as f:
            f.write("content")
        assert fos.isdir(path) is False

    def test_isdir_true(self, temp_dir):
        assert fos.isdir(temp_dir) is True

    def test_isfile_false_for_dir(self, temp_dir):
        assert fos.isfile(temp_dir) is False

    def test_isfile_true(self, temp_dir):
        path = os.path.join(temp_dir, "file.txt")
        with open(path, "w") as f:
            f.write("content")
        assert fos.isfile(path) is True

    def test_list_files(self, temp_dir):
        for i in range(3):
            with open(os.path.join(temp_dir, f"file_{i}.txt"), "w") as f:
                f.write(f"content {i}")

        files = fos.list_files(temp_dir)
        assert len(files) == 3

    def test_list_files_recursive(self, temp_dir):
        os.makedirs(os.path.join(temp_dir, "subdir"))
        with open(os.path.join(temp_dir, "top.txt"), "w") as f:
            f.write("top")
        with open(os.path.join(temp_dir, "subdir", "nested.txt"), "w") as f:
            f.write("nested")

        files = fos.list_files(temp_dir, recursive=True)
        assert len(files) == 2

    def test_list_files_nonexistent_dir(self, temp_dir):
        nonexistent = os.path.join(temp_dir, "does_not_exist")
        files = fos.list_files(nonexistent)
        assert files == []

    def test_list_files_return_metadata(self, temp_dir):
        path = os.path.join(temp_dir, "file.txt")
        with open(path, "w") as f:
            f.write("content")

        files = fos.list_files(temp_dir, return_metadata=True)

        assert len(files) == 1
        metadata = files[0]
        assert "name" in metadata
        assert "size" in metadata
        assert "last_modified" in metadata
        assert "filepath" in metadata
        assert metadata["name"] == "file.txt"
        assert metadata["size"] == 7  # len("content")

    def test_list_files_return_metadata_abs_paths(self, temp_dir):
        path = os.path.join(temp_dir, "file.txt")
        with open(path, "w") as f:
            f.write("content")

        files = fos.list_files(temp_dir, abs_paths=True, return_metadata=True)

        assert len(files) == 1
        metadata = files[0]
        assert os.path.isabs(metadata["filepath"])

    def test_list_subdirs(self, temp_dir):
        os.makedirs(os.path.join(temp_dir, "dir1"))
        os.makedirs(os.path.join(temp_dir, "dir2"))
        with open(os.path.join(temp_dir, "file.txt"), "w") as f:
            f.write("content")

        subdirs = fos.list_subdirs(temp_dir)
        assert len(subdirs) == 2

    def test_make_temp_dir(self):
        tmpdir = fos.make_temp_dir()
        try:
            assert os.path.isdir(tmpdir)
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    def test_make_temp_dir_with_basedir(self, temp_dir):
        tmpdir = fos.make_temp_dir(basedir=temp_dir)
        try:
            assert os.path.isdir(tmpdir)
            assert tmpdir.startswith(temp_dir)
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    def test_move_file(self, temp_dir):
        src = os.path.join(temp_dir, "source.txt")
        dst = os.path.join(temp_dir, "moved.txt")

        with open(src, "w") as f:
            f.write("content to move")

        fos.move_file(src, dst)

        assert not os.path.exists(src)
        assert os.path.exists(dst)
        with open(dst, "r") as f:
            assert f.read() == "content to move"

    def test_open_files_read(self, temp_dir):
        paths = []
        for i in range(3):
            path = os.path.join(temp_dir, f"file_{i}.txt")
            with open(path, "w") as f:
                f.write(f"content {i}")
            paths.append(path)

        with fos.open_files(paths, "r") as files:
            contents = [f.read() for f in files]
            assert len(contents) == 3
            for i, content in enumerate(contents):
                assert content == f"content {i}"

    def test_open_files_raises_on_failure(self, temp_dir):
        path = os.path.join(temp_dir, "exists.txt")
        with open(path, "w") as f:
            f.write("content")

        paths = [path, os.path.join(temp_dir, "nonexistent.txt")]
        with pytest.raises(FileNotFoundError):
            fos.open_files(paths, "r")

    def test_open_files_skip_failures(self, temp_dir):
        path = os.path.join(temp_dir, "exists.txt")
        with open(path, "w") as f:
            f.write("content")

        paths = [path, os.path.join(temp_dir, "nonexistent.txt")]
        with fos.open_files(paths, "r", skip_failures=True) as files:
            # Length is 2 but nonexistent file entry is None
            assert len(files) == 2
            assert files[0] is not None
            assert files[1] is None

    def test_write_and_read_binary(self, temp_dir):
        path = os.path.join(temp_dir, "binary.bin")
        content = b"\x00\x01\x02\x03"

        fos.write_file(content, path)
        read_content = fos.read_file(path, binary=True)

        assert read_content == content

    def test_write_and_read_file(self, temp_dir):
        path = os.path.join(temp_dir, "test.txt")
        content = "test content\n"

        fos.write_file(content, path)
        read_content = fos.read_file(path)

        assert read_content == content


class TestMoveDir:
    """Test move_dir() function."""

    def test_move_dir(self, temp_dir):
        # Create source directory with files
        src_dir = os.path.join(temp_dir, "src")
        os.makedirs(src_dir)
        with open(os.path.join(src_dir, "file1.txt"), "w") as f:
            f.write("content 1")
        os.makedirs(os.path.join(src_dir, "subdir"))
        with open(os.path.join(src_dir, "subdir", "file2.txt"), "w") as f:
            f.write("content 2")

        dst_dir = os.path.join(temp_dir, "dst")

        fos.move_dir(src_dir, dst_dir)

        assert os.path.exists(os.path.join(dst_dir, "file1.txt"))
        assert os.path.exists(os.path.join(dst_dir, "subdir", "file2.txt"))
        # Source should no longer exist
        assert not os.path.exists(src_dir)

    def test_move_dir_overwrite(self, temp_dir):
        # Create source directory
        src_dir = os.path.join(temp_dir, "src")
        os.makedirs(src_dir)
        with open(os.path.join(src_dir, "new.txt"), "w") as f:
            f.write("new content")

        # Create existing destination with different content
        dst_dir = os.path.join(temp_dir, "dst")
        os.makedirs(dst_dir)
        with open(os.path.join(dst_dir, "old.txt"), "w") as f:
            f.write("old content")

        fos.move_dir(src_dir, dst_dir, overwrite=True)

        assert os.path.exists(os.path.join(dst_dir, "new.txt"))
        assert not os.path.exists(os.path.join(dst_dir, "old.txt"))


class TestNormalizePath:
    """Test normalize_path() function for local paths."""

    def test_normalize_path_expands_tilde(self):
        normalized = fos.normalize_path("~/path")
        assert os.path.isabs(normalized)
        assert "~" not in normalized

    def test_normalize_path_removes_trailing_sep(self):
        # Construct path with trailing separator
        path_with_trailing = os.path.join(os.sep, "local", "path") + os.sep
        normalized = fos.normalize_path(path_with_trailing)
        assert not normalized.endswith(os.sep) or normalized == os.sep


class TestNormpath:
    """Test normpath() function for local paths."""

    def test_normpath_removes_double_sep(self):
        # Use os.sep to construct path with double separator
        path = os.sep + "local" + os.sep + os.sep + "path"
        result = fos.normpath(path)
        assert (os.sep + os.sep) not in result

    def test_normpath_resolves_dot(self):
        path = os.path.join(os.sep, "local", ".", "path")
        result = fos.normpath(path)
        expected = os.path.join(os.sep, "local", "path")
        assert result == expected

    def test_normpath_resolves_dotdot(self):
        path = os.path.join(os.sep, "local", "path", "..", "other")
        result = fos.normpath(path)
        expected = os.path.join(os.sep, "local", "other")
        assert ".." not in result
        assert result == expected

    @pytest.mark.skipif(os.name != "nt", reason="Windows-specific test")
    def test_normpath_windows_backslashes(self):
        result = fos.normpath("C:\\local\\path")
        assert "\\\\" not in result
        assert result == "C:\\local\\path"


class TestOpenFile:
    """Test open_file() function for single file."""

    def test_open_file_read(self, temp_dir):
        path = os.path.join(temp_dir, "test.txt")
        with open(path, "w") as f:
            f.write("test content")

        with fos.open_file(path, "r") as f:
            content = f.read()

        assert content == "test content"

    def test_open_file_write(self, temp_dir):
        path = os.path.join(temp_dir, "test.txt")

        with fos.open_file(path, "w") as f:
            f.write("written content")

        with open(path, "r") as f:
            assert f.read() == "written content"

    def test_open_file_read_binary(self, temp_dir):
        path = os.path.join(temp_dir, "test.bin")
        with open(path, "wb") as f:
            f.write(b"\x00\x01\x02")

        with fos.open_file(path, "rb") as f:
            content = f.read()

        assert content == b"\x00\x01\x02"

    def test_open_file_write_binary(self, temp_dir):
        path = os.path.join(temp_dir, "test.bin")

        with fos.open_file(path, "wb") as f:
            f.write(b"\x03\x04\x05")

        with open(path, "rb") as f:
            assert f.read() == b"\x03\x04\x05"


class TestOpenFiles:
    """Test open_files() function and FileCollection context manager."""

    def test_open_files_as_context_manager(self, temp_dir):
        """Test that open_files() works as a context manager."""
        paths = [os.path.join(temp_dir, f"file_{i}.txt") for i in range(3)]
        for path in paths:
            with open(path, "w") as f:
                f.write(f"content for {path}\n")

        with fos.open_files(paths, "r") as files:
            contents = [f.read() for f in files]

        assert len(contents) == 3
        for i, content in enumerate(contents):
            assert f"file_{i}.txt" in content

    def test_open_files_closes_files_on_exception(self, temp_dir):
        """Test that files are closed even if an exception occurs."""
        paths = [os.path.join(temp_dir, f"file_{i}.txt") for i in range(3)]
        for path in paths:
            with open(path, "w") as f:
                f.write("content\n")

        file_handles = None
        with pytest.raises(ValueError, match="Test exception"):
            with fos.open_files(paths, "r") as files:
                file_handles = list(files)
                raise ValueError("Test exception")

        assert file_handles is not None
        for f in file_handles:
            assert f.closed, "File should be closed even after exception"

    def test_open_files_closes_files_on_exit(self, temp_dir):
        """Test that files are closed after exiting context manager."""
        paths = [os.path.join(temp_dir, f"file_{i}.txt") for i in range(3)]
        for path in paths:
            with open(path, "w") as f:
                f.write("content\n")

        with fos.open_files(paths, "r") as files:
            file_handles = list(files)

        for f in file_handles:
            assert (
                f.closed
            ), "File should be closed after exiting context manager"

    def test_open_files_returns_list(self, temp_dir):
        """Test that open_files() returns a list (backwards compatibility)."""
        paths = [os.path.join(temp_dir, f"file_{i}.txt") for i in range(3)]
        for path in paths:
            with open(path, "w") as f:
                f.write("content\n")

        files = fos.open_files(paths, "r")

        assert isinstance(files, list)
        assert len(files) == 3

        # Clean up - manually close since not using context manager
        for f in files:
            f.close()

    def test_open_files_write_mode(self, temp_dir):
        """Test open_files() in write mode with context manager."""
        paths = [os.path.join(temp_dir, f"write_{i}.txt") for i in range(3)]

        with fos.open_files(paths, "w") as files:
            for i, f in enumerate(files):
                f.write(f"written content {i}\n")

        for i, path in enumerate(paths):
            with open(path, "r") as f:
                assert f.read() == f"written content {i}\n"


class TestRealpath:
    """Test realpath() function for local paths."""

    def test_realpath_resolves_symlinks(self, temp_dir):
        real_file = os.path.realpath(os.path.join(temp_dir, "real.txt"))
        with open(real_file, "w") as f:
            f.write("content")

        symlink = os.path.join(temp_dir, "link.txt")
        try:
            os.symlink(real_file, symlink)
            result = fos.realpath(symlink)
            assert result == real_file
        except OSError:
            pytest.skip("Symlinks not supported on this platform")


class TestSep:
    """Test sep() function for local path separator."""

    def test_sep_local(self):
        path = os.path.join(os.sep, "local", "path")
        assert fos.sep(path) == os.sep


class TestSerializationLocal:
    """Test JSON/YAML serialization on local filesystem."""

    @pytest.fixture
    def temp_dir(self):
        tmpdir = tempfile.mkdtemp(prefix="fiftyone_test_")
        yield tmpdir
        shutil.rmtree(tmpdir, ignore_errors=True)

    def test_load_json_from_path(self, temp_dir):
        path = os.path.join(temp_dir, "test.json")
        with open(path, "w") as f:
            f.write('{"key": "value"}')

        data = fos.read_json(path)
        assert data == {"key": "value"}

    def test_load_json_from_string(self):
        data = fos.load_json('{"key": "value"}')
        assert data == {"key": "value"}

    def test_load_ndjson_from_path(self, temp_dir):
        path = os.path.join(temp_dir, "test.ndjson")
        with open(path, "w") as f:
            f.write('{"a": 1}\n{"b": 2}\n')

        data = fos.read_ndjson(path)
        assert data == [{"a": 1}, {"b": 2}]

    def test_load_ndjson_from_string(self):
        data = fos.load_ndjson('{"a": 1}\n{"b": 2}')
        assert data == [{"a": 1}, {"b": 2}]

    def test_write_and_read_json(self, temp_dir):
        path = os.path.join(temp_dir, "test.json")
        data = {"key": "value", "number": 42}

        fos.write_json(data, path)
        read_data = fos.read_json(path)

        assert read_data == data

    def test_write_and_read_ndjson(self, temp_dir):
        path = os.path.join(temp_dir, "test.ndjson")
        data = [{"a": 1}, {"b": 2}, {"c": 3}]

        fos.write_ndjson(data, path)
        read_data = fos.read_ndjson(path)

        assert read_data == data

    def test_write_and_read_yaml(self, temp_dir):
        path = os.path.join(temp_dir, "test.yaml")
        data = {"key": "value", "list": [1, 2, 3]}

        fos.write_yaml(data, path)
        read_data = fos.read_yaml(path)

        assert read_data == data

    def test_write_json_pretty(self, temp_dir):
        path = os.path.join(temp_dir, "pretty.json")
        data = {"key": "value"}

        fos.write_json(data, path, pretty_print=True)

        with open(path, "r") as f:
            content = f.read()
        assert "\n" in content

    def test_load_json_invalid_raises(self):
        filename = "not valid json or a file path"
        with pytest.raises(
            ValueError, match=f"Unable to load JSON from '{filename}'"
        ):
            fos.load_json(filename)

    def test_load_ndjson_invalid_raises(self):
        filename = "not valid ndjson or a file path"
        with pytest.raises(
            ValueError, match=f"Unable to load NDJSON from '{filename}'"
        ):
            fos.load_ndjson(filename)

    def test_read_json_invalid_raises(self, temp_dir):
        path = os.path.join(temp_dir, "invalid.json")
        with open(path, "w") as f:
            f.write("not valid json")

        with pytest.raises(ValueError, match="Unable to parse JSON file"):
            fos.read_json(path)


class TestSplitPrefix:
    """Test split_prefix() function for local paths."""

    def test_split_prefix_absolute(self):
        path = os.path.join(os.sep, "local", "path")
        prefix, result_path = fos.split_prefix(path)
        assert prefix == ""
        assert result_path == path

    def test_split_prefix_relative(self):
        path = os.path.join("relative", "path")
        prefix, result_path = fos.split_prefix(path)
        assert prefix == ""
        assert result_path == path


class TestTempDir:
    """Test TempDir context manager."""

    def test_temp_dir_creates_directory(self):
        with fos.TempDir() as tmpdir:
            assert os.path.isdir(tmpdir)

    def test_temp_dir_cleans_up(self):
        tmpdir_path = None
        with fos.TempDir() as tmpdir:
            tmpdir_path = tmpdir
            assert os.path.isdir(tmpdir)

        assert not os.path.exists(tmpdir_path)

    def test_temp_dir_with_basedir(self):
        basedir = tempfile.mkdtemp(prefix="fiftyone_test_")
        try:
            with fos.TempDir(basedir=basedir) as tmpdir:
                assert tmpdir.startswith(basedir)
                assert os.path.isdir(tmpdir)
        finally:
            shutil.rmtree(basedir, ignore_errors=True)


class TestToBytes:
    """Test _to_bytes() internal function."""

    def test_to_bytes_from_string(self):
        result = fos._to_bytes("hello")
        assert result == b"hello"

    def test_to_bytes_from_bytes(self):
        result = fos._to_bytes(b"hello")
        assert result == b"hello"

    def test_to_bytes_invalid_type_raises(self):
        with pytest.raises(TypeError):
            fos._to_bytes(12345)


class TestRun:
    """Test run() function for parallel task execution."""

    def test_run_returns_results(self):
        tasks = [1, 2, 3, 4, 5]

        results = fos.run(lambda x: x * 2, tasks)

        assert results == [2, 4, 6, 8, 10]

    def test_run_empty_tasks(self):
        results = fos.run(lambda x: x, [])
        assert results == []

    def test_run_no_return_results(self):
        collected = []

        def collect(x):
            collected.append(x)

        result = fos.run(collect, [1, 2, 3], return_results=False)

        assert result is None
        assert sorted(collected) == [1, 2, 3]

    def test_run_single_worker(self):
        tasks = [1, 2, 3]

        results = fos.run(lambda x: x * 2, tasks, num_workers=1)

        assert results == [2, 4, 6]

    def test_run_multiworker_calls_pool(self):
        from unittest.mock import patch, MagicMock
        import multiprocessing.dummy
        import fiftyone.core.utils as fou

        tasks = [1, 2, 3]

        # Mock the Pool to verify multi-worker path is exercised
        mock_pool = MagicMock()
        mock_pool.__enter__ = MagicMock(return_value=mock_pool)
        mock_pool.__exit__ = MagicMock(return_value=False)
        mock_pool.imap = MagicMock(return_value=iter([2, 4, 6]))

        with patch.object(
            multiprocessing.dummy, "Pool", return_value=mock_pool
        ) as mock_pool_ctor:
            recommended_workers = 4
            with patch.object(
                fou,
                "recommend_thread_pool_workers",
                return_value=recommended_workers,
            ):
                results = fos.run(lambda x: x * 2, tasks)

                mock_pool_ctor.assert_called_once_with(
                    processes=recommended_workers
                )

        assert results == [2, 4, 6]
        mock_pool.imap.assert_called_once()
