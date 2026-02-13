"""
Annotation label schema generation

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from pymongo.errors import OperationFailure

import eta.core.utils as etau

import fiftyone.core.annotation.constants as foac
from fiftyone.core.annotation.validate_label_schemas import (
    validate_label_schemas,
)
import fiftyone.core.annotation.utils as foau
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol

import logging

logger = logging.getLogger(__name__)


def generate_label_schemas(sample_collection, fields=None, scan_samples=True):
    """Generates label schemas for a
    :class:`fiftyone.core.collections.SampleCollection`.

    A label schema is defined by a ``type`` and ``component`` with respect
    to a field. Further settings depend on the ``type`` and ``component``
    combination as outlined below.

    The ``type`` value for a field is inferred from the collection's field
    schema. See
    :meth:`fiftyone.core.collections.SampleCollection.get_field_schema`

    Currently supported media types for the collection are ``image`` and
    ``3d``. See :attr:`fiftyone.core.collections.SampleCollection.media_type`

    **Primitives and components**

    Supported primitive types are:

        -   ``bool``: :class:`fiftyone.core.fields.BooleanField`
        -   ``date``: :class:`fiftyone.core.fields.DateField`
        -   ``datetime``: :class:`fiftyone.core.fields.DateTimeField`
        -   ``dict``: :class:`fiftyone.core.fields.DictField`
        -   ``float``: :class:`fiftyone.core.fields.FloatField`
        -   ``id``: :class:`fiftyone.core.fields.ObjectIdField` or
            :class:`fiftyone.core.fields.UUIDField`
        -   ``int``: :class:`fiftyone.core.fields.IntField` or
            :class:`fiftyone.core.fields.FrameNumberField`
        -   ``list<int>``: :class:`fiftyone.core.fields.ListField` of
            :class:`fiftyone.core.fields.IntField`
        -   ``list<float>``: :class:`fiftyone.core.fields.ListField` of
            :class:`fiftyone.core.fields.FloatField`
        -   ``list<str>``: :class:`fiftyone.core.fields.ListField` of
            :class:`fiftyone.core.fields.StringField`
        -   ``str``: :class:`fiftyone.core.fields.StringField`

    Supported ``bool`` components are:

        -   ``checkbox``
        -   ``toggle`` - the default

    ``date`` and ``datetime`` only support the ``datepicker`` component.

    ``dict`` only supports the ``json`` component.

    Supported ``float`` and ``int`` components are:

        -   ``dropdown``
        -   ``radio``
        -   ``slider``: the default when ``scan_samples`` is ``True`` and
            distinct finite bounds are found that define a ``range``
        -   ``text``: the default when ``scan_samples`` is ``False`` or
            distinct finite bounds are not found

    Supported ``list<float>`` and ``list<int>`` components are:

        -   ``checkboxes``
        -   ``dropdown``
        -   ``text`` - the default

    Supported ``list<str>`` components are:

        -   ``checkboxes``: the default if ``<=5`` values are scanned
        -   ``dropdown``: the default if ``>5`` and ``<=1000`` values are
            scanned
        -   ``text``: the default if ``0`` values or ``>1000`` values are
            scanned, or ``scan_samples`` is ``False``

    Supported ``str`` type components are:

        -   ``dropdown``: the default if ``>5`` and ``<=1000`` values are
            scanned
        -   ``radio``: the default if ``<=5`` values are scanned
        -   ``text``: the default if ``0`` values or ``>1000`` values are
            scanned, or ``scan_samples`` is ``False``

    ``float`` types support a ``precision`` setting when a ``text`` component
    is configured for the number of digits to allow after the decimal.

    All types support a ``read_only`` flag. ``id`` types must be ``read_only``.
    If a field is ``read_only`` in the field schema, then the ``read_only``
    label schema setting must be ``True``, e.g. ``created_at`` and
    ``last_modified_at`` must be read only.

    All components support ``values`` except ``json``, ``slider``, and
    ``toggle`` excepting ``id`` restrictions.

    ``checkboxes`` and ``dropdown`` require the ``values`` setting.

    ``slider`` requires the ``range: [min, max]`` setting.

    **Labels**

    The ``label`` subfield of all label types are configured via ``classes``
    and support the same settings as a ``str`` type. See the example output
    below for ``detections`` fields in the quickstart dataset. If the label
    type has a visual representation, that field is handled by the App's
    builtin annotation UI, e.g. ``bounding_box`` for a ``detection``. Primitive
    attributes of label types are configured via the ``attributes`` list.

    When a label is marked as ``read_only``, all its attributes inherit the
    setting as well.

    All :class:`fiftyone.core.labels.Label` types are resolved by this method
    except :class:`fiftyone.core.labels.GeoLocation`,
    :class:`fiftyone.core.labels.GeoLocations`,
    :class:`fiftyone.core.labels.TemporalDetection`, and
    :class:`fiftyone.core.labels.TemporalDetections` when provided
    in the ``fields`` argument, otherwise only App supported fields are
    resolved. For label types supported
    by the App for annotation, see
    :func:`fiftyone.core.annotation.utils.get_supported_app_annotation_fields`.

    All attributes and the label class itself support a ``default`` setting
    that applies when creating a new label.

    **Embedded documents**

    One level of nesting is supported via ``dot.notation`` for
    :class:`fiftyone.core.fields.EmbeddedDocumentField`` fields for the default
    ``metadata`` field and the
    :class:`fiftyone.core.odm.embedded_document.DynamicEmbeddedDocument``
    document type. All label and primitive types are supported. See
    :ref:`here <dynamic-attributes>` for more details on adding dynamic
    attributes.

    Example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart")
        dataset.compute_metadata()

        fo.pprint(fo.generate_label_schemas(dataset, scan_samples=False))

    Output::

        {
            "created_at": {
                "type": "datetime",
                "component": "datepicker",
                "read_only": True,
            },
            "filepath": {"type": "str", "component": "text"},
            "ground_truth": {
                "attributes": [
                    {
                        "name": "attributes",
                        "type": "dict",
                        "component": "json",
                    },
                    {
                        "name": "confidence",
                        "type": "float",
                        "component": "text",
                    },
                    {
                        "name": "id",
                        "type": "id",
                        "component": "text",
                        "read_only": True,
                    },
                    {"name": "index", "type": "int", "component": "text"},
                    {"name": "mask_path", "type": "str", "component": "text"},
                    {"name": "tags", "type": "list<str>", "component": "text"},
                ],
                "component": "text",
                "type": "detections",
            },
            "id": {"type": "id", "component": "text", "read_only": True},
            "last_modified_at": {
                "type": "datetime",
                "component": "datepicker",
                "read_only": True,
            },
            "metadata.height": {"type": "int", "component": "text"},
            "metadata.mime_type": {"type": "str", "component": "text"},
            "metadata.num_channels": {"type": "int", "component": "text"},
            "metadata.size_bytes": {"type": "int", "component": "text"},
            "metadata.width": {"type": "int", "component": "text"},
            "predictions": {
                "attributes": [
                    {
                        "name": "attributes",
                        "type": "dict",
                        "component": "json",
                    },
                    {
                        "name": "confidence",
                        "type": "float",
                        "component": "text",
                    },
                    {
                        "name": "id",
                        "type": "id",
                        "component": "text",
                        "read_only": True,
                    },
                    {"name": "index", "type": "int", "component": "text"},
                    {"name": "mask_path", "type": "str", "component": "text"},
                    {"name": "tags", "type": "list<str>", "component": "text"},
                ],
                "component": "text",
                "type": "detections",
            },
            "tags": {"type": "list<str>", "component": "text"},
            "uniqueness": {"type": "float", "component": "text"},
        }

    Args:
        sample_collection: the
            :class:`fiftyone.core.collections.SampleCollection` to generate the
            schema with
        fields (None): a field name, ``embedded.field.name`` or iterable of
            such values
        scan_samples (True): whether to scan the collection to populate
            component settings based on actual field values (ranges,
            values, etc). If False, the label schema is generated from *only*
            the statically available information in the dataset's field schema

    Raises:
        ValueError: if the sample collection or field is not supported

    Returns:
        a label schemas ``dict``, or an individual field's label schema
        ``dict`` if only one field is provided
    """
    original_fields = fields
    is_scalar = etau.is_str(fields)
    all_fields = foau.list_valid_annotation_fields(
        sample_collection, require_app_support=True, flatten=True
    )
    if is_scalar:
        fields = [fields]
    elif fields is None:
        fields = all_fields

    fields = list(fields)
    is_scalar = is_scalar and len(fields) == 1 and fields[0] == original_fields

    schema = {}
    for field_name in fields:
        if field_name not in all_fields:
            raise ValueError(f"field '{field_name}' is not supported")

        label_schema = _generate_field_label_schema(
            sample_collection, field_name, scan_samples
        )

        validate_label_schemas(
            sample_collection,
            label_schema,
            fields=field_name,
        )

        if is_scalar:
            return label_schema

        schema[field_name] = label_schema

    return schema


def _generate_field_label_schema(collection, field_name, scan_samples):
    field = collection.get_field(field_name)
    read_only = field.read_only
    _type = foau.get_type(field)

    if _type == foac.LABEL:
        # classes are essentially a 'str' type
        _type = foac.STR

    is_list = isinstance(field, fof.ListField)
    if is_list:
        field = field.field

    settings = {
        foac.TYPE: _type,
    }

    component = foac.DEFAULT_COMPONENTS[_type]
    if component:
        settings[foac.COMPONENT] = component

    if read_only or _type == foac.ID:
        settings[foac.READ_ONLY] = True
        return settings

    fn = None

    if isinstance(field, fof.BooleanField):
        fn = _handle_bool
    elif isinstance(field, (fof.FloatField, fof.IntField)):
        fn = _handle_float_or_int
    elif isinstance(field, fof.StringField):
        fn = _handle_str

    if fn:
        return fn(collection, field_name, is_list, settings, scan_samples)

    if is_list:
        raise ValueError(f"unsupported field {field_name}: {field}")

    if isinstance(
        field,
        (
            fof.DateField,
            fof.DateTimeField,
            fof.DictField,
            fof.ObjectIdField,
            fof.UUIDField,
        ),
    ):
        return settings

    if not isinstance(field, fof.EmbeddedDocumentField):
        raise ValueError(f"unsupported field {field_name}: {field}")

    _type = field.document_type.__name__.lower()
    if issubclass(field.document_type, fol._HasLabelList):
        field_name = f"{field_name}.{field.document_type._LABEL_LIST_FIELD}"
        field = collection.get_field(field_name).field

    attributes = {}
    classes = []
    for f in field.fields:
        if f.name == foac.ATTRIBUTES and issubclass(
            field.document_type, fol.Label
        ):
            # ignore deprecated 'attributes' subfield on label types
            continue

        if (
            f.name == foac.BOUNDING_BOX
            and field.document_type == fol.Detection
        ):
            # bounding_box is a list of floats field, but really a 4-tuple of
            # [0, 1] floats, omit for special handling by the App
            continue

        if f.name == foac.POINTS and field.document_type == fol.Polyline:
            # points is a list of (x, y) or (x, y, z) coordinate lists that
            # define the polyline shape, omit for special handling by the App
            continue

        try:
            attributes[f.name] = _generate_field_label_schema(
                collection, f"{field_name}.{f.name}", scan_samples
            )
        except ValueError:
            logger.debug(f"Field '{f.name}' is not supported")

    label = attributes.pop(foac.LABEL, {})
    label.pop(foac.TYPE, None)
    classes = label.pop(foac.VALUES, None)

    result = dict(
        attributes=[dict(name=k, **attributes[k]) for k in sorted(attributes)],
        **label,
        type=_type,
    )

    if classes:
        result[foac.CLASSES] = classes

    return {k: result[k] for k in sorted(result)}


def _handle_bool(collection, field_name, is_list, settings, scan_samples):
    if is_list:
        settings[foac.COMPONENT] = foac.TEXT
    else:
        settings[foac.COMPONENT] = foac.TOGGLE

    return settings


def _handle_float_or_int(
    collection, field_name, is_list, settings, scan_samples
):
    settings[foac.COMPONENT] = foac.TEXT
    if is_list or not scan_samples:
        return settings

    mn, mx = collection.bounds(field_name, safe=True)
    if mn != mx:
        settings[foac.COMPONENT] = foac.SLIDER
        settings[foac.RANGE] = [mn, mx]

    return settings


def _handle_str(collection, field_name, is_list, settings, scan_samples):
    values = None

    try:
        if scan_samples and field_name != foac.FILEPATH:
            values = collection.distinct(field_name)
    except OperationFailure as e:
        # Likely too many distinct values
        errmsg = (e.details or {}).get("errmsg") or str(e)
        logger.debug(
            f"Could not compute distinct values for field `{field_name}`: {errmsg}"
        )

    if values:
        if len(values) <= foac.CHECKBOXES_OR_RADIO_THRESHOLD:
            settings[foac.COMPONENT] = (
                foac.CHECKBOXES if is_list else foac.RADIO
            )

        elif len(values) <= foac.VALUES_THRESHOLD:
            settings[foac.COMPONENT] = foac.DROPDOWN

        if settings[foac.COMPONENT] in foac.VALUES_COMPONENTS:
            settings[foac.VALUES] = values

    return settings
