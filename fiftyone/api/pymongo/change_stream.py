"""
| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import abc
from typing import TYPE_CHECKING, Any, Union

import pymongo

from fiftyone.api.pymongo import mixin, proxy

if TYPE_CHECKING:
    from fiftyone.api import pymongo as fomongo


class AbstractChangeStream(proxy.PymongoWebsocketProxy, abc.ABC):
    """Abstract proxy for change streams"""

    def __init__(
        self,
        target: Union[
            "fomongo.MongoClient",
            "fomongo.database.Database",
            "fomongo.collection.Collection",
        ],
        *args: Any,
        **kwargs: Any
    ):
        self.__target = target
        self.__attr = "watch"

        super().__init__(*args, **kwargs)

    @property
    def __proxy_api_client__(self) -> proxy.ProxyAPIClient:
        return self.__target.__proxy_api_client__

    @property
    def __proxy_api_context__(self) -> proxy.ProxyAPIContext:
        return [
            *self.__target.__proxy_api_context__,
            (self.__attr, self._proxy_init_args, self._proxy_init_kwargs),
        ]


class ChangeStream(
    mixin.PymongoWebsocketProxyDunderMixin, AbstractChangeStream
):
    """Proxy for pymongo.change_stream.ChangeStream"""

    __proxy_class__ = pymongo.change_stream.ChangeStream


class ClusterChangeStream(ChangeStream):
    """Proxy class for pymongo.change_stream.ClusterChangeStream"""

    __proxy_class__ = pymongo.change_stream.ClusterChangeStream

    def __init__(
        self, client: "fomongo.MongoClient", *args: Any, **kwargs: Any
    ):
        super().__init__(client, *args, **kwargs)


class CollectionChangeStream(ChangeStream):
    """Proxy class for pymongo.change_stream.CollectionChangeStream"""

    __proxy_class__ = pymongo.change_stream.CollectionChangeStream

    def __init__(
        self,
        collection: "fomongo.collection.Collection",
        *args: Any,
        **kwargs: Any
    ):
        super().__init__(collection, *args, **kwargs)


class DatabaseChangeStream(ChangeStream):
    """Proxy class for pymongo.change_stream.DatabaseChangeStream"""

    __proxy_class__ = pymongo.change_stream.DatabaseChangeStream

    def __init__(
        self, database: "fomongo.database.Database", *args: Any, **kwargs: Any
    ):
        super().__init__(database, *args, **kwargs)
