"""
FiftyOne Server extensions

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import traceback

from graphql import GraphQLError
from strawberry.extensions import Extension
from strawberry.utils.await_maybe import AwaitableOrValue


class EndSession(Extension):
    async def on_request_end(self) -> AwaitableOrValue[None]:
        result = self.execution_context.result
        if getattr(result, "errors", None):
            result.errors = [
                GraphQLError(
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
