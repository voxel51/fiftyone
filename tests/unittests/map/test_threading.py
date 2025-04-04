"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest import mock

import pytest

import fiftyone.core.config as focc
import fiftyone.core.utils as fou
import fiftyone.core.map.threading as fomt


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
