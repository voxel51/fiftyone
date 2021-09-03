"""
Multiprocess tests.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import multiprocessing
import os

import fiftyone.core.odm.database as food


def test_multiprocessing():
    with multiprocessing.Pool(1, _check_process) as pool:
        for _ in pool.imap_unordered(_do_nothing, [None]):
            pass


def _check_process(*_):
    assert "FIFTYONE_PRIVATE_DATABASE_PORT" in os.environ
    port = os.environ["FIFTYONE_PRIVATE_DATABASE_PORT"]
    assert int(port) == food._connection_kwargs["port"]


def _do_nothing(*_args):
    pass
