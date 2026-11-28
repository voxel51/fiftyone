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

    def test_triples_produce_vertices_and_types(self):
        """Each ``[x, y, type]`` triple gives a vertex and a type
        character."""
        out = foub._convert_mot_poly2d(
            [[1.0, 2.0, "L"], [3.0, 4.0, "C"]], "lane/road_curb"
        )

        assert out[0]["vertices"] == [[1.0, 2.0], [3.0, 4.0]]
        assert out[0]["types"] == "LC"
        assert out[0]["closed"] is False

    def test_area_category_is_closed(self):
        """An ``area/*`` category gives a closed polygon."""
        out = foub._convert_mot_poly2d([[0.0, 0.0, "L"]], "area/drivable")

        assert out[0]["closed"] is True

    def test_short_points_are_skipped(self):
        """A point without all three values is dropped rather than raising
        IndexError, so vertices and types stay aligned."""
        out = foub._convert_mot_poly2d(
            [[1.0, 2.0, "L"], [9.0], [5.0, 6.0], [3.0, 4.0, "C"]],
            "lane/road_curb",
        )

        assert out[0]["vertices"] == [[1.0, 2.0], [3.0, 4.0]]
        assert out[0]["types"] == "LC"


class TestParsePolylines:
    """Parsing of legacy poly2d labels into polylines."""

    LABEL = {
        "category": "lane/road_curb",
        "attributes": {"laneDirection": "parallel"},
        "poly2d": foub._convert_mot_poly2d(
            [[10.0, 20.0, "L"], [30.0, 40.0, "C"]], "lane/road_curb"
        ),
    }

    def test_converted_types_are_kept(self):
        """The ``types`` of a converted poly2d reach the polyline along with
        the label's attributes."""
        polylines = foub._parse_bdd_polylines(self.LABEL, (100, 200), True)

        assert polylines[0].types == "LC"
        assert polylines[0].laneDirection == "parallel"

    def test_types_are_filtered_like_attributes(self):
        """``extra_attrs`` selects among the label's attributes and the
        ``types``."""
        polylines = foub._parse_bdd_polylines(
            self.LABEL, (100, 200), ["types"]
        )

        assert polylines[0].types == "LC"
        assert not polylines[0].has_attribute("laneDirection")


class TestDownloadErrorRemediation:
    """Parser failures name the actual failing path."""

    def test_bad_source_dir_names_the_source_dir(self, tmp_path):
        """A ``source_dir`` without the legacy layout fails naming that
        directory, without advising a manual download."""
        source_dir = str(tmp_path / "not-bdd")
        os.makedirs(source_dir)

        with pytest.raises(OSError, match="not-bdd") as excinfo:
            foub.download_bdd100k_dataset(
                str(tmp_path / "dataset"), source_dir=source_dir
            )

        message = str(excinfo.value)
        assert "legacy 2018 layout" in message
        assert "download the source files" not in message


class _StubbedDownload:
    """Runs the downloader against stand-ins for the network, the archives
    and the parser."""

    IMAGES = foub._BDD100K_IMAGES_ZIP
    LABELS = foub._BDD100K_LABELS_ZIP

    def _stub(
        self, monkeypatch, interrupt, image_splits=("val", "train", "test")
    ):
        """Stands in for the network, the archives and the parser; the first
        download or extraction of each archive in ``interrupt`` stops
        partway, and the images archive holds ``image_splits``."""
        calls = {"download": [], "extract": []}

        def download_file(url, path=None):
            """Writes the archive, or part of it before stopping."""
            calls["download"].append(os.path.basename(path))
            with open(path, "wb") as f:
                f.write(b"zip")
            if ("download", os.path.basename(url)) in interrupt:
                interrupt.discard(("download", os.path.basename(url)))
                raise RuntimeError("interrupted")

        def extract_archive(archive, outdir=None):
            """Creates the archive's tree, val first, or only val before
            stopping."""
            name = os.path.basename(archive)
            calls["extract"].append(name)
            if name == self.IMAGES:
                kind, splits = "images", image_splits
            else:
                kind, splits = "labels", ("val", "train")
            for split in splits:
                os.makedirs(
                    os.path.join(outdir, "bdd100k", kind, "100k", split),
                    exist_ok=True,
                )
                if ("extract", name) in interrupt:
                    interrupt.discard(("extract", name))
                    raise RuntimeError("interrupted")

        def convert(mot_dir, out_path):
            """Writes an empty consolidated label file."""
            with open(out_path, "w") as f:
                f.write("[]")

        monkeypatch.setattr(foub.etaw, "download_file", download_file)
        monkeypatch.setattr(foub.etau, "extract_archive", extract_archive)
        monkeypatch.setattr(foub, "_convert_mot_to_legacy_labels", convert)
        monkeypatch.setattr(
            foub, "parse_bdd100k_dataset", lambda *args, **kwargs: None
        )
        monkeypatch.setattr(foub, "_count_split_samples", lambda d: 0)
        return calls

    def _download(self, tmp_path):
        """Runs the downloader with a fixed scratch directory."""
        foub.download_bdd100k_dataset(
            str(tmp_path / "dataset"), scratch_dir=str(tmp_path / "scratch")
        )


class TestScratchReuse(_StubbedDownload):
    """Only complete downloads and extractions are reused from scratch."""

    def test_an_interrupted_extraction_is_repeated(
        self, monkeypatch, tmp_path
    ):
        """An extraction that stopped after creating the val directories is
        repeated, and a complete one is not."""
        calls = self._stub(monkeypatch, {("extract", self.IMAGES)})

        with pytest.raises(RuntimeError):
            self._download(tmp_path)
        self._download(tmp_path)
        self._download(tmp_path)

        assert calls["extract"] == [self.IMAGES, self.IMAGES, self.LABELS]

    def test_an_interrupted_download_is_fetched_again(
        self, monkeypatch, tmp_path
    ):
        """A download that stopped partway leaves no archive to reuse."""
        calls = self._stub(monkeypatch, {("download", self.IMAGES)})

        with pytest.raises(RuntimeError):
            self._download(tmp_path)
        assert not os.path.exists(tmp_path / "scratch" / self.IMAGES)
        self._download(tmp_path)

        assert calls["download"] == [
            self.IMAGES + ".part",
            self.IMAGES + ".part",
            self.LABELS + ".part",
        ]


class TestExtractedLayout(_StubbedDownload):
    """The extracted archives are checked before any labels are
    converted."""

    def test_a_missing_image_split_is_named(self, monkeypatch, tmp_path):
        """An images archive without the test split fails naming that
        directory."""
        self._stub(monkeypatch, set(), image_splits=("val", "train"))

        with pytest.raises(OSError) as excinfo:
            self._download(tmp_path)

        expected = os.path.join("bdd100k", "images", "100k", "test")
        assert expected in str(excinfo.value)
        labels_dir = tmp_path / "scratch" / "bdd100k" / "labels"
        assert not list(labels_dir.glob("*.json"))
