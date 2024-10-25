import time
import logging
import logging.handlers
import sys
import random
from datetime import datetime, timedelta

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
        instance_id: str = "fiftyone-enterprise",
        instance_desc: str = "FiftyOne Enterprise",
        run_link_path: str = None,
    ):
        self.running = True
        self.execution_interval = execution_interval
        self.registration_interval = registration_interval
        self.instance_id = instance_id
        self.instance_desc = instance_desc
        self.do_svc = do_svc
        self.orch_svc = orch_svc
        self.file_handler = None
        self.temp_dir = None
        self.log_path = None
        self.run_link_path = run_link_path

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
            run_link = self.create_run_link(str(queued_op.id))
            results = self.do_svc.execute_operation(
                queued_op, log=True, run_link=run_link
            )
            if results:
                self.flush_logs(run_link)

    def register(self):
        logger.info(f"Registering executor {self.instance_id}")
        self.orch_svc.register(
            instance_id=self.instance_id,
            description=self.instance_desc,
        )
        register_delta = random.gauss(self.registration_interval, 120)
        return datetime.utcnow() + timedelta(seconds=register_delta)

    def create_run_link(self, op_id: str):
        now = datetime.utcnow()
        return (
            fos.join(
                self.run_link_path,
                self.DO_LOGS,
                str(now.year),
                str(now.month),
                str(now.day),
                op_id + ".log",
            )
            if self.run_link_path
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
        if self.run_link_path is not None:
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
