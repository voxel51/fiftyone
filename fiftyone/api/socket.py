"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import queue
import threading
from typing import Optional, Union


import websocket

from fiftyone.api import constants


class SocketDisconnectException(Exception):
    """Wrapper for abnormal socket disconnects"""


_SOCKET_QUEUE_TIMEOUT = 0.01


class Socket:
    """Class for communicating over websocket"""

    def __init__(
        self,
        base_url: str,
        url_path: str,
        headers: Union[list, dict],
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
            on_open=self.__on_open,
            on_message=self.__on_message,
            on_close=self.__on_close,
        )

        self._wst = threading.Thread(target=self._ws.run_forever)
        self._wst.daemon = True
        self._wst.start()

    def __on_open(self, _):
        self._ready.set()

    def __on_message(self, _, msg):
        self._queue.put(msg)

    def __on_close(self, _, status_code, reason):
        if status_code != 1000:
            self._err = SocketDisconnectException(reason)

        self._closed = True

    def __iter__(self):
        return self

    def __next__(self) -> str:
        """Get a message from the server"""
        while True:
            # Attempt to read any messages from queue.
            try:
                msg = self._queue.get(timeout=_SOCKET_QUEUE_TIMEOUT)
                if msg:
                    return msg

                break
            except queue.Empty:
                # The queue is empty and the socket is closed, stop attempting
                # to read messages from queue.
                if self._closed:
                    break

        # If a socket occured raise it here.
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
        if self.closed and self._err:
            raise self._err

        self._ready.wait()

        self._ws.send(msg)
        self._sent.append(msg)
