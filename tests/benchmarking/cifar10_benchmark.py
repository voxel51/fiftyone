"""
Benchmarking CRUD operations on CIFAR10.

Results are appended to `cifar10_benchmark.log`.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import OrderedDict
import pathlib
import random
import os
import subprocess
import time

import numpy as np

import fiftyone.zoo as foz


def get_git_revision_hash():
    return (
        subprocess.check_output(["git", "rev-parse", "HEAD"])
        .strip()
        .decode("utf-8")
    )


DATASET_NAME = "cifar10"
RESULT = OrderedDict({"githash": get_git_revision_hash()})

# Ensure the dataset is downloaded
foz.download_zoo_dataset(DATASET_NAME)

# CREATE: load the dataset
start_time = time.time()
dataset = foz.load_zoo_dataset(DATASET_NAME, drop_existing_dataset=True)
RESULT["load_dataset"] = time.time() - start_time

# READ: load from view
read_sample_times = []
for _ in range(9):
    view = dataset.take(1000)
    start_time = time.time()
    samples = [s for s in view]
    read_sample_times.append(time.time() - start_time)

RESULT["read_samples"] = np.median(read_sample_times)

# UPDATE: modify a field
update_sample_times = []
for _ in range(9):
    view = dataset.take(1000)
    start_time = time.time()
    for sample in view:
        sample.filepath = sample.filepath + "123"
        sample.save()

    update_sample_times.append(time.time() - start_time)

RESULT["update_samples_modify_field"] = np.median(update_sample_times)

# UPDATE: add a new field
update_sample_times = []
for i in range(9):
    view = dataset.take(1000)
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
    view = dataset.take(1000)
    start_time = time.time()
    dataset.delete_samples(view)
    delete_sample_times.append(time.time() - start_time)

RESULT["delete_samples"] = np.median(delete_sample_times)

# Append results to logfile
logpath = os.path.splitext(os.path.abspath(__file__))[0] + ".log"
with open(logpath, "a") as f:
    for k, v in RESULT.items():
        if isinstance(v, float):
            RESULT[k] = "{:7.4f}".format(v)

    f.write("\n" + " ".join(RESULT.values()))
