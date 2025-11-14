"""
Annotation runs framework.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import eta.core.utils as etau

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.metadata as fomm
from fiftyone.core.runs import (
    BaseRun,
    BaseRunConfig,
    BaseRunInfo,
    BaseRunResults,
)
from fiftyone.core.odm import patch_annotation_runs, DynamicEmbeddedDocument


class AnnotationInfo(BaseRunInfo):
    """Information about an annotation run on a dataset.

    Args:
        key: the annotation key
        timestamp (None): the UTC ``datetime`` when the annotation run was
            initiated
        config (None): the :class:`AnnotationMethodConfig` for the run
    """

    @classmethod
    def config_cls(cls):
        return AnnotationMethodConfig


class AnnotationMethodConfig(BaseRunConfig):
    """Base class for configuring :class:`AnnotationMethod` instances.

    Args:
        **kwargs: any leftover keyword arguments after subclasses have done
            their parsing
    """

    @property
    def type(self):
        return "annotation"

    @property
    def method(self):
        return None


class AnnotationMethod(BaseRun):
    """Base class for annotation methods.

    Args:
        config: an :class:`AnnotationMethodConfig`
    """

    @classmethod
    def run_info_cls(cls):
        return AnnotationInfo

    @classmethod
    def _runs_field(cls):
        return "annotation_runs"

    @classmethod
    def _run_str(cls):
        return "annotation run"

    @classmethod
    def _results_cache_field(cls):
        return "_annotation_cache"

    @classmethod
    def _patch_function(cls):
        return patch_annotation_runs


class AnnotationResults(BaseRunResults):
    """Base class for annotation run results."""

    pass


def get_supported_app_annotation_fields(sample_collection):
    """
    Gets the supported App annotation fields for a
    :class:`fiftyone.core.collections.SampleCollection`.

    Currently supported  media types for the collection are ``image`` and
    ``3d``. See :attr:`fiftyone.core.collections.SampleCollection.media_type`

    All supported primitive and ``embedded.document`` primitives are supported
    as documented in :func:`generate_label_schema`

    The below :class:`fiftyone.core.labels.Label` types are also resolved.

    Supported ``image`` :class:`fiftyone.core.labels.Label` types are:
        -   ``classification``:
            :class:`fiftyone.core.labels.Classification`
        -   ``classifications``:
            :class:`fiftyone.core.labels.Classification`
        -   ``detection``: :class:`fiftyone.core.labels.Detection`
        -   ``detections``: :class:`fiftyone.core.labels.Detections`

    Supported ``3d`` label types are:
        -   ``classification``:
            :class:`fiftyone.core.labels.ClassificationField`
        -   ``classifications``:
            :class:`fiftyone.core.labels.ClassificationField`
        -   ``polyline``: :class:`fiftyone.core.labels.Polyline`
        -   ``polylines``: :class:`fiftyone.core.labels.Polylines`

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`

    Returns:
        a list of supported fields
    """
    _ensure_collection_is_supported(sample_collection)
    fields = _get_all_supported_fields(
        sample_collection, app_annotation_support=True
    )
    return _flatten_fields(sample_collection, fields)


def generate_label_schema(sample_collection, fields=None, scan_samples=True):
    """Generates a label schema given a
    :class:`fiftyone.core.collections.SampleCollection`.

    A label schema is defined by a ``type`` and ``component``. Further
    settings depend on the ``type`` and ``component`` combination as outined
    below.

    The ``type`` value for a field is inferred from the collection's field
    schema. See
    :meth:`fiftyone.core.collections.SampleCollection.get_field_schema`

    Currently supported  media types for the collection are ``image`` and
    ``3d``. See :attr:`fiftyone.core.collections.SampleCollection.media_type`

    Primitives and components::

    Supported primitive types are:
        -   ``bool``: :class:`fiftyone.core.fields.BooleanField`
        -   ``date``: :class:`fiftyone.core.fields.DateField`
        -   ``datetime``: :class:`fiftyone.core.fields.DateTimeField`
        -   ``dict``: :class:`fiftyone.core.fields.DictField`
        -   ``float``: :class:`fiftyone.core.fields.FloatField`
        -   ``id``: : :class:`fiftyone.core.fields.ObjectIdField` or
            :class:`fiftyone.core.fields.UUIDField`
        -   ``int``: :class:`fiftyone.core.fields.IntField` or
            :class:`fiftyone.core.fields.FrameNumberField`
        -   ``list<bool>``: :class:`fiftyone.core.fields.ListField` of
            :class:`fiftyone.core.fields.BooleanField`
        -   ``list<int>``: :class:`fiftyone.core.fields.ListField` of
            :class:`fiftyone.core.fields.IntField`
        -   ``list<float>``: :class:`fiftyone.core.fields.ListField` of
            :class:`fiftyone.core.fields.FloatField`
        -   ``list<str>``: : :class:`fiftyone.core.fields.ListField` of
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
            finite values are found that define the ``range``
        -   ``text``: the default when ``scan_samples`` is ``False``

    ``id`` only supports the ``text`` component where ``read_only`` must be
    ``True`` with no other settings.

    Supported ``list<bool>``, ``list<float>``, and ``list<int>`` components
    are:
        -   ``checkboxes``
        -   ``dropdown``
        -   ``text`` - the default

    Supported ``list<str>`` components are:
        -   ``checkboxes``: the default if ``<=5`` values are scanned
        -   ``text``: the default if ``0`` values or ``>20`` values are
            scanned, or ``scan_samples`` is ``False`. If ``>1000`` values are
            scanned, the ``values`` setting is omitted

    Supported ``str`` type components are:
        -   ``radio``: the default if ``<=5`` values are scanned
        -   ``text``: the default if ``0`` values or ``>1000`` values are
            scanned, or ``scan_samples`` is ``False``

    ``float`` supports a ``precision`` setting for the number of digits to
    allow after the decimal.

    All components support a ``default`` value setting and ``read_only``
    flag.

    All components support ``values`` except ``json``, ``slider``, and
    ``toggle` excepting ``id`` restrictions.

    ``checkboxes`` and ``dropdown`` require the ``values`` setting.

    ``slider`` requires the ``range: [min, max]`` setting.

    Labels::

    The ``label`` subfield of all label types are configured via ``classes``
    and support the same settings as a ``str`` type. See the example output
    below for ``detections`` fields in the quickstart dataset. If the label
    tyoe has a visual representation, that field is handled by the App's
    builtin annotation UI, e.g. ``bounding_box`` for a ``detection``. Primitive
    attributes of label types are configured via the ``attributes`` setting.

    All :class:`fiftyone.core.labels.Label`` types are resolved by this method
    except :class:`fiftyone.core.labels.GeoLocation`,
    :class:`fiftyone.core.labels.GeoLocations`,
    :class:`fiftyone.core.labels.TemporalDetection`, and
    :class:`fiftyone.core.labels.TemporalDetections`. For label types supported
    by the App for annotation, see :meth:`get_supported_app_annotation_fields`.

    If a field is ``read_only`` in the field schema, then the ``read_only``
    label schema setting can must be ``True``, e.g. ``created_at`` and
    ``last_modified_at`` must be read only.

    Embedded documents::

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

        fo.pprint(fo.generate_field_schema(dataset, scan_samples=True))

        # todo: add output here

    Args:
        sample_collection: the
            :class:`fiftyone.core.collections.SampleCollection` to generate the
            schema with
        field (None): a field name, ``embedded.field.name`` or iterable of such
            values
        scan_samples (False): whether to scan the collection to populate
            component settings

    Raises:
        ValueError: If the sample collection or the field is not supported, or
        the field does not exist or is not supported

    Returns:
        a label schema ``dict``
    """
    if etau.is_str(fields):
        fields = [fields]
    elif fields is None:
        fields = _get_all_supported_fields(sample_collection)

    fields = list(fields)
    fields = _flatten_fields(sample_collection, fields)

    schema = {}
    for field in fields:
        schema[field] = _generate_field_label_schema(
            sample_collection, field, scan_samples
        )


def _flatten_fields(collection, fields):
    flattened_fields = []
    for field_name in fields:
        field = collection.get_field(field)

        if field is None:
            raise ValueError(f"field '{field_name}' does not exist")

        if not isinstance(field, fof.EmbeddedDocumentField):
            flattened_fields.append(field)
            continue

        if field.document_type not in _SUPPORTED_DOC_TYPES:
            continue

        for subfield in field.fields:
            if not _is_supported_field(subfield, collection.media_type):
                continue

            flattened_fields.push(f"{field_name}.{subfield.name}")

    return sorted(set(flattened_fields))


def _get_all_supported_fields(collection, app_annotation_support=False):
    fields = collection.get_field_schema()
    media_type = collection.media_type

    result = set()
    for field_name, field in fields.items():

        if _is_supported_field(
            field, media_type, app_annotation_support=app_annotation_support
        ):
            result.add(field_name)
            continue

        elif field.document_type in _SUPPORTED_DOC_TYPES:
            result.add(field_name)

    return sorted(result)


def _generate_field_label_schema(collection, field, scan_samples):
    media_type = collection.media_type
    if not _is_supported_field(field, media_type):
        raise ValueError(
            f"field '{field_name}' of type '{str(field)} is not supported"
        )

    read_only = field.read_only

    is_list = isinstance(field, fof.ListField)
    if is_list:
        field = field.field

    default_type = (
        _FIELD_TYPE_TO_TYPES[fof.ListField][type(field)]
        if is_list
        else _FIELD_TYPE_TO_TYPES[type(field)]
    )

    settings = {
        "read_only": True,
        "type": default_type,
    }
    component = _DEFAULT_COMPONENTS[_type]
    if component:
        settings["component"] = component

    if read_only:
        return settings

    if isinstance(field, fof.StringField):
        _handle_str()

    if isinstance(field, fof.BooleanField):
        _handle_bool()

    if isinstance(field, (fof.FloatField, fof.IntField)):
        _handle_float_or_int()

    if is_list:
        raise ValueError(f"todo")

    if isinstance(
        field,
        (
            fof.DateField,
            fof.DateTimeField,
            fof.ObjectIdField,
            fof.FloatField,
            fof.IntField,
        ),
    ):
        return {"type": "input", "default": None}

    if not isinstance(field, fof.EmbeddedDocumentField):
        raise ValueError(f"unsupported annotation field {field}")

    if issubclass(field.document_type, fol._HasLabelList):
        field_name = f"{field_name}.{field.document_type._LABEL_LIST_FIELD}"
        field = collection.get_field(field_name).field

    attributes = {}
    classes = []
    for f in field.fields:
        if _is_supported_field():
            # todo
            pass

        if f.name == "id":
            continue

        if f.name == "label":
            classes = (
                collection.distinct(f"{field_name}.label")
                if scan_samples
                else []
            )
            continue

        if f.name == "bounding_box" and field.document_type == fol.Detection:
            # bounding_box is a list of floats field, but really a 4-tuple of
            # [0, 1] floats, omit for special handling by the App
            continue

        try:
            attributes[f.name] = generate_label_schema(
                sample_collection, f"{field_name}.{f.name}"
            )
        except:
            pass

    return {
        "attributes": attributes,
        "classes": classes,
    }


def _ensure_collection_is_supported(collection):
    if collection.media_type in _SUPPORTED_MEDIA_TYPES:
        raise ValueError(f"{collection.media_type} media is not supported yet")


def _handle_bool():
    pass


def _handle_float_or_int():
    pass


def _handle_str(collection, field_name, is_list, settings, scan_samples):
    try:
        if scan_samples:
            values = collection.distinct(field_name)
        else:
            values = None

        if len(values) <= _CHECKBOXES_OR_RADIO_THRESHOLD:
            settings["type"] = "checkboxes" if is_list else "radio"

        if values > _VALUES_THRESHOLD:
            values = None

        if values:
            settings["values"] = values

        return settings
    except:
        # too many distinct values
        return settings


def _is_supported_field(field, media_type, app_annotation_support=False):
    if _is_supported_primitive(field):
        return True

    if not isinstance(field, fof.EmbeddedDocumentField):
        return False

    if app_annotation_support:

        if field.document_type in _SUPPORTED_LABEL_TYPES:
            return True

        if (
            field.document_type
            in _SUPPORTED_LABEL_TYPES_BY_MEDIA_TYPE[media_type]
        ):
            return True

        return False

    if (
        isinstance(field, fol.Label)
        and type(field) not in _UNSUPPORTED_LABEL_TYPES
    ):
        return True

    return False


def _is_supported_primitive(field):
    if isinstance(field, _SUPPORTED_PRIMITIVES):
        return True

    if isinstance(field, fof.ListField):
        if isinstance(field.field, _SUPPORTED_LISTS_OF_PRIMITIVES):
            return True

    return False


### Compnents

CHECKBOX = "checkbox"
CHECKBOXES = "checkboxes"
DATEPICKER = "datepicker"
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
ID = "id"
INT = "int"
LIST_BOOL = "list<bool>"
LIST_FLOAT = "list<float>"
LIST_INT = "list<int>"
LIST_STR = "list<str>"
STR = "str"


_DEFAULT_COMPONENTS = {
    BOOL: TOGGLE,
    DATE: DATEPICKER,
    DATEPICKER: DATEPICKER,
    DICT: JSON,
    FLOAT: TEXT,
    ID: None,
    INT: TEXT,
    LIST_BOOL: TEXT,
    LIST_FLOAT: TEXT,
    LIST_INT: TEXT,
    LIST_STR: TEXT,
    STR: TEXT,
}

_FIELD_TYPE_TO_TYPES = {
    fof.BooleanField: BOOL,
    fof.DateField: DATE,
    fof.DateTimeField: DATETIME,
    fof.DictField: DICT,
    fof.FloatField: FLOAT,
    fof.IntField: INT,
    fof.ObjectIdField: ID,
    fof.StringField: STR,
    fof.ListField: {
        fof.BooleanField: LIST_BOOL,
        fof.FloatField: LIST_FLOAT,
        fof.IntField: LIST_INT,
        fof.StringField: LIST_STR,
    },
    fof.UUIDField: ID,
}


_CHECKBOXES_OR_RADIO_THRESHOLD = 5
_VALUES_THRESHOLD = 1000


_SUPPORTED_MEDIA_TYPES = {fom.IMAGE, fom.THREE_D}


_SUPPORTED_DOC_TYPES = {
    DynamicEmbeddedDocument,
    fomm.ImageMetadata,
    fomm.SceneMetadata,
}


_SUPPORTED_LABEL_TYPES = {fol.Classification, fol.Classifications}


_SUPPORTED_LISTS_OF_PRIMITIVES = {
    fof.BooleanField,
    fof.FloatField,
    fof.IntField,
    fof.StringField,
}


_SUPPORTED_PRIMITIVES = {
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
}


_SUPPORTED_LABEL_TYPES_BY_MEDIA_TYPE = {
    fom.IMAGE: {
        fol.Detection,
        fol.Detections,
    },
    fom.THREE_D: {fol.Polyline, fol.Polylines},
}

_UNSUPPORTED_LABEL_TYPES = {
    fol.GeoLocation,
    fol.GeoLocations,
    fol.TemporalDetection,
    fol.TemporalDetections,
}
