"""
FiftyOne operator utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from datetime import datetime, timedelta
import logging

from .operator import Operator


class ProgressHandler(logging.Handler):
    """A logging handler that reports all logging messages issued while the
    handler's context manager is active to the provided execution context's
    :meth:`set_progress() <fiftyone.operators.executor.ExecutionContext.set_progress>`
    method.

    Args:
        ctx: an :class:`fiftyone.operators.executor.ExecutionContext`
        logger (None): a specific ``logging.Logger`` for which to report
            records. By default, the root logger is used
        level (None): an optional logging level above which to report records.
            By default, the logger's effective level is used
    """

    def __init__(self, ctx, logger=None, level=None):
        super().__init__()
        self.ctx = ctx
        self.logger = logger
        self.level = level

    def __enter__(self):
        if self.logger is None:
            self.logger = logging.getLogger()

        if self.level is None:
            self.level = self.logger.getEffectiveLevel()

        self.setLevel(self.level)
        self.logger.addHandler(self)

    def __exit__(self, *args):
        try:
            self.logger.removeHandler(self)
        except:
            pass

    def emit(self, record):
        msg = self.format(record)
        self.ctx.set_progress(label=msg)


def is_method_overridden(base_class, sub_class_instance, method_name):
    """Returns whether a method is overridden in a subclass.

    Args:
        base_class: the base class
        sub_class_instance: an instance of the subclass
        method_name: the name of the method

    Returns:
        True/False
    """

    base_method = getattr(base_class, method_name, None)
    sub_method = getattr(type(sub_class_instance), method_name, None)
    return base_method != sub_method


def is_new(release_date, days=30):
    """
    Determines if a feature is considered "new" based on its release date.

    A feature is considered new if its release date is within the specified
    number of days.

    Examples::

        is_new("2024-11-09")
        # True if today's date is within 30 days after 2024-11-09

        is_new(datetime(2024, 11, 9), days=15)
        # True if today's date is within 15 days after November 9, 2024

        is_new("2024-10-01", days=45)
        # False if today's date is more than 45 days after October 1, 2024

    Args:
        release_date: the release date of the feature, in one of the following
            formats:

            -   a string in the format ``"%Y-%m-%d"``, e.g., ``"2024-11-09"``
            -   a datetime instance

        days (30): the number of days for which the feature is considered new

    Returns:
        True/False whether the release date is within the specified number of
        days
    """
    if isinstance(release_date, str):
        release_date = datetime.strptime(release_date, "%Y-%m-%d")
    elif not isinstance(release_date, datetime):
        raise ValueError("release_date must be a string or datetime object")

    return (datetime.now() - release_date).days <= days
