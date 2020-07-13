"""
Benchmarking packages


| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from pathlib import Path
import sys

import matplotlib.pyplot as plt
import numpy as np

sys.path.append(Path(__file__).parent)
from pymongo_funcs import pymongo_one, pymongo_many
from pymodm_funcs import pymodm_one, pymodm_many
from mongoengine_funcs import mongoengine_one, mongoengine_many
from mongoframes_funcs import mongoframes_one, mongoframes_many


# PARAMETERS ##################################################################

# batch sizes
NUM_SAMPLES = [10 ** i for i in range(3, 5)]

# what packages to test
packages = [
    # "mongoengine",
    # "pymodm",
    "mongoframes",
    "pymongo",
]

# test single-document operations (one) and/or bulk operations (many)
bulk = [
    # "one",
    "many",
]

###############################################################################

func_map = {
    "pymongo": {"one": pymongo_one, "many": pymongo_many},
    "pymodm": {"one": pymodm_one, "many": pymodm_many},
    "mongoengine": {"one": mongoengine_one, "many": mongoengine_many},
    "mongoframes": {"one": mongoframes_one, "many": mongoframes_many},
}

ops = ["create", "read", "update", "delete"]


def compute_times():
    all_times = defaultdict(lambda: defaultdict(dict))

    for b in bulk:
        for pkg in packages:
            func = func_map[pkg][b]
            times = None
            for n in NUM_SAMPLES:
                if n < 1000:
                    rounds = None
                    for i in range(11):
                        if rounds is None:
                            rounds = func(n)
                        else:
                            rounds = np.vstack([rounds, func(n)])
                    # new_time
                    new_time = np.median(rounds, axis=0)
                else:
                    new_time = func(n)

                new_time = new_time * 1000 / n

                if times is None:
                    times = np.expand_dims(new_time, axis=0)
                else:
                    times = np.vstack([times, new_time])
                print(
                    "%18s() %s per 1000 samples (batch size = %d)"
                    % (func.__name__, times[-1, :], n)
                )

            for i, op in enumerate(ops):
                all_times[op][b][pkg] = times[:, i]

    return all_times


###############################################################################

all_times = compute_times()

###############################################################################

x = np.arange(len(NUM_SAMPLES))
width = 0.1

fig, axs = plt.subplots(nrows=len(ops))
if len(ops) == 1:
    axs = [axs]

for ax, op in zip(axs, ops):
    i = 0
    for b in bulk:
        for pkg in packages:
            times = all_times[op][b][pkg]
            L = (len(bulk) * len(packages) - 1) / 2
            rects = ax.bar(
                x + (i - L) * width,
                times,
                width=width,
                label="-".join([pkg, b]),
            )
            i += 1

    # Add some text for labels, title and custom x-axis tick labels, etc.
    ax.set_ylabel("Time per 1000 samples")
    ax.set_title("Processing Time for '%s'" % op)
    ax.set_xticks(x)
    ax.set_xticklabels(NUM_SAMPLES)
    ax.legend()
    # ax.set_yscale("log")

ax.set_xlabel("Operation Batch Size")

plt.show()
