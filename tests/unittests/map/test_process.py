"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import multiprocessing
from unittest import mock

import pytest

import fiftyone.core.utils as fou
import fiftyone.core.map.process as fomp


class TestConstructor:
    """test generic constructor"""

    @pytest.fixture(name="current_process")
    def patch_multiprocessing_current_process(self):
        """Patch method"""
        with mock.patch.object(multiprocessing, "current_process") as m:
            m.return_value = mock.Mock()
            m.return_value.daemon = False
            yield m.return_value

    @pytest.fixture(name="recommend_process_pool_workers")
    def patch_make_view(self):
        """Patch method"""
        with mock.patch.object(fou, "recommend_process_pool_workers") as m:
            yield m

    @pytest.mark.parametrize(
        ("workers"),
        (
            pytest.param(None, id="worker-is-unset"),
            pytest.param(5, id="worker-is-set"),
        ),
    )
    def test_daemon(
        self, workers, current_process, recommend_process_pool_workers
    ):
        """test worker value"""
        current_process.daemon = True

        #####
        mapper = fomp.ProcessMapper(mock.Mock(), workers)
        #####

        assert not recommend_process_pool_workers.called
        assert mapper.workers == 1

    @pytest.mark.parametrize(
        ("workers"),
        (
            pytest.param(None, id="worker-is-unset"),
            pytest.param(5, id="worker-is-set"),
        ),
    )
    def test_workers(self, workers, recommend_process_pool_workers):
        """test worker value"""

        #####
        mapper = fomp.ProcessMapper(mock.Mock(), workers)
        #####

        if workers is None:
            recommend_process_pool_workers.assert_called_once()
            assert (
                mapper.workers == recommend_process_pool_workers.return_value
            )
        else:
            assert mapper.workers == workers
