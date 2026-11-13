"""
Tests for fiftyone/utils/huggingface.py.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
from unittest.mock import MagicMock

import pytest

import fiftyone.utils.huggingface as fouh


def _make_collection(filepaths=None, media_references=False):
    collection = MagicMock()
    collection.media_type = "video"
    collection._contains_media_references.return_value = media_references
    collection.app_config.media_fields = ["filepath"]
    collection.get_field_schema.return_value = {}

    def values(field):
        if field == "filepath":
            if media_references:
                raise AssertionError(
                    "filepath must not be read on reference-backed datasets"
                )

            return list(filepaths)

        raise AssertionError("unexpected field: %s" % field)

    collection.values.side_effect = values
    return collection


class TestGetFilesToDownload:
    def test_filepath_backed_returns_missing_files(self, tmp_path):
        present = tmp_path / "present.mp4"
        present.write_bytes(b"")
        missing = str(tmp_path / "missing.mp4")

        collection = _make_collection(filepaths=[str(present), missing])

        assert fouh._get_files_to_download(collection) == [missing]

    def test_reference_backed_skips_filepath(self):
        # e.g. LeRobot episodes: no `filepath`, media lives in `media_sources/`
        collection = _make_collection(media_references=True)

        assert fouh._get_files_to_download(collection) == []
        collection.values.assert_not_called()
