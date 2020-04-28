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
import threading

import socketio

import fiftyone.constants as voxc


logging.getLogger("socketio").setLevel(logging.ERROR)
logging.getLogger("engineio").setLevel(logging.ERROR)


def start_background_task(target, *args, **kwargs):
    """We are monkey patching here to start threads in `daemon` mode.

    ### Original Docs Below ###

    The patch allows for clean exits out of python.

    Start a background task.

    This is a utility function that applications can use to start a
    background task.

    Args:
        target: the target function to execute.
        args: arguments to pass to the function.
        kwargs: keyword arguments to pass to the function.

    This function returns an object compatible with the `Thread` class in
    the Python standard library. The `start()` method on this object is
    already called by this function.
    """
    th = threading.Thread(target=target, args=args, kwargs=kwargs, daemon=True)
    th.start()
    return th


class BaseClient(socketio.ClientNamespace):
    """SocketIO Client.

    It is possible to add any arbitrary `on_my_event()` method to a socketio
    ClientNamespace, but using a single generic `on_update()` is sufficient.

    Organizing message categories can instead be done by subclassing
    `HasClient`.

    Attributes:
        data: the current data
    """

    def on_connect(self):
        """Receive the "connect" event.

        Nothing is required of us at the moment
        """
        pass

    def on_disconnect(self):
        """Receive the "disconnect" event.

        Nothing is required of us at the moment
        """
        pass

    def on_update(self, data):
        """Receive an update.

        Args:
            data: the new data
        """
        self.data = data

    def update(self, data):
        """Send an update.

        Args:
            data: the new data
        """
        self.data = data
        self.emit("update", data)


class HasClient(object):
    """HasClient is a mixin that supports maintaining a shared state of data
    using web sockets.

    `_HC_NAMESPACE` and `_HC_ATTR_NAME` MUST be set by subclasses at the class
    level.

    Attributes:
        _HC_NAMESPACE: The socketio namespace to use. To be set by subclasses.
        _HC_ATTR_NAME: The attribute name to use for that shared data. The data
            must be a subclass of eta.core.serial.Serializable
    """

    _HC_NAMESPACE = None
    _HC_ATTR_NAME = None

    def __init__(self):
        """Creates the SocketIO client"""
        self.__sio = socketio.Client()
        # the following is a monkey patch to set threads to daemon mode
        self.__sio.eio.start_background_task = start_background_task
        self.__client = BaseClient("/" + self._HC_NAMESPACE)
        self.__sio.register_namespace(self.__client)
        self.__sio.connect(voxc.SERVER_ADDR)

    def __getattr__(self, name):
        """Get the data via the attribute defined by `_HC_ATTR_NAME`."""
        if name == self._HC_ATTR_NAME:
            return self.__client.data
        raise AttributeError(name)

    def __setattr__(self, name, value):
        """Set the data to the attribute defined by `_HC_ATTR_NAME`."""
        if name == self._HC_ATTR_NAME:
            self.__client.update(value)
        else:
            super(HasClient, self).__setattr__(name, value)


class HasViewClient(HasClient):
    """Mixin for `Dataset` to maintain state of the current view."""

    _HC_NAMESPACE = "view"
    _HC_ATTR_NAME = "view"
