"""
| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio


class PymongoWebsocketProxyAsyncDunderMixin:
    """Mixin for adding dunder methods"""

    def __del__(self, *_, **__) -> None:
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(self.close())
            else:
                loop.run_until_complete(self.close())
        except Exception:  # pylint: disable=broad-except
            ...

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_, **__) -> None:
        await self.close()

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            return self.next()
        except StopIteration as err:
            raise StopAsyncIteration from err
