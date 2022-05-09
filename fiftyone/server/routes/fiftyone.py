"""
FiftyOne Server /fiftyone route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import eta.core.serial as etas

import fiftyone as fo
import fiftyone.constants as foc
import fiftyone.core.uid as fou

from fiftyone.server.decorators import route


class FiftyOne(HTTPEndpoint):
    @route
    async def get(self, request: Request, data: dict) -> dict:
        uid, _ = fou.get_user_id()
        isfile = os.path.isfile(foc.TEAMS_PATH)
        if isfile:
            submitted = etas.load_json(foc.TEAMS_PATH)["submitted"]
        else:
            submitted = False

        return {
            "version": foc.TEAMS_VERSION,
            "user_id": uid,
            "do_not_track": fo.config.do_not_track,
            "teams": {"submitted": submitted, "minimized": isfile},
            "dev_install": foc.DEV_INSTALL or foc.RC_INSTALL,
        }
