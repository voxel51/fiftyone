"""
FiftyOne Teams dataloader.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t

from dacite import Config, from_dict
import motor as mtr
import motor.motor_tornado as mtrt
from strawberry.dataloader import DataLoader

from .utils import Info, GenericID, HasCollectionType


dataloaders: t.Dict[t.Type[HasCollectionType], str] = {}


def get_dataloader(
    cls: t.Type[HasCollectionType],
    key: str,
    db: mtr.MotorDatabase,
    session: mtrt.MotorClientSession,
) -> DataLoader[HasCollectionType]:
    async def load_items(keys: GenericID) -> t.List[HasCollectionType]:
        results = {}
        if key == "id":
            key == "_id"
        async for doc in db[cls.get_collection_name()].find(
            {key: {"$in": keys}}
        ):
            results[doc[key]] = doc
            doc["id"] = doc.pop("_id")

        def build(doc):
            if doc:
                return from_dict(cls, doc, config=Config(check_types=False))

            return None

        return [build(results.get(k, None)) for k in keys]

    return DataLoader(load_fn=load_items)


def get_dataloader_resolver(
    cls: t.Type[HasCollectionType], key: str
) -> t.Callable[[GenericID, Info], t.Awaitable[HasCollectionType]]:
    dataloaders[cls] = key

    async def resolver(id: GenericID, info: Info) -> HasCollectionType:
        return await info.context.dataloaders[cls].load(id)

    return resolver
