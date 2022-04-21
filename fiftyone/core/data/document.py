"""
FiftyOne singleton implementations.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t
import weakref

import eta.core.serial as etas
import eta.core.utils as etau
from bson import ObjectId

from .bson_schema import (
    BSON_TYPE_MAP,
    BSONSchemaArrayProperty,
    BSONSchemaObjectProperty,
    BSONSchemaProperties,
)
from .data import (
    PRIMITIVES,
    Data,
    DataMetaclass,
    FiftyOneDataError,
    asdict,
    fields,
)
from .database import get_db_conn
from .datafield import Field, field
from .types import (
    DictDefinition,
    DocumentFieldDefinition,
    FieldDefinition,
    ListDefinition,
    TupleDefinition,
)


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
    if not document.__fiftyone_ref__.collections:
        raise FiftyOneDataError(
            "cannot save a document that has not been added to a dataset"
        )

    collection = db[
        document.__fiftyone_ref__.collections[document.__fiftyone_path__ or ""]
    ]
    collection.replace_one(
        asdict(document, dict_factory=dict, links=False), {"_id": document._id}
    )


def _get_type_definition(
    type: t.Type,
) -> t.Union[DictDefinition, ListDefinition, TupleDefinition, str]:
    if type == list or getattr(type, "__origin__", None) == list:
        return ListDefinition(
            type=_get_type_definition(getattr(type, "__args__", (None,))[0])
        )

    if type == dict or getattr(type, "__origin__", None) == dict:
        (key, value) = getattr(type, "__args__", ("str", None))
        if key not in (int, str):
            raise FiftyOneDataError("invalid key type for dict field")

        return DictDefinition(key=key, value=_get_type_definition(value))

    if type == tuple or getattr(type, "__origin__", None) == tuple:
        args = getattr(type, "__args__", None)
        if not args or any(a not in PRIMITIVES for a in args):
            raise FiftyOneDataError("invalid tuple type for field")

        return TupleDefinition(types=[_get_type_definition(a) for a in args])

    return etau.get_class_name(type)


def _unwind_to_object_property(
    property: t.Union[BSONSchemaObjectProperty, BSONSchemaArrayProperty],
) -> BSONSchemaObjectProperty:
    while (
        not isinstance(property, BSONSchemaObjectProperty)
        or property.additional_properties is not False
    ):
        if isinstance(property, BSONSchemaArrayProperty):
            if not isinstance(property.items, BSONSchemaObjectProperty):
                raise FiftyOneDataError("unwound to undefined bson property")

            property = property.items
            continue

        if isinstance(property, BSONSchemaObjectProperty):
            if not isinstance(
                property.additional_properties, BSONSchemaObjectProperty
            ):
                raise FiftyOneDataError("todo")

            property = property.additional_properties
            continue

        if not isinstance(
            property, (BSONSchemaArrayProperty, BSONSchemaObjectProperty)
        ):
            raise FiftyOneDataError("todo")


def _type_definition_as_bson_property(
    definition: t.Union[DictDefinition, ListDefinition, TupleDefinition, str]
) -> BSONSchemaProperties:
    property: BSONSchemaProperties

    if isinstance(definition, DictDefinition):
        property = BSONSchemaObjectProperty(additional_properties=True)

        if definition.value:
            property.additional_properties = _type_definition_as_bson_property(
                definition.value
            )
        return property

    if isinstance(definition, ListDefinition):
        property = BSONSchemaArrayProperty()

        if definition.type:
            property.items = _type_definition_as_bson_property(definition.type)

        return property

    if isinstance(definition, TupleDefinition):
        property = BSONSchemaArrayProperty()

        if definition.types:
            property.items = [
                _type_definition_as_bson_property(a) for a in definition.types
            ]

        return property

    cls = etau.get_class(definition)

    if issubclass(cls, Data):
        property = BSONSchemaObjectProperty()

        for field in fields(cls):
            if not field.name or not field.type:
                raise FiftyOneDataError("todo")

            property.properties[
                field.name
            ] = _type_definition_as_bson_property(
                _get_type_definition(field.type)
            )

            property.required.append(field.name)

        property.required = sorted(property.required)
        return property

    if cls in BSON_TYPE_MAP:
        return BSON_TYPE_MAP[cls]()

    raise FiftyOneDataError("todo")


def _get_path_property(
    path: str, bson_schema: BSONSchemaObjectProperty
) -> BSONSchemaProperties:
    names = path.split(".")
    property: BSONSchemaProperties = bson_schema
    for name in names[:-1]:
        if not isinstance(property, BSONSchemaObjectProperty):
            raise FiftyOneDataError("todo")

        property = property.properties[name]
        if isinstance(
            property, (BSONSchemaArrayProperty, BSONSchemaObjectProperty)
        ):
            property = _unwind_to_object_property(property)

    return property


def as_bson_schema(schema: t.Dict[str, Field]) -> BSONSchemaObjectProperty:
    paths = sorted(schema)
    bson_schema = BSONSchemaObjectProperty()
    for path in paths:
        names = path.split(".")
        property = _get_path_property(".".join(names[:-1]), bson_schema)

        field = schema[path]

        if (
            not isinstance(property, BSONSchemaObjectProperty)
            or not field.type
        ):
            raise FiftyOneDataError("todo")

        property.properties[names[-1]] = _type_definition_as_bson_property(
            _get_type_definition(field.type)
        )

    return bson_schema


def as_field_definitions(
    schema: t.Dict[str, Field]
) -> t.List[t.Union[DocumentFieldDefinition, FieldDefinition]]:
    fields: t.List[t.Union[DocumentFieldDefinition, FieldDefinition]] = []
    for path, field in schema.items():
        if not field.type:
            raise FiftyOneDataError(f"field {field.name} has no type")

        d: t.Union[DocumentFieldDefinition, FieldDefinition]
        type = _get_type_definition(field.type)
        if issubclass(field.type, Document):
            d = DocumentFieldDefinition(path, type)
        else:
            d = FieldDefinition(path, type)

        fields.append(d)

    return sorted(fields, key=lambda d: d.path)


def _make_type(
    definition: t.Union[DictDefinition, ListDefinition, TupleDefinition, str]
) -> t.Type:
    if isinstance(definition, DictDefinition):
        return t.Dict[
            etau.get_class(definition.key),
            _make_type(definition.value) if definition.value else t.Any,
        ]

    if isinstance(definition, ListDefinition):
        return (
            t.List[_make_type(definition.type)] if definition.type else t.List
        )

    if isinstance(definition, TupleDefinition):
        return (
            t.Tuple[tuple(_make_type(a) for a in definition.types)]
            if definition.types
            else t.Tuple
        )

    return etau.get_class(definition)


def as_schema(
    field_definitions: t.List[
        t.Union[DocumentFieldDefinition, FieldDefinition]
    ],
    bson_schema: BSONSchemaObjectProperty,
) -> t.Dict[str, Field]:
    schema = {
        definition.path: Field(
            name=definition.path.split(".")[-1],
            type=_make_type(definition.type),
        )
        for definition in field_definitions
    }

    for path in schema:
        names = path.split(".")
        name = names[-1]
        field = schema[path]
        parent = ".".join(names[:-1])
        property = _get_path_property(parent, bson_schema)

        if not isinstance(property, BSONSchemaObjectProperty):
            raise FiftyOneDataError("adfa")

        if name in property.required:
            field.required = True

    return schema
