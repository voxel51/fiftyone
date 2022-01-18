"""
Garbage collection service for the FiftyOne media cache.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from functools import wraps
import logging
import schedule
import os
import time

import eta.core.utils as etau

import fiftyone.core.cache as foc


logger = None
log_to_disk = foc.media_cache.config.gc_log
log_path = foc.media_cache.log_path
interval = foc.media_cache.config.gc_sleep_seconds


if __name__ != "__main__":
    raise RuntimeError(
        "This file cannot be imported; it must be executed as a script"
    )


def ignore_errors(func):
    @wraps(func)
    def safe_func(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except:
            pass

    return safe_func


def make_logger():
    global logger

    logger = logging.getLogger("fiftyone.service.cache")
    logger.handlers = []
    logger.propagate = False

    if log_to_disk:
        etau.ensure_basedir(log_path)

        logger.setLevel(logging.INFO)
        handler = logging.handlers.RotatingFileHandler(
            log_path,
            maxBytes=foc.media_cache.config.gc_log_max_bytes,
            backupCount=foc.media_cache.config.gc_log_backup_count,
        )
        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)


make_logger()


@ignore_errors
def garbage_collect():
    # Gracefully recover if logfile was deleted
    if log_to_disk and not os.path.isfile(log_path):
        make_logger()

    foc.media_cache.garbage_collect(_logger=logger)


schedule.every(interval).seconds.do(garbage_collect)

while True:
    schedule.run_pending()
    time.sleep(1)
