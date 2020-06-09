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
import time

import numpy as np

import fiftyone.core.config as foc
import fiftyone.zoo as foz

from utils import get_git_revision_hash, write_result


DATASET_NAME = "cifar10"

foc.set_config_settings(default_ml_backend="tensorflow")

RESULT = OrderedDict({"githash": get_git_revision_hash()})

# CREATE: load the dataset
start_time = time.time()
dataset = foz.load_zoo_dataset(DATASET_NAME, drop_existing_dataset=True)
RESULT["load_dataset"] = time.time() - start_time

# READ: load from view
read_sample_times = []
for _ in range(9):
    view = dataset.view().take(1000)
    start_time = time.time()
    samples = [s for s in view]
    read_sample_times.append(time.time() - start_time)
RESULT["read_samples"] = np.median(read_sample_times)

# UPDATE: modify a field
update_sample_times = []
for _ in range(9):
    view = dataset.view().take(1000)
    start_time = time.time()
    for sample in view:
        sample.filepath = sample.filepath + "123"
        sample.save()
    update_sample_times.append(time.time() - start_time)
RESULT["update_samples_modify_field"] = np.median(update_sample_times)

# UPDATE: add a new field
update_sample_times = []
for i in range(9):
    view = dataset.view().take(1000)
    field_name = "field_%d" % i
    start_time = time.time()
    for sample in view:
        sample[field_name] = random.randint(0, 100)
        sample.save()
    update_sample_times.append(time.time() - start_time)
RESULT["update_samples_new_field"] = np.median(update_sample_times)

# DELETE:
delete_sample_times = []
for _ in range(9):
    view = dataset.view().take(1000)
    start_time = time.time()
    dataset.remove_samples(view)
    delete_sample_times.append(time.time() - start_time)
RESULT["delete_samples"] = np.median(delete_sample_times)

log_path = (
    pathlib.Path(__file__)
    .parent.absolute()
    .joinpath("logs/cifar10_benchmark_log.txt")
)

write_result(log_path, RESULT)
