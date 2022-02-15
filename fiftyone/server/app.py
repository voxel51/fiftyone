"""
FiftyOne Server app

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.applications import Starlette

import fiftyone.constants as foc

from fiftyone.server.routes import routes


app = Starlette(debug=foc.DEV_INSTALL, routes=routes)
