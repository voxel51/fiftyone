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
        return pytest.main(sys.argv[1:])
    finally:
        for child in reversed(psutil.Process().children(recursive=True)):
            try:
                child.kill()
                child.wait()
            except psutil.Error:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
