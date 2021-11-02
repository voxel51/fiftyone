"""
Utilities for working with the
`Kinetics <https://deepmind.com/research/open-source/kinetics>`
dataset.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging


logger = logging.getLogger(__name__)


def download_kinetics_split(
    dataset_dir,
    split,
    classes=None,
    max_duration=None,
    num_workers=None,
    shuffle=None,
    seed=None,
    max_samples=None,
    version="700",
):
    return None, None
