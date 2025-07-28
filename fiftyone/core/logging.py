"""
Logging utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
import logging
import sys
import time

import fiftyone as fo
from fiftyone.core.decorators import run_once

logger = logging.getLogger(__name__)


class JsonFormatter(logging.Formatter):
    """Custom JSON formatting"""

    converter = time.gmtime

    def format(self, record):
        log_entry = {
            "timestamp": f'{self.formatTime(record, "%Y-%m-%dT%H:%M:%S")}{record.msecs/1000:.3f}Z',
            "level": record.levelname,
            "message": record.getMessage(),
            "filename": record.filename,
            "lineno": record.lineno,
        }

        if record.exc_info:
            log_entry["stacktrace"] = self.formatException(record.exc_info)

        return json.dumps(log_entry)


@run_once
def add_handlers():
    """Adds the default logging handlers to FiftyOne's package-wide loggers."""
    formatter = (
        JsonFormatter()
        if fo.config.logging_format == "json"
        else logging.Formatter(fmt="%(message)s")
    )

    stdout_handler = logging.StreamHandler(stream=sys.stdout)
    stdout_handler.setFormatter(formatter)
    stdout_handler.addFilter(lambda r: r.levelno < logging.ERROR)

    stderr_handler = logging.StreamHandler(stream=sys.stderr)
    stderr_handler.setFormatter(formatter)
    stderr_handler.setLevel(logging.ERROR)
    stderr_handler.addFilter(lambda r: r.levelno >= logging.ERROR)

    for _logger in _get_loggers():
        _logger.addHandler(stdout_handler)
        _logger.addHandler(stderr_handler)


def init_logging():
    """Initializes FiftyOne's package-wide logging.

    The logging level is set to ``fo.config.logging_level``.
    """
    add_handlers()
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
