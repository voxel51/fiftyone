"""
FiftyOne plugins constants.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from importlib.resources import files
from pathlib import Path

current_file = Path(__file__).resolve()
BUILTIN_PLUGINS_DIR = current_file.parent.parent.parent / "plugins"

print(BUILTIN_PLUGINS_DIR)
