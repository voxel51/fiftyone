#!/usr/bin/env python
"""
Installs FiftyOne.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone as fo
import fiftyone.zoo as foz
if __name__ == "__main__":
    dataset = foz.load_zoo_dataset("quickstart")
    fo.app_config.theme="light"
    session = fo.launch_app(dataset, port=5151, remote=True)
    session.wait()