"""
Benchmarking CRUD operations on CIFAR10

Results are written to a log file: `benchmark_log.txt`

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import OrderedDict
import pathlib
import random
import subprocess
import time

import numpy as np

import fiftyone.core.config as foc
import fiftyone.server.utils as fosu
import fiftyone.zoo as foz

from utils import get_git_revision_hash, write_result


DATASET_NAME = "cifar10"


foc.set_config_settings(default_ml_backend="tensorflow")

RESULT = OrderedDict({"githash": get_git_revision_hash()})

dataset = foz.load_zoo_dataset(
    DATASET_NAME, splits=["test"], drop_existing_dataset=True
)

# PAGE
page_sample_times = []
for i in range(10):
    view = dataset.view()
    start_time = time.time()
    _ = fosu.tile(view, i, 50)
    page_sample_times.append(time.time() - start_time)
RESULT["page_samples"] = np.median(page_sample_times)

log_path = (
    pathlib.Path(__file__)
    .parent.absolute()
    .joinpath("logs/page_benchmark_log.txt")
)

write_result(log_path, RESULT)
