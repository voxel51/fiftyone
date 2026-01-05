"""
FiftyOne SSE operators.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging

import fiftyone.operators as foo
from fiftyone.operators.executor import ExecutionContext
from fiftyone.operators.remote_notifier import default_sse_notifier

logger = logging.getLogger(__name__)


class SseOperatorConfig(foo.OperatorConfig):
    def __init__(
        self,
        name,
        label,
        store_name,
        description=None,
        icon=None,
        light_icon=None,
        dark_icon=None,
    ):
        super().__init__(
            name,
            label=label,
            description=description,
            icon=icon,
            light_icon=light_icon,
            dark_icon=dark_icon,
        )
        self.store_name = store_name


class SseOperator(foo.Operator):
    IS_SSE_OPERATOR = True

    @property
    def subscription_config(self):
        raise NotImplementedError(
            "Subscriptions must define subscription_config"
        )

    @property
    def config(self):
        return self.subscription_config

    async def execute(self, ctx: ExecutionContext):
        if not self.subscription_config:
            raise ValueError("subscription_config must be defined")

        dataset_id = ctx.request_params.get("dataset_id", None)

        return await default_sse_notifier.get_event_source_response(
            self.subscription_config.store_name,
            dataset_id,
        )
