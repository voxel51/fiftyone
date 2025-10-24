"""
Annotation runs framework.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
from fiftyone.core.runs import (
    BaseRun,
    BaseRunConfig,
    BaseRunInfo,
    BaseRunResults,
)
from fiftyone.core.odm import patch_annotation_runs


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


def compute_annotation_schema(collection, field_name, scan_samples=True):
    """Compute the annotation schema for a collection's field

    An annotation schema is defined by a type. A field type and an annotation
    type informs the form type and allowed values

    Annotation types are:
        - checkbox
        - input
        - select
        - radio
        - text
        - tags

    Args:
        collection: a :class:`fiftyone.core.collections.SampleCollection`
        field_name: a field name or ``embedded.field.name`` to process

    Raises:
        ValueError: if the field does not exists or annotation for its
        field type is not supported

    Returns:
        an annotation schema dictionary
    """
    if field_name is None:
        raise ValueError("field_name is required")

    field = collection.get_field(field_name)
    if field is None:
        raise ValueError(f"field '{field_name}' does not exist")
    is_list = isinstance(field, fof.ListField)
    if is_list:
        field = field.field

    if isinstance(field, fof.StringField):
        try:
            return {
                "default": [] if is_list else None,
                "type": "tags" if is_list else "select",
                "values": (
                    collection.distinct(field_name) if scan_samples else []
                ),
            }
        except:
            # too many distinct values
            return {"default": None, "type": "input"}

    if is_list:
        raise ValueError(
            f"unsupported annotation field {field}; only StringField lists are supported"
        )

    if isinstance(field, fof.BooleanField):
        return {
            "default": None,
            "type": "radio",
            "values": [True, False, None],
        }

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
            attributes[f.name] = compute_annotation_schema(
                collection, f"{field_name}.{f.name}"
            )
        except:
            pass

    return {
        "attributes": attributes,
        "classes": classes,
    }
