"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest import mock


import pytest

import fiftyone.core.utils as fou
import fiftyone.core.map.threading as fomt


class TestConstructor:
    """test generic constructor"""

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
    def test_workers(self, workers, recommend_process_pool_workers):
        """test worker value"""

        #####
        mapper = fomt.ThreadMapper(mock.Mock(), workers)
        #####

        if workers is None:
            recommend_process_pool_workers.assert_called_once()
            assert (
                mapper.workers == recommend_process_pool_workers.return_value
            )
        else:
            assert mapper.workers == workers
