"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
from typing import Dict, Optional

import backoff
import websocket

from fiftyone_teams_api import constants


@backoff.on_exception(backoff.expo, ConnectionRefusedError, max_tries=5)
def _get_socket(url: str, headers: Dict[str, str]):
    return websocket.create_connection(url, header=headers)


class Socket:
    """Class for communicating over websocket"""

    def __init__(
        self,
        base_url: str,
        url_path: str,
        headers: Dict[str, str],
        timeout: Optional[int] = constants.DEFAULT_TIMEOUT,
    ):
        url = os.path.join(base_url.replace("http", "ws"), url_path)

        self._ws = _get_socket(url, headers=headers)

        self._timeout = timeout
        self._sent = []
        self._closed = False

    def __iter__(self):
        return self

    def __next__(self) -> str:
        """Get a message from the server"""
        msg = self._ws.recv()
        if not msg:
            self._closed = True
            raise StopIteration
        return msg

    @property
    def closed(self) -> bool:
        """Whether the connection is closed or not"""
        return self._closed

    def close(self) -> None:
        """Close the connection"""
        if not self._closed:
            self._ws.close()

        self._closed = True

    def send(self, msg: str) -> None:
        """Sends a message to the server"""
        self._ws.send(msg)
        self._sent.append(msg)
