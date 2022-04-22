import typing as t
from abc import ABC
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from enum import Enum
from dacite import from_dict

from pymongo.database import Database
import eta.core.utils as etau
from bson import ObjectId
from numpy import ndarray

from .datafield import Field
from .definitions import (
    DictDefinition,
    DocumentFieldDefinition,
    FieldDefinition,
    ListDefinition,
    TupleDefinition,
    get_type,
    get_type_definition,
)
from .exceptions import FiftyOneDataError


class BSONTypes(str, Enum):
    ARRAY = "array"
    BOOL = "bool"
    BINARY = "binData"
    DATE = "date"
    DOUBLE = "double"
    DECIMAL = "decimal"
    INT = "int"
    OBJECT = "object"
    OBJECT_ID = "objectId"
    LONG = "long"
    STRING = "string"
    TIMESTAMP = "timestamp"


@dataclass
class BSONSchemaProperty(ABC):
    description: t.Optional[str] = None
    title: t.Optional[str] = None


@dataclass
class BSONSchemaArrayProperty(BSONSchemaProperty):
    items: t.Optional[
        t.Union[t.List["BSONSchemaProperties"], "BSONSchemaProperties"]
    ] = None
    maxItems: t.Optional[int] = None
    minItems: t.Optional[int] = None
    uniqueItems: t.Optional[bool] = None


@dataclass
class BSONSchemaBinaryProperty(BSONSchemaProperty):
    bsonType: t.Literal[BSONTypes.BINARY] = BSONTypes.BINARY


@dataclass
class BSONSchemaBoolProperty(BSONSchemaProperty):
    bsonType: t.Literal[BSONTypes.BOOL] = BSONTypes.BOOL


@dataclass
class BSONSchemaDateProperty(BSONSchemaProperty):
    bsonType: t.Literal[BSONTypes.DATE] = BSONTypes.DATE


@dataclass
class BSONSchemaDecimalProperty(BSONSchemaProperty):
    bsonType: t.Literal[BSONTypes.DECIMAL] = BSONTypes.DECIMAL
    maximum: t.Optional[float] = None
    minimum: t.Optional[float] = None
    multipleOf: t.Optional[float] = None


@dataclass
class BSONSchemaDoubleProperty(BSONSchemaProperty):
    bson_type: t.Literal[BSONTypes.DOUBLE] = BSONTypes.DOUBLE
    maximum: t.Optional[float] = None
    minimum: t.Optional[float] = None
    multipleOf: t.Optional[float] = None


@dataclass
class BSONSchemaEnumProperty(BSONSchemaProperty):
    bsonType: t.Literal[BSONTypes.STRING] = BSONTypes.STRING
    enum: t.List[str] = field(default_factory=list)


@dataclass
class BSONSchemaIntProperty(BSONSchemaProperty):
    bsonType: t.Literal[BSONTypes.INT] = BSONTypes.INT
    maximum: t.Optional[int] = None
    minimum: t.Optional[int] = None
    multipleOf: t.Optional[int] = None


@dataclass
class BSONSchemaLongProperty(BSONSchemaProperty):
    bsonType: t.Literal[BSONTypes.LONG] = BSONTypes.LONG
    maximum: t.Optional[int] = None
    minimum: t.Optional[int] = None
    multipleOf: t.Optional[int] = None


@dataclass
class BSONSchemaObjectProperty(BSONSchemaProperty):
    bsonType: t.Literal[BSONTypes.OBJECT] = BSONTypes.OBJECT
    maxProperties: t.Optional[int] = None
    minProperties: t.Optional[int] = None
    properties: t.Dict[str, "BSONSchemaProperties"] = field(
        default_factory=dict
    )
    required: t.List[str] = field(default_factory=list)
    additionalProperties: t.Union[bool, "BSONSchemaProperties"] = False


@dataclass
class BSONSchemaObjectIdProperty(BSONSchemaProperty):
    bsonType: t.Literal[BSONTypes.OBJECT_ID] = BSONTypes.OBJECT_ID


@dataclass
class BSONSchemaStringProperty(BSONSchemaProperty):
    bsonType: t.Literal[BSONTypes.STRING] = BSONTypes.STRING
    maxLength: t.Optional[int] = None
    minLength: t.Optional[int] = None
    pattern: t.Optional[str] = None


@dataclass
class BSONSchemaTimestampProperty(BSONSchemaProperty):
    bsonType: t.Literal[BSONTypes.TIMESTAMP] = BSONTypes.TIMESTAMP


BSONSchemaProperties = t.Union[
    BSONSchemaIntProperty,
    BSONSchemaDoubleProperty,
    BSONSchemaLongProperty,
    BSONSchemaDecimalProperty,
    BSONSchemaStringProperty,
    BSONSchemaEnumProperty,
    BSONSchemaObjectProperty,
    "BSONSchemaArrayProperty",
]


BSON_TYPE_MAP = {
    date: BSONSchemaDateProperty,
    datetime: BSONSchemaTimestampProperty,
    bool: BSONSchemaBoolProperty,
    bytes: BSONSchemaBinaryProperty,
    Enum: BSONSchemaEnumProperty,
    float: BSONSchemaDoubleProperty,
    int: BSONSchemaIntProperty,
    ObjectId: BSONSchemaObjectIdProperty,
    ndarray: BSONSchemaBinaryProperty,
    str: BSONSchemaStringProperty,
}


