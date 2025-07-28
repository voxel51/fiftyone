"""
Logging utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import sys

import fiftyone as fo
from fiftyone.core.decorators import run_once


logger = logging.getLogger(__name__)


@run_once
def add_handler():
    """Adds the default logging handler to FiftyOne's package-wide loggers."""
    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(logging.Formatter(fmt="%(message)s"))

    for _logger in _get_loggers():
        _logger.addHandler(handler)


def init_logging():
    """Initializes FiftyOne's package-wide logging.

    The logging level is set to ``fo.config.logging_level``.
    """
    add_handler()
    set_logging_level(_parse_logging_level())


def get_logging_level():
    """Gets FiftyOne's package-wide logging level.

    Returns:
        a ``logging`` level, such as ``logging.INFO``
    """
    return _get_loggers()[0].level


def set_logging_level(level):
    """Sets FiftyOne's package-wide logging level.

    Args:
        level: a ``logging`` level, such as ``logging.INFO``
    """
    for logger in _get_loggers():
        logger.setLevel(level)


def _get_loggers():
    return [
        logging.getLogger("fiftyone"),
        logging.getLogger("eta"),
    ]


def _parse_logging_level():
    try:
        level = getattr(logging, fo.config.logging_level)
    except AttributeError:
        logger.warning("Invalid logging level '%s'", fo.config.logging_level)
        level = logging.INFO

    return level
