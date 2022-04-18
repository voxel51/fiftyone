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

from .data import Data, DataMetaclass, FiftyOneDataError, asdict, fields
from .database import get_db_conn
from .datafield import Field, field
from .types import DocumentField as DocumentFieldDef
from .types import Field as FieldDef
from .types import JSONSchemaObjectProperty


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

    def __setitem__(cls: t.Type[_D], : _D) -> None:
        cls.__fiftyone_instances__[instance.id] = instance

    def __get_item__(cls, instance):
        try:
            return cls._instances[doc.collection_name][str(doc.id)]
        except KeyError:
            return None

    def _reload_instance(cls, obj):
        # pylint: disable=no-value-for-parameter
        cls._reload_doc(obj._doc.collection_name, obj.id)

    def _rename_fields(cls, collection_name, field_names, new_field_names):
        if collection_name not in cls._instances:
            return

        for sample in cls._instances[collection_name].values():
            data = sample._doc._data
            for field_name, new_field_name in zip(
                field_names, new_field_names
            ):
                data[new_field_name] = data.pop(field_name, None)

    def _clear_fields(cls, collection_name, field_names):
        if collection_name not in cls._instances:
            return

        for sample in cls._instances[collection_name].values():
            for field_name in field_names:
                sample._doc._data[field_name] = None

    def _purge_fields(cls, collection_name, field_names):
        if collection_name not in cls._instances:
            return

        for sample in cls._instances[collection_name].values():
            for field_name in field_names:
                sample._doc._data.pop(field_name, None)

    def _reload_doc(cls, collection_name, sample_id, hard=False):
        if collection_name not in cls._instances:
            return

        sample = cls._instances[collection_name].get(sample_id, None)
        if sample is not None:
            sample.reload(hard=hard)

    def _reload_docs(cls, collection_name, sample_ids=None, hard=False):
        if collection_name not in cls._instances:
            return

        samples = cls._instances[collection_name]

        if sample_ids is not None:
            sample_ids = set(sample_ids)
            for sample in samples.values():
                if sample.id in sample_ids:
                    sample.reload(hard=hard)
        else:
            for sample in samples.values():
                sample.reload(hard=hard)


    def _reset_docs(cls, collection_name, sample_ids=None):
        if collection_name not in cls._instances:
            return

        if sample_ids is not None:
            samples = cls._instances[collection_name]
            for sample_id in sample_ids:
                sample = samples.pop(sample_id, None)
                if sample is not None:
                    sample._reset_backing_doc()
        else:
            samples = cls._instances.pop(collection_name)
            for sample in samples.values():
                sample._reset_backing_doc()


class FiftyOneDocumentError(TypeError):
    pass


class Document(Data, metaclass=DocumentMetaclass):

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

    def to_json(self, pretty_print=False):
        return etas.json_to_str(self.to_dict(), pretty_print=pretty_print)

    def save(self) -> None:
        save(self)

    def reload(self, hard=False):
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


def reload(document: Document, hard: bool = False) -> None:
    db = get_db_conn()
    if not document.__fiftyone_collection__:
        raise FiftyOneDataError(
            "cannot save a document that has not been added to a dataset"
        )

    collection = db[document.__fiftyone_collection__]
    document.__dict__ = collection.find_one({"_id": document._id})


def save(document: Document) -> None:
    db = get_db_conn()
    if not document.__fiftyone_collection__:
        raise FiftyOneDataError(
            "cannot save a document that has not been added to a dataset"
        )

    collection = db[document.__fiftyone_collection__]
    collection.replace_one(
        asdict(document, dict_factory=dict, links=False), {"_id": document._id}
    )


def json_schemas(
    data: t.Union[t.Type[Data], Data]
) -> JSONSchemaObjectProperty:
    for field in fields(data):
        pass


def schema(
    data: t.Union[t.Type[Data], Data]
) -> t.Tuple[t.Union[DocumentFieldDef, FieldDef], ...]:
    l: t.List[t.Union[DocumentFieldDef, FieldDef]] = []
    for path, field in data.__fiftyone_schema__.items():
        if not field.type:
            raise FiftyOneDataError(f"field {field.name} has no type")

        d: t.Union[DocumentFieldDef, FieldDef]
        if issubclass(field.type, Document):
            d = DocumentFieldDef(path, str(field.type))
        else:
            d = FieldDef(path, str(field.type))

        l.append(d)

    return tuple(sorted(l, key=lambda d: d.path))
