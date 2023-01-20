"""
FiftyOne Server dataloader

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import dataclass
import typing as t

from dacite import Config, from_dict
import motor.motor_asyncio as mtr
from strawberry.dataloader import DataLoader

from fiftyone.server.data import Info, T

# from fiftyone.server.query import SavedView


@dataclass
class DataLoaderConfig:
    collection: str
    key: str
    filters: t.List[dict]
    projections: t.Optional[t.Dict]


dataloaders: t.Dict[type, DataLoaderConfig] = {}


def get_dataloader(
    cls: t.Type[T],
    config: DataLoaderConfig,
    db: mtr.AsyncIOMotorDatabase,
    session: mtr.AsyncIOMotorClientSession,
) -> DataLoader[str, t.Optional[T]]:
    async def load_items(
        keys: t.List[str],
    ) -> t.List[t.Optional[T]]:
        results = {}
        if config.key == "id":
            config.key = "_id"
        find_params = [
            {"$and": [{config.key: {"$in": keys}}] + config.filters}
        ]
        if config.projections:
            find_params.append(config.projections)

        async for doc in db[config.collection].find(*find_params):
            results[doc[config.key]] = doc

        def build(doc: dict = None) -> t.Optional[T]:
            if not doc:
                return None

            doc = cls.modifier(doc)
            return from_dict(cls, doc, config=Config(check_types=False))

        return [build(results.get(k, None)) for k in keys]

    return DataLoader(load_fn=load_items)


def get_dataloader_resolver(
    cls: t.Type[T],
    collection: str,
    key: str,
    filters: t.List[dict],
    projections: t.Optional[t.Dict] = None,
) -> t.Callable[[str, Info], t.Coroutine[t.Any, t.Any, t.Optional[T]],]:
    dataloaders[cls] = DataLoaderConfig(
        collection=collection,
        key=key,
        filters=filters,
        projections=projections,
    )

    async def resolver(name: str, info: Info) -> t.Awaitable[t.Optional[T]]:
        return await info.context.dataloaders[cls].load(name)

    resolver.__annotations__[key] = resolver.__annotations__.pop("name")
    return resolver
