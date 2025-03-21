import time
import logging
import logging.handlers
import sys
import random
from datetime import datetime, timedelta
from bson import ObjectId
import os

import fiftyone.internal.util as foiu
import fiftyone as fo
import fiftyone.operators.delegated as food
import fiftyone.core.storage as fos
import fiftyone.factory as fof
import fiftyone.operators.executor as foe
import fiftyone.operators.orchestrator as foo

logger = logging.getLogger(__name__)
root_logger = logging.getLogger()


class ContinualExecutor:
    """Continual Executor for Delegated Operations."""

    DO_LOGS = "do_logs"

    def __init__(
        self,
        do_svc: food.DelegatedOperationService,
        orch_svc: foo.OrchestratorService,
        execution_interval: int = 10,
        registration_interval: int = 600,
        instance_id: str = "builtin",
        instance_desc: str = "Builtin",
        log_directory_path: str = None,
    ):
        self.running = True
        self.execution_interval = execution_interval
        self.registration_interval = registration_interval
        self.instance_id = instance_id
        self.instance_desc = instance_desc
        self.do_svc = do_svc
        self.orch_svc = orch_svc
        self.file_handler = None
        self.temp_log_dir_path = None
        self.temp_log_path = None
        self.log_directory_path = log_directory_path

        self.configure_logging()

    def start(self):
        logger.info("Executor started")
        next_register_time = self.register()
        while self.running:
            if datetime.utcnow() >= next_register_time:
                next_register_time = self.register()
            self.execute()
            time.sleep(self.execution_interval)

    def execute(self):
        queued_ops = self.do_svc.list_operations(
            run_state=foe.ExecutionRunState.QUEUED,
            paging=fof.DelegatedOperationPagingParams(limit=1),
            delegation_target=self.instance_id,
        )
        for queued_op in queued_ops:
            log_path = self.create_log_path(str(queued_op.id))
            if self.file_handler is not None:
                self.file_handler.doRollover()
            results = self.do_svc.execute_operation(
                queued_op, log=True, log_path=log_path
            )
            if results:
                self.flush_logs(queued_op.id, log_path)

    def register(self):
        logger.info(f"Registering executor {self.instance_id}")
        self.orch_svc.register(
            instance_id=self.instance_id,
            description=self.instance_desc,
        )
        register_delta = random.gauss(self.registration_interval, 120)
        return datetime.utcnow() + timedelta(seconds=register_delta)

    def create_log_path(self, op_id: str):
        now = datetime.utcnow()
        return (
            fos.join(
                self.log_directory_path,
                self.DO_LOGS,
                str(now.year),
                str(now.month),
                str(now.day),
                op_id + ".log",
            )
            if self.log_directory_path
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
        if self.log_directory_path:
            self.temp_log_dir_path = fos.make_temp_dir(ensure_writeable=True)
            self.temp_log_path = fos.join(
                self.temp_log_dir_path, "fiftyone_delegated_executor.log"
            )
            formatter = logging.Formatter(
                fmt="%(asctime)s - %(levelname)s - %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
            self.file_handler = logging.handlers.RotatingFileHandler(
                filename=self.temp_log_path, mode="w"
            )
            self.file_handler.setFormatter(formatter)
            root_logger.addHandler(self.file_handler)

    def flush_logs(self, doc_id: ObjectId, run_link: str = None):
        if run_link:
            try:
                logger.info(f"Flushing logs to {run_link}")
                fos.copy_file(self.temp_log_path, run_link)
                self.do_svc.set_log_size(
                    doc_id, os.path.getsize(self.temp_log_path)
                )
            except Exception as e:
                logger.warning(
                    f"Failed to flush logs to bucket %s due to: %s",
                    run_link,
                    e,
                )
                self.do_svc.set_log_upload_error(doc_id, str(e))
            if not self.running:
                self.file_handler.close()
                fos.delete_dir(self.temp_log_dir_path)

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

        if error_message:
            raise RuntimeError(
                "Invalid runtime environment for "
                f"{self.__class__.__name__}:\n{error_message.strip()}"
            )
