"""
FiftyOne Server mixins

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


class HasCollection(object):
    @staticmethod
    def get_collection_name() -> str:
        raise NotImplementedError(
            "subclasses must implement 'get_collection_name()'"
        )

    @staticmethod
    def modifier(doc: dict) -> dict:
        doc["id"] = doc.pop("_id")
        return doc
