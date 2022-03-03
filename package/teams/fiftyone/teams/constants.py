"""
FiftyOne Teams constants

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

import fiftyone.constants as foc


FIFTYONE_TEAMS_CONFIG_PATH = os.path.join(
    foc.FIFTYONE_CONFIG_DIR, "teams_config.json"
)
FIFTYONE_TEAMS_API_AUDIENCE = (
    "api.dev.fiftyone.ai" if foc.DEV_INSTALL else "api.fiftyone.ai"
)
FIFTYONE_TEAMS_API_DOMAIN = (
    "login.dev.fiftyone.ai" if foc.DEV_INSTALL else "login.fiftyone.ai"
)
