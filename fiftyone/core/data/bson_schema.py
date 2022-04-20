from abc import ABC
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
import typing as t
from bson import ObjectId

from numpy import ndarray


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
    max_items: t.Optional[int] = None
    min_items: t.Optional[int] = None
    unique_items: t.Optional[bool] = None


@dataclass
class BSONSchemaBinaryProperty(BSONSchemaProperty):
    bson_type: t.Literal[BSONTypes.BINARY] = BSONTypes.BINARY


@dataclass
class BSONSchemaBoolProperty(BSONSchemaProperty):
    bson_type: t.Literal[BSONTypes.BOOL] = BSONTypes.BOOL


@dataclass
class BSONSchemaDateProperty(BSONSchemaProperty):
    bson_type: t.Literal[BSONTypes.DATE] = BSONTypes.DATE


@dataclass
class BSONSchemaDecimalProperty(BSONSchemaProperty):
    bson_type: t.Literal[BSONTypes.DECIMAL] = BSONTypes.DECIMAL
    maximum: t.Optional[float] = None
    minimum: t.Optional[float] = None
    multiple_of: t.Optional[float] = None


@dataclass
class BSONSchemaDoubleProperty(BSONSchemaProperty):
    bson_type: t.Literal[BSONTypes.DOUBLE] = BSONTypes.DOUBLE
    maximum: t.Optional[float] = None
    minimum: t.Optional[float] = None
    multiple_of: t.Optional[float] = None


@dataclass
class BSONSchemaEnumProperty(BSONSchemaProperty):
    bson_type: t.Literal[BSONTypes.STRING] = BSONTypes.STRING
    enum: t.List[str] = field(default_factory=list)


@dataclass
class BSONSchemaIntProperty(BSONSchemaProperty):
    bson_type: t.Literal[BSONTypes.INT] = BSONTypes.INT
    maximum: t.Optional[int] = None
    minimum: t.Optional[int] = None
    multiple_of: t.Optional[int] = None


@dataclass
class BSONSchemaLongProperty(BSONSchemaProperty):
    bson_type: t.Literal[BSONTypes.LONG] = BSONTypes.LONG
    maximum: t.Optional[int] = None
    minimum: t.Optional[int] = None
    multiple_of: t.Optional[int] = None


@dataclass
class BSONSchemaObjectProperty(BSONSchemaProperty):
    bson_type: t.Literal[BSONTypes.OBJECT] = BSONTypes.OBJECT
    max_properties: t.Optional[int] = None
    min_properties: t.Optional[int] = None
    properties: t.Dict[str, "BSONSchemaProperties"] = field(
        default_factory=dict
    )
    required: t.List[str] = field(default_factory=list)
    additional_properties: t.Union[bool, "BSONSchemaProperties"] = False


@dataclass
class BSONSchemaObjectIdProperty(BSONSchemaProperty):
    bson_type: t.Literal[BSONTypes.OBJECT_ID] = BSONTypes.OBJECT_ID


@dataclass
class BSONSchemaStringProperty(BSONSchemaProperty):
    bson_type: t.Literal[BSONTypes.STRING] = BSONTypes.STRING
    max_length: t.Optional[int] = None
    min_length: t.Optional[int] = None
    pattern: t.Optional[str] = None


@dataclass
class BSONSchemaTimestampProperty(BSONSchemaProperty):
    bson_type: t.Literal[BSONTypes.TIMESTAMP] = BSONTypes.TIMESTAMP


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
