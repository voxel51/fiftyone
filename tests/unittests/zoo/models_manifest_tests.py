"""
Tests for the model zoo's manifest memoization.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest import mock

import fiftyone.zoo.models as fozm

SOURCE = "https://github.com/voxel51/openai-clip"


class TestManifestMemoization:
    """The manifest is memoized for the life of the process, so whatever
    writes a new one to disk has to drop the memo — the lookup that follows a
    download reads through it and would otherwise miss what was just fetched.
    """

    def test_a_download_drops_the_memo(self):
        with mock.patch.object(
            fozm, "_load_zoo_models_manifest", return_value=({}, {})
        ) as load, mock.patch.object(
            fozm, "_download_model_metadata"
        ) as download:
            load.cache_clear = mock.Mock()
            fozm._parse_model_identifier(SOURCE)

        download.assert_called_once()
        load.cache_clear.assert_called_once()

    def test_a_source_already_registered_keeps_the_memo(self):
        # Nothing was written, so re-reading every manifest on disk would be
        # the cost this memo exists to avoid
        with mock.patch.object(
            fozm,
            "_load_zoo_models_manifest",
            return_value=({}, {SOURCE: object()}),
        ) as load, mock.patch.object(
            fozm, "_download_model_metadata"
        ) as download:
            load.cache_clear = mock.Mock()
            fozm._parse_model_identifier(SOURCE)

        download.assert_not_called()
        load.cache_clear.assert_not_called()
