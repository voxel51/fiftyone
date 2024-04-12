"""
FiftyOne Server main

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import argparse
import os

import asyncio
from hypercorn.asyncio import serve
from hypercorn.config import Config
import logging

if os.environ.get("FIFTYONE_DISABLE_SERVICES", False):
    del os.environ["FIFTYONE_DISABLE_SERVICES"]

os.environ["FIFTYONE_SERVER"] = "1"

import fiftyone as fo
import fiftyone.constants as foc

from fiftyone.server.app import app
from fiftyone.server.events import set_port

DEBUG_LOGGING = fo.config.logging_level == "DEBUG"

if DEBUG_LOGGING:
    logging.getLogger("asyncio").setLevel(logging.DEBUG)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=fo.config.default_app_port)
    parser.add_argument(
        "--address", type=str, default=fo.config.default_app_address
    )
    parser.add_argument("--clean_start", action="store_true")
    args = parser.parse_args()
    config = Config()
    config.bind = [f"{args.address}:{args.port}"]
    set_port(args.port)

    config.use_reloader = foc.DEV_INSTALL

    if args.clean_start:
        fo.delete_datasets("*")

    asyncio.run(serve(app, config), debug=DEBUG_LOGGING)
