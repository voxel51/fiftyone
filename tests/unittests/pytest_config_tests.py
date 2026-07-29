"""
Tests for repository pytest configuration.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

pytest_plugins = ("pytester",)


def test_unknown_markers_fail_collection(pytester, pytestconfig):
    pytester.makeini(pytestconfig.inipath.read_text(encoding="utf-8"))
    pytester.makepyfile(
        """
        import pytest


        @pytest.mark.misspelled_marker
        def test_marker_typo():
            pass
        """
    )

    result = pytester.runpytest(
        "--collect-only",
        "-q",
        "-p",
        "no:asyncio",
    )

    result.assert_outcomes(errors=1)
    result.stdout.fnmatch_lines(
        ["*misspelled_marker*not found in `markers` configuration option*"]
    )
