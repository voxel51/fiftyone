"""
Tests for fiftyone/utils/bdd.py BDD100K download and parsing helpers.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os

import pytest

import fiftyone.utils.bdd as foub


class TestConvertMotPoly2d:
    """Conversion of MOT-style poly2d points to legacy polylines."""

    def test_triples_produce_vertices_and_types(self) -> None:
        out = foub._convert_mot_poly2d(
            [[1.0, 2.0, "L"], [3.0, 4.0, "C"]], "lane/road_curb"
        )

        assert out[0]["vertices"] == [[1.0, 2.0], [3.0, 4.0]]
        assert out[0]["types"] == "LC"
        assert out[0]["closed"] is False

    def test_area_category_is_closed(self) -> None:
        out = foub._convert_mot_poly2d([[0.0, 0.0, "L"]], "area/drivable")

        assert out[0]["closed"] is True

    def test_short_points_are_skipped(self) -> None:
        """A point with fewer than two values is dropped rather than
        raising IndexError."""
        out = foub._convert_mot_poly2d(
            [[1.0, 2.0, "L"], [9.0], [3.0, 4.0, "C"]], "lane/road_curb"
        )

        assert out[0]["vertices"] == [[1.0, 2.0], [3.0, 4.0]]
        assert out[0]["types"] == "LC"


class TestDownloadErrorRemediation:
    """Parser failures name the actual failing path."""

    def test_bad_source_dir_names_the_source_dir(self, tmp_path) -> None:
        source_dir = str(tmp_path / "not-bdd")
        os.makedirs(source_dir)

        with pytest.raises(OSError, match="not-bdd") as excinfo:
            foub.download_bdd100k_dataset(
                str(tmp_path / "dataset"), source_dir=source_dir
            )

        message = str(excinfo.value)
        assert "legacy 2018 layout" in message
        assert "download the source files" not in message
