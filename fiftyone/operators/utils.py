"""
FiftyOne operator utilities.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging


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
