"""
FiftyOne Server extensions

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import traceback

from strawberry.extensions import Extension
from strawberry.utils.await_maybe import AwaitableOrValue

from fiftyone.server.context import Context


class EndSession(Extension):
    async def on_request_end(self) -> AwaitableOrValue[None]:
        context: Context = self.execution_context.context
        await context.session.end_session()

        if self.execution_context.errors:

            for exception in self.execution_context.errors:
                exception.extensions = {
                    "stack": traceback.format_tb(exception.__traceback__)
                }

        return super().on_request_end()
