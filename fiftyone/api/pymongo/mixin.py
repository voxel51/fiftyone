"""
| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


class PymongoWebsocketProxyDunderMixin:
    """Mixin for adding dunder methods"""

    def __del__(self) -> None:
        self.close()

    def __enter__(self):
        return self

    def __exit__(self, *_, **__) -> None:
        self.close()

    def __iter__(self):
        return self

    def __next__(self):
        try:
            return self.next()
        except StopIteration as err:
            raise err
