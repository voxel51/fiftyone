"""
FiftyOne Server /media route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from starlette.responses import FileResponse


class Media(HTTPEndpoint):
    def get(self, request: Request):
        path = request.query_params["filepath"]

        return FileResponse(
            path,
            headers={
                "Accept-Ranges": "bytes",
                "Access-Control-Allow-Origin": "*",
            },
        )
