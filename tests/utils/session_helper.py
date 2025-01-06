"""
A script that sets up and tears down a session. For use by session tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import argparse
import sys

import fiftyone as fo


parser = argparse.ArgumentParser()
parser.add_argument("--remote", action="store_true")
parser.add_argument("--slow", action="store_true")
args = parser.parse_args()

session = fo.launch_app(remote=args.remote)
if args.slow:
    assert isinstance(session._disable_wait_warning, bool)
    session._disable_wait_warning = True

session.__del__()
