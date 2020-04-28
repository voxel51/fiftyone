"""
Core module that defines web socket client mixins for the SDK.

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
from future.utils import itervalues

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import logging

import socketio

import fiftyone.constants as voxc


logging.getLogger("socketio").setLevel(logging.ERROR)
logging.getLogger("engineio").setLevel(logging.ERROR)


class BaseClient(socketio.ClientNamespace):
    """SocketIO Client

    Attributes:
        data: the current data
    """

    def on_connect(self):
        print("Client connected")

    def on_disconnect(self):
        print("Client disconnected")

    def on_update(self, data):
        print("Update received")
        print(data)
        self.data = data

    def update(self, data):
        print("Sending update")
        print(data)
        self.data = data
        self.emit("update", data)


class HasClient(object):
    """HasClient is a mixin that supports maintaining a shared state of data
    using web sockets.

    """

    _HC_NAMESPACE = None
    _HC_ATTR_NAME = None

    def __init__(self):
        """Creates the SocketIO client"""
        self._hc_sio = socketio.Client()
        self._hc_client = BaseClient("/" + self._HC_NAMESPACE)
        self._hc_sio.register_namespace(self._hc_client)
        self._hc_sio.connect(voxc.SERVER_ADDR)

    def __getattr__(self, name):
        """Get the data via the attribute defined by `_HC_ATTR_NAME`."""
        if name == self._HC_ATTR_NAME:
            return self._hc_client.data
        raise AttributeError(name)

    def __setattr__(self, name, value):
        """Set the data to the attribute defined by `_HC_ATTR_NAME`."""
        if name == self._HC_ATTR_NAME:
            self._hc_client.update(value)
        else:
            super(HasClient, self).__setattr__(name, value)

    def __del__(self):
        """Disconnect upon deletion"""
        self._hc_client.disconnect()
        self._hc_sio.disconnect()


class HasViewClient(HasClient):
    """Mixin for Dataset to maintain state of the current view"""

    _HC_NAMESPACE = "view"
    _HC_ATTR_NAME = "view"
