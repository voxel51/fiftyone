"""
FiftyOne dataset-related unit tests.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import pytest

import fiftyone.utils.torch as fout
import torch.utils.data as tud
import fiftyone.core.collections as focc

from unittest.mock import patch, MagicMock


class TestDownloadContext:
    def test_empty_media_fields(self):
        sample_col = MagicMock()
        sample_col.configure_mock(
            **{
                "_get_media_fields.return_value": {},
            }
        )
        do = focc.DownloadContext(sample_collection=sample_col)
        do.__enter__()
        sample_col._get_media_fields.assert_called_once()
        sample_col._get_media_paths.assert_not_called()

    def test_empty_media_fields_input(self):
        sample_col = MagicMock()
        do = focc.DownloadContext(
            sample_collection=sample_col, media_fields={}
        )
        do.__enter__()
        sample_col._get_media_fields.assert_not_called()
        sample_col._get_media_paths.assert_not_called()

    def test_valid_media_fields_input(self):
        sample_col = MagicMock()
        sample_col.configure_mock(
            **{
                "_get_media_paths.return_value": None,
            }
        )
        do = focc.DownloadContext(
            sample_collection=sample_col,
            media_fields=list(
                self._create_media_fields(10, "filepath").keys()
            ),
        )
        do.__enter__()
        sample_col._get_media_fields.assert_not_called()
        sample_col._resolve_media_field.assert_not_called()
        sample_col._get_media_paths.assert_called_once()

    def test_invalid_media_fields_input(self):
        sample_col = MagicMock()
        sample_view = MagicMock()
        sample_col.configure_mock(
            **{
                "_get_media_fields.return_value": self._create_media_fields(
                    10
                ),
                "_resolve_media_field.return_value": "path",
                "exists.return_value": sample_view,
            }
        )
        sample_view.configure_mock(
            **{
                "limit.return_value": False,
            }
        )

        do = focc.DownloadContext(sample_collection=sample_col)
        do.__enter__()
        sample_col._get_media_fields.assert_called_once()
        sample_col._get_media_paths.assert_not_called()

    @patch("fiftyone.core.cache.media_cache.get_local_paths")
    def test_disabled_batching(self, mocked_get_local_paths):
        file_paths = ["f" for _ in range(10)]
        sample_col = MagicMock()
        sample_col.configure_mock(
            **{
                "_get_media_paths.return_value": file_paths,
            }
        )
        do = focc.DownloadContext(
            sample_collection=sample_col,
            target_size_bytes=-1,
            media_fields=self._create_media_fields(10, "filepath").keys(),
        )
        do.__enter__()
        mocked_get_local_paths.assert_called_once_with(
            file_paths, download=True, skip_failures=True, progress=None
        )

    @patch("fiftyone.core.cache.media_cache.get_local_paths")
    def test_fixed_size_batching(self, mocked_get_local_paths):
        batch_size = 5
        file_paths = ["f" for _ in range(10)]
        batch_count = len(file_paths) // batch_size
        sample_col = MagicMock()
        sample_col.configure_mock(
            **{
                "_get_media_paths.return_value": file_paths,
            }
        )
        do = focc.DownloadContext(
            sample_collection=sample_col,
            batch_size=batch_size,
            media_fields=self._create_media_fields(10, "filepath").keys(),
        )
        do.__enter__()
        for _ in file_paths:
            do.next()

        assert len(mocked_get_local_paths.mock_calls) == batch_count

    @patch("fiftyone.core.cache.media_cache.get_local_paths")
    def test_fixed_size_batching_with_prefetch(self, mocked_get_local_paths):
        batch_size = 5
        prefetch = 9
        file_paths = ["f" for _ in range(15)]
        batch_count = len(file_paths) // batch_size
        sample_col = MagicMock()
        sample_col.configure_mock(
            **{
                "_get_media_paths.return_value": file_paths,
            }
        )
        do = focc.DownloadContext(
            sample_collection=sample_col,
            batch_size=batch_size,
            media_fields=self._create_media_fields(10, "filepath").keys(),
            prefetch_buffer_size=prefetch,
        )
        do.__enter__()
        mocked_get_local_paths.assert_any_call(
            file_paths[:batch_size],
            download=True,
            skip_failures=True,
            progress=None,
        )
        assert len(mocked_get_local_paths.mock_calls) == batch_count - 1
        for _ in file_paths:
            do.next()

        assert len(mocked_get_local_paths.mock_calls) == batch_count

    @pytest.mark.parametrize(
        "batch_size, num_workers, data_loader_workers, expected",
        [
            (None, 1, 1, 2),
            (1, 1, 2, 2),
            (2, 1, 2, 4),
            (1, None, 1, 2),
            (1, 1, 0, 0),
        ],
    )
    def test_get_prefetch_buffer_size(
        self, batch_size, num_workers, data_loader_workers, expected
    ):
        with patch(
            "fiftyone.utils.torch.recommend_num_workers", return_value=1
        ):
            data_loader = tud.DataLoader(
                range(1000),
                batch_size=batch_size,
                num_workers=data_loader_workers,
            )
            assert (
                fout.get_prefetch_buffer_size(
                    batch_size, num_workers, data_loader
                )
                == expected
            )

    def _create_media_fields(self, size, name=None):
        res = {}
        for i in range(size):
            if not name:
                res[f"field_{i}"] = f"value_{i}"
            else:
                res[name] = f"value_{i}"
        return res
