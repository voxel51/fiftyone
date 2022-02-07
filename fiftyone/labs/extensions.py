"""
FiftyOne Teams extensions.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from strawberry.extensions import Extension

from .context import Context


class EndSession(Extension):
    async def on_request_end(self):
        context: Context = self.execution_context.context
        await context.session.end_session()
