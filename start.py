#!/usr/bin/env python
"""
Installs FiftyOne.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone as fo
if __name__ == "__main__":
    fo.app_config.theme="light"
    session = fo.launch_app(port=5151, remote=True)
    session.wait()