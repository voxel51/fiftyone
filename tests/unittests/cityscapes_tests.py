"""
Cityscapes utility unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
from unittest.mock import Mock

import pytest

import fiftyone.utils.cityscapes as foucs


class CityscapesSplitTests(unittest.TestCase):
    def test_parse_split(self):
        self.assertEqual(foucs._parse_split("train"), "train")
        self.assertEqual(foucs._parse_split("train_extra"), "train_extra")
        self.assertEqual(foucs._parse_split("validation"), "val")
        self.assertEqual(foucs._parse_split("test"), "test")

        with pytest.raises(ValueError):
            foucs._parse_split("bad-split")


@pytest.mark.parametrize(
    "split, cached, archive, should_fail",
    [
        ("train_extra", False, False, True),
        ("train_extra", True, False, False),
        ("train_extra", False, True, False),
        ("train", False, False, False),
    ],
)
def test_requested_extra_images(
    tmp_path, monkeypatch, split, cached, archive, should_fail
):
    images = tmp_path / "leftImg8bit"
    images.mkdir()
    extra = images / "train_extra"
    if cached:
        extra.mkdir()

    monkeypatch.setattr(
        foucs,
        "_parse_source_dir",
        lambda *args: (
            "base.zip",
            "extra.zip" if archive else None,
            None,
            None,
            None,
        ),
    )
    monkeypatch.setattr(foucs, "_extract_images", lambda *args: str(images))
    extract = Mock(side_effect=lambda *args: extra.mkdir(exist_ok=True))
    export = Mock()
    monkeypatch.setattr(foucs, "_extract_extra_images", extract)
    monkeypatch.setattr(foucs, "_export_split", export)

    def parse():
        foucs.parse_cityscapes_dataset(
            "source", str(tmp_path / "output"), "scratch", [split]
        )

    if should_fail:
        with pytest.raises(OSError, match="train_extra"):
            parse()
        export.assert_not_called()
    else:
        parse()
        export.assert_called_once()

    assert extract.call_count == int(archive and split == "train_extra")


if __name__ == "__main__":
    unittest.main(verbosity=2)
