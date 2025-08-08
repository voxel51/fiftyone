"""
FiftyOne logging-related tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from bson import json_util

import fiftyone as fo
from fiftyone.core.logging import (
    init_logging,
    add_handlers,
    _get_loggers,
)

import logging

import pytest


def _reset_logging_state():
    loggers = _get_loggers()
    for _logger in loggers:
        for handler in _logger.handlers[:]:
            _logger.removeHandler(handler)
        _logger.setLevel(logging.NOTSET)

    add_handlers.cache_clear()


@pytest.mark.parametrize(
    "logging_level", ["DEBUG", "INFO", "WARNING", "ERROR"]
)
@pytest.mark.parametrize("destination", ["stdout", "stdout,stderr"])
@pytest.mark.parametrize("logging_format", ["json", "text"])
def test_init_(
    monkeypatch, capsys, logging_format, destination, logging_level
):
    _reset_logging_state()
    monkeypatch.setattr(fo.config, "logging_format", logging_format)
    monkeypatch.setattr(fo.config, "logging_destination", destination)
    monkeypatch.setattr(fo.config, "logging_level", logging_level)
    monkeypatch.setattr(fo.config, "logging_debug_targets", None)

    # Initialize logging and handlers base on config
    init_logging()

    logger = logging.getLogger("fiftyone")
    logger.debug("DEBUG")
    logger.info("INFO")
    logger.warning("WARNING")
    logger.error("ERROR")

    captured = capsys.readouterr()
    err = captured.err
    out = captured.out

    expected = {
        "DEBUG": ["DEBUG", "INFO", "WARNING", "ERROR"],
        "INFO": ["INFO", "WARNING", "ERROR"],
        "WARNING": ["WARNING", "ERROR"],
        "ERROR": ["ERROR"],
    }

    assert logger.level == getattr(logging, logging_level)

    if destination == "stdout":
        assert len(err) == 0
    elif destination == "stdout,stderr":
        assert len(err) > 0

    num_logs = 0
    lines = [l for l in out.splitlines() if l.strip()] + [
        l for l in err.splitlines() if l.strip()
    ]
    if logging_format == "json":
        # JSON format has additional fields
        for line in lines:
            parsed = json_util.loads(line)
            assert isinstance(parsed, dict)
            if parsed["logger"] != "fiftyone":
                continue
            num_logs += 1

            assert parsed["message"] in expected[logging_level]
            assert getattr(logging, parsed["severity"]) >= getattr(
                logging, logging_level
            )
    else:
        # Text format only has the message
        for msg in expected[logging_level]:
            assert msg in lines
            num_logs += 1

    assert num_logs == len(expected[logging_level])
