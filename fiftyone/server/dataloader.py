"""
FiftyOne Server dataloader

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import dataclass
import typing as t

from dacite import Config, from_dict
import motor.motor_asyncio as mtr
from strawberry.dataloader import DataLoader

from fiftyone.server.data import Info, HasCollectionType


@dataclass
class DataLoaderConfig:
    key: str
    filters: t.List[dict]


dataloaders: t.Dict[type, DataLoaderConfig] = {}


def get_dataloader(
    cls: t.Type[HasCollectionType],
    config: DataLoaderConfig,
    db: mtr.AsyncIOMotorDatabase,
    session: mtr.AsyncIOMotorClientSession,
) -> DataLoader[str, t.Optional[HasCollectionType]]:
    async def load_items(
        keys: t.List[str],
    ) -> t.List[t.Optional[HasCollectionType]]:
        results = {}
        if config.key == "id":
            config.key == "_id"
        async for doc in db[cls.get_collection_name()].find(
            {"$and": [{config.key: {"$in": keys}}] + config.filters}
        ):
            results[doc[config.key]] = doc

        def build(doc: dict = None) -> t.Optional[HasCollectionType]:
            if not doc:
                return None

            doc = cls.modifier(doc)
            return from_dict(cls, doc, config=Config(check_types=False))

        return [build(results.get(k, None)) for k in keys]

    return DataLoader(load_fn=load_items)


def get_dataloader_resolver(
    cls: t.Type[HasCollectionType], key: str, filters: t.List[dict]
) -> t.Callable[
    [str, Info],
    t.Coroutine[t.Any, t.Any, t.Optional[HasCollectionType]],
]:
    dataloaders[cls] = DataLoaderConfig(key=key, filters=filters)

    async def resolver(
        name: str, info: Info
    ) -> t.Awaitable[t.Optional[HasCollectionType]]:
        return await info.context.dataloaders[cls].load(name)

    resolver.__annotations__[key] = resolver.__annotations__.pop("name")

    return resolver