def _get_path_property(
    path: str, bson_schemas: t.Dict[str, BSONSchemaObjectProperty]
) -> BSONSchemaProperties:
    schema = sorted(filter(lambda s: path.startswith(s), bson_schemas))[-1]

    names = path.split(".")[len(schema.split(".")) :]
    property: BSONSchemaProperties = bson_schemas[schema]

    for name in names[:-1]:
        if not isinstance(property, BSONSchemaObjectProperty):
            raise FiftyOneDataError("todo")

        property = property.properties[name]
        if isinstance(
            property, (BSONSchemaArrayProperty, BSONSchemaObjectProperty)
        ):
            property = _unwind_to_object_property(property)

    return property


def _unwind_to_object_property(
    property: t.Union[BSONSchemaObjectProperty, BSONSchemaArrayProperty],
) -> BSONSchemaObjectProperty:
    while (
        not isinstance(property, BSONSchemaObjectProperty)
        or property.additionalProperties is not False
    ):
        if isinstance(property, BSONSchemaArrayProperty):
            if not isinstance(property.items, BSONSchemaObjectProperty):
                raise FiftyOneDataError("unwound to undefined bson property")

            property = property.items
            continue

        if isinstance(property, BSONSchemaObjectProperty):
            if not isinstance(
                property.additionalProperties, BSONSchemaObjectProperty
            ):
                raise FiftyOneDataError("todo")

            property = property.additionalProperties
            continue

        if not isinstance(
            property, (BSONSchemaArrayProperty, BSONSchemaObjectProperty)
        ):
            raise FiftyOneDataError("todo")

    return property


def as_bson_schemas(
    collections: t.List[str], schema: t.Dict[str, Field]
) -> t.Dict[str, BSONSchemaObjectProperty]:
    paths = sorted(schema)
    bson_schemas: t.Dict[str, BSONSchemaObjectProperty] = {
        path: BSONSchemaObjectProperty() for path in collections
    }

    for path in paths:
        names = path.split(".")
        property = _get_path_property(".".join(names[:-1]), bson_schemas)

        field = schema[path]

        if (
            not isinstance(property, BSONSchemaObjectProperty)
            or not field.type
        ):
            raise FiftyOneDataError("todo")

        property.properties[names[-1]] = _type_definition_as_bson_property(
            get_type_definition(field.type)
        )

    return bson_schemas


def _type_definition_as_bson_property(
    definition: t.Union[DictDefinition, ListDefinition, TupleDefinition, str]
) -> BSONSchemaProperties:
    property: BSONSchemaProperties

    if isinstance(definition, DictDefinition):
        property = BSONSchemaObjectProperty(additional_properties=True)

        if definition.value:
            property.additionalProperties = _type_definition_as_bson_property(
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

    from .data import Data

    if issubclass(cls, Data):
        property = BSONSchemaObjectProperty()

        from .data import fields

        for field in fields(cls):
            if not field.name or not field.type:
                raise FiftyOneDataError("todo")

            property.properties[
                field.name
            ] = _type_definition_as_bson_property(
                get_type_definition(field.type)
            )

            property.required.append(field.name)

        property.required = sorted(property.required)
        return property

    if cls in BSON_TYPE_MAP:
        return BSON_TYPE_MAP[cls]()

    raise FiftyOneDataError("todo")


def as_schema(
    field_definitions: t.List[
        t.Union[DocumentFieldDefinition, FieldDefinition]
    ],
    bson_schemas: t.Dict[str, BSONSchemaObjectProperty],
) -> t.Dict[str, Field]:
    schema = {
        definition.path: Field(
            name=definition.path.split(".")[-1],
            type=get_type(definition.type),
        )
        for definition in field_definitions
    }

    for path in schema:
        names = path.split(".")
        name = names[-1]
        field = schema[path]
        parent = ".".join(names[:-1])
        property = _get_path_property(parent, bson_schemas)

        if not isinstance(property, BSONSchemaObjectProperty):
            raise FiftyOneDataError("adfa")

        if name in property.required:
            field.required = True

    return schema


def commit_bson_schema(
    db: Database,
    collection: str,
    schema: BSONSchemaObjectProperty,
) -> None:
    db.command(
        {
            "collMod": collection,
            "validationLevel": "strict",
            "validationAction": "error",
            "validator": {
                "$jsonSchema": asdict(
                    schema,
                    dict_factory=lambda d: dict(t for t in d if t[1]),
                )
            },
        }
    )


def load_bson_schemas(
    db: Database, collections: t.Dict[str, str]
) -> t.Dict[str, BSONSchemaObjectProperty]:
    reverse = {v: k for k, v in collections.items()}
    return {
        reverse[result["name"]]: from_dict(
            BSONSchemaObjectProperty,
            result["options"]["validator"]["$jsonSchema"],
        )
        for result in db.command(
            {
                "listCollections": 1,
                "filter": {"name": {"$in": list(collections.values())}},
            }
        )["cursor"]["firstBatch"]
    }
