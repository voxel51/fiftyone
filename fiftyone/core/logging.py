"""
Logging utilities.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import functools
import json
import logging
import sys
import time

import fiftyone as fo
import fiftyone.constants as foc

logger = logging.getLogger(__name__)


class JsonFormatter(logging.Formatter):
    """Custom JSON formatting"""

    converter = time.gmtime

    def format(self, record):
        log_entry = {
            "timestamp": f'{self.formatTime(record, "%Y-%m-%dT%H:%M:%S")}{record.msecs/1000:.3f}Z',
            "severity": record.levelname,
            "level": record.levelno,
            "logger": record.name,
            "message": record.getMessage(),
            "filename": record.filename,
            "lineno": record.lineno,
            "function": record.funcName,
            "fiftyone_version": foc.VERSION,
        }

        if record.exc_info:
            log_entry["stacktrace"] = self.formatException(record.exc_info)

        return json.dumps(log_entry)


@functools.cache  # has side effects, so only do it once
def add_handlers(log_level):
    """Adds the default logging handlers to FiftyOne's package-wide loggers.

    Args:
        log_level: a ``logging`` level used to configure the loggers
    """
    formatter = (
        JsonFormatter()
        if fo.config.logging_format == "json"
        else logging.Formatter(fmt="%(message)s")
    )

    loggers = _get_loggers()

    if fo.config.logging_destination == "stdout":
        stdout_handler = logging.StreamHandler(stream=sys.stdout)
        stdout_handler.setFormatter(formatter)

        for _logger in loggers:
            _logger.addHandler(stdout_handler)
            _logger.setLevel(log_level)

    elif fo.config.logging_destination == "stdout,stderr":
        stdout_handler = logging.StreamHandler(stream=sys.stdout)
        stdout_handler.setFormatter(formatter)
        stdout_handler.addFilter(lambda r: r.levelno < logging.ERROR)

        stderr_handler = logging.StreamHandler(stream=sys.stderr)
        stderr_handler.setFormatter(formatter)
        stderr_handler.addFilter(lambda r: r.levelno >= logging.ERROR)

        for _logger in loggers:
            _logger.addHandler(stdout_handler)
            _logger.addHandler(stderr_handler)
            _logger.setLevel(log_level)

    logger.debug("Added handlers to loggers: %s", loggers)


def init_logging():
    """Initializes FiftyOne's package-wide logging.

    The logging level is set to ``fo.config.logging_level``.
    """
    add_handlers(_parse_logging_level())


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
    loggers = [
        logging.getLogger("fiftyone"),
        logging.getLogger("eta"),
    ]
    if fo.config.logging_debug_targets:
        try:
            for debug_logger in fo.config.logging_debug_targets.split(","):
                if logger_name := debug_logger.strip():
                    loggers.append(logging.getLogger(logger_name))
        except Exception as e:
            # Note that invalid names will not raise an exception
            logger.warning(
                "Failed to parse logging debug targets '%s': %s",
                fo.config.logging_debug_targets,
                e,
            )

    return loggers


def _parse_logging_level():
    try:
        level = getattr(logging, fo.config.logging_level)
    except AttributeError:
        logger.warning("Invalid logging level '%s'", fo.config.logging_level)
        level = logging.INFO

    return level
