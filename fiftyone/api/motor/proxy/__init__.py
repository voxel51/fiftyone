"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import abc
import asyncio

from fiftyone.api.motor.proxy import abstract
from fiftyone.api.pymongo.proxy import abstract as _pymongo_abstract

TeamsContext = _pymongo_abstract.TeamsContext


class MotorRestProxy(
    _pymongo_abstract.AbstractPymongoRestProxy,
    abc.ABC,
    metaclass=abstract.MotorProxyMeta,
):
    ...


class MotorWebsocketProxy(
    _pymongo_abstract.AbstractPymongoWebsocketProxy,
    abc.ABC,
    metaclass=abstract.MotorProxyMeta,
):
    def __aiter__(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_, **__) -> None:
        await self.close()

    def __del__(self, *_, **__) -> None:
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(self.close())
            else:
                loop.run_until_complete(self.close())
        except Exception:
            pass

    async def close(self) -> None:
        return super().close()

    async def next(self):
        try:
            return super().next()
        except StopIteration as err:
            raise StopAsyncIteration from err

    __anext__ = next
