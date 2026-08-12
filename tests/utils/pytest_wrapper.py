"""
Wrapper around pytest that cleans up subprocesses.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import sys

import psutil
import pytest


def main():
    try:
        code = pytest.main(sys.argv[1:])
    finally:
        for child in reversed(psutil.Process().children(recursive=True)):
            try:
                child.kill()
                child.wait()
            except psutil.Error:
                pass

    return code


# The guard is required: "spawn" and "forkserver" child processes re-import
# this module as __mp_main__, and Python 3.14 changed the default start
# method on Linux from "fork" to "forkserver"
if __name__ == "__main__":
    exit(main())
