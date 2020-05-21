"""
Web socket client mixins.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
# pragma pylint: disable=redefined-builtin
# pragma pylint: disable=unused-wildcard-import
# pragma pylint: disable=wildcard-import
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals
from builtins import *

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import logging
from retrying import retry
import threading

import socketio

import fiftyone.constants as foc
import fiftyone.core.service as fos

logging.getLogger("socketio").setLevel(logging.ERROR)
logging.getLogger("engineio").setLevel(logging.ERROR)


class BaseClient(socketio.ClientNamespace):
    """SocketIO Client.

    It is possible to add any arbitrary ``on_my_event()`` method to a socketio
    ClientNamespace, but using a single generic ``on_update()`` is sufficient.

    Organizing message categories can instead be done by subclassing
    :class:`HasClient`.

    Attributes:
        data: the current data
        data_cls: the data cls to load updated data as

    Args:
        namespace: client namespace
        data_cls: data class type (must be ``eta.core.serial.Serializable``)
    """

    def __init__(self, namespace, data_cls):
        self.data_cls = data_cls
        self.data = data_cls()
        super(BaseClient, self).__init__(namespace)

    def on_connect(self):
        """Receives the "connect" event."""
        pass

    def on_disconnect(self):
        """Receives the "disconnect" event."""
        pass

    def on_update(self, data):
        """Receives an update.

        Args:
            data: the new data
        """
        self.data = self.data_cls.from_dict(data)

    def update(self, data):
        """Sends an update.

        Args:
            data: the new data
        """
        self.data = data
        self.emit("update", data.serialize())


@retry(wait_fixed=500, stop_max_attempt_number=5)
def _connect(sio, addr):
    sio.connect(addr)


class HasClient(object):
    """Mixin that supports maintaining a shared state of data using web
    sockets.

    Subclasses must set the ``_HC_NAMESPACE`` and ``_HC_ATTR_NAME`` class
    attributes.

    Attributes:
        _HC_NAMESPACE: The socketio namespace to use
        _HC_ATTR_NAME: The attribute name to use for that shared data. The data
            must be a subclass of ``eta.core.serial.Serializable``
    """

    _HC_NAMESPACE = None
    _HC_ATTR_NAME = None
    _HC_ATTR_TYPE = None

    def __init__(self, port):
        self._server_service = fos.ServerService(port)
        self._hc_sio = socketio.Client()
        # the following is a monkey patch to set threads to daemon mode
        self._hc_sio.eio.start_background_task = _start_background_task
        self._hc_client = BaseClient(
            "/" + self._HC_NAMESPACE, self._HC_ATTR_TYPE
        )
        self._hc_sio.register_namespace(self._hc_client)
        _connect(self._hc_sio, foc.SERVER_ADDR % port)

    def __getattr__(self, name):
        """Gets the data via the attribute defined by ``_HC_ATTR_NAME``."""
        if name == self._HC_ATTR_NAME:
            return self._hc_client.data

        return None

    def __setattr__(self, name, value):
        """Sets the data to the attribute defined by ``_HC_ATTR_NAME``."""
        if name == self._HC_ATTR_NAME:
            if self._HC_ATTR_TYPE is not None and not isinstance(
                value, self._HC_ATTR_TYPE
            ):
                raise ValueError(
                    "Client expected type %s, but got type %s"
                    % (self._HC_ATTR_TYPE, type(value))
                )
            self._hc_client.update(value)
        else:
            super(HasClient, self).__setattr__(name, value)

    @property
    def server_port(self):
        """Getter for the port number the :class:`ServerService` is listening
        on.
        """
        return self._server_service.port


def _start_background_task(target, *args, **kwargs):
    """We are monkey patching here to start threads in ``daemon`` mode.

    Original docs below:

        The patch allows for clean exits out of python.

        Start a background task.

        This is a utility function that applications can use to start a
        background task.

    Args:
        target: the target function to execute
        *args: arguments to pass to the function
        **kwargs: keyword arguments to pass to the function

    Returns:
        an object compatible with the ``Thread`` class in the Python standard
        library. The ``start()`` method on this object is called by this
        function before returning it
    """
    th = threading.Thread(target=target, args=args, kwargs=kwargs, daemon=True)
    th.start()
    return th
