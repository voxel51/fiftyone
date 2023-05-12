"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import queue
import threading
import time
from typing import Dict, Optional

import websocket

from fiftyone.api import constants


class Socket:
    """Class for communicating over websocket"""

    def __init__(
        self,
        base_url: str,
        url_path: str,
        headers: Dict[str, str],
        timeout: Optional[int] = constants.DEFAULT_TIMEOUT,
    ):
        self._timeout = timeout
        self._sent = []
        self._closed = False
        self._ready = threading.Event()
        self._queue = queue.Queue()
        self._err = None

        self._ws = websocket.WebSocketApp(
            os.path.join(base_url.replace("http", "ws"), url_path),
            header=headers,
            on_open=lambda ws: self.__on_open(ws),
            on_message=lambda ws, msg: self.__on_message(ws, msg),
            on_close=lambda ws, status_code, reason: self.__on_close(
                ws, status_code, reason
            ),
        )

        self._wst = threading.Thread(target=self._ws.run_forever)
        self._wst.daemon = True
        self._wst.start()

    def __on_open(self, ws):
        self._ready.set()

    def __on_message(self, ws, msg):
        self._queue.put(msg)

    def __on_close(self, ws, status_code, reason):
        if status_code == 1011 and reason:
            self._err = Exception(reason)

        self._closed = True

    def __iter__(self):
        return self

    def __next__(self) -> str:
        """Get a message from the server"""
        while not self.closed:
            try:
                msg = self._queue.get(block=False)
                if msg:
                    return msg

                break
            except queue.Empty:
                time.sleep(0.05)

        if self._err:
            raise self._err

        raise StopIteration

    @property
    def closed(self) -> bool:
        """Whether the connection is closed or not"""
        return self._closed

    def close(self) -> None:
        """Close the connection"""
        if not self._closed:
            self._ws.close()

    def send(self, msg: str) -> None:
        """Sends a message to the server"""
        self._ready.wait()

        self._ws.send(msg)
        self._sent.append(msg)
