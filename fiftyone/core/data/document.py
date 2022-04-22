"""
FiftyOne singleton implementations.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t
import weakref

import eta.core.serial as etas
from bson import ObjectId

from fiftyone.core.database import get_db_conn

from .data import (
    Data,
    DataMetaclass,
    FiftyOneDataError,
    asdict,
)
from .datafield import Field, field


_D = t.TypeVar("_D", bound="Document")


class DocumentMetaclass(DataMetaclass):
    def __init__(
        cls,
        __name: str,
        __bases: t.Tuple[t.Type, ...],
        __dict: t.Dict[str, t.Any],
        **kwds: t.Any,
    ) -> None:
        super().__init__(__name, __bases, __dict, **kwds)

        cls.__fiftyone_instances__: t.MutableMapping[
            t.Tuple[t.Union[str, int], ...], "Document"
        ] = weakref.WeakValueDictionary()


class Document(Data, metaclass=DocumentMetaclass):

    __fiftyone_keys__: t.ClassVar[t.Tuple[str, ...]] = ("id",)
    __fiftyone_indexes__: t.ClassVar[t.Tuple[t.Any, ...]]
    __fiftyone_instances__: t.ClassVar[
        t.MutableMapping[(t.Tuple[t.Union[str, int], ...]), "Document"]
    ]

    _id: ObjectId = field(default_factory=ObjectId, required=True)
    id: str = field(link="_id", dump=ObjectId, load=str, required=True)

    def has_field(self, name: str) -> bool:
        return bool(self.__fiftyone_field__(name))

    def get_field(self, field_name: str) -> t.Any:
        return getattr(self, field_name)

    def set_field(self, name: str, value: t.Any, create: bool = True) -> None:
        if create:
            self[name] = value
        else:
            setattr(self, name, value)

    def update_fields(
        self, values: t.Dict[str, t.Any], expand_schema: bool = True
    ) -> None:
        for name, value in values.items():
            if expand_schema:
                self[name] = value
            else:
                setattr(self, name, value)

    def clear_field(self, field_name: str) -> None:
        del self[field_name]

    def iter_fields(
        self, include_id: bool = False
    ) -> t.Iterator[t.Tuple[str, Field]]:
        for name in self.__fiftyone_fields__:
            if name.startswith("_"):
                continue

            if name == "id" and not include_id:
                continue

            field: Field = self.__fiftyone_field__(name)  # type: ignore
            yield name, field

    def merge(
        self,
        document: "Document",
        fields=None,
        omit_fields=None,
        merge_lists=True,
        overwrite=True,
        expand_schema=True,
    ):
        if not overwrite:
            existing_field_names = set(self.field_names)

        fields = document._parse_fields(fields=fields, omit_fields=omit_fields)

        for src_field, dst_field in fields.items():
            value = document[src_field]

            if value is None:
                continue

            try:
                curr_value = self[dst_field]
            except KeyError:
                curr_value = None

            if merge_lists:
                field_type = type(curr_value)

                if issubclass(field_type, list):
                    if value is not None:
                        curr_value.extend(
                            v for v in value if v not in curr_value
                        )

                    continue

                if field_type in fol._LABEL_LIST_FIELDS:
                    if value is not None:
                        list_field = field_type._LABEL_LIST_FIELD
                        _merge_labels(
                            curr_value[list_field],
                            value[list_field],
                            overwrite=overwrite,
                        )

                    continue

            if (
                not overwrite
                and dst_field in existing_field_names
                and curr_value is not None
            ):
                continue

            self.set_field(dst_field, value, create=expand_schema)

    def to_dict(self) -> t.Dict:
        return asdict(self)

    def to_json(self, pretty_print: bool = False) -> str:
        return etas.json_to_str(self.to_dict(), pretty_print=pretty_print)

    def save(self) -> None:
        save(self)

    def reload(self, hard: bool = False) -> None:

        d = self._dataset._sample_collection.find_one({"_id": self._id})
        self._doc = self._dataset._sample_dict_to_doc(d)
        if hard:
            self._reload_backing_doc()
        else:
            self._doc.reload(*list(self._doc))

    @classmethod
    def from_dict(cls: t.Type[_D], d: t.Dict[str, t.Any]) -> _D:
        return cls(**d)

    @classmethod
    def from_json(cls: t.Type[_D], path: str) -> _D:
        return cls.from_dict(etas.load_json(path))


def reload(document: Document) -> None:
    db = get_db_conn()
    if not document.__fiftyone_ref__.collections:
        raise FiftyOneDataError(
            "cannot save a document that has not been added to a dataset"
        )

    collection = db[
        document.__fiftyone_ref__.collections[document.__fiftyone_path__ or ""]
    ]
    document.__dict__ = collection.find_one(
        {key: document.__dict__[key] for key in document.__fiftyone_keys__}
    )


def save(document: Document) -> None:
    db = get_db_conn()
    if not document.__fiftyone_ref__.in_db:
        raise FiftyOneDataError(
            "cannot save a document that has not been added to a dataset"
        )

    if document.__fiftyone_ref__.expanded:
        commit_schema(document.__fiftyone_ref__)

    collection = db[
        document.__fiftyone_ref__.collections[document.__fiftyone_path__ or ""]
    ]
    collection.replace_one(
        asdict(document, dict_factory=dict, links=False), {"_id": document._id}
    )
