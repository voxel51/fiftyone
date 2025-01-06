"""
Benchmarking for :func:`fiftyone.core.dataset.Dataset.add_samples`.

Results are written to `add_samples_benchmark.log`.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os

import eta.core.logging as etal

import fiftyone as fo
import fiftyone.zoo as foz


logger = logging.getLogger(__name__)


# Logs everything written by a `logger` in this benchmark
etal.custom_setup(
    etal.LoggingConfig(
        dict(
            filename=os.path.splitext(os.path.abspath(__file__))[0] + ".log",
            file_format="%(message)s",
        )
    ),
    verbose=False,
)


#
# Add samples benchmark
#

dataset = foz.load_zoo_dataset("cifar10", split="train")

samples = [s.copy() for s in dataset]

logger.info("\nStarting test")
for batch_size in [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, None]:
    logger.info("\nBatch size: %s" % batch_size)
    dataset2 = fo.Dataset()
    dataset2.add_samples(samples, _batch_size=batch_size)
