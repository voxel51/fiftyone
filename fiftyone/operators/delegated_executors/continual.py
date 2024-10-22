import time
import logging
import sys

import fiftyone.internal.util as foiu
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

    def validate(self):
        """Ensure conditions this executor expects to be operating under.

        raises:
            RuntimeError:   If conditions are not met
        """
        error_message = ""
        if not foiu.is_internal_service():
            error_message += (
                "- Must be running with `FIFTYONE_INTERNAL_SERVICE=1`\n"
            )
        if not foiu.has_encryption_key():
            error_message += (
                "- Must be configured with a `FIFTYONE_ENCRYPTION_KEY`\n"
            )
        if not foiu.has_api_key():
            error_message += (
                "- Must be configured with an admin `FIFTYONE_API_KEY`\n"
            )

        if error_message:
            raise RuntimeError(
                "Invalid runtime environment for "
                f"{self.__class__.__name__}:\n{error_message.strip()}"
            )
