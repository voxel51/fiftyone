"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import abc

from fiftyone.api.pymongo.proxy import abstract

TeamsContext = abstract.TeamsContext


class PymongoRestProxy(
    abstract.AbstractPymongoRestProxy,
    abc.ABC,
    metaclass=abstract.PymongoProxyMeta,
):
    ...


class PymongoWebsocketProxy(
    abstract.AbstractPymongoWebsocketProxy,
    abc.ABC,
    metaclass=abstract.PymongoProxyMeta,
):
    def __del__(self) -> None:
        self.close()

    def __enter__(self):
        return self

    def __exit__(self, *_, **__) -> None:
        self.close()

    def __iter__(self):
        return self

    def __next__(self):
        return self.next()
