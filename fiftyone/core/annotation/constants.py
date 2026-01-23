"""
Annotation constants

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.metadata as fomm
from fiftyone.core.odm import DynamicEmbeddedDocument


### Components


CHECKBOX = "checkbox"
CHECKBOXES = "checkboxes"
DATEPICKER = "datepicker"
DROPDOWN = "dropdown"
JSON = "json"
RADIO = "radio"
SLIDER = "slider"
TEXT = "text"
TOGGLE = "toggle"


### Types


BOOL = "bool"
DATE = "date"
DATETIME = "datetime"
DICT = "dict"
FLOAT = "float"
FLOAT_LIST = "list<float>"
ID = "id"
INT = "int"
INT_LIST = "list<int>"
STR = "str"
STR_LIST = "list<str>"


### Settings


ATTRIBUTES = "attributes"
CLASSES = "classes"
COMPONENT = "component"
DEFAULT = "default"
NAME = "name"
PRECISION = "precision"
RANGE = "range"
READ_ONLY = "read_only"
STEP = "step"
TYPE = "type"
VALUES = "values"


### Acceptable component types


BOOL_COMPONENTS = {CHECKBOX, TOGGLE}
DATE_DATETIME_COMPONENTS = {DATEPICKER}
DICT_COMPONENTS = {JSON}
FLOAT_INT_COMPONENTS = {DROPDOWN, RADIO, SLIDER, TEXT}
FLOAT_INT_LIST_COMPONENTS = {CHECKBOXES, DROPDOWN, TEXT}
ID_COMPONENTS = {TEXT}
STR_COMPONENTS = {DROPDOWN, RADIO, TEXT}
STR_LIST_COMPONENTS = {CHECKBOXES, DROPDOWN, TEXT}


### Settings constraints


ALL_TYPES_SETTINGS = {COMPONENT, READ_ONLY, TYPE}
BOOL_SETTINGS = ALL_TYPES_SETTINGS.union({DEFAULT})
DATE_DATETIME_SETTINGS = ALL_TYPES_SETTINGS.union({DEFAULT})
DICT_SETTINGS = ALL_TYPES_SETTINGS.union({DEFAULT})
FLOAT_INT_SETTINGS = ALL_TYPES_SETTINGS.union({DEFAULT})
FLOAT_SETTINGS = {PRECISION}
FLOAT_INT_LIST_SETTINGS = ALL_TYPES_SETTINGS.union({DEFAULT})
ID_SETTINGS = ALL_TYPES_SETTINGS
LABEL_SETTINGS = ALL_TYPES_SETTINGS.union({ATTRIBUTES, DEFAULT})
SLIDER_SETTINGS = {RANGE, STEP}
STR_SETTINGS = ALL_TYPES_SETTINGS.union({DEFAULT})
STR_LIST_SETTINGS = ALL_TYPES_SETTINGS.union({DEFAULT})
VALUES_COMPONENTS = {CHECKBOXES, DROPDOWN, RADIO}


### Default components


DEFAULT_COMPONENTS = {
    BOOL: TOGGLE,
    DATE: DATEPICKER,
    DATETIME: DATEPICKER,
    DICT: JSON,
    FLOAT: TEXT,
    FLOAT_LIST: TEXT,
    ID: TEXT,
    INT: TEXT,
    INT_LIST: TEXT,
    STR: TEXT,
    STR_LIST: TEXT,
}


### Default fields


BOUNDING_BOX = "bounding_box"
FILEPATH = "filepath"
LABEL = "label"
POINTS = "points"


### Field type to label schema type


FIELD_TYPE_TO_TYPES = {
    fof.BooleanField: BOOL,
    fof.DateField: DATE,
    fof.DateTimeField: DATETIME,
    fof.DictField: DICT,
    fof.FloatField: FLOAT,
    fof.FrameNumberField: INT,
    fof.IntField: INT,
    fol.Label: LABEL,
    fof.ListField: {
        fof.FloatField: FLOAT_LIST,
        fof.IntField: INT_LIST,
        fof.StringField: STR_LIST,
    },
    fof.ObjectIdField: ID,
    fof.StringField: STR,
    fof.UUIDField: ID,
}


### Label schema type to field type
TYPES_TO_FIELD_TYPE = {
    BOOL: fof.BooleanField,
    DATE: fof.DateField,
    DATETIME: fof.DateTimeField,
    DICT: fof.DictField,
    FLOAT: fof.FloatField,
    ID: fof.ObjectIdField,
    INT: fof.IntField,
    STR: fof.StringField,
    FLOAT_LIST: fof.FloatField,
    INT_LIST: fof.IntField,
    STR_LIST: fof.StringField,
}


### Heuristics


CHECKBOXES_OR_RADIO_THRESHOLD = 5
DEFAULT_STEP = 0.001
VALUES_THRESHOLD = 1000


### App support


SUPPORTED_DOC_TYPES = {
    DynamicEmbeddedDocument,
    fomm.ImageMetadata,
    fomm.SceneMetadata,
}
SUPPORTED_LABEL_TYPES = {fol.Classification, fol.Classifications}
SUPPORTED_LABEL_TYPES_BY_MEDIA_TYPE = {
    fom.IMAGE: {
        fol.Detection,
        fol.Detections,
    },
    fom.THREE_D: {fol.Detection, fol.Detections, fol.Polyline, fol.Polylines},
}
SUPPORTED_LISTS_OF_PRIMITIVES = (
    fof.BooleanField,
    fof.FloatField,
    fof.IntField,
    fof.StringField,
)
SUPPORTED_MEDIA_TYPES = {fom.IMAGE, fom.THREE_D}
SUPPORTED_PRIMITIVES = (
    fof.BooleanField,
    fof.DateField,
    fof.DateTimeField,
    fof.DictField,
    fof.FloatField,
    fof.FrameNumberField,
    fof.IntField,
    fof.ObjectIdField,
    fof.StringField,
    fof.UUIDField,
)
# label types whose subfields cannot yet be represented by a type/component in
# annotation, e.g. the TemporalDetection.support field
UNSUPPORTED_LABEL_TYPES = {
    fol.GeoLocation,
    fol.GeoLocations,
    fol.TemporalDetection,
    fol.TemporalDetections,
}
