"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest import mock

import fiftyone.core.config as focc
import fiftyone.core.map.threading as fomt
import fiftyone.core.utils as fou
import pytest


class TestCreate:
    """test create class method"""

    @pytest.fixture(name="config")
    def patch_load_config(self):
        """Patch method"""
        with mock.patch.object(focc, "load_config") as m:
            config = mock.Mock()
            config.default_thread_pool_workers = None
            config.max_thread_pool_workers = None
            m.load_config.return_value = config
            yield config

    @pytest.fixture(name="recommend_thread_pool_workers")
    def patch_make_view(self):
        """Patch method"""
        with mock.patch.object(fou, "recommend_thread_pool_workers") as m:
            yield m

    @pytest.mark.parametrize(
        "max_workers",
        [
            pytest.param(value, id=f"max-workers={value}")
            for value in (None, 3)
        ],
    )
    @pytest.mark.parametrize(
        "value_from",
        ("explicit", "config", "default"),
    )
    def test_workers(
        self, value_from, max_workers, config, recommend_thread_pool_workers
    ):
        """test worker value"""

        expected_workers = 5

        workers = None
        if value_from == "explicit":
            workers = expected_workers
        elif value_from == "config":
            config.default_thread_pool_workers = expected_workers
        elif value_from == "default":
            recommend_thread_pool_workers.return_value = expected_workers

        if max_workers is not None:
            config.max_thread_pool_workers = max_workers

        #####
        mapper = fomt.ThreadMapper.create(
            config=config, batch_cls=mock.Mock(), workers=workers
        )
        #####

        if value_from == "default":
            recommend_thread_pool_workers.assert_called_once()
        else:
            assert not recommend_thread_pool_workers.called

        # pylint:disable-next=protected-access
        assert mapper._workers == (
            max_workers if max_workers is not None else expected_workers
        )

    @pytest.mark.parametrize(
        "progress_option, expected_module",
        [
            pytest.param("workers", "tqdm", id="progress=workers"),
            pytest.param(True, "fou.ProgressBar", id="progress=True"),
        ],
    )
    def test_progress_module_usage(self, progress_option, expected_module):
        """Test that the correct progress module is used based on the progress parameter."""
        with mock.patch(
            "fiftyone.core.utils.ProgressBar"
        ) as mock_progress_bar, mock.patch(
            "fiftyone.core.map.threading.tqdm"
        ) as mock_tqdm:

            # Mock dependencies
            sample_collection = mock.Mock()
            map_fcn = mock.Mock()
            batch_cls = mock.Mock()

            # Mock the batches returned by batch_cls.split
            mock_batches = []
            for _ in range(10):
                mock_batch = mock.Mock()
                mock_batch.create_subset = mock.Mock(return_value=mock.Mock())
                mock_batch.total = 10

                # Mock the sample iterator
                mock_sample_iter = iter([mock.Mock(id=i) for i in range(10)])
                mock_batch.create_subset.return_value.iter_samples = mock.Mock(
                    return_value=mock_sample_iter
                )

                mock_batches.append(mock_batch)

            batch_cls.split = mock.Mock(return_value=mock_batches)

            config = mock.Mock()
            config.max_thread_pool_workers = 4

            mapper = fomt.ThreadMapper.create(
                config=config, batch_cls=batch_cls, workers=2
            )

            # Call and consume
            list(
                mapper._map_samples_multiple_workers(
                    sample_collection=sample_collection,
                    map_fcn=map_fcn,
                    progress=progress_option,
                    save=False,
                    skip_failures=False,
                )
            )

            # Verify the correct progress module is used
            if expected_module == "tqdm":
                mock_tqdm.assert_called()
                mock_progress_bar.assert_not_called()
            elif expected_module == "fou.ProgressBar":
                mock_progress_bar.assert_called()
                mock_tqdm.assert_not_called()
