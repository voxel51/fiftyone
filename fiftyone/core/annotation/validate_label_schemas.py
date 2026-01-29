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
    sample_collection,
    label_schema,
    allow_new_attrs=False,
    allow_new_fields=False,
    fields=None,
    _allow_default=False,
):
    """Validates label schemas for a
    :class:`fiftyone.core.collections.SampleCollection`.  See
    :func:`generate_label_schemas` for acceptable label schema specifications

    Args:
        sample_collection: the
            :class:`fiftyone.core.collections.SampleCollection`
        label_schema: a label schemas ``dict`` or an individual field's label
            schema ``dict`` if only one field is provided
        allow_new_attrs (False): whether to allow label attributes that do not
            yet exist on the :ref:`field schema <field-schemas>`
        allow_new_fields (False): whether to allow label schemas for fields
            that do not yet exist on the :ref:`field schema <field-schemas>`
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
    for field_name in fields:
        try:
            if allow_new_fields is False and field_name not in all_fields:
                raise ValueError(f"field '{field_name}' does not exist")

            if field_name in all_fields and field_name not in supported_fields:
                raise ValueError(f"field '{field_name}' is not supported")

            _validate_field_label_schema(
                sample_collection.get_field(field_name),
                field_name,
                label_schema[field_name],
                allow_default=_allow_default,
                allow_new_attrs=allow_new_attrs,
                allow_new_fields=allow_new_fields,
            )
        except Exception as exc:
            exceptions.append(exc)

    if exceptions:
        raise ValidationErrors("invalid label schema(s)", exceptions)


def _validate_field_label_schema(
    field,
    field_name,
    label_schema,
    allow_default=False,
    allow_labels=True,
    allow_new_attrs=False,
    allow_new_fields=False,
):
    type_ = None
    if allow_new_fields is False:
        if field is None:
            raise ValueError(f"field '{field_name}' does not exist")

        if type(field) in foac.FIELD_TYPE_TO_TYPES:
            type_ = foac.FIELD_TYPE_TO_TYPES[type(field)]
            if isinstance(field, fof.ListField):
                type_ = type_[type(field.field)]
    else:
        type_ = label_schema.get(foac.TYPE, None)

    is_label = False
    if allow_labels:
        if (
            isinstance(field, fof.EmbeddedDocumentField)
            and issubclass(field.document_type, fol.Label)
            and field.document_type not in foac.UNSUPPORTED_LABEL_TYPES
        ):
            is_label = True

        elif not field and type_ in _ALL_LABEL_TYPES:
            is_label = True

    if not is_label and foac.COMPONENT not in label_schema:
        raise ValueError(
            f"no '{foac.COMPONENT}' provided for field '{field_name}'"
        )

    if foac.TYPE not in label_schema:
        raise ValueError(f"no '{foac.TYPE}' provided for field '{field_name}'")

    field_is_read_only = field and field.read_only

    if label_schema.get(foac.READ_ONLY, None) is False and field_is_read_only:
        raise ValueError(
            f"'{foac.READ_ONLY}' cannot be False for field '{field_name}'"
        )

    if is_label:
        _validate_label_field_label_schema(
            field,
            field_name,
            label_schema,
            allow_default=True,
            allow_new_attrs=allow_new_attrs,
        )
        return

    is_list = isinstance(field, fof.ListField)
    if is_list:
        field = field.field

    fn = None

    if type_ == foac.BOOL:
        fn = _validate_bool_field_label_schema
    elif type_ in {foac.DATE, foac.DATETIME}:
        fn = _validate_date_datetime_field_label_schema
    elif type_ == foac.DICT:
        fn = _validate_dict_field_label_schema
    elif type_ in {foac.FLOAT, foac.INT}:
        fn = _validate_float_int_field_label_schema
    elif type_ in {foac.FLOAT_LIST, foac.INT_LIST}:
        fn = _validate_float_int_list_field_label_schema
    elif type_ == foac.ID:
        fn = _validate_id_field_label_schema
    elif type_ == foac.STR:
        fn = _validate_str_field_label_schema
    elif type_ == foac.STR_LIST:
        fn = _validate_str_list_field_label_schema

    if fn is None:
        raise ValueError(f"unsupported field '{field_name}': {str(field)}")

    fn(field, field_name, label_schema, allow_default)


def _validate_bool_field_label_schema(
    field, field_name, label_schema, allow_default
):
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
    field, field_name, label_schema, allow_default
):
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
    field, field_name, label_schema, allow_default
):
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
    field, field_name, label_schema, allow_default
):
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
                    f"'{foac.PRECISION}' and '{foac.VALUES}' are incompatible "
                    f"settings for field '{field_name}'"
                )
            _validate_precision(field_name, value)
        elif key == foac.READ_ONLY:
            _validate_read_only(field_name, value)
        elif key == foac.TYPE and value != _str_type:
            _raise_type_error(field, field_name, value)


def _validate_float_int_list_field_label_schema(
    field, field_name, label_schema, allow_default
):
    is_float = isinstance(field, fof.FloatField)
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
                    f"'{foac.PRECISION}' and '{foac.VALUES}' are incompatible "
                    f"settings for field '{field_name}'"
                )
            _validate_precision(field_name, value)
        elif key == foac.READ_ONLY:
            _validate_read_only(field_name, value)
        elif key == foac.TYPE and value != _str_type:
            _raise_type_error(field, field_name, value)


def _validate_id_field_label_schema(
    field, field_name, label_schema, _unused_allow_default
):
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
    field, field_name, label_schema, allow_default
):
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
    field, field_name, label_schema, allow_default
):
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
    field,
    field_name,
    label_schema,
    allow_default,
    allow_new_attrs=False,
):

    class_name = (
        field.document_type.__name__.lower()
        if field
        else label_schema[foac.TYPE]
    )
    component = label_schema.get(foac.COMPONENT, None)
    settings = foac.LABEL_SETTINGS
    values = label_schema.get(foac.CLASSES, None)
    if component in foac.VALUES_COMPONENTS:
        _validate_values_setting(field_name, values, str, key=foac.CLASSES)
        settings = settings.union({foac.CLASSES})

    for key, value in label_schema.items():
        if key not in settings:
            if key == foac.CLASSES:
                raise ValueError(
                    f"'{foac.CLASSES}' requires a {foac.DROPDOWN} or "
                    f"{foac.RADIO} '{foac.COMPONENT}' for field '{field_name}'"
                )

            _raise_unknown_setting_error(key, field_name)

        if key == foac.ATTRIBUTES:
            _validate_attributes(
                field,
                field_name,
                class_name,
                value,
                allow_new_attrs=allow_new_attrs,
            )
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


def _raise_component_error(field_name, value):
    raise ValueError(f"invalid component '{value}' for field '{field_name}'")


def _raise_type_error(field, field_name, value):
    raise ValueError(
        f"invalid type '{value}' for {field_name} field: {str(field)}"
    )


def _raise_unknown_setting_error(name, field_name):
    raise ValueError(f"unknown setting '{name}' for '{field_name}' field")


def _validate_attribute(
    class_name,
    label_schema,
    parent_field,
    parent_field_name,
    path,
    subfields,
    allow_new_attrs=True,
):
    label_schema = label_schema.copy()
    attribute = label_schema.pop(foac.NAME, None)
    if attribute is None:
        raise ValueError(
            f"missing '{foac.NAME}' in 'attributes' for field "
            f"'{parent_field_name}'"
        )

    if allow_new_attrs is False and attribute not in subfields:
        raise ValueError(
            f"'{attribute}' attribute does not exist on {class_name} field"
            f" '{parent_field_name}'"
        )

    if attribute == foac.LABEL:
        raise ValueError(
            f"'{foac.LABEL}' attribute for field '{parent_field_name}' is "
            f" configured via '{foac.CLASSES}' for label fields"
        )

    if attribute == foac.BOUNDING_BOX and class_name in {
        _DETECTION,
        _DETECTIONS,
    }:
        raise ValueError(
            f"'{foac.BOUNDING_BOX}' attribute is not configurable for field "
            f"'{parent_field_name}'"
        )

    if attribute == foac.POINTS and class_name in {
        _POLYLINE,
        _POLYLINES,
    }:
        raise ValueError(
            f"'{foac.POINTS}' attribute is not configurable for field "
            f"'{parent_field_name}'"
        )

    _validate_field_label_schema(
        parent_field.get_field(attribute) if parent_field else None,
        f"{path}.{attribute}",
        label_schema,
        allow_default=True,
        allow_labels=False,
        allow_new_fields=allow_new_attrs,
    )

    return attribute


def _validate_attributes(
    field, field_name, class_name, attributes, allow_new_attrs=True
):
    if not isinstance(attributes, list):
        raise ValueError(
            f"'{foac.ATTRIBUTES}' setting for field '{field_name}' must be a "
            f"list"
        )

    path = field_name
    if field and issubclass(field.document_type, fol._HasLabelList):
        field = field.get_field(field.document_type._LABEL_LIST_FIELD).field

    subfields = {f.name: f for f in field.fields} if field else {}
    exceptions = []
    validated = set()
    for label_schema in attributes:
        try:

            attr = _validate_attribute(
                class_name,
                label_schema,
                field,
                field_name,
                path,
                subfields,
                allow_new_attrs=allow_new_attrs,
            )

            if attr in validated:
                raise ValueError(
                    f"'{foac.ATTRIBUTES}' setting for field '{field_name}' "
                    f"has duplicate '{attr}' settings"
                )

            validated.add(attr)

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
            f"'{foac.DEFAULT}' setting is not allowed for field '{field_name}'"
        )

    exception = ValueError(
        f"invalid '{foac.DEFAULT}' setting '{value}' for field '{field_name}'"
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
                    f"invalid json '{foac.DEFAULT}' for field '{field_name}'"
                ) from exc

        return

    raise exception


def _validate_default_list(
    field_name, value, _type, allow_default, values=None
):
    if not allow_default:
        raise ValueError(
            f"'{foac.DEFAULT}' setting is not allowed for field '{field_name}'"
        )

    if not isinstance(value, list):
        raise ValueError(
            f"'{foac.DEFAULT}' setting for field '{field_name}' must be a list"
        )

    if len(value) > foac.VALUES_THRESHOLD:
        raise ValueError(
            f"'{foac.DEFAULT}' setting for field '{field_name}' has more than "
            f"{foac.VALUES_THRESHOLD} values"
        )

    if len(value) > len(set(value)):
        raise ValueError(
            f"'{foac.DEFAULT}' setting for field '{field_name}' has duplicates"
        )

    for v in value:
        if not isinstance(v, _type) or (
            values is not None and v not in values
        ):
            raise ValueError(
                f"invalid value '{v}' in '{foac.DEFAULT}' setting for field "
                f"'{field_name}'"
            )


def _validate_precision(field_name, value):
    if isinstance(value, int) and value >= 0:
        return

    raise ValueError(
        f"invalid '{foac.PRECISION}' setting '{value}' for field "
        f"'{field_name}'"
    )


def _validate_range_setting(field_name, value, _type):
    if isinstance(value, list) and len(value) == 2:
        if isinstance(value[0], _type) and isinstance(value[1], _type):
            if value[0] < value[1]:
                return

    raise ValueError(
        f"invalid '{foac.RANGE}' setting '{value}' for field '{field_name}'"
    )


def _validate_read_only(field_name, value, require=False):
    if not isinstance(value, bool) or (require and not value):
        raise ValueError(
            f"invalid '{foac.READ_ONLY}' value '{value}' for field "
            f"'{field_name}'"
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


_CLASSIFICATION = "classification"
_CLASSIFICATIONS = "classifications"
_DETECTION = "detection"
_DETECTIONS = "detections"
_POLYLINE = "polyline"
_POLYLINES = "polylines"

_ALL_LABEL_TYPES = {
    _CLASSIFICATION,
    _CLASSIFICATIONS,
    _DETECTION,
    _DETECTIONS,
    _POLYLINE,
    _POLYLINES,
}
