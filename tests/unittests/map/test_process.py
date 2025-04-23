"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import multiprocessing
from unittest import mock

import pytest

import fiftyone.core.config as focc
import fiftyone.core.utils as fou
import fiftyone.core.map.process as fomp


class TestCreate:
    """test create class method"""

    @pytest.fixture(name="current_process")
    def patch_mp(self):
        """Patch method"""
        with mock.patch.object(multiprocessing, "current_process") as m:
            m.return_value = mock.Mock()
            m.return_value.daemon = False
            yield m.return_value

    @pytest.fixture(name="config")
    def patch_load_config(self):
        """Patch method"""
        with mock.patch.object(focc, "load_config") as m:
            config = mock.Mock()
            config.default_process_pool_workers = None
            config.max_process_pool_workers = None
            m.load_config.return_value = config
            yield config

    @pytest.fixture(name="recommend_process_pool_workers")
    def patch_make_view(self):
        """Patch method"""
        with mock.patch.object(fou, "recommend_process_pool_workers") as m:
            yield m

    @pytest.mark.parametrize(
        "num_workers",
        (
            pytest.param(None, id="worker-is-unset"),
            pytest.param(5, id="worker-is-set"),
        ),
    )
    def test_force_one_worker(
        self,
        config,
        num_workers,
        current_process,
        recommend_process_pool_workers,
    ):
        """test worker value"""
        current_process.daemon = True

        #####
        mapper = fomp.ProcessMapper.create(
            config=config, batch_cls=mock.Mock(), num_workers=num_workers
        )
        #####

        assert not recommend_process_pool_workers.called

        assert mapper.num_workers == 1

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
    def num_test_workers(
        self, value_from, max_workers, config, recommend_process_pool_workers
    ):
        """test worker value"""

        expected_workers = 5

        num_workers = None
        if value_from == "explicit":
            num_workers = expected_workers
        elif value_from == "config":
            config.default_process_pool_workers = expected_workers
        elif value_from == "default":
            recommend_process_pool_workers.return_value = expected_workers

        if max_workers is not None:
            config.max_process_pool_workers = max_workers

        #####
        mapper = fomp.ProcessMapper.create(
            config=config, batch_cls=mock.Mock(), num_workers=num_workers
        )
        #####

        if value_from == "default":
            recommend_process_pool_workers.assert_called_once()
        else:
            assert not recommend_process_pool_workers.called

        assert mapper.num_workers == (
            max_workers if max_workers is not None else expected_workers
        )
