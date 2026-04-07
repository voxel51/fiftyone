"""
Tests for :mod:`fiftyone.core.walk`.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os

import pytest

from fiftyone.core.walk import walk_safe


def test_walk_safe_empty_directory(tmp_path):
    triples = list(walk_safe(tmp_path))
    assert len(triples) == 1
    dirpath, dirnames, filenames = triples[0]
    assert os.path.samefile(dirpath, tmp_path)
    assert dirnames == []
    assert filenames == []


def test_walk_safe_lists_subdirs_and_files(tmp_path):
    (tmp_path / "nested").mkdir()
    (tmp_path / "notes.txt").write_text("x")

    dirpath, dirnames, filenames = next(walk_safe(tmp_path))

    assert os.path.samefile(dirpath, tmp_path)
    assert set(dirnames) == {"nested"}
    assert set(filenames) == {"notes.txt"}


def test_walk_safe_pruning_dirnames_skips_descent(tmp_path):
    (tmp_path / "keep").mkdir()
    (tmp_path / "prune").mkdir()

    seen = []
    for dirpath, dirnames, _ in walk_safe(tmp_path):
        seen.append(dirpath)
        if os.path.samefile(dirpath, tmp_path):
            dirnames.remove("prune")

    assert str(tmp_path / "prune") not in seen
    assert any(os.path.samefile(p, tmp_path / "keep") for p in seen)


def _dirpaths(walk_iter):
    return sorted(p for p, _, _ in walk_iter)


def test_walk_safe_matches_os_walk_simple_tree(tmp_path):
    (tmp_path / "a").mkdir()
    (tmp_path / "a" / "nested").mkdir()
    (tmp_path / "b").mkdir()
    (tmp_path / "file.txt").write_text("x")

    os_paths = _dirpaths(os.walk(tmp_path, followlinks=False))
    safe_paths = _dirpaths(walk_safe(tmp_path, follow_symlinks=False))
    assert safe_paths == os_paths


def test_walk_safe_topdown_false_matches_os_walk(tmp_path):
    (tmp_path / "sub").mkdir()
    os_paths = _dirpaths(os.walk(tmp_path, topdown=False, followlinks=False))
    safe_paths = _dirpaths(
        walk_safe(tmp_path, topdown=False, follow_symlinks=False)
    )
    assert safe_paths == os_paths


def test_walk_safe_matches_os_walk_unfollowed_symlink(tmp_path):
    real = tmp_path / "real"
    real.mkdir()
    (real / "inside.txt").write_text("1")
    link = tmp_path / "linkdir"
    try:
        os.symlink(real, link)
    except OSError:
        pytest.skip("could not create symlink")

    assert _dirpaths(walk_safe(tmp_path, follow_symlinks=False)) == _dirpaths(
        os.walk(tmp_path, followlinks=False)
    )


def test_walk_safe_follow_symlinks_breaks_cycles(tmp_path):
    d = tmp_path / "d"
    d.mkdir()
    (d / "sub").mkdir()
    (d / "sub" / "f.txt").write_text("x")
    try:
        os.symlink(d, d / "back_to_d")
    except OSError:
        pytest.skip("could not create symlink")

    paths = _dirpaths(walk_safe(d, follow_symlinks=True))
    assert paths == sorted([str(d), str(d / "sub")])
