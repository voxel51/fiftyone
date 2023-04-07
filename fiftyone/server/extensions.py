"""
FiftyOne Server extensions

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import traceback

from strawberry.exceptions import StrawberryException
from strawberry.extensions import Extension
from strawberry.utils.await_maybe import AwaitableOrValue

from fiftyone.server.context import Context


class EndSession(Extension):
    async def on_execute(self) -> AwaitableOrValue[None]:
        yield
        result = self.execution_context.result
        if getattr(result, "errors", None):
            result.errors = [
                StrawberryException(
                    extensions={
                        "stack": traceback.format_tb(error.__traceback__)
                    },
                    nodes=error.nodes,
                    source=error.source,
                    positions=error.positions,
                    path=error.path,
                    original_error=error.original_error,
                    message=error.message,
                )
                for error in result.errors
            ]
        context: Context = self.execution_context.context
        await context.session.end_session()
