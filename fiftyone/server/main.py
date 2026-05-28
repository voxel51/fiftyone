"""
FiftyOne Server main

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import argparse
import os

import asyncio
from hypercorn.asyncio import serve
from hypercorn.config import Config
import logging
import webbrowser

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


def start_server(
    port=None,
    address=None,
    dataset=None,
    clean_start=False,
    open_browser=False,
):
    if port is None:
        port = fo.config.default_app_port

    if address is None:
        address = fo.config.default_app_address

    if clean_start:
        fo.delete_datasets("*")

    config = Config()
    config.bind = [f"{address}:{port}"]
    set_port(port)

    config.use_reloader = foc.DEV_INSTALL

    if open_browser:
        url = f"http://{address}:{port}"
        if dataset is not None:
            url += f"/datasets/{dataset}"

        webbrowser.open(url, new=2)

    asyncio.run(serve(app, config), debug=DEBUG_LOGGING)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--address", type=str, default=None)
    parser.add_argument("--clean_start", action="store_true")
    parser.add_argument("--open_browser", action="store_true")
    args = parser.parse_args()

    start_server(
        port=args.port,
        address=args.address,
        clean_start=args.clean_start,
        open_browser=args.open_browser,
    )
