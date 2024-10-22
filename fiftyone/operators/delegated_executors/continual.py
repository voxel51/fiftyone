import time
import logging
import logging.handlers
import sys
from datetime import datetime

import fiftyone.internal.util as foiu
import fiftyone as fo
import fiftyone.operators.delegated as food
import fiftyone.core.storage as fos
import fiftyone.factory as fof
import fiftyone.operators.executor as foe

logger = logging.getLogger(__name__)
root_logger = logging.getLogger()


class ContinualExecutor:
    """Continual Executor for Delegated Operations."""

    def __init__(self, interval: int = 10):
        self.running = True
        self.interval = interval
        self.dos = food.DelegatedOperationService()
        self.file_handler = None
        self.temp_dir = None
        self.log_path = None
        self.configure_logging()

    def start(self):
        logger.info("Executor started")
        while self.running:
            queued_ops = self.dos.list_operations(
                run_state=foe.ExecutionRunState.QUEUED,
                paging=fof.DelegatedOperationPagingParams(limit=1),
            )
            for queued_op in queued_ops:
                run_link = self.create_run_link(str(queued_op.id))
                results = self.dos.execute_operation(
                    queued_op, log=True, run_link=run_link
                )
                if results:
                    self.flush_logs(run_link)
            time.sleep(self.interval)

    def create_run_link(self, op_id: str):
        now = datetime.utcnow()
        return (
            fos.join(
                fo.config.delegated_operation_run_link_path,
                "do_logs",
                str(now.year),
                str(now.month),
                str(now.day),
                op_id + ".log",
            )
            if fo.config.delegated_operation_run_link_path
            else None
        )

    def signal_handler(self, sig, frame):
        logger.info("Received termination signal, stopping executor...")
        self.stop()
        sys.exit(0)

    def stop(self):
        logger.info("stopping daemon")
        self.running = False

    def configure_logging(self):
        if fo.config.delegated_operation_run_link_path is not None:
            self.temp_dir = fos.make_temp_dir()
            self.log_path = fos.join(
                self.temp_dir, "fiftyone_delegated_executor.log"
            )
            formatter = logging.Formatter(fmt="%(message)s")
            self.file_handler = logging.handlers.RotatingFileHandler(
                filename=self.log_path, mode="w"
            )
            self.file_handler.setFormatter(formatter)
            root_logger.addHandler(self.file_handler)

    def flush_logs(self, run_link: str = None):
        if run_link:
            try:
                logger.info(f"Flushing logs to {run_link}")
                fos.copy_file(self.log_path, run_link)
            except Exception as e:
                logger.warning(
                    f"Failed to flush logs to bucket %s due to: %s",
                    run_link,
                    e,
                )
            self.file_handler.doRollover()
            if not self.running:
                self.file_handler.close()
                fos.delete_dir(self.temp_dir)

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
