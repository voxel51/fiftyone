"""
Benchmarking utilities

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import subprocess


def get_git_revision_hash():
    """Get the current git revision hash

    Returns:
        the hash string
    """
    return (
        subprocess.check_output(["git", "rev-parse", "HEAD"])
        .strip()
        .decode("utf-8")
    )


def write_result(log_path, result):
    """Write the result of a benchmark

    Args:
        log_path: the path to the benchmark log
        result: the result dictionary
    """
    with open(log_path, "a") as file:
        for k, v in result.items():
            if isinstance(v, float):
                result[k] = "{:7.4f}".format(v)
        file.write("\n" + " ".join(result.values()))
