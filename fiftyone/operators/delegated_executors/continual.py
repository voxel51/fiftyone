import time
import logging
import sys

import fiftyone.operators.delegated as food

logger = logging.getLogger(__name__)


class ContinualExecutor:
    """Continual Executor for Delegated Operations."""

    def __init__(self, interval: int = 10):
        self.running = True
        self.interval = interval
        self.dos = food.DelegatedOperationService()

    def signal_handler(self, sig, frame):
        logger.info("Received termination signal, stopping executor...")
        self.stop()
        sys.exit(0)

    def start(self):
        logger.info("Executor started")
        while self.running:
            self.dos.execute_queued_operations(limit=1, log=True)
            time.sleep(self.interval)

    def stop(self):
        # TODO handle currently processing operation
        logger.info("stopping daemon")
        self.running = False
