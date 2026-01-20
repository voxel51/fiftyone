"""
Annotation label schema validation

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from datetime import date, datetime
from exceptiongroup import ExceptionGroup
import json

import eta.core.utils as etau

import fiftyone.core.annotation.constants as foac
import fiftyone.core.annotation.utils as foau
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol


class ValidationErrors(ExceptionGroup):
    """Validation errors for label schemas"""


def validate_label_schemas(
    sample_collection, label_schema, fields=None, _allow_default=False
):
    """Validates label schemas for a
    :class:`fiftyone.core.collections.SampleCollection`.  See
    :func:`generate_label_schemas` for acceptable label schema specifications

    Args:
        sample_collection: the
            :class:`fiftyone.core.collections.SampleCollection`
        label_schema: a label schemas ``dict`` or an individual field's label
            schema ``dict`` if only one field is provided
        fields (None): a field name, ``embedded.field.name`` or iterable of
            such values

    Raises:
        ValidationErrors: if the label schema(s) are invalid
    """
    is_scalar = etau.is_str(fields)

    if is_scalar:
        label_schema = {fields: label_schema}
        fields = [fields]
    elif fields is None:
        fields = sorted(label_schema.keys())

    all_fields = sample_collection.get_field_schema(flat=True)
    supported_fields = foau.list_valid_annotation_fields(
        sample_collection, flatten=True
    )
    exceptions = []
    for field in fields:
        try:
            if field not in all_fields:
                raise ValueError(f"field '{field}' does not exist")

            if field not in supported_fields:
                raise ValueError(f"field '{field}' is not supported")

            _validate_field_label_schema(
                sample_collection,
                field,
                label_schema[field],
                allow_default=_allow_default,
            )
        except Exception as exc:
            exceptions.append(exc)

    if exceptions:
        raise ValidationErrors("invalid label schema(s)", exceptions)


def _validate_field_label_schema(
    sample_collection, field_name, label_schema, allow_default=False
):
    field = sample_collection.get_field(field_name)
    if field is None:
        raise ValueError(f"field '{field_name}' does not exist")

    field_is_read_only = field.read_only

    is_list = isinstance(field, fof.ListField)
    if is_list:
        field = field.field

    fn = None
    is_label = False

    if isinstance(field, fof.EmbeddedDocumentField):
        if (
            issubclass(field.document_type, fol.Label)
            and field.document_type not in foac.UNSUPPORTED_LABEL_TYPES
        ):
            is_label = True

    if foac.TYPE not in label_schema:
        raise ValueError(f"no type provided for field '{field_name}'")

    if not is_label and foac.COMPONENT not in label_schema:
        raise ValueError(f"no component provided for field '{field_name}'")

    if label_schema.get(foac.READ_ONLY, None) is False and field_is_read_only:
        raise ValueError(
            f"'{foac.READ_ONLY}' cannot be False for read only '{field_name}'"
        )

    elif isinstance(field, fof.BooleanField):
        if not is_list:
            fn = _validate_bool_field_label_schema
    elif isinstance(field, (fof.DateField, fof.DateTimeField)):
        if is_list:
            _raise_field_error(sample_collection, field_name)
        fn = _validate_date_datetime_field_label_schema
    elif isinstance(field, fof.DictField):
        if is_list:
            _raise_field_error(sample_collection, field_name)
        fn = _validate_dict_field_label_schema
    elif isinstance(field, (fof.FloatField, fof.IntField)):
        if is_list:
            fn = _validate_float_int_list_field_label_schema
        else:
            fn = _validate_float_int_field_label_schema
    elif isinstance(field, (fof.ObjectIdField, fof.UUIDField)):
        fn = _validate_id_field_label_schema
    elif isinstance(field, fof.StringField):
        if is_list:
            fn = _validate_str_list_field_label_schema
        else:
            fn = _validate_str_field_label_schema
    elif is_label:
        fn = _validate_label_field_label_schema

    if fn:
        fn(
            sample_collection,
            field_name,
            label_schema,
            allow_default or is_label,
        )
        return

    raise ValueError(f"unsupported field '{field_name}': {str(field)}")


def _validate_bool_field_label_schema(
    collection, field_name, label_schema, allow_default
):
    field = collection.get_field(field_name)
    for key, value in label_schema.items():
        if key not in foac.BOOL_SETTINGS:
            _raise_unknown_setting_error(key, field_name)

        if key == foac.COMPONENT and value not in foac.BOOL_COMPONENTS:
            _raise_component_error(field_name, value)
        elif key == foac.DEFAULT:
            _validate_default(field_name, value, bool, allow_default)
        elif key == foac.READ_ONLY:
            _validate_read_only(field_name, value)
        elif key == foac.TYPE and value != foac.BOOL:
            _raise_type_error(field, field_name, value)


def _validate_date_datetime_field_label_schema(
    collection, field_name, label_schema, allow_default
):
    field = collection.get_field(field_name)
    _type = date if isinstance(field, fof.DateField) else datetime
    for key, value in label_schema.items():
        if key not in foac.DATE_DATETIME_SETTINGS:
            _raise_unknown_setting_error(key, field_name)

        if (
            key == foac.COMPONENT
            and value not in foac.DATE_DATETIME_COMPONENTS
        ):
            _raise_component_error(field_name, value)
        elif key == foac.DEFAULT:
            _validate_default(field_name, value, _type, allow_default)
        elif key == foac.READ_ONLY:
            _validate_read_only(field_name, value)
        elif key == foac.TYPE:
            invalid_date = (
                isinstance(field, fof.DateField) and value != foac.DATE
            )
            invalid_datetime = (
                isinstance(field, fof.DateTimeField) and value != foac.DATETIME
            )
            if invalid_date or invalid_datetime:
                _raise_type_error(field, field_name, value)


def _validate_dict_field_label_schema(
    collection, field_name, label_schema, allow_default
):
    field = collection.get_field(field_name)
    for key, value in label_schema.items():
        if key not in foac.DICT_SETTINGS:
            _raise_unknown_setting_error(key, field_name)

        if key == foac.COMPONENT and value not in foac.DICT_COMPONENTS:
            _raise_component_error(field_name, value)
        elif key == foac.DEFAULT:
            _validate_default(field_name, value, dict, allow_default)
        elif key == foac.READ_ONLY:
            _validate_read_only(field_name, value)
        elif key == foac.TYPE and value != foac.DICT:
            _raise_type_error(field, field_name, value)


def _validate_float_int_field_label_schema(
    collection, field_name, label_schema, allow_default
):
    field = collection.get_field(field_name)
    is_float = isinstance(field, fof.FloatField)
    _str_type = foac.FLOAT if is_float else foac.INT
    # a float field accepts float and int values
    _type = (float, int) if is_float else int

    settings = foac.FLOAT_INT_SETTINGS
    component = label_schema.get(foac.COMPONENT, None)
    _range = label_schema.get(foac.RANGE, None)
    values = label_schema.get(foac.VALUES, None)
    if component == foac.SLIDER:
        _validate_range_setting(field_name, _range, _type)
        settings = settings.union({foac.RANGE})
    elif component in foac.VALUES_COMPONENTS:
        _validate_values_setting(field_name, values, _type)
        settings = settings.union({foac.VALUES})

    for key, value in label_schema.items():
        if key not in settings:
            if _type is int or key not in foac.FLOAT_SETTINGS:
                _raise_unknown_setting_error(key, field_name)

        if key == foac.COMPONENT and value not in foac.FLOAT_INT_COMPONENTS:
            _raise_component_error(field_name, value)
        elif key == foac.DEFAULT:
            _validate_default(
                field_name,
                value,
                _type,
                allow_default,
                _range=_range,
                values=values,
            )
        elif key == foac.PRECISION:
            if foac.VALUES in label_schema:
                raise ValueError(
                    "'precision' and 'values' are incompatible settings for "
                    f"field '{field_name}'"
                )
            _validate_precision(field_name, value)
        elif key == foac.READ_ONLY:
            _validate_read_only(field_name, value)
        elif key == foac.TYPE and value != _str_type:
            _raise_type_error(field, field_name, value)


def _validate_float_int_list_field_label_schema(
    collection, field_name, label_schema, allow_default
):
    field = collection.get_field(field_name)
    is_float = isinstance(field.field, fof.FloatField)
    _str_type = foac.FLOAT_LIST if is_float else foac.INT_LIST
    _type = float if is_float else int

    settings = foac.FLOAT_INT_LIST_SETTINGS
    component = label_schema.get(foac.COMPONENT, None)
    values = label_schema.get(foac.VALUES, None)
    if component in foac.VALUES_COMPONENTS:
        _validate_values_setting(field_name, values, _type)
        settings = settings.union({foac.VALUES})

    for key, value in label_schema.items():
        if key not in settings:
            if _type is int or key not in foac.FLOAT_SETTINGS:
                _raise_unknown_setting_error(key, field_name)

        if (
            key == foac.COMPONENT
            and value not in foac.FLOAT_INT_LIST_COMPONENTS
        ):
            _raise_component_error(field_name, value)
        elif key == foac.DEFAULT:
            _validate_default_list(
                field_name, value, _type, allow_default, values=values
            )
        elif key == foac.PRECISION:
            if foac.VALUES in label_schema:
                raise ValueError(
                    "'precision' and 'values' are incompatible settings for "
                    f"field '{field_name}'"
                )
            _validate_precision(field_name, value)
        elif key == foac.READ_ONLY:
            _validate_read_only(field_name, value)
        elif key == foac.TYPE and value != _str_type:
            _raise_type_error(field, field_name, value)


def _validate_id_field_label_schema(
    collection, field_name, label_schema, _unused_allow_default
):
    field = collection.get_field(field_name)

    _validate_read_only(
        field_name, label_schema.get(foac.READ_ONLY, None), require=True
    )
    for key, value in label_schema.items():
        if key not in foac.ID_SETTINGS:
            _raise_unknown_setting_error(key, field_name)

        if key == foac.COMPONENT and value not in foac.ID_COMPONENTS:
            _raise_component_error(field_name, value)
        elif key == foac.TYPE and value != foac.ID:
            _raise_type_error(field, field_name, value)


def _validate_str_field_label_schema(
    collection, field_name, label_schema, allow_default
):
    field = collection.get_field(field_name)
    settings = foac.STR_SETTINGS
    component = label_schema.get(foac.COMPONENT, None)
    values = label_schema.get(foac.VALUES, None)
    if component in foac.VALUES_COMPONENTS:
        _validate_values_setting(field_name, values, str)
        settings = settings.union({foac.VALUES})

    for key, value in label_schema.items():
        if key not in settings:
            _raise_unknown_setting_error(key, field_name)

        if key == foac.COMPONENT and value not in foac.STR_COMPONENTS:
            _raise_component_error(field_name, value)
        elif key == foac.DEFAULT:
            _validate_default(
                field_name, value, str, allow_default, values=values
            )
        elif key == foac.READ_ONLY:
            _validate_read_only(field_name, value)
        elif key == foac.TYPE and value != foac.STR:
            _raise_type_error(field, field_name, value)


def _validate_str_list_field_label_schema(
    collection, field_name, label_schema, allow_default
):
    field = collection.get_field(field_name)
    settings = foac.STR_LIST_SETTINGS
    component = label_schema.get(foac.COMPONENT, None)
    values = label_schema.get(foac.VALUES, None)
    if component in foac.VALUES_COMPONENTS:
        _validate_values_setting(field_name, values, str)
        settings = settings.union({foac.VALUES})

    for key, value in label_schema.items():
        if key not in settings:
            _raise_unknown_setting_error(key, field_name)

        if key == foac.COMPONENT and value not in foac.STR_LIST_COMPONENTS:
            _raise_component_error(field_name, value)
        elif key == foac.DEFAULT:
            _validate_default_list(
                field_name, value, str, allow_default, values=values
            )
        elif key == foac.READ_ONLY:
            _validate_read_only(field_name, value)
        elif key == foac.TYPE and value != foac.STR_LIST:
            _raise_type_error(field, field_name, value)


def _validate_label_field_label_schema(
    collection, field_name, label_schema, allow_default
):
    field: fof.EmbeddedDocumentField = collection.get_field(field_name)
    class_name = field.document_type.__name__.lower()
    component = label_schema.get(foac.COMPONENT, None)
    settings = foac.LABEL_SETTINGS
    values = label_schema.get(foac.CLASSES, None)
    if component in foac.VALUES_COMPONENTS:
        _validate_values_setting(field_name, values, str)
        settings = settings.union({foac.CLASSES})

    for key, value in label_schema.items():
        if key not in settings:
            _raise_unknown_setting_error(key, field_name)

        if key == foac.ATTRIBUTES:
            _validate_attributes(collection, field_name, class_name, value)
        elif key == foac.COMPONENT and value not in foac.STR_COMPONENTS:
            _raise_component_error(field_name, value)
        elif key == foac.DEFAULT:
            _validate_default(
                field_name, value, str, allow_default, values=values
            )
        elif key == foac.READ_ONLY:
            _validate_read_only(field_name, value)
        elif key == foac.TYPE and value != class_name:
            _raise_type_error(field, field_name, value)


def _raise_field_error(collection, field_name):
    field = collection.get_field(field_name)
    raise ValueError(
        f"field '{field_name}' of field type {str(field)} is not supported"
    )


def _raise_component_error(field_name, value):
    raise ValueError(f"invalid component '{value}' for field '{field_name}'")


def _raise_type_error(field, field_name, value):
    raise ValueError(
        f"invalid type '{value}' for {field_name} field: {str(field)}"
    )


def _raise_unknown_setting_error(name, field_name):
    raise ValueError(f"unknown setting '{name}' for '{field_name}' field")


def _validate_attribute(
    attribute,
    class_name,
    collection,
    field_name,
    label_schema,
    path,
    subfields,
):
    if attribute not in subfields:
        raise ValueError(
            f"'{attribute}' attribute does not exist on {class_name} field"
            f" '{field_name}'"
        )

    if attribute == foac.LABEL:
        raise ValueError(
            f"'label' attribute for field {field_name} is configured via "
            "'classes' for label fields"
        )

    if attribute == foac.BOUNDING_BOX and class_name in {
        _DETECTION,
        _DETECTIONS,
    }:
        raise ValueError(
            f"'bounding_box' attribute is not configurable for field "
            f"'{field_name}'"
        )

    if attribute == foac.POINTS and class_name in {
        _POLYLINE,
        _POLYLINES,
    }:
        raise ValueError(
            f"'points' attribute is not configurable for field '{field_name}'"
        )

    _validate_field_label_schema(
        collection, f"{path}.{attribute}", label_schema, allow_default=True
    )


def _validate_attributes(collection, field_name, class_name, attributes):
    if not isinstance(attributes, dict):
        raise ValueError(
            f"'attributes' setting for field '{field_name}' must be a 'dict'"
        )

    field: fof.EmbeddedDocumentField = collection.get_field(field_name)
    path = field_name
    if issubclass(field.document_type, fol._HasLabelList):
        path = f"{path}.{field.document_type._LABEL_LIST_FIELD}"
        field = collection.get_field(path).field

    subfields = {f.name: f for f in field.fields}
    exceptions = []
    for attribute, label_schema in attributes.items():
        try:
            _validate_attribute(
                attribute,
                class_name,
                collection,
                field_name,
                label_schema,
                path,
                subfields,
            )
        except Exception as exc:
            exceptions.append(exc)

    if exceptions:
        raise ValidationErrors(
            f"invalid attribute(s) for field '{field_name}'", exceptions
        )


def _validate_default(
    field_name, value, _type, allow_default, _range=None, values=None
):
    if not allow_default:
        raise ValueError(
            f"'default' setting is not allowed for field '{field_name}'"
        )

    exception = ValueError(
        f"invalid 'default' setting '{value}' for field '{field_name}'"
    )

    if isinstance(value, _type):
        if _range is not None and (value < _range[0] or value > _range[1]):
            raise exception

        if values is not None and (value not in values):
            raise exception

        if _type == dict:
            try:
                json_str = json.dumps(value)
                if json_str != json.dumps(json.loads(json_str)):
                    raise Exception("inconsistent json")
            except Exception as exc:
                raise ValueError(
                    f"invalid json 'default' for field '{field_name}'"
                ) from exc

        return

    raise exception


def _validate_default_list(
    field_name, value, _type, allow_default, values=None
):
    if not allow_default:
        raise ValueError(
            f"'default' setting is not allowed for field '{field_name}'"
        )

    if not isinstance(value, list):
        raise ValueError(
            f"'default' setting for field {field_name} must be a list"
        )

    if len(value) > foac.VALUES_THRESHOLD:
        raise ValueError(
            f"'default' setting for field '{field_name}' has more than "
            f"{foac.VALUES_THRESHOLD} values"
        )

    if len(value) > len(set(value)):
        raise ValueError(
            f"'default' setting for field '{field_name}' has duplicates"
        )

    for v in value:
        if not isinstance(v, _type) or (
            values is not None and v not in values
        ):
            raise ValueError(
                f"invalid value '{v}' in 'default' setting for field "
                f"'{field_name}'"
            )


def _validate_precision(field_name, value):
    if isinstance(value, int) and value >= 0:
        return

    raise ValueError(
        f"invalid 'precision' setting '{value}' for field '{field_name}'"
    )


def _validate_range_setting(field_name, value, _type):
    if isinstance(value, list) and len(value) == 2:
        if isinstance(value[0], _type) and isinstance(value[1], _type):
            if value[0] < value[1]:
                return

    raise ValueError(
        f"invalid 'range' setting '{value}' for field '{field_name}'"
    )


def _validate_read_only(field_name, value, require=False):
    if not isinstance(value, bool) or (require and not value):
        raise ValueError(
            f"invalid 'read_only' value '{value}' for field '{field_name}'"
        )


def _validate_values_setting(field_name, value, _type, key=foac.VALUES):
    if not isinstance(value, list):
        raise ValueError(
            f"'{key}' setting for field '{field_name}' must be a list"
        )

    if not value:
        raise ValueError(
            f"'{key}' setting for field '{field_name}' must have at least "
            f"one value"
        )

    if len(value) > foac.VALUES_THRESHOLD:
        raise ValueError(
            f"'{key}' setting for field '{field_name}' has more than "
            f"{foac.VALUES_THRESHOLD} values"
        )

    if len(value) > len(set(value)):
        raise ValueError(
            f"'{key}' setting for field '{field_name}' has duplicates"
        )

    for v in value:
        if not isinstance(v, _type):
            raise ValueError(
                f"invalid value '{v}' in '{key}' setting for field "
                f"'{field_name}'"
            )


_DETECTION = "detection"
_DETECTIONS = "detections"
_POLYLINE = "polyline"
_POLYLINES = "polylines"
