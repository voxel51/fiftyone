"""
Logging utilities.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import sys

import fiftyone as fo


logger = logging.getLogger(__name__)
handler = None


def init_logging():
    """Initializes FiftyOne's package-wide logging.

    The logging level is set to ``fo.config.logging_level``.
    """
    global handler
    if handler is None:
        handler = logging.StreamHandler(stream=sys.stdout)

    handler.setFormatter(logging.Formatter(fmt="%(message)s"))
    logging.getLogger("fiftyone").addHandler(handler)
    logging.getLogger("eta").addHandler(handler)

    level = _parse_logging_level()
    handler.setLevel(level)


def get_logging_level():
    """Gets FiftyOne's package-wide logging level.

    Returns:
        a ``logging`` level, such as ``logging.INFO``
    """
    return handler.level


def set_logging_level(level):
    """Sets FiftyOne's package-wide logging level.

    Args:
        level: a ``logging`` level, such as ``logging.INFO``
    """
    handler.setLevel(level)


def _parse_logging_level():
    try:
        level = getattr(logging, fo.config.logging_level)
    except AttributeError:
        logger.warning("Invalid logging level '%s'", fo.config.logging_level)
        level = logging.INFO

    return level
