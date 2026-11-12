"""
Tests for fiftyone/utils/video.py concat_videos().

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
from unittest import mock

import pytest

import fiftyone.utils.video as fouv


def _concat_list(input_paths):
    """Returns the bytes of the list file that concat_videos() hands ffmpeg."""
    captured = {}

    def run(self, inpath, outpath, verbose=False):
        with open(inpath, "rb") as f:
            captured["list"] = f.read()

    with mock.patch.object(fouv.etav.FFmpeg, "run", run):
        fouv.concat_videos(input_paths, "out.mp4")

    return captured["list"]


class TestConcatVideosList:
    def test_plain_paths(self):
        paths = [
            os.path.join("clips", "a.mp4"),
            os.path.join("clips", "b.mp4"),
        ]

        lines = _concat_list(paths).decode("utf-8").splitlines()

        assert lines == ["file '%s'" % p for p in paths]

    @pytest.mark.parametrize("folder", ["vidéos", "動画", "видео"])
    def test_non_ascii_paths_are_utf8(self, folder):
        # ffmpeg reads the list as UTF-8, whatever the platform's encoding
        path = os.path.join(folder, "a.mp4")

        lines = _concat_list([path]).decode("utf-8").splitlines()

        assert lines == ["file '%s'" % path]

    def test_single_quote_is_escaped(self):
        lines = _concat_list(["it's.mp4"]).decode("utf-8").splitlines()

        assert lines == ["file 'it'\\''s.mp4'"]
