"""
Wrapper around an arbitrary command that cleans up subprocesses.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import subprocess
import sys

import psutil


try:
    subprocess.check_call(sys.argv[1:])
finally:
    for child in reversed(psutil.Process().children(recursive=True)):
        try:
            child.kill()
            child.wait()
        except psutil.Error:
            pass
