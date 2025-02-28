"""
View stages.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import builtins
from collections import defaultdict, OrderedDict
import contextlib
from copy import deepcopy
import itertools
import random
import reprlib
import uuid
import warnings

from bson import ObjectId
import numpy as np

import eta.core.utils as etau

import fiftyone.core.expressions as foe
from fiftyone.core.expressions import ViewField as F
from fiftyone.core.expressions import VALUE
import fiftyone.core.frame as fofr
import fiftyone.core.groups as fog
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
from fiftyone.core.odm.document import MongoEngineBaseDocument
import fiftyone.core.sample as fos
import fiftyone.core.utils as fou
import fiftyone.core.validation as fova
from fiftyone.core.fields import EmbeddedDocumentField, ListField

fob = fou.lazy_import("fiftyone.brain")
focl = fou.lazy_import("fiftyone.core.clips")
foc = fou.lazy_import("fiftyone.core.collections")
fod = fou.lazy_import("fiftyone.core.dataset")
fop = fou.lazy_import("fiftyone.core.patches")
fov = fou.lazy_import("fiftyone.core.view")
fovi = fou.lazy_import("fiftyone.core.video")
foug = fou.lazy_import("fiftyone.utils.geojson")


class ViewStage(object):
    """Abstract base class for all view stages.

    :class:`ViewStage` instances represent logical operations to apply to
    :class:`fiftyone.core.collections.SampleCollection` instances, which may
    decide what subset of samples in the collection should pass though the
    stage, and also what subset of the contents of each
    :class:`fiftyone.core.sample.Sample` should be passed. The output of
    view stages are represented by a :class:`fiftyone.core.view.DatasetView`.
    """

    # tricky: this becomes shadowed by an instance attribute when _serialize()
    # is called
    _uuid = None

    def __str__(self):
        return repr(self)

    def __repr__(self):
        kwargs_list = []
        for k, v in self._kwargs():
            if k.startswith("_"):
                continue

            v_repr = _repr.repr(v)
            # v_repr = etau.summarize_long_str(v_repr, 30)
            kwargs_list.append("%s=%s" % (k, v_repr))

        kwargs_str = ", ".join(kwargs_list)
        return "%s(%s)" % (self.__class__.__name__, kwargs_str)

    def __eq__(self, other):
        return type(self) == type(other) and self._kwargs() == other._kwargs()

    @property
    def has_view(self):
        """Whether this stage's output view should be loaded via
        :meth:`load_view` rather than appending stages to an aggregation
        pipeline via :meth:`to_mongo`.
        """
        return False

    @property
    def outputs_dynamic_groups(self):
        """Whether this stage outputs or flattens dynamic groups.

        The possible return values are:

        -   ``True``: this stage *dynamically groups* the input collection
        -   ``False``: this stage *flattens* dynamic groups
        -   ``None``: this stage does not change group status
        """
        return None

    @property
    def flattens_groups(self):
        """Whether this stage flattens groups into a non-grouped collection.

        The possible return values are:

        -   ``True``: this stage *flattens* groups
        -   ``False``: this stage *does not flatten* groups
        -   ``None``: this stage does not change group status
        """
        return None

    def get_edited_fields(self, sample_collection, frames=False):
        """Returns a list of names of fields or embedded fields that may have
        been edited by the stage, if any.

        The ``"frames."`` prefix should be omitted when ``frames`` is True.

        Args:
            sample_collection: the
                :class:`fiftyone.core.collections.SampleCollection` to which
                the stage is being applied
            frames (False): whether to return sample-level (False) or
                frame-level (True) fields

        Returns:
            a list of fields, or ``None`` if no fields have been edited
        """
        return None

    def get_filtered_fields(self, sample_collection, frames=False):
        """Returns a list of names of fields or embedded fields that contain
        **arrays** have been filtered by the stage, if any.

        For example, if a stage filters a
        :class:`fiftyone.core.labels.Detections` field called
        ``"predictions"``, it should include ``"predictions.detections"`` in
        the returned list.

        The ``"frames."`` prefix should be omitted when ``frames`` is True.

        Args:
            sample_collection: the
                :class:`fiftyone.core.collections.SampleCollection` to which
                the stage is being applied
            frames (False): whether to return sample-level (False) or
                frame-level (True) fields

        Returns:
            a list of fields, or ``None`` if no fields have been filtered
        """
        return None

    def get_selected_fields(self, sample_collection, frames=False):
        """Returns a list of fields that have been selected by the stage, if
        any.

        View stages only need to report selected fields if they insist that
        non-selected fields not appear in the schema of the returned view.

        Args:
            sample_collection: the
                :class:`fiftyone.core.collections.SampleCollection` to which
                the stage is being applied
            frames (False): whether to return sample-level (False) or
                frame-level (True) fields

        Returns:
            a list of fields, or ``None`` if no fields have been selected
        """
        return None

    def get_excluded_fields(self, sample_collection, frames=False):
        """Returns a list of fields that have been excluded by the stage, if
        any.

        View stages only need to report excluded fields if they insist that
        excluded fields not appear in the schema of the returned view.

        Args:
            sample_collection: the
                :class:`fiftyone.core.collections.SampleCollection` to which
                the stage is being applied
            frames (False): whether to return sample-level (False) or
                frame-level (True) fields

        Returns:
            a list of fields, or ``None`` if no fields have been selected
        """
        return None

    def get_media_type(self, sample_collection):
        """Returns the media type outputted by this stage when applied to the
        given collection, if and only if it is different from the input type.

        Args:
            sample_collection: the
                :class:`fiftyone.core.collections.SampleCollection` to which
                the stage is being applied

        Returns:
            the media type, or ``None`` if the stage does not change the type
        """
        return None

    def get_group_expr(self, sample_collection):
        """Returns the dynamic group expression for the given stage, if any.

        Only usable if :meth:`outputs_dynamic_groups` is ``True``.

        Args:
            sample_collection: the
                :class:`fiftyone.core.collections.SampleCollection` to which
                the stage is being applied

        Returns:
            a tuple of

            -   the group expression, or ``None`` if the stage does not
                generate dynamic groups
            -   whether the group expression is an ObjectId field, or ``None``
        """
        return None, None

    def get_group_media_types(self, sample_collection):
        """Returns the group media types outputted by this stage, if any, when
        applied to the given collection, if and only if they are different from
        the input collection.

        Args:
            sample_collection: the
                :class:`fiftyone.core.collections.SampleCollection` to which
                the stage is being applied

        Returns:
            a dict mapping slice names to media types, or ``None`` if the stage
            does not change the types
        """
        return None

    def load_view(self, sample_collection):
        """Loads the :class:`fiftyone.core.view.DatasetView` containing the
        output of the stage.

        Only usable if :meth:`has_view` is ``True``.

        Args:
            sample_collection: the
                :class:`fiftyone.core.collections.SampleCollection` to which
                the stage is being applied

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        if not self.has_view:
            raise ValueError(
                "%s stages use `to_mongo()`, not `load_view()`" % type(self)
            )

        raise NotImplementedError("subclasses must implement `load_view()`")

    def to_mongo(self, sample_collection):
        """Returns the MongoDB aggregation pipeline for the stage.

        Only usable if :meth:`has_view` is ``False``.

        Args:
            sample_collection: the
                :class:`fiftyone.core.collections.SampleCollection` to which
                the stage is being applied

        Returns:
            a MongoDB aggregation pipeline (list of dicts)
        """
        if not self.has_view:
            raise ValueError(
                "%s stages use `load_view()`, not `to_mongo()`" % type(self)
            )

        raise NotImplementedError("subclasses must implement `to_mongo()`")

    def validate(self, sample_collection):
        """Validates that the stage can be applied to the given collection.

        Args:
            sample_collection: a
                :class:`fiftyone.core.collections.SampleCollection`

        Raises:
            :class:`ViewStageError`: if the stage cannot be applied to the
                collection
        """
        pass

    def _needs_frames(self, sample_collection):
        """Whether the stage requires frame labels of video samples to be
        attached.

        Args:
            sample_collection: the
                :class:`fiftyone.core.collections.SampleCollection` to which
                the stage is being applied

        Returns:
            True/False
        """
        return False

    def _needs_group_slices(self, sample_collection):
        """Whether the stage requires group slice(s) to be attached.

        Args:
            sample_collection: the
                :class:`fiftyone.core.collections.SampleCollection` to which
                the stage is being applied

        Returns:
            None, or a list of group slices
        """
        return None

    def _serialize(self, include_uuid=True):
        """Returns a JSON dict representation of the :class:`ViewStage`.

        Args:
            include_uuid (True): whether to include the stage's UUID in the
                JSON representation

        Returns:
            a JSON dict
        """
        d = {
            "_cls": etau.get_class_name(self),
            "kwargs": self._kwargs(),
        }

        if include_uuid:
            if self._uuid is None:
                self._uuid = str(uuid.uuid4())

            d["_uuid"] = self._uuid

        return d

    def _kwargs(self):
        """Returns a list of ``[name, value]`` lists describing the parameters
        of this stage instance.

        Returns:
            a list of ``[name, value]`` lists
        """
        raise NotImplementedError("subclasses must implement `_kwargs()`")

    @classmethod
    def _params(cls):
        """Returns a list of JSON dicts describing the stage's supported
        parameters.

        Returns:
            a list of JSON dicts
        """
        raise NotImplementedError("subclasses must implement `_params()`")

    @classmethod
    def _from_dict(cls, d):
        """Creates a :class:`ViewStage` instance from a serialized JSON dict
        representation of it.

        Args:
            d: a JSON dict

        Returns:
            a :class:`ViewStage`
        """
        view_stage_cls = etau.get_class(d["_cls"])
        stage = view_stage_cls(**dict(d["kwargs"]))
        stage._uuid = d.get("_uuid", None)
        return stage


class ViewStageError(Exception):
    """An error raised when a problem with a :class:`ViewStage` is encountered."""

    pass


class Concat(ViewStage):
    """Concatenates the contents of the given
    :class:`fiftyone.core.collections.SampleCollection` to this collection.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("quickstart")

        #
        # Concatenate two views
        #

        view1 = dataset.match(F("uniqueness") < 0.2)
        view2 = dataset.match(F("uniqueness") > 0.7)

        stage = fo.Concat(view2)
        view = view1.add_stage(stage)

        print(view1)
        print(view2)
        print(view)

        #
        # Concatenate two patches views
        #

        gt_objects = dataset.to_patches("ground_truth")

        patches1 = gt_objects[:50]
        patches2 = gt_objects[-50:]

        stage = fo.Concat(patches2)
        patches = patches1.add_stage(stage)

        print(patches1)
        print(patches2)
        print(patches)

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection` whose
            contents to append to this collection
    """

    def __init__(self, samples):
        samples, view = self._parse_params(samples)

        self._samples = samples
        self._view = view

    @property
    def samples(self):
        """The :class:`fiftyone.core.collections.SampleCollection` whose
        contents to append to this collection.
        """
        return self._view

    def to_mongo(self, _):
        return [
            {
                "$unionWith": {
                    "coll": self._view._dataset._sample_collection_name,
                    "pipeline": self._view._pipeline(
                        detach_frames=True, detach_groups=True
                    ),
                }
            }
        ]

    def validate(self, sample_collection):
        if sample_collection._dataset != self._view._dataset:
            if sample_collection._root_dataset == self._view._root_dataset:
                raise ValueError(
                    "When concatenating samples from generated views (e.g. "
                    "patches or frames), all views must be derived from the "
                    "same root generated view"
                )
            else:
                raise ValueError(
                    "Cannot concatenate samples from different datasets"
                )

    def _kwargs(self):
        return [["samples", self._samples]]

    @classmethod
    def _params(cls):
        return [{"name": "samples", "type": "json", "placeholder": ""}]

    def _parse_params(self, samples):
        if not isinstance(samples, (foc.SampleCollection, dict)):
            raise ValueError(
                "`samples` must be a SampleCollection or a serialized "
                "representation of one, but found %s" % samples
            )

        view = None

        if isinstance(samples, foc.SampleCollection):
            view = samples.view()
            samples = None

        if view is None:
            view = self._load_view(samples)

        if samples is None:
            samples = self._serialize_view(view)

        return samples, view

    def _serialize_view(self, view):
        return {
            "dataset": view._root_dataset.name,
            "stages": view._serialize(include_uuids=False),
        }

    def _load_view(self, d):
        dataset = fod.load_dataset(d["dataset"])
        return fov.DatasetView._build(dataset, d["stages"])


class Exclude(ViewStage):
    """Excludes the samples with the given IDs from a collection.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(filepath="/path/to/image1.png"),
                fo.Sample(filepath="/path/to/image2.png"),
                fo.Sample(filepath="/path/to/image3.png"),
            ]
        )

        #
        # Exclude the first sample from the dataset
        #

        sample_id = dataset.first().id
        stage = fo.Exclude(sample_id)
        view = dataset.add_stage(stage)

        #
        # Exclude the first and last samples from the dataset
        #

        sample_ids = [dataset.first().id, dataset.last().id]
        stage = fo.Exclude(sample_ids)
        view = dataset.add_stage(stage)

    Args:
        sample_ids: the samples to exclude. Can be any of the following:

            -   a sample ID
            -   an iterable of sample IDs
            -   a :class:`fiftyone.core.sample.Sample` or
                :class:`fiftyone.core.sample.SampleView`
            -   an iterable of :class:`fiftyone.core.sample.Sample` or
                :class:`fiftyone.core.sample.SampleView` instances
            -   a :class:`fiftyone.core.collections.SampleCollection`
    """

    def __init__(self, sample_ids):
        sample_ids, bools = _parse_sample_ids(sample_ids)

        if bools:
            raise ValueError(
                "Excluding samples via boolean indexing is not supported; use "
                "select() instead"
            )

        self._sample_ids = sample_ids

    @property
    def sample_ids(self):
        """The list of sample IDs to exclude."""
        return self._sample_ids

    def to_mongo(self, _):
        sample_ids = [ObjectId(_id) for _id in self._sample_ids]
        return [{"$match": {"_id": {"$not": {"$in": sample_ids}}}}]

    def _kwargs(self):
        return [["sample_ids", self._sample_ids]]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "sample_ids",
                "type": "list<id>|id",
                "placeholder": "list,of,sample,ids",
            }
        ]


class ExcludeBy(ViewStage):
    """Excludes the samples with the given field values from a collection.

    This stage is typically used to work with categorical fields (strings,
    ints, and bools). If you want to exclude samples based on floating point
    fields, use :class:`Match`.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(filepath="image%d.jpg" % i, int=i, str=str(i))
                for i in range(10)
            ]
        )

        #
        # Create a view excluding samples whose `int` field have the given
        # values
        #

        stage = fo.ExcludeBy("int", [1, 9, 3, 7, 5])
        view = dataset.add_stage(stage)
        print(view.head(5))

        #
        # Create a view excluding samples whose `str` field have the given
        # values
        #

        stage = fo.ExcludeBy("str", ["1", "9", "3", "7", "5"])
        view = dataset.add_stage(stage)
        print(view.head(5))

    Args:
        field: a field or ``embedded.field.name``
        values: a value or iterable of values to exclude by
    """

    def __init__(self, field, values):
        if etau.is_container(values):
            values = list(values)
        else:
            values = [values]

        self._field = field
        self._values = values

    @property
    def field(self):
        """The field whose values to exclude by."""
        return self._field

    @property
    def values(self):
        """The list of values to exclude by."""
        return self._values

    def to_mongo(self, sample_collection):
        path, is_id_field, _ = sample_collection._handle_id_fields(self._field)

        if is_id_field:
            values = [
                value if isinstance(value, ObjectId) else ObjectId(value)
                for value in self._values
            ]
        else:
            values = self._values

        return [{"$match": {path: {"$not": {"$in": values}}}}]

    def _kwargs(self):
        return [["field", self._field], ["values", self._values]]

    @classmethod
    def _params(cls):
        return [
            {"name": "field", "type": "field|str", "placeholder": "field"},
            {
                "name": "values",
                "type": "json",
                "placeholder": "list,of,values",
            },
        ]


class ExcludeFields(ViewStage):
    """Excludes the fields with the given names from the samples in a
    collection.

    Note that default fields cannot be excluded.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    ground_truth=fo.Classification(label="cat"),
                    predictions=fo.Classification(
                        label="cat",
                        confidence=0.9,
                        mood="surly",
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    ground_truth=fo.Classification(label="dog"),
                    predictions=fo.Classification(
                        label="dog",
                        confidence=0.8,
                        mood="happy",
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                ),
            ]
        )

        #
        # Exclude the `predictions` field from all samples
        #

        stage = fo.ExcludeFields("predictions")
        view = dataset.add_stage(stage)

        #
        # Exclude the `mood` attribute from all classifications in the
        # `predictions` field
        #

        stage = fo.ExcludeFields("predictions.mood")
        view = dataset.add_stage(stage)

        #
        # Exclude the `predictions` field from all samples
        #

    Args:
        field_names (None): a field name or iterable of field names to exclude.
            May contain ``embedded.field.name`` as well
        meta_filter (None): a filter that dynamically excludes fields in
            the collection's schema according to the specified rule, which
            can be matched against the field's ``name``, ``type``,
            ``description``, and/or ``info``. For example:

            -   Use ``meta_filter="2023"`` or ``meta_filter={"any": "2023"}``
                to exclude fields that have the string "2023" anywhere in their
                name, type, description, or info
            -   Use ``meta_filter={"type": "StringField"}`` or
                ``meta_filter={"type": "Classification"}`` to exclude all
                string or classification fields, respectively
            -   Use ``meta_filter={"description": "my description"}`` to
                exclude fields whose description contains the string
                "my description"
            -   Use ``meta_filter={"info": "2023"}`` to exclude fields that
                have the string "2023" anywhere in their info
            -   Use ``meta_filter={"info.key": "value"}}`` to exclude
                fields that have a specific key/value pair in their info
            -   Include ``meta_filter={"include_nested_fields": True, ...}`` in
                your meta filter to include all nested fields in the filter
    """

    def __init__(
        self,
        field_names=None,
        meta_filter=None,
        _allow_missing=False,
    ):
        if etau.is_str(field_names):
            field_names = [field_names]
        elif field_names is not None:
            field_names = list(field_names)

        self._field_names = field_names
        self._meta_filter = meta_filter
        self._allow_missing = _allow_missing

    @property
    def field_names(self):
        """A list of field names to exclude."""
        return self._field_names

    @property
    def meta_filter(self):
        """A filter that dynamically excludes fields."""
        return self._meta_filter

    def get_excluded_fields(self, sample_collection, frames=False):
        if frames:
            return self._get_excluded_frame_fields(sample_collection)

        return self._get_excluded_fields(sample_collection)

    def _get_excluded_fields(self, sample_collection, use_db_fields=False):
        excluded_paths = set()

        if self._field_names is not None:
            if sample_collection._contains_videos():
                paths, _ = fou.split_frame_fields(self._field_names)
            else:
                paths = self._field_names

            excluded_paths.update(paths)

        if self._meta_filter is not None:
            paths = _get_meta_filtered_fields(
                sample_collection, self._meta_filter
            )

            # Cannot exclude default fields
            default_paths = sample_collection._get_default_sample_fields(
                include_private=True
            )
            paths = set(paths) - set(default_paths)

            excluded_paths.update(paths)

        excluded_paths = list(excluded_paths)

        if use_db_fields:
            return sample_collection._handle_db_fields(excluded_paths)

        return excluded_paths

    def _get_excluded_frame_fields(
        self, sample_collection, use_db_fields=False
    ):
        if not sample_collection._contains_videos():
            return None

        excluded_paths = set()

        if self._field_names is not None:
            _, paths = fou.split_frame_fields(self._field_names)
            excluded_paths.update(paths)

        if self._meta_filter is not None:
            paths = _get_meta_filtered_fields(
                sample_collection, self._meta_filter, frames=True
            )

            # Cannot exclude default fields
            default_paths = sample_collection._get_default_frame_fields(
                include_private=True
            )
            paths = set(paths) - set(default_paths)

            excluded_paths.update(paths)

        excluded_paths = list(excluded_paths)

        if use_db_fields:
            return sample_collection._handle_db_fields(
                excluded_paths, frames=True
            )

        return excluded_paths

    def to_mongo(self, sample_collection):
        excluded_paths = self._get_excluded_fields(
            sample_collection, use_db_fields=True
        )

        if sample_collection._contains_videos():
            excluded_frame_paths = self._get_excluded_frame_fields(
                sample_collection, use_db_fields=True
            )
            _merge_frame_paths(excluded_paths, excluded_frame_paths)

        if not excluded_paths:
            return []

        return [{"$project": {p: False for p in excluded_paths}}]

    def _needs_frames(self, sample_collection):
        if not sample_collection._contains_videos():
            return False

        if self._field_names is None:
            return False

        # @todo consider `meta_filter` here too?
        return any(
            sample_collection._is_frame_field(f) for f in self._field_names
        )

    def _needs_group_slices(self, sample_collection):
        if sample_collection.media_type != fom.GROUP:
            return None

        if self._field_names is None:
            return None

        return sample_collection._get_group_slices(self._field_names)

    def _kwargs(self):
        return [
            ["field_names", self._field_names],
            ["meta_filter", self._meta_filter],
            ["_allow_missing", self._allow_missing],
        ]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "field_names",
                "type": "NoneType|list<field>|field|list<str>|str",
                "placeholder": "field_names",
            },
            {
                "name": "meta_filter",
                "type": "NoneType|str|json",
                "default": "None",
                "placeholder": "meta_filter",
            },
            {"name": "_allow_missing", "type": "bool", "default": "False"},
        ]

    def validate(self, sample_collection):
        if self._allow_missing or self._field_names is None:
            return

        # Validate that all root fields exist
        # Using dataset here allows a field to be excluded multiple times
        sample_collection._dataset.validate_fields_exist(self._field_names)

        if sample_collection._contains_videos():
            paths, frame_paths = fou.split_frame_fields(self._field_names)
        else:
            paths = self._field_names
            frame_paths = None

        if paths:
            defaults = set()
            for root, _paths in _parse_paths(paths).items():
                default_paths = sample_collection._get_default_sample_fields(
                    path=root, include_private=True
                )
                defaults.update(_paths & set(default_paths))

            if defaults:
                raise ValueError("Cannot exclude default fields %s" % defaults)

        if frame_paths:
            defaults = set()
            for root, _paths in _parse_paths(frame_paths).items():
                default_paths = sample_collection._get_default_frame_fields(
                    path=root, include_private=True
                )
                defaults.update(_paths & set(default_paths))

            if defaults:
                raise ValueError(
                    "Cannot exclude default frame fields %s" % defaults
                )


def _get_meta_filtered_fields(sample_collection, meta_filter, frames=False):
    if not meta_filter:
        return []

    if isinstance(meta_filter, dict):
        flat = meta_filter.get("include_nested_fields", False)
    else:
        flat = False

    if frames:
        schema = sample_collection.get_frame_field_schema(flat=flat)
    else:
        schema = sample_collection.get_field_schema(flat=flat)

    if isinstance(meta_filter, str):
        str_filter = meta_filter
        meta_filter = {}
    else:
        str_filter = None

    _mf = meta_filter.copy()

    if not str_filter and isinstance(_mf, dict):
        str_filter = _mf.pop("any", None)

    description_filter = _mf.pop("description", None)
    name_filter = _mf.pop("name", None)
    info_filter = _mf.pop("info", None)
    type_filter = _mf.pop("type", None)

    for key, val in meta_filter.items():
        if "." in key:
            if not info_filter:
                info_filter = {}
            base, leaf = key.split(".", 1)
            info_filter[leaf] = val

    matcher = lambda q, v: (
        q.lower() in v.lower()
        if isinstance(v, str) and isinstance(q, str)
        else (
            q.lower() in str(v).lower()
            if isinstance(q, str) and isinstance(v, dict)
            else q == v
        )
    )

    type_matcher = lambda query, field: (
        (
            type(field.document_type).__name__ == query
            or field.document_type.__name__ == query
            if isinstance(field, EmbeddedDocumentField)
            else type(field).__name__ == query
        )
        if isinstance(query, str)
        else (
            isinstance(field.document_type, query)
            or field.document_type == query
            if isinstance(field, EmbeddedDocumentField)
            else isinstance(field, query)
        )
    )

    paths = []

    for path, field in schema.items():
        # match anything anywhere
        if str_filter is not None and _matches_field_meta(
            field, matcher, str_filter
        ):
            paths.append(path)

        # match description only
        if description_filter is not None and _matches_field_meta(
            field, matcher, description_filter, "description"
        ):
            paths.append(path)

        # match name only
        if name_filter is not None and _matches_field_meta(
            field, matcher, name_filter, "name"
        ):
            paths.append(path)

        # match info only
        if info_filter is not None and _matches_field_meta(
            field, matcher, info_filter, "info"
        ):
            paths.append(path)

        # match type only
        if type_filter is not None and _matches_field_meta(
            field, type_matcher, type_filter, "type"
        ):
            paths.append(path)

        for key, val in meta_filter.items():
            if _matches_field_meta(field, matcher, val, key):
                paths.append(path)

    return paths


def _matches_field_meta(field, matcher, query, key=None):
    if key is None:
        matches = matcher(query, field.description)
        if not matches:
            matches |= matcher(query, field.name)
        if not matches and isinstance(field.info, dict):
            matches |= _recursive_match(field.info, matcher, query)
        return matches

    if key == "description":
        return matcher(query, field.description)

    if key == "name":
        return matcher(query, field.name)

    if key == "type":
        return matcher(query, field)

    if key == "info" and field.info is not None:
        matches = matcher(query, field.info)
        # else fall through to the recursive match
        if not matches and isinstance(query, dict):
            for k, v in query.items():
                matches |= _recursive_match(field.info, matcher, v, k)
        return matches

    if not isinstance(field.info, dict):
        return False

    return _recursive_match(field.info, matcher, query, key)


def _recursive_match(info, matcher, query, key=None, recursion_limit=1):
    if recursion_limit <= 0:
        return False
    if not key:
        for val in info.values():
            if isinstance(val, dict):
                if _recursive_match(val, matcher, query, recursion_limit - 1):
                    return True
            elif matcher(query, val):
                return True

    if key in info:
        if matcher(query, info[key]):
            return True

    for sub_key, sub_value in info.items():
        if isinstance(sub_value, dict):
            if _recursive_match(
                sub_value, matcher, query, key, recursion_limit - 1
            ):
                return True

    return False


def _parse_paths(paths):
    d = defaultdict(set)

    for path in paths:
        if "." in path:
            base = path.rsplit(".", 1)[0]
            d[base].add(path)
        else:
            d[None].add(path)

    return d


class ExcludeFrames(ViewStage):
    """Excludes the frames with the given IDs from a video collection.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart-video")

        #
        # Exclude some specific frames
        #

        frame_ids = [
            dataset.first().frames.first().id,
            dataset.last().frames.last().id,
        ]

        stage = fo.ExcludeFrames(frame_ids)
        view = dataset.add_stage(stage)

        print(dataset.count("frames"))
        print(view.count("frames"))

    Args:
        frame_ids: the frames to exclude. Can be any of the following:

            -   a frame ID
            -   an iterable of frame IDs
            -   a :class:`fiftyone.core.frame.Frame` or
                :class:`fiftyone.core.frame.FrameView`
            -   an iterable of :class:`fiftyone.core.frame.Frame` or
                :class:`fiftyone.core.frame.FrameView` instances
            -   a :class:`fiftyone.core.collections.SampleCollection` whose
                frames to exclude

        omit_empty (True): whether to omit samples that have no frames after
            excluding the specified frames
    """

    def __init__(self, frame_ids, omit_empty=True):
        self._frame_ids = _parse_frame_ids(frame_ids)
        self._omit_empty = omit_empty

    @property
    def frame_ids(self):
        """The list of frame IDs to exclude."""
        return self._frame_ids

    @property
    def omit_empty(self):
        """Whether to omit samples that have no frames after filtering."""
        return self._omit_empty

    def to_mongo(self, _):
        frame_ids = [ObjectId(_id) for _id in self._frame_ids]
        select_expr = F("frames").filter(~F("_id").is_in(frame_ids))
        pipeline = [{"$addFields": {"frames": select_expr.to_mongo()}}]

        if self._omit_empty:
            non_empty_expr = F("frames").length() > 0
            pipeline.append({"$match": {"$expr": non_empty_expr.to_mongo()}})

        return pipeline

    def _kwargs(self):
        return [
            ["frame_ids", self._frame_ids],
            ["omit_empty", self._omit_empty],
        ]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "frame_ids",
                "type": "list<id>|id",
                "placeholder": "list,of,frame,ids",
            },
            {
                "name": "omit_empty",
                "type": "bool",
                "default": "True",
                "placeholder": "omit empty (default=True)",
            },
        ]

    def _needs_frames(self, _):
        return True

    def validate(self, sample_collection):
        fova.validate_video_collection(sample_collection)


class ExcludeGroups(ViewStage):
    """Excludes the groups with the given IDs from a grouped collection.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart-groups")

        #
        # Exclude some specific groups by ID
        #

        view = dataset.take(2)
        group_ids = view.values("group.id")

        stage = fo.ExcludeGroups(group_ids)
        other_groups = dataset.add_stage(stage)

        assert len(set(group_ids) & set(other_groups.values("group.id"))) == 0

    Args:
        groups_ids: the groups to select. Can be any of the following:

            -   a group ID
            -   an iterable of group IDs
            -   a :class:`fiftyone.core.sample.Sample` or
                :class:`fiftyone.core.sample.SampleView`
            -   a group dict returned by
                :meth:`get_group() <fiftyone.core.collections.SampleCollection.get_group>`
            -   an iterable of :class:`fiftyone.core.sample.Sample` or
                :class:`fiftyone.core.sample.SampleView` instances
            -   an iterable of group dicts returned by
                :meth:`get_group() <fiftyone.core.collections.SampleCollection.get_group>`
            -   a :class:`fiftyone.core.collections.SampleCollection`
    """

    def __init__(self, group_ids, ordered=False):
        self._group_ids = _parse_group_ids(group_ids)

    @property
    def group_ids(self):
        """The list of group IDs to exclude."""
        return self._group_ids

    def to_mongo(self, sample_collection):
        id_path = sample_collection.group_field + "._id"
        ids = [ObjectId(_id) for _id in self._group_ids]

        return [{"$match": {id_path: {"$not": {"$in": ids}}}}]

    def _kwargs(self):
        return [["group_ids", self._group_ids]]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "group_ids",
                "type": "list<id>|id",
                "placeholder": "list,of,group,ids",
            }
        ]

    def validate(self, sample_collection):
        if sample_collection.media_type != fom.GROUP:
            raise ValueError("%s has no groups" % type(sample_collection))


class ExcludeLabels(ViewStage):
    """Excludes the specified labels from a collection.

    The returned view will omit samples, sample fields, and individual labels
    that do not match the specified selection criteria.

    You can perform an exclusion via one or more of the following methods:

    -   Provide the ``labels`` argument, which should contain a list of dicts
        in the format returned by
        :attr:`fiftyone.core.session.Session.selected_labels`, to exclude
        specific labels

    -   Provide the ``ids`` argument to exclude labels with specific IDs

    -   Provide the ``tags`` argument to exclude labels with specific tags

    If multiple criteria are specified, labels must match all of them in order
    to be excluded.

    By default, the exclusion is applied to all
    :class:`fiftyone.core.labels.Label` fields, but you can provide the
    ``fields`` argument to explicitly define the field(s) in which to exclude.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart")

        #
        # Exclude the labels currently selected in the App
        #

        session = fo.launch_app(dataset)

        # Select some labels in the App...

        stage = fo.ExcludeLabels(labels=session.selected_labels)
        view = dataset.add_stage(stage)

        #
        # Exclude labels with the specified IDs
        #

        # Grab some label IDs
        ids = [
            dataset.first().ground_truth.detections[0].id,
            dataset.last().predictions.detections[0].id,
        ]

        stage = fo.ExcludeLabels(ids=ids)
        view = dataset.add_stage(stage)

        print(dataset.count("ground_truth.detections"))
        print(view.count("ground_truth.detections"))

        print(dataset.count("predictions.detections"))
        print(view.count("predictions.detections"))

        #
        # Exclude labels with the specified tags
        #

        # Grab some label IDs
        ids = [
            dataset.first().ground_truth.detections[0].id,
            dataset.last().predictions.detections[0].id,
        ]

        # Give the labels a "test" tag
        dataset = dataset.clone()  # create copy since we're modifying data
        dataset.select_labels(ids=ids).tag_labels("test")

        print(dataset.count_values("ground_truth.detections.tags"))
        print(dataset.count_values("predictions.detections.tags"))

        # Exclude the labels via their tag
        stage = fo.ExcludeLabels(tags="test")
        view = dataset.add_stage(stage)

        print(dataset.count("ground_truth.detections"))
        print(view.count("ground_truth.detections"))

        print(dataset.count("predictions.detections"))
        print(view.count("predictions.detections"))

    Args:
        labels (None): a list of dicts specifying the labels to exclude in the
            format returned by
            :attr:`fiftyone.core.session.Session.selected_labels`
        ids (None): an ID or iterable of IDs of the labels to exclude
        tags (None): a tag or iterable of tags of labels to exclude
        fields (None): a field or iterable of fields from which to exclude
        omit_empty (True): whether to omit samples that have no labels after
            filtering
    """

    def __init__(
        self, labels=None, ids=None, tags=None, fields=None, omit_empty=True
    ):
        if labels is not None:
            sample_ids, labels_map = _parse_labels(labels)
        else:
            sample_ids, labels_map = None, None

        if etau.is_str(ids):
            ids = [ids]
        elif ids is not None:
            ids = list(ids)

        if etau.is_str(tags):
            tags = [tags]
        elif tags is not None:
            tags = list(tags)

        if etau.is_str(fields):
            fields = [fields]
        elif fields is not None:
            fields = list(fields)

        self._labels = labels
        self._ids = ids
        self._tags = tags
        self._fields = fields
        self._omit_empty = omit_empty
        self._sample_ids = sample_ids
        self._labels_map = labels_map
        self._pipeline = None

    @property
    def labels(self):
        """A list of dicts specifying the labels to exclude."""
        return self._labels

    @property
    def ids(self):
        """A list of IDs of labels to exclude."""
        return self._ids

    @property
    def tags(self):
        """A list of tags of labels to exclude."""
        return self._tags

    @property
    def fields(self):
        """A list of fields from which labels are being excluded."""
        return self._fields

    @property
    def omit_empty(self):
        """Whether to omit samples that have no labels after filtering."""
        return self._omit_empty

    def get_edited_fields(self, sample_collection, frames=False):
        if self._labels is not None:
            fields = self._labels_map.keys()
        elif self._fields is not None:
            fields = self._fields
        else:
            fields = sample_collection._get_label_fields()

        edited_fields = []

        for field in fields:
            field_name, is_frame_field = sample_collection._handle_frame_field(
                field
            )
            if frames == is_frame_field:
                edited_fields.append(field_name)

        if edited_fields:
            return edited_fields

        return None

    def get_filtered_fields(self, sample_collection, frames=False):
        if self._labels is not None:
            fields = self._labels_map.keys()
        elif self._fields is not None:
            fields = self._fields
        else:
            fields = sample_collection._get_label_fields()

        filtered_fields = []

        for field in fields:
            list_path, is_list_field, is_frame_field = _parse_labels_field(
                sample_collection, field
            )
            if is_list_field and frames == is_frame_field:
                list_path, _ = sample_collection._handle_frame_field(list_path)
                filtered_fields.append(list_path)

        if filtered_fields:
            return filtered_fields

        return None

    def to_mongo(self, _):
        if self._pipeline is None:
            raise ValueError(
                "`validate()` must be called before using a %s stage"
                % self.__class__
            )

        return self._pipeline

    def _kwargs(self):
        return [
            ["labels", self._labels],
            ["ids", self._ids],
            ["tags", self._tags],
            ["fields", self._fields],
            ["omit_empty", self._omit_empty],
        ]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "labels",
                "type": "NoneType|json",
                "placeholder": "[{...}]",
                "default": "None",
            },
            {
                "name": "ids",
                "type": "NoneType|list<id>|id",
                "placeholder": "ids",
                "default": "None",
            },
            {
                "name": "tags",
                "type": "NoneType|list<str>|str",
                "placeholder": "tags",
                "default": "None",
            },
            {
                "name": "fields",
                "type": "NoneType|list<field>|field|list<str>|str",
                "placeholder": "fields",
                "default": "None",
            },
            {
                "name": "omit_empty",
                "type": "bool",
                "default": "True",
                "placeholder": "omit empty (default=True)",
            },
        ]

    def _needs_frames(self, sample_collection):
        if not sample_collection._contains_videos():
            return False

        if self._labels is not None:
            fields = self._labels_map.keys()
        elif self._fields is not None:
            fields = self._fields
        else:
            fields = sample_collection._get_label_fields()

        return any(sample_collection._is_frame_field(f) for f in fields)

    def _needs_group_slices(self, sample_collection):
        if sample_collection.media_type != fom.GROUP:
            return None

        if self._labels is not None:
            fields = self._labels_map.keys()
        elif self._fields is not None:
            fields = self._fields
        else:
            fields = sample_collection._get_label_fields()

        return sample_collection._get_group_slices(fields)

    def _make_labels_pipeline(self, sample_collection):
        pipeline = []

        # Exclude specified labels
        for field, labels_map in self._labels_map.items():
            label_filter = ~F("_id").is_in(
                [foe.ObjectId(_id) for _id in labels_map]
            )
            stage = FilterLabels(field, label_filter, only_matches=False)
            stage.validate(sample_collection)
            pipeline.extend(stage.to_mongo(sample_collection))

        # Filter samples with no labels, if requested
        if self._omit_empty:
            fields = sample_collection._get_label_fields()
            pipeline.extend(
                _make_omit_empty_labels_pipeline(sample_collection, fields)
            )

        return pipeline

    def _make_pipeline(self, sample_collection):
        pipeline = []

        if self._fields is not None:
            fields = self._fields
        else:
            fields = sample_collection._get_label_fields()

        filter_expr = None

        if self._ids is not None:
            filter_expr = ~F("_id").is_in([ObjectId(_id) for _id in self._ids])

        if self._tags is not None:
            tag_expr = (F("tags") != None).if_else(
                ~F("tags").contains(self._tags), False
            )
            if filter_expr is not None:
                filter_expr &= tag_expr
            else:
                filter_expr = tag_expr

        # Filter excluded labels
        if filter_expr is not None:
            for field in fields:
                stage = FilterLabels(field, filter_expr, only_matches=False)
                stage.validate(sample_collection)
                pipeline.extend(stage.to_mongo(sample_collection))

        # Filter samples with no labels, if requested
        if self._omit_empty:
            fields = sample_collection._get_label_fields()
            pipeline.extend(
                _make_omit_empty_labels_pipeline(sample_collection, fields)
            )

        return pipeline

    def validate(self, sample_collection):
        if self._labels is not None:
            self._pipeline = self._make_labels_pipeline(sample_collection)
        else:
            self._pipeline = self._make_pipeline(sample_collection)


class Exists(ViewStage):
    """Returns a view containing the samples in a collection that have (or do
    not have) a non-``None`` value for the given field or embedded field.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    ground_truth=fo.Classification(label="cat"),
                    predictions=fo.Classification(label="cat", confidence=0.9),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    ground_truth=fo.Classification(label="dog"),
                    predictions=fo.Classification(label="dog", confidence=0.8),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    ground_truth=fo.Classification(label="dog"),
                    predictions=fo.Classification(label="dog"),
                ),
                fo.Sample(
                    filepath="/path/to/image4.png",
                    ground_truth=None,
                    predictions=None,
                ),
                fo.Sample(filepath="/path/to/image5.png"),
            ]
        )

        #
        # Only include samples that have a value in their `predictions` field
        #

        stage = fo.Exists("predictions")
        view = dataset.add_stage(stage)

        #
        # Only include samples that do NOT have a value in their `predictions`
        # field
        #

        stage = fo.Exists("predictions", False)
        view = dataset.add_stage(stage)

        #
        # Only include samples that have prediction confidences
        #

        stage = fo.Exists("predictions.confidence")
        view = dataset.add_stage(stage)

    Args:
        field: the field name or ``embedded.field.name``
        bool (True): whether to check if the field exists (None or True) or
            does not exist (False)
    """

    def __init__(self, field, bool=None):
        if bool is None:
            bool = True

        self._field = field
        self._bool = bool

    @property
    def field(self):
        """The field to check for existence."""
        return self._field

    @property
    def bool(self):
        """Whether to check if the field exists (True) or does not exist
        (False).
        """
        return self._bool

    def to_mongo(self, sample_collection):
        field_name, is_frame_field = sample_collection._handle_frame_field(
            self._field
        )

        if is_frame_field and not field_name:
            if self._bool:
                expr = F("frames").length() > 0
            else:
                expr = F("frames").length() == 0

            return [{"$match": {"$expr": expr.to_mongo()}}]

        if not is_frame_field:
            expr = F(field_name).exists(self._bool)
            return [{"$match": {"$expr": expr.to_mongo()}}]

        if self._bool:
            expr = F("frames").filter(F(field_name).exists()).length() > 0
        else:
            expr = F("frames").filter(F(field_name).exists()).length() == 0

        return [{"$match": {"$expr": expr.to_mongo()}}]

    def _needs_frames(self, sample_collection):
        if not sample_collection._contains_videos():
            return False

        return sample_collection._is_frame_field(self._field)

    def _needs_group_slices(self, sample_collection):
        if sample_collection.media_type != fom.GROUP:
            return None

        return sample_collection._get_group_slices(self._field)

    def _kwargs(self):
        return [["field", self._field], ["bool", self._bool]]

    @classmethod
    def _params(cls):
        return [
            {"name": "field", "type": "field|str"},
            {
                "name": "bool",
                "type": "bool",
                "default": "None",
                "placeholder": "bool (default=None)",
            },
        ]


class FilterField(ViewStage):
    """Filters the values of a given field or embedded field of each sample in
    a collection.

    Values of ``field`` for which ``filter`` returns ``False`` are
    replaced with ``None``.

    Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    ground_truth=fo.Classification(label="cat"),
                    predictions=fo.Classification(label="cat", confidence=0.9),
                    numeric_field=1.0,
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    ground_truth=fo.Classification(label="dog"),
                    predictions=fo.Classification(label="dog", confidence=0.8),
                    numeric_field=-1.0,
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    ground_truth=None,
                    predictions=None,
                    numeric_field=None,
                ),
            ]
        )

        #
        # Only include classifications in the `predictions` field
        # whose `label` is "cat"
        #

        stage = fo.FilterField("predictions", F("label") == "cat")
        view = dataset.add_stage(stage)

        #
        # Only include samples whose `numeric_field` value is positive
        #

        stage = fo.FilterField("numeric_field", F() > 0)
        view = dataset.add_stage(stage)

    Args:
        field: the field name or ``embedded.field.name``
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
        only_matches (True): whether to only include samples that match the
            filter (True) or include all samples (False)
    """

    def __init__(self, field, filter, only_matches=True, _new_field=None):
        self._field = field
        self._filter = filter
        self._only_matches = only_matches
        self._new_field = _new_field or field
        self._is_frame_field = None
        self._validate_params()

    @property
    def field(self):
        """The field to filter."""
        return self._field

    @property
    def filter(self):
        """The filter expression."""
        return self._filter

    @property
    def only_matches(self):
        """Whether to only include samples that match the filter."""
        return self._only_matches

    def get_edited_fields(self, sample_collection, frames=False):
        field_name, is_frame_field = sample_collection._handle_frame_field(
            self._field
        )

        if frames == is_frame_field:
            return [field_name]

        return None

    def to_mongo(self, sample_collection):
        field_name, is_frame_field = sample_collection._handle_frame_field(
            self._field
        )
        new_field = self._get_new_field(sample_collection)

        if is_frame_field:
            return _get_filter_frames_field_pipeline(
                sample_collection,
                field_name,
                new_field,
                self._filter,
                only_matches=self._only_matches,
            )

        return _get_filter_field_pipeline(
            sample_collection,
            field_name,
            new_field,
            self._filter,
            only_matches=self._only_matches,
        )

    def _get_mongo_filter(self):
        if self._is_frame_field:
            filter_field = self._field.split(".", 1)[1]  # remove `frames`
            return _get_field_mongo_filter(
                self._filter, prefix="$frame." + filter_field
            )

        return _get_field_mongo_filter(self._filter, prefix=self._field)

    def _get_new_field(self, sample_collection):
        new_field, _ = sample_collection._handle_frame_field(self._new_field)
        return new_field

    def _needs_frames(self, sample_collection):
        if not sample_collection._contains_videos():
            return False

        return sample_collection._is_frame_field(self._field)

    def _needs_group_slices(self, sample_collection):
        if sample_collection.media_type != fom.GROUP:
            return None

        return sample_collection._get_group_slices(self._field)

    def _kwargs(self):
        return [
            ["field", self._field],
            ["filter", self._get_mongo_filter()],
            ["only_matches", self._only_matches],
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "field", "type": "field|str"},
            {"name": "filter", "type": "json", "placeholder": ""},
            {
                "name": "only_matches",
                "type": "bool",
                "default": "True",
                "placeholder": "only matches (default=True)",
            },
        ]

    def _validate_params(self):
        if not isinstance(self._filter, (foe.ViewExpression, dict, bool)):
            raise ValueError(
                "Filter must be a ViewExpression or a MongoDB aggregation "
                "expression defining a filter; found '%s'" % self._filter
            )

    def validate(self, sample_collection):
        sample_collection.validate_fields_exist(self._field)

        field, is_frame_field = sample_collection._handle_frame_field(
            self._field
        )
        self._is_frame_field = is_frame_field

        if is_frame_field:
            if field in ("id", "frame_number"):
                raise ValueError(
                    "Cannot filter required frame field '%s'" % field
                )
        else:
            if field in ("id", "filepath"):
                raise ValueError("Cannot filter required field '%s'" % field)


def _get_filter_field_pipeline(
    sample_collection,
    filter_field,
    new_field,
    filter_arg,
    only_matches=True,
):
    cond = _get_field_mongo_filter(filter_arg, prefix=filter_field)

    pipeline = [
        {
            "$addFields": {
                new_field: {
                    "$cond": {
                        "if": cond,
                        "then": "$" + filter_field,
                        "else": None,
                    }
                }
            }
        }
    ]

    if only_matches:
        match_expr = _get_field_only_matches_expr(new_field)
        pipeline.append({"$match": {"$expr": match_expr.to_mongo()}})

    return pipeline


def _get_field_only_matches_expr(field):
    return F(field).exists()


def _get_filter_frames_field_pipeline(
    sample_collection,
    filter_field,
    new_field,
    filter_arg,
    only_matches=True,
):
    cond = _get_field_mongo_filter(filter_arg, prefix="$frame." + filter_field)

    if "." in new_field:
        parent, child = new_field.split(".", 1)
        obj = {
            "$cond": {
                "if": {"$gt": ["$$frame." + filter_field, None]},
                "then": {
                    "$cond": {
                        "if": cond,
                        "then": {parent: {child: "$$frame." + filter_field}},
                        "else": None,
                    }
                },
                "else": {},
            },
        }

    else:
        obj = {
            new_field: {
                "$cond": {
                    "if": cond,
                    "then": "$$frame." + filter_field,
                    "else": None,
                }
            }
        }

    pipeline = [
        {
            "$addFields": {
                "frames": {
                    "$map": {
                        "input": "$frames",
                        "as": "frame",
                        "in": {
                            "$mergeObjects": [
                                "$$frame",
                                obj,
                            ]
                        },
                    }
                }
            }
        }
    ]

    if only_matches:
        match_expr = _get_frames_field_only_matches_expr(new_field)
        pipeline.append({"$match": {"$expr": match_expr.to_mongo()}})

    return pipeline


def _get_frames_field_only_matches_expr(field):
    return F("frames").reduce(VALUE + F(field).exists().to_int()) > 0


def _get_field_mongo_filter(filter_arg, prefix="$this"):
    if isinstance(filter_arg, foe.ViewExpression):
        return filter_arg.to_mongo(prefix="$" + prefix)

    return filter_arg


class FilterLabels(ViewStage):
    """Filters the :class:`fiftyone.core.labels.Label` field of each sample in
    a collection.

    If the specified ``field`` is a single :class:`fiftyone.core.labels.Label`
    type, fields for which ``filter`` returns ``False`` are replaced with
    ``None``:

    -   :class:`fiftyone.core.labels.Classification`
    -   :class:`fiftyone.core.labels.Detection`
    -   :class:`fiftyone.core.labels.Polyline`
    -   :class:`fiftyone.core.labels.Keypoint`

    If the specified ``field`` is a :class:`fiftyone.core.labels.Label` list
    type, the label elements for which ``filter`` returns ``False`` are omitted
    from the view:

    -   :class:`fiftyone.core.labels.Classifications`
    -   :class:`fiftyone.core.labels.Detections`
    -   :class:`fiftyone.core.labels.Polylines`
    -   :class:`fiftyone.core.labels.Keypoints`

    Classifications Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    predictions=fo.Classification(label="cat", confidence=0.9),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    predictions=fo.Classification(label="dog", confidence=0.8),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    predictions=fo.Classification(label="rabbit"),
                ),
                fo.Sample(
                    filepath="/path/to/image4.png",
                    predictions=None,
                ),
            ]
        )

        #
        # Only include classifications in the `predictions` field whose
        # `confidence` is greater than 0.8
        #

        stage = fo.FilterLabels("predictions", F("confidence") > 0.8)
        view = dataset.add_stage(stage)

        #
        # Only include classifications in the `predictions` field whose `label`
        # is "cat" or "dog"
        #

        stage = fo.FilterLabels("predictions", F("label").is_in(["cat", "dog"]))
        view = dataset.add_stage(stage)

    Detections Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="cat",
                                bounding_box=[0.1, 0.1, 0.5, 0.5],
                                confidence=0.9,
                            ),
                            fo.Detection(
                                label="dog",
                                bounding_box=[0.2, 0.2, 0.3, 0.3],
                                confidence=0.8,
                            ),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="cat",
                                bounding_box=[0.5, 0.5, 0.4, 0.4],
                                confidence=0.95,
                            ),
                            fo.Detection(label="rabbit"),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="squirrel",
                                bounding_box=[0.25, 0.25, 0.5, 0.5],
                                confidence=0.5,
                            ),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image4.png",
                    predictions=None,
                ),
            ]
        )

        #
        # Only include detections in the `predictions` field whose `confidence`
        # is greater than 0.8
        #

        stage = fo.FilterLabels("predictions", F("confidence") > 0.8)
        view = dataset.add_stage(stage)

        #
        # Only include detections in the `predictions` field whose `label` is
        # "cat" or "dog"
        #

        stage = fo.FilterLabels("predictions", F("label").is_in(["cat", "dog"]))
        view = dataset.add_stage(stage)

        #
        # Only include detections in the `predictions` field whose bounding box
        # area is smaller than 0.2
        #

        # Bboxes are in [top-left-x, top-left-y, width, height] format
        bbox_area = F("bounding_box")[2] * F("bounding_box")[3]

        stage = fo.FilterLabels("predictions", bbox_area < 0.2)
        view = dataset.add_stage(stage)

    Polylines Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    predictions=fo.Polylines(
                        polylines=[
                            fo.Polyline(
                                label="lane",
                                points=[[(0.1, 0.1), (0.1, 0.6)]],
                                filled=False,
                            ),
                            fo.Polyline(
                                label="road",
                                points=[[(0.2, 0.2), (0.5, 0.5), (0.2, 0.5)]],
                                filled=True,
                            ),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    predictions=fo.Polylines(
                        polylines=[
                            fo.Polyline(
                                label="lane",
                                points=[[(0.4, 0.4), (0.9, 0.4)]],
                                filled=False,
                            ),
                            fo.Polyline(
                                label="road",
                                points=[[(0.6, 0.6), (0.9, 0.9), (0.6, 0.9)]],
                                filled=True,
                            ),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    predictions=None,
                ),
            ]
        )

        #
        # Only include polylines in the `predictions` field that are filled
        #

        stage = fo.FilterLabels("predictions", F("filled") == True)
        view = dataset.add_stage(stage)

        #
        # Only include polylines in the `predictions` field whose `label` is
        # "lane"
        #

        stage = fo.FilterLabels("predictions", F("label") == "lane")
        view = dataset.add_stage(stage)

        #
        # Only include polylines in the `predictions` field with at least
        # 3 vertices
        #

        num_vertices = F("points").map(F().length()).sum()
        stage = fo.FilterLabels("predictions", num_vertices >= 3)
        view = dataset.add_stage(stage)

    Keypoints Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    predictions=fo.Keypoint(
                        label="house",
                        points=[(0.1, 0.1), (0.1, 0.9), (0.9, 0.9), (0.9, 0.1)],
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    predictions=fo.Keypoint(
                        label="window",
                        points=[(0.4, 0.4), (0.5, 0.5), (0.6, 0.6)],
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    predictions=None,
                ),
            ]
        )

        #
        # Only include keypoints in the `predictions` field whose `label` is
        # "house"
        #

        stage = fo.FilterLabels("predictions", F("label") == "house")
        view = dataset.add_stage(stage)

        #
        # Only include keypoints in the `predictions` field with less than four
        # points
        #

        stage = fo.FilterLabels("predictions", F("points").length() < 4)
        view = dataset.add_stage(stage)

    Args:
        field: the label field to filter
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
        only_matches (True): whether to only include samples with at least
            one label after filtering (True) or include all samples (False)
        trajectories (False): whether to match entire object trajectories for
            which the object matches the given filter on at least one frame.
            Only applicable to video datasets and frame-level label fields
            whose objects have their ``index`` attributes populated
    """

    def __init__(
        self,
        field,
        filter,
        only_matches=True,
        trajectories=False,
        _new_field=None,
        _validate=True,
    ):
        self._field = field
        self._filter = filter
        self._only_matches = only_matches
        self._trajectories = trajectories
        self._new_field = _new_field or field
        self._labels_field = None
        self._is_frame_field = None
        self._is_labels_list_field = None
        self._validate_params()

    @property
    def field(self):
        """The label field to filter."""
        return self._field

    @property
    def filter(self):
        """The filter expression."""
        return self._filter

    @property
    def only_matches(self):
        """Whether to only include samples that match the filter."""
        return self._only_matches

    @property
    def trajectories(self):
        """Whether to match entire object trajectories for which the object
        matches the given filter on at least one frame.
        """
        return self._trajectories

    def get_edited_fields(self, sample_collection, frames=False):
        field_name, is_frame_field = sample_collection._handle_frame_field(
            self._field
        )

        if frames == is_frame_field:
            return [field_name]

        return None

    def get_filtered_fields(self, sample_collection, frames=False):
        if self._is_labels_list_field and (frames == self._is_frame_field):
            list_path, _ = sample_collection._handle_frame_field(
                self._labels_field
            )
            return [list_path]

        return None

    def to_mongo(self, sample_collection):
        if self._labels_field is None:
            raise ValueError(
                "`validate()` must be called before using a %s stage"
                % self.__class__
            )

        labels_field, is_frame_field = sample_collection._handle_frame_field(
            self._labels_field
        )
        new_field = self._get_new_field(sample_collection)

        pipeline = []

        if self._trajectories:
            (
                set_pipeline,
                label_filter,
                unset_pipeline,
            ) = _get_trajectories_filter(
                sample_collection, self._field, self._filter
            )

            pipeline.extend(set_pipeline)
        else:
            label_filter = self._filter

        if is_frame_field:
            if self._is_labels_list_field:
                _make_filter_pipeline = _get_filter_frames_list_field_pipeline
            else:
                _make_filter_pipeline = _get_filter_frames_field_pipeline
        elif self._is_labels_list_field:
            _make_filter_pipeline = _get_filter_list_field_pipeline
        else:
            _make_filter_pipeline = _get_filter_field_pipeline

        filter_pipeline = _make_filter_pipeline(
            sample_collection,
            labels_field,
            new_field,
            label_filter,
            only_matches=self._only_matches,
        )

        pipeline.extend(filter_pipeline)

        if self._trajectories:
            pipeline.extend(unset_pipeline)

        return pipeline

    def _parse_labels_field(self, sample_collection):
        field_name, is_list_field, is_frame_field = _parse_labels_field(
            sample_collection, self._field
        )
        self._is_frame_field = is_frame_field
        self._labels_field = field_name
        self._is_labels_list_field = is_list_field
        self._is_frame_field = is_frame_field

    def _get_mongo_filter(self):
        if self._trajectories:
            if self._is_labels_list_field:
                return _get_list_trajectory_mongo_filter(self._filter)

            return _get_trajectory_mongo_filter(self._filter)

        if self._is_labels_list_field:
            return _get_list_field_mongo_filter(self._filter)

        if self._is_frame_field:
            filter_field = self._field.split(".", 1)[1]  # remove `frames`
            return _get_field_mongo_filter(
                self._filter, prefix="$frame." + filter_field
            )

        return _get_field_mongo_filter(self._filter, prefix=self._field)

    def _get_new_field(self, sample_collection):
        field, _ = sample_collection._handle_frame_field(self._labels_field)
        new_field, _ = sample_collection._handle_frame_field(self._new_field)

        if len(field.split(".")) - len(new_field.split(".")) == 1:
            return ".".join([new_field, field.split(".")[-1]])

        return new_field

    def _needs_frames(self, sample_collection):
        if not sample_collection._contains_videos():
            return False

        return sample_collection._is_frame_field(self._labels_field)

    def _needs_group_slices(self, sample_collection):
        if sample_collection.media_type != fom.GROUP:
            return None

        return sample_collection._get_group_slices(self._labels_field)

    def _kwargs(self):
        return [
            ["field", self._field],
            ["filter", self._get_mongo_filter()],
            ["only_matches", self._only_matches],
            ["trajectories", self._trajectories],
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "field", "type": "field|str"},
            {"name": "filter", "type": "json", "placeholder": ""},
            {
                "name": "only_matches",
                "type": "bool",
                "default": "True",
                "placeholder": "only matches (default=True)",
            },
            {
                "name": "trajectories",
                "type": "bool",
                "default": "False",
                "placeholder": "trajectories (default=False)",
            },
        ]

    def _validate_params(self):
        if not isinstance(self._filter, (foe.ViewExpression, dict, bool)):
            raise ValueError(
                "Filter must be a ViewExpression or a MongoDB aggregation "
                "expression defining a filter; found '%s'" % self._filter
            )

    def validate(self, sample_collection):
        self._parse_labels_field(sample_collection)


def _get_filter_list_field_pipeline(
    sample_collection,
    filter_field,
    new_field,
    filter_arg,
    only_matches=True,
):
    cond = _get_list_field_mongo_filter(filter_arg)
    pipeline = [
        {
            "$addFields": {
                new_field: {
                    "$filter": {
                        "input": "$" + filter_field,
                        "cond": cond,
                    }
                }
            }
        }
    ]

    if only_matches:
        match_expr = _get_list_field_only_matches_expr(new_field)
        pipeline.append({"$match": {"$expr": match_expr.to_mongo()}})

    return pipeline


def _get_list_field_only_matches_expr(field):
    return F(field).length() > 0


def _get_filter_frames_list_field_pipeline(
    sample_collection,
    filter_field,
    new_field,
    filter_arg,
    only_matches=True,
):
    cond = _get_list_field_mongo_filter(filter_arg)

    parent, leaf = filter_field.split(".", 1)
    new_parent, _ = new_field.split(".", 1)
    if not issubclass(
        sample_collection.get_field(f"frames.{parent}").document_type,
        fol.Label,
    ):
        label_field, labels_list = leaf.split(".")
        obj = lambda merge: {new_parent: {label_field: merge}}
        label_path = f"{parent}.{label_field}"
    else:
        label_field, labels_list = new_parent, leaf
        label_path = label_field
        obj = lambda merge: {label_field: merge}

    merge = {
        "$mergeObjects": [
            "$$frame." + label_path,
            {
                labels_list: {
                    "$filter": {
                        "input": "$$frame." + filter_field,
                        "cond": cond,
                    }
                }
            },
        ]
    }

    pipeline = [
        {
            "$addFields": {
                "frames": {
                    "$map": {
                        "input": "$frames",
                        "as": "frame",
                        "in": {"$mergeObjects": ["$$frame", obj(merge)]},
                    }
                }
            }
        }
    ]

    if only_matches:
        match_expr = _get_frames_list_field_only_matches_expr(new_field)
        pipeline.append({"$match": {"$expr": match_expr.to_mongo()}})

    return pipeline


def _get_frames_list_field_only_matches_expr(field):
    return F("frames").reduce(VALUE + F(field).length()) > 0


def _get_trajectories_filter(sample_collection, field, filter_arg):
    root, is_list_field = sample_collection._get_label_field_root(field)
    root, is_frame_field = sample_collection._handle_frame_field(root)
    label_type = sample_collection._get_label_field_type(field)

    if not is_frame_field:
        raise ValueError(
            "Filtering trajectories is only supported for frame fields"
        )

    if label_type not in fol._INDEX_FIEDS:
        raise ValueError(
            "Cannot filter trajectories for field '%s' of type %s"
            % (field, fol._INDEX_FIEDS)
        )

    if is_list_field:
        cond = _get_list_trajectory_mongo_filter(filter_arg)
        filter_expr = (F("index") != None) & foe.ViewExpression(cond)
        reduce_expr = VALUE.extend(
            (F(root) != None).if_else(
                F(root).filter(filter_expr).map(F("index")),
                [],
            )
        )
    else:
        cond = _get_trajectory_mongo_filter(filter_arg)
        filter_expr = (F("index") != None) & foe.ViewExpression(cond)
        reduce_expr = (
            F(root)
            .apply(filter_expr)
            .if_else(VALUE.append(F(root + ".index")), VALUE)
        )

    # union() removes duplicates
    indexes_expr = F("frames").reduce(reduce_expr, []).union()

    set_pipeline = [{"$addFields": {"_indexes": indexes_expr.to_mongo()}}]
    label_filter = (F("$_indexes") != None) & F("$_indexes").contains(
        [F("index")]
    )
    unset_pipeline = [{"$project": {"_indexes": False}}]

    return set_pipeline, label_filter, unset_pipeline


def _get_trajectory_mongo_filter(filter_arg):
    if isinstance(filter_arg, foe.ViewExpression):
        return filter_arg.to_mongo(prefix="$$expr")

    return filter_arg


def _get_list_trajectory_mongo_filter(filter_arg):
    if isinstance(filter_arg, foe.ViewExpression):
        return filter_arg.to_mongo(prefix="$$this")

    return filter_arg


def _get_list_field_mongo_filter(filter_arg):
    if isinstance(filter_arg, foe.ViewExpression):
        return filter_arg.to_mongo(prefix="$$this")

    return filter_arg


class FilterKeypoints(ViewStage):
    """Filters the individual :attr:`fiftyone.core.labels.Keypoint.points`
    elements in the specified keypoints field of each sample in the
    collection.

    .. note::

        Use :class:`FilterLabels` if you simply want to filter entire
        :class:`fiftyone.core.labels.Keypoint` objects in a field.

    Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    predictions=fo.Keypoints(
                        keypoints=[
                            fo.Keypoint(
                                label="person",
                                points=[(0.1, 0.1), (0.1, 0.9), (0.9, 0.9), (0.9, 0.1)],
                                confidence=[0.7, 0.8, 0.95, 0.99],
                            )
                        ]
                    )
                ),
                fo.Sample(filepath="/path/to/image2.png"),
            ]
        )

        dataset.default_skeleton = fo.KeypointSkeleton(
            labels=["nose", "left eye", "right eye", "left ear", "right ear"],
            edges=[[0, 1, 2, 0], [0, 3], [0, 4]],
        )

        #
        # Only include keypoints in the `predictions` field whose
        # `confidence` is greater than 0.9
        #

        stage = fo.FilterKeypoints("predictions", filter=F("confidence") > 0.9)
        view = dataset.add_stage(stage)

        #
        # Only include keypoints in the `predictions` field with less than
        # four points
        #

        stage = fo.FilterKeypoints("predictions", labels=["left eye", "right eye"])
        view = dataset.add_stage(stage)

    Args:
        field: the :class:`fiftyone.core.labels.Keypoint` or
            :class:`fiftyone.core.labels.Keypoints` field to filter
        filter (None): a :class:`fiftyone.core.expressions.ViewExpression`
            or `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean, like ``F("confidence") > 0.5`` or
            ``F("occluded") == False``, to apply elementwise to the
            specified field, which must be a list of same length as
            :attr:`fiftyone.core.labels.Keypoint.points`
        labels (None): a label or iterable of keypoint skeleton labels to keep
        only_matches (True): whether to only include keypoints/samples with
            at least one point after filtering (True) or include all
            keypoints/samples (False)
    """

    def __init__(
        self,
        field,
        filter=None,
        labels=None,
        only_matches=True,
        _new_field=None,
    ):
        self._field = field
        self._filter = filter
        self._labels = labels
        self._only_matches = only_matches
        self._new_field = _new_field or field

        self._filter_dict = None
        self._filter_field = None
        self._filter_expr = None

        self._validate_params()

    @property
    def filter(self):
        """The filter expression."""
        return self._filter

    @property
    def labels(self):
        """An iterable of keypoint skeleton labels to keep."""
        return self._labels

    @property
    def only_matches(self):
        """Whether to only include samples that match the filter."""
        return self._only_matches

    def get_edited_fields(self, sample_collection, frames=False):
        field_name, is_frame_field = sample_collection._handle_frame_field(
            self._field
        )

        if frames == is_frame_field:
            return [field_name]

        return None

    def to_mongo(self, sample_collection):
        label_type, root_path = sample_collection._get_label_field_path(
            self._field
        )

        supported_types = (fol.Keypoint, fol.Keypoints)
        if label_type not in supported_types:
            raise ValueError(
                "Field '%s' has type %s; expected %s"
                % (self._field, label_type, supported_types)
            )

        is_list_field = issubclass(label_type, fol.Keypoints)
        _, points_path = sample_collection._get_label_field_path(
            self._field, "points"
        )

        pipeline = []

        if self._new_field != self._field:
            field, _ = sample_collection._handle_frame_field(self._field)
            _pipeline, _ = sample_collection._make_set_field_pipeline(
                self._new_field,
                F(field),
                allow_missing=True,
                embedded_root=True,
            )
            pipeline.extend(_pipeline)

        if self._filter_expr is not None:
            filter_expr = (F(self._filter_field) != None).if_else(
                F.zip(F("points"), F(self._filter_field)).map(
                    (F()[1].apply(self._filter_expr)).if_else(
                        F()[0],
                        [float("nan"), float("nan")],
                    )
                ),
                F("points"),
            )

            _pipeline, _ = sample_collection._make_set_field_pipeline(
                points_path,
                filter_expr,
                embedded_root=True,
                allow_missing=True,
                new_field=self._new_field,
            )
            pipeline.extend(_pipeline)

        if self._labels is not None:
            skeleton = sample_collection.get_skeleton(self._field)
            if skeleton is None:
                raise ValueError(
                    "No keypoint skeleton found for field '%s'" % self._field
                )

            if skeleton.labels is None:
                raise ValueError(
                    "Keypoint skeleton for field '%s' has no labels"
                    % self._field
                )

            if etau.is_str(self._labels):
                labels = {self._labels}
            else:
                labels = set(self._labels)

            inds = [
                idx
                for idx, label in enumerate(skeleton.labels)
                if label in labels
            ]

            labels_expr = F.enumerate(F("points")).map(
                F()[0]
                .is_in(inds)
                .if_else(F()[1], [float("nan"), float("nan")])
            )

            _pipeline, _ = sample_collection._make_set_field_pipeline(
                points_path,
                labels_expr,
                embedded_root=True,
                allow_missing=True,
                new_field=self._new_field,
            )
            pipeline.extend(_pipeline)

        if self._only_matches:
            # Remove Keypoint objects with no points after filtering
            has_points = (
                F("points").filter(F()[0] != float("nan")).length() > 0
            )
            if is_list_field:
                only_expr = F().filter(has_points)
            else:
                only_expr = has_points.if_else(F(), None)

            _pipeline, _ = sample_collection._make_set_field_pipeline(
                root_path,
                only_expr,
                allow_missing=True,
                new_field=self._new_field,
            )
            pipeline.extend(_pipeline)

            # Remove samples with no Keypoint objects after filtering
            match_expr = _get_label_field_only_matches_expr(
                sample_collection, self._field, new_field=self._new_field
            )

            pipeline.append({"$match": {"$expr": match_expr.to_mongo()}})

        return pipeline

    def _get_new_field(self, sample_collection):
        field, _ = sample_collection._handle_frame_field(self._field)
        new_field, _ = sample_collection._handle_frame_field(self._new_field)

        if len(field.split(".")) - len(new_field.split(".")) == 1:
            return ".".join([new_field, field.split(".")[-1]])

        return new_field

    def _needs_frames(self, sample_collection):
        if not sample_collection._contains_videos():
            return False

        return sample_collection._is_frame_field(self._field)

    def _needs_group_slices(self, sample_collection):
        if sample_collection.media_type != fom.GROUP:
            return None

        return sample_collection._get_group_slices(self._field)

    def _kwargs(self):
        return [
            ["field", self._field],
            ["filter", self._filter_dict],
            ["labels", self._labels],
            ["only_matches", self._only_matches],
        ]

    def _validate_params(self):
        if self._filter is None:
            return

        if isinstance(self._filter, foe.ViewExpression):
            # note: $$expr is used here because that's what
            # `ViewExpression.apply()` uses
            filter_dict = self._filter.to_mongo(prefix="$$expr")
        elif not isinstance(self._filter, dict):
            raise ValueError(
                "Filter must be a ViewExpression or a MongoDB aggregation "
                "expression defining a filter; found '%s'" % self._filter
            )
        else:
            filter_dict = self._filter

        filter_field, d = _extract_filter_field(filter_dict)

        self._filter_dict = filter_dict
        self._filter_field = filter_field
        self._filter_expr = foe.ViewExpression(d)

    @classmethod
    def _params(cls):
        return [
            {"name": "field", "type": "field|str"},
            {
                "name": "filter",
                "type": "NoneType|json",
                "placeholder": "filter",
                "default": "None",
            },
            {
                "name": "labels",
                "type": "NoneType|list<str>|str",
                "placeholder": "labels",
                "default": "None",
            },
            {
                "name": "only_matches",
                "type": "bool",
                "default": "True",
                "placeholder": "only matches (default=True)",
            },
        ]


def _extract_filter_field(val):
    field = None

    # note: $$expr is used here because that's what `F.apply()` uses
    if etau.is_str(val) and val.startswith("$$expr."):
        val, field = val.split(".", 1)

    if isinstance(val, dict):
        _val = {}
        for k, v in val.items():
            _field, _k = _extract_filter_field(k)
            if _field is not None:
                field = _field

            _field, _v = _extract_filter_field(v)
            if _field is not None:
                field = _field

            _val[_k] = _v

        return field, _val

    if isinstance(val, list):
        _val = []
        for v in val:
            _field, _v = _extract_filter_field(v)
            if _field is not None:
                field = _field

            _val.append(_v)

        return field, _val

    return field, val


class _GeoStage(ViewStage):
    def __init__(self, location_field=None, create_index=True):
        self._location_field = location_field
        self._location_key = None
        self._create_index = create_index

    @property
    def location_field(self):
        """The location field."""
        return self._location_field

    @property
    def create_index(self):
        """Whether to create the required spherical index, if necessary."""
        return self._create_index

    def validate(self, sample_collection):
        if self._location_field is None:
            self._location_field = sample_collection._get_geo_location_field()

        if sample_collection._is_label_field(
            self._location_field, fol.GeoLocation
        ):
            # Assume the user meant the `.point` field
            self._location_key = self._location_field + ".point"
        else:
            # Assume the user directly specified the subfield to use
            self._location_key = self._location_field

        if self._create_index:
            # These operations require a spherical index
            sample_collection.create_index([(self._location_key, "2dsphere")])


class GeoNear(_GeoStage):
    """Sorts the samples in a collection by their proximity to a specified
    geolocation.

    .. note::

        This stage must be the **first stage** in any
        :class:`fiftyone.core.view.DatasetView` in which it appears.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz

        TIMES_SQUARE = [-73.9855, 40.7580]

        dataset = foz.load_zoo_dataset("quickstart-geo")

        #
        # Sort the samples by their proximity to Times Square
        #

        stage = fo.GeoNear(TIMES_SQUARE)
        view = dataset.add_stage(stage)

        #
        # Sort the samples by their proximity to Times Square, and only
        # include samples within 5km
        #

        stage = fo.GeoNear(TIMES_SQUARE, max_distance=5000)
        view = dataset.add_stage(stage)

        #
        # Sort the samples by their proximity to Times Square, and only
        # include samples that are in Manhattan
        #

        import fiftyone.utils.geojson as foug

        in_manhattan = foug.geo_within(
            "location.point",
            [
                [
                    [-73.949701, 40.834487],
                    [-73.896611, 40.815076],
                    [-73.998083, 40.696534],
                    [-74.031751, 40.715273],
                    [-73.949701, 40.834487],
                ]
            ]
        )

        stage = fo.GeoNear(
            TIMES_SQUARE, location_field="location", query=in_manhattan
        )
        view = dataset.add_stage(stage)

    Args:
        point: the reference point to compute distances to. Can be any of the
            following:

            -   A ``[longitude, latitude]`` list
            -   A GeoJSON dict with ``Point`` type
            -   A :class:`fiftyone.core.labels.GeoLocation` instance whose
                ``point`` attribute contains the point

        location_field (None): the location data of each sample to use. Can be
            any of the following:

            -   The name of a :class:`fiftyone.core.fields.GeoLocation` field
                whose ``point`` attribute to use as location data
            -   An ``embedded.field.name`` containing GeoJSON data to use as
                location data
            -   ``None``, in which case there must be a single
                :class:`fiftyone.core.fields.GeoLocation` field on the samples,
                which is used by default

        min_distance (None): filter samples that are less than this distance
            (in meters) from ``point``
        max_distance (None): filter samples that are greater than this distance
            (in meters) from ``point``
        query (None): an optional dict defining a
            `MongoDB read query <https://docs.mongodb.com/manual/tutorial/query-documents/#read-operations-query-argument>`_
            that samples must match in order to be included in this view
        create_index (True): whether to create the required spherical index,
            if necessary
    """

    def __init__(
        self,
        point,
        location_field=None,
        min_distance=None,
        max_distance=None,
        query=None,
        create_index=True,
    ):
        super().__init__(
            location_field=location_field,
            create_index=create_index,
        )
        self._point = foug.parse_point(point)
        self._min_distance = min_distance
        self._max_distance = max_distance
        self._query = query

    @property
    def point(self):
        """The point to search proximity to."""
        return self._point

    @property
    def min_distance(self):
        """The minimum distance for matches, in meters."""
        return self._min_distance

    @property
    def max_distance(self):
        """The maximum distance for matches, in meters."""
        return self._max_distance

    @property
    def query(self):
        """A query dict specifying a match condition."""
        return self._query

    def to_mongo(self, _, **__):
        distance_field = self._location_field + "._distance"

        geo_near_expr = {
            "near": self._point,
            "key": self._location_key,
            "distanceField": distance_field,
            "spherical": True,
        }

        if self._min_distance is not None:
            geo_near_expr["minDistance"] = self._min_distance

        if self._max_distance is not None:
            geo_near_expr["maxDistance"] = self._max_distance

        if self._query is not None:
            geo_near_expr["query"] = self._query

        return [
            {"$geoNear": geo_near_expr},
            {"$project": {distance_field: False}},
        ]

    def _kwargs(self):
        return [
            ["point", self._point],
            ["location_field", self._location_field],
            ["min_distance", self._min_distance],
            ["max_distance", self._max_distance],
            ["query", self._query],
            ["create_index", self._create_index],
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "point", "type": "json", "placeholder": ""},
            {
                "name": "location_field",
                "type": "NoneType|field|str",
                "placeholder": "",
                "default": "None",
            },
            {
                "name": "min_distance",
                "type": "NoneType|float",
                "placeholder": "min distance (meters)",
                "default": "None",
            },
            {
                "name": "max_distance",
                "type": "NoneType|float",
                "placeholder": "max distance (meters)",
                "default": "None",
            },
            {
                "name": "query",
                "type": "NoneType|dict",
                "placeholder": "",
                "default": "None",
            },
            {
                "name": "create_index",
                "type": "bool",
                "default": "True",
                "placeholder": "create_index (default=True)",
            },
        ]


class GeoWithin(_GeoStage):
    """Filters the samples in a collection to only match samples whose
    geolocation is within a specified boundary.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz

        MANHATTAN = [
            [
                [-73.949701, 40.834487],
                [-73.896611, 40.815076],
                [-73.998083, 40.696534],
                [-74.031751, 40.715273],
                [-73.949701, 40.834487],
            ]
        ]

        dataset = foz.load_zoo_dataset("quickstart-geo")

        #
        # Create a view that only contains samples in Manhattan
        #

        stage = fo.GeoWithin(MANHATTAN)
        view = dataset.add_stage(stage)

    Args:
        boundary: a :class:`fiftyone.core.labels.GeoLocation`,
            :class:`fiftyone.core.labels.GeoLocations`, GeoJSON dict, or list
            of coordinates that define a ``Polygon`` or ``MultiPolygon`` to
            search within
        location_field (None): the location data of each sample to use. Can be
            any of the following:

            -   The name of a :class:`fiftyone.core.fields.GeoLocation` field
                whose ``point`` attribute to use as location data
            -   An ``embedded.field.name`` that directly contains the GeoJSON
                location data to use
            -   ``None``, in which case there must be a single
                :class:`fiftyone.core.fields.GeoLocation` field on the samples,
                which is used by default

        strict (True): whether a sample's location data must strictly fall
            within boundary (True) in order to match, or whether any
            intersection suffices (False)

    """

    def __init__(
        self,
        boundary,
        location_field=None,
        strict=True,
        create_index=True,
    ):
        super().__init__(
            location_field=location_field,
            create_index=create_index,
        )
        self._boundary = foug.parse_polygon(boundary)
        self._strict = strict

    @property
    def boundary(self):
        """A GeoJSON dict describing the boundary to match within."""
        return self._boundary

    @property
    def strict(self):
        """Whether matches must be strictly contained in the boundary."""
        return self._strict

    def to_mongo(self, _, **__):
        op = "$geoWithin" if self._strict else "$geoIntersects"
        return [
            {
                "$match": {
                    self._location_key: {op: {"$geometry": self._boundary}}
                }
            }
        ]

    def _kwargs(self):
        return [
            ["boundary", self._boundary],
            ["location_field", self._location_field],
            ["strict", self._strict],
            ["create_index", self._create_index],
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "boundary", "type": "json", "placeholder": ""},
            {
                "name": "location_field",
                "type": "NoneType|field|str",
                "placeholder": "",
                "default": "None",
            },
            {
                "name": "strict",
                "type": "bool",
                "default": "True",
                "placeholder": "strict (default=True)",
            },
            {
                "name": "create_index",
                "type": "bool",
                "default": "True",
                "placeholder": "create_index (default=True)",
            },
        ]


class GroupBy(ViewStage):
    """Creates a view that groups the samples in a collection by a specified
    field or expression.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("cifar10", split="test")

        #
        # Take 1000 samples at random and group them by ground truth label
        #

        stage = fo.GroupBy("ground_truth.label")
        view = dataset.take(1000).add_stage(stage)

        for group in view.iter_groups():
            print("%s: %d" % (group[0].ground_truth.label, len(group)))

        #
        # Variation of above operation that arranges the groups in decreasing
        # order of size and immediately flattens them
        #

        from itertools import groupby

        stage = fo.GroupBy(
            "ground_truth.label",
            flat=True,
            sort_expr=F().length(),
            reverse=True,
        )
        view = dataset.take(1000).add_stage(stage)

        rle = lambda v: [(k, len(list(g))) for k, g in groupby(v)]
        for label, count in rle(view.values("ground_truth.label")):
            print("%s: %d" % (label, count))

    Args:
        field_or_expr: the field or ``embedded.field.name`` to group by, or a
            list of field names defining a compound group key, or a
            :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that defines the value to group by
        order_by (None): an optional field by which to order the samples in
            each group
        reverse (False): whether to return the results in descending order.
            Applies to both ``order_by`` and ``sort_expr``
        flat (False): whether to return a grouped collection (False) or a
            flattened collection (True)
        match_expr (None): an optional
            :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that defines which groups to include in the output view. If
            provided, this expression will be evaluated on the list of samples
            in each group. Only applicable when ``flat=True``
        sort_expr (None): an optional
            :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that defines how to sort the groups in the output view. If
            provided, this expression will be evaluated on the list of samples
            in each group. Only applicable when ``flat=True``
        create_index (True): whether to create an index, if necessary, to
            optimize the grouping. Only applicable when grouping by field(s),
            not expressions
    """

    def __init__(
        self,
        field_or_expr,
        order_by=None,
        reverse=False,
        flat=False,
        match_expr=None,
        sort_expr=None,
        create_index=True,
    ):
        self._field_or_expr = field_or_expr
        self._order_by = order_by
        self._reverse = reverse
        self._flat = flat
        self._match_expr = match_expr
        self._sort_expr = sort_expr
        self._create_index = create_index
        self._sort_stage = None

    @property
    def outputs_dynamic_groups(self):
        if self._flat:
            return None

        return True

    @property
    def field_or_expr(self):
        """The field or expression to group by."""
        return self._field_or_expr

    @property
    def order_by(self):
        """The field by which to order the samples in each group."""
        return self._order_by

    @property
    def reverse(self):
        """Whether to sort the groups in descending order."""
        return self._reverse

    @property
    def flat(self):
        """Whether to generate a flattened collection."""
        return self._flat

    @property
    def match_expr(self):
        """An expression to apply to select groups in the output view."""
        return self._match_expr

    @property
    def sort_expr(self):
        """An expression defining how the sort the groups in the output view."""
        return self._sort_expr

    @property
    def create_index(self):
        """Whether to create an index, if necessary, to optimize the grouping."""
        return self._create_index

    def to_mongo(self, sample_collection):
        if self._order_by is not None and self._sort_stage is None:
            raise ValueError(
                "`validate()` must be called before using a %s stage"
                % self.__class__
            )

        if self._flat:
            return self._make_flat_pipeline(sample_collection)

        return self._make_grouped_pipeline(sample_collection)

    def _make_flat_pipeline(self, sample_collection):
        group_expr, _ = self._get_group_expr(sample_collection)
        match_expr = self._get_mongo_match_expr()
        sort_expr = self._get_mongo_sort_expr()

        pipeline = []

        if self._sort_stage is not None:
            pipeline.extend(self._sort_stage.to_mongo(sample_collection))

        pipeline.append(
            {"$group": {"_id": group_expr, "docs": {"$push": "$$ROOT"}}}
        )

        if match_expr is not None:
            pipeline.append({"$match": {"$expr": match_expr}})

        if sort_expr is not None:
            order = -1 if self._reverse else 1
            pipeline.extend(
                [
                    {"$addFields": {"_sort_field": sort_expr}},
                    {"$sort": {"_sort_field": order}},
                    {"$project": {"_sort_field": False}},
                ]
            )

        pipeline.extend(
            [{"$unwind": "$docs"}, {"$replaceRoot": {"newRoot": "$docs"}}]
        )

        return pipeline

    def _make_grouped_pipeline(self, sample_collection):
        group_expr, _ = self._get_group_expr(sample_collection)

        pipeline = []

        # sort so that first document in each group comes from a sorted list
        if self._sort_stage is not None:
            pipeline.extend(self._sort_stage.to_mongo(sample_collection))

        pipeline.extend(
            [
                {"$group": {"_id": group_expr, "doc": {"$first": "$$ROOT"}}},
                {"$replaceRoot": {"newRoot": "$doc"}},
            ]
        )

        # add a sort stage so that we return a stable ordering of groups
        # sort by _id to preserve insertion order
        pipeline.append({"$sort": {"_id": 1}})

        return pipeline

    def get_group_expr(self, sample_collection):
        if self._flat:
            return None, None

        return self._get_group_expr(sample_collection)

    def _get_group_expr(self, sample_collection):
        field_or_expr = self._get_mongo_field_or_expr()

        if etau.is_str(field_or_expr):
            (
                field_or_expr,
                is_id_field,
                _,
            ) = sample_collection._handle_id_fields(field_or_expr)

            group_expr = field_or_expr
            if not group_expr.startswith("$"):
                group_expr = "$" + group_expr
        elif isinstance(field_or_expr, (list, tuple)):
            group_expr = []
            is_id_field = []
            for _field_or_expr in field_or_expr:
                if etau.is_str(_field_or_expr):
                    (
                        _field_or_expr,
                        _is_id_field,
                        _,
                    ) = sample_collection._handle_id_fields(_field_or_expr)
                else:
                    _is_id_field = False

                _group_expr = _field_or_expr
                if not _group_expr.startswith("$"):
                    _group_expr = "$" + _group_expr

                group_expr.append(_group_expr)
                is_id_field.append(_is_id_field)
        else:
            group_expr = field_or_expr
            is_id_field = False

        return group_expr, is_id_field

    def get_media_type(self, sample_collection):
        if self._flat:
            return None

        return fom.GROUP

    def _needs_frames(self, sample_collection):
        if not sample_collection._contains_videos():
            return False

        field_or_expr = self._get_mongo_field_or_expr()

        if etau.is_str(field_or_expr):
            return sample_collection._is_frame_field(field_or_expr)

        return foe.is_frames_expr(field_or_expr)

    def _needs_group_slices(self, sample_collection):
        if sample_collection.media_type != fom.GROUP:
            return None

        field_or_expr = self._get_mongo_field_or_expr()

        if etau.is_str(field_or_expr):
            return sample_collection._get_group_slices(field_or_expr)

        return foe.get_group_slices(field_or_expr)

    def _get_mongo_field_or_expr(self):
        if isinstance(self._field_or_expr, foe.ViewField):
            return self._field_or_expr._expr

        if isinstance(self._field_or_expr, foe.ViewExpression):
            return self._field_or_expr.to_mongo()

        return self._field_or_expr

    def _get_mongo_match_expr(self):
        if isinstance(self._match_expr, foe.ViewExpression):
            return self._match_expr.to_mongo(prefix="$docs")

        return self._match_expr

    def _get_mongo_sort_expr(self):
        if isinstance(self._sort_expr, foe.ViewExpression):
            return self._sort_expr.to_mongo(prefix="$docs")

        return self._sort_expr

    def _kwargs(self):
        return [
            ["field_or_expr", self._get_mongo_field_or_expr()],
            ["order_by", self._order_by],
            ["reverse", self._reverse],
            ["flat", self._flat],
            ["match_expr", self._get_mongo_match_expr()],
            ["sort_expr", self._get_mongo_sort_expr()],
            ["create_index", self._create_index],
        ]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "field_or_expr",
                "type": "field|str|json",
                "placeholder": "field or expression",
            },
            {
                "name": "order_by",
                "type": "NoneType|field|str",
                "placeholder": "order by",
                "default": "None",
            },
            {
                "name": "reverse",
                "type": "bool",
                "default": "False",
                "placeholder": "reverse (default=False)",
            },
            {
                "name": "flat",
                "type": "bool",
                "default": "False",
                "placeholder": "flat (default=False)",
            },
            {
                "name": "match_expr",
                "type": "NoneType|json",
                "placeholder": "match expression",
                "default": "None",
            },
            {
                "name": "sort_expr",
                "type": "NoneType|json",
                "placeholder": "sort expression",
                "default": "None",
            },
            {
                "name": "create_index",
                "type": "bool",
                "default": "True",
                "placeholder": "create_index (default=True)",
            },
        ]

    def validate(self, sample_collection):
        if sample_collection._is_dynamic_groups:
            raise ValueError(
                "Cannot group a collection that is already dynamically grouped"
            )

        field_or_expr = self._get_mongo_field_or_expr()
        order_by = self._order_by

        if order_by is not None:
            order = -1 if self._reverse else 1
            stage = SortBy(
                [(field_or_expr, 1), (order_by, order)],
                create_index=self._create_index,
            )
            stage.validate(sample_collection)

            self._sort_stage = stage
        elif not self._create_index:
            return
        elif etau.is_str(field_or_expr):
            index_spec = field_or_expr.lstrip("$")
            sample_collection.create_index(index_spec)
        elif isinstance(field_or_expr, (list, tuple)) and all(
            etau.is_str(f) for f in field_or_expr
        ):
            index_spec = [(f.lstrip("$"), 1) for f in field_or_expr]
            sample_collection.create_index(index_spec)


class Flatten(ViewStage):
    """Returns a flattened view that contains all samples in a dynamic grouped
    collection.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("cifar10", split="test")

        # Group samples by ground truth label
        grouped_view = dataset.take(1000).group_by("ground_truth.label")
        print(len(grouped_view))  # 10

        # Return a flat view that contains 10 samples from each class
        stage = fo.Flatten(fo.Limit(10))
        flat_view = grouped_view.add_stage(stage)
        print(len(flat_view))  # 100

    Args:
        stages (None): a :class:`ViewStage` or list of :class:`ViewStage`
            instances to apply to each group's samples while flattening
    """

    def __init__(self, stages=None):
        stages, stages_kwargs = _parse_stages(stages)
        self._stages = stages
        self._stages_kwargs = stages_kwargs
        self._pipeline = None

    @property
    def outputs_dynamic_groups(self):
        return False

    @property
    def stages(self):
        """Stage(s) to apply to each group's samples while flattening."""
        return self._stages

    def to_mongo(self, sample_collection):
        return sample_collection._dynamic_groups_pipeline(
            group_pipeline=self._pipeline
        )

    def get_media_type(self, sample_collection):
        return sample_collection._dataset.media_type

    def validate(self, sample_collection):
        if not sample_collection._is_dynamic_groups:
            raise ValueError(
                "%s is not a dynamic grouped collection" % sample_collection
            )

        pipeline = None

        if self._stages:
            _, _, view, _ = sample_collection._parse_dynamic_groups()

            if etau.is_container(self._stages):
                stages = list(self._stages)
            else:
                stages = [self._stages]

            pipeline = []
            for stage in stages:
                pipeline.extend(stage.to_mongo(view))
                view = view.add_stage(stage)

        self._pipeline = pipeline

    def _kwargs(self):
        return [["stages", self._stages_kwargs]]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "stages",
                "type": "NoneType|json",
                "placeholder": "stages (default=None)",
                "default": "None",
            }
        ]


def _parse_stages(stages):
    if stages is None:
        return None, None

    single_stage = isinstance(stages, (ViewStage, dict))
    if single_stage:
        stages = [stages]
    else:
        stages = list(stages)

    _stages = []
    _stages_kwargs = []
    for stage in stages:
        if isinstance(stage, ViewStage):
            _stage = stage
            _stage_kwargs = stage._serialize(include_uuid=False)
        else:
            _stage = ViewStage._from_dict(stage)
            _stage_kwargs = stage

        _stages.append(_stage)
        _stages_kwargs.append(_stage_kwargs)

    if single_stage:
        _stages = _stages[0]
        _stages_kwargs = _stages_kwargs[0]

    return _stages, _stages_kwargs


class Limit(ViewStage):
    """Creates a view with at most the given number of samples.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    ground_truth=fo.Classification(label="cat"),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    ground_truth=fo.Classification(label="dog"),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    ground_truth=None,
                ),
            ]
        )

        #
        # Only include the first 2 samples in the view
        #

        stage = fo.Limit(2)
        view = dataset.add_stage(stage)

    Args:
        limit: the maximum number of samples to return. If a non-positive
            number is provided, an empty view is returned
    """

    def __init__(self, limit):
        self._limit = limit

    @property
    def limit(self):
        """The maximum number of samples to return."""
        return self._limit

    def to_mongo(self, _):
        if self._limit <= 0:
            return [{"$match": {"_id": None}}]

        return [{"$limit": self._limit}]

    def _kwargs(self):
        return [["limit", self._limit]]

    @classmethod
    def _params(cls):
        return [{"name": "limit", "type": "int", "placeholder": "int"}]


class LimitLabels(ViewStage):
    """Limits the number of :class:`fiftyone.core.labels.Label` instances in
    the specified labels list field of each sample in a collection.

    The specified ``field`` must be one of the following types:

    -   :class:`fiftyone.core.labels.Classifications`
    -   :class:`fiftyone.core.labels.Detections`
    -   :class:`fiftyone.core.labels.Keypoints`
    -   :class:`fiftyone.core.labels.Polylines`

    Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="cat",
                                bounding_box=[0.1, 0.1, 0.5, 0.5],
                                confidence=0.9,
                            ),
                            fo.Detection(
                                label="dog",
                                bounding_box=[0.2, 0.2, 0.3, 0.3],
                                confidence=0.8,
                            ),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="cat",
                                bounding_box=[0.5, 0.5, 0.4, 0.4],
                                confidence=0.95,
                            ),
                            fo.Detection(label="rabbit"),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image4.png",
                    predictions=None,
                ),
            ]
        )

        #
        # Only include the first detection in the `predictions` field of each
        # sample
        #

        stage = fo.LimitLabels("predictions", 1)
        view = dataset.add_stage(stage)

    Args:
        field: the labels list field to filter
        limit: the maximum number of labels to include in each labels list.
            If a non-positive number is provided, all lists will be empty
    """

    def __init__(self, field, limit):
        self._field = field
        self._limit = limit
        self._labels_list_field = None
        self._is_frame_field = None

    @property
    def field(self):
        """The labels field to limit."""
        return self._field

    @property
    def limit(self):
        """The maximum number of labels to allow in each labels list."""
        return self._limit

    def get_edited_fields(self, sample_collection, frames=False):
        field_name, is_frame_field = sample_collection._handle_frame_field(
            self._field
        )

        if frames == is_frame_field:
            return [field_name]

        return None

    def get_filtered_fields(self, sample_collection, frames=False):
        if frames == self._is_frame_field:
            list_path, _ = sample_collection._handle_frame_field(
                self._labels_list_field
            )
            return [list_path]

        return None

    def to_mongo(self, sample_collection):
        if self._labels_list_field is None:
            raise ValueError(
                "`validate()` must be called before using a %s stage"
                % self.__class__
            )

        limit = max(self._limit, 0)
        root, leaf = self._labels_list_field.rsplit(".", 1)

        expr = (F() != None).if_else(
            F().set_field(leaf, F(leaf)[:limit]),
            None,
        )
        pipeline, _ = sample_collection._make_set_field_pipeline(root, expr)

        return pipeline

    def _needs_frames(self, sample_collection):
        return self._is_frame_field

    def _needs_group_slices(self, sample_collection):
        if sample_collection.media_type != fom.GROUP:
            return None

        return sample_collection._get_group_slices(self._field)

    def _kwargs(self):
        return [
            ["field", self._field],
            ["limit", self._limit],
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "field", "type": "field"},
            {"name": "limit", "type": "int", "placeholder": "int"},
        ]

    def validate(self, sample_collection):
        list_field, is_list_field, is_frame_field = _parse_labels_field(
            sample_collection, self._field
        )

        if not is_list_field:
            raise ValueError(
                "Field '%s' does not contain a list of labels" % self._field
            )

        self._labels_list_field = list_field
        self._is_frame_field = is_frame_field


class MapLabels(ViewStage):
    """Maps the ``label`` values of a :class:`fiftyone.core.labels.Label` field
    to new values for each sample in a collection.

    Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    weather=fo.Classification(label="sunny"),
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="cat",
                                bounding_box=[0.1, 0.1, 0.5, 0.5],
                                confidence=0.9,
                            ),
                            fo.Detection(
                                label="dog",
                                bounding_box=[0.2, 0.2, 0.3, 0.3],
                                confidence=0.8,
                            ),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    weather=fo.Classification(label="cloudy"),
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="cat",
                                bounding_box=[0.5, 0.5, 0.4, 0.4],
                                confidence=0.95,
                            ),
                            fo.Detection(label="rabbit"),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    weather=fo.Classification(label="partly cloudy"),
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="squirrel",
                                bounding_box=[0.25, 0.25, 0.5, 0.5],
                                confidence=0.5,
                            ),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image4.png",
                    predictions=None,
                ),
            ]
        )

        #
        # Map the "partly cloudy" weather label to "cloudy"
        #

        stage = fo.MapLabels("weather", {"partly cloudy": "cloudy"})
        view = dataset.add_stage(stage)

        #
        # Map "rabbit" and "squirrel" predictions to "other"
        #

        stage = fo.MapLabels(
            "predictions", {"rabbit": "other", "squirrel": "other"}
        )
        view = dataset.add_stage(stage)

    Args:
        field: the labels field to map
        map: a dict mapping label values to new label values
    """

    def __init__(self, field, map):
        self._field = field
        self._map = map
        self._labels_field = None

    @property
    def field(self):
        """The labels field to map."""
        return self._field

    @property
    def map(self):
        """The labels map dict."""
        return self._map

    def get_edited_fields(self, sample_collection, frames=False):
        field_name, is_frame_field = sample_collection._handle_frame_field(
            self._field
        )

        if frames == is_frame_field:
            return [field_name]

        return None

    def to_mongo(self, sample_collection):
        labels_field = _parse_labels_field(sample_collection, self._field)[0]
        label_path = labels_field + ".label"
        expr = F().map_values(self._map)
        pipeline, _ = sample_collection._make_set_field_pipeline(
            label_path, expr
        )
        return pipeline

    def _needs_frames(self, sample_collection):
        if not sample_collection._contains_videos():
            return False

        return sample_collection._is_frame_field(self._field)

    def _needs_group_slices(self, sample_collection):
        if sample_collection.media_type != fom.GROUP:
            return None

        return sample_collection._get_group_slices(self._field)

    def _kwargs(self):
        return [
            ["field", self._field],
            ["map", self._map],
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "field", "type": "field"},
            {"name": "map", "type": "dict", "placeholder": "map"},
        ]

    def validate(self, sample_collection):
        _parse_labels_field(sample_collection, self._field)


class SetField(ViewStage):
    """Sets a field or embedded field on each sample in a collection by
    evaluating the given expression.

    This method can process embedded list fields. To do so, simply append
    ``[]`` to any list component(s) of the field path.

    .. note::

        There are two cases where FiftyOne will automatically unwind array
        fields without requiring you to explicitly specify this via the ``[]``
        syntax:

        **Top-level lists:** when you specify a ``field`` path that refers to a
        top-level list field of a dataset; i.e., ``list_field`` is
        automatically coerced to ``list_field[]``, if necessary.

        **List fields:** When you specify a ``field`` path that refers to the
        list field of a |Label| class, such as the
        :attr:`Detections.detections <fiftyone.core.labels.Detections.detections>`
        attribute; i.e., ``ground_truth.detections.label`` is automatically
        coerced to ``ground_truth.detections[].label``, if necessary.

        See the examples below for demonstrations of this behavior.

    The provided ``expr`` is interpreted relative to the document on which the
    embedded field is being set. For example, if you are setting a nested field
    ``field="embedded.document.field"``, then the expression ``expr`` you
    provide will be applied to the ``embedded.document`` document. Note that
    you can override this behavior by defining an expression that is bound to
    the root document by prepending ``"$"`` to any field name(s) in the
    expression.

    See the examples below for more information.

    .. note::

        Note that you cannot set a non-existing top-level field using this
        stage, since doing so would violate the dataset's schema. You can,
        however, first declare a new field via
        :meth:`fiftyone.core.dataset.Dataset.add_sample_field` and then
        populate it in a view via this stage.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("quickstart")

        #
        # Replace all values of uniqueness that are less than 0.5 with `None`
        #

        stage = fo.SetField(
            "uniqueness",
            (F("uniqueness") >= 0.5).if_else(F("uniqueness"), None)
        )
        view = dataset.add_stage(stage)
        print(view.bounds("uniqueness"))

        #
        # Lower bound all object confidences in the `predictions` field by 0.5
        #

        stage = fo.SetField(
            "predictions.detections.confidence", F("confidence").max(0.5)
        )
        view = dataset.add_stage(stage)
        print(view.bounds("predictions.detections.confidence"))

        #
        # Add a `num_predictions` property to the `predictions` field that
        # contains the number of objects in the field
        #

        stage = fo.SetField(
            "predictions.num_predictions",
            F("$predictions.detections").length(),
        )
        view = dataset.add_stage(stage)
        print(view.bounds("predictions.num_predictions"))

        #
        # Set an `is_animal` field on each object in the `predictions` field
        # that indicates whether the object is an animal
        #

        ANIMALS = [
            "bear", "bird", "cat", "cow", "dog", "elephant", "giraffe",
            "horse", "sheep", "zebra"
        ]

        stage = fo.SetField(
            "predictions.detections.is_animal", F("label").is_in(ANIMALS)
        )
        view = dataset.add_stage(stage)
        print(view.count_values("predictions.detections.is_animal"))

    Args:
        field: the field or ``embedded.field.name`` to set
        expr: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that defines the field value to set
    """

    def __init__(self, field, expr, _allow_missing=False):
        if isinstance(expr, MongoEngineBaseDocument):
            expr = expr.to_dict()
            expr.pop("_id", None)

        self._field = field
        self._expr = expr
        self._allow_missing = _allow_missing
        self._pipeline = None
        self._expr_dict = None

    @property
    def field(self):
        """The field to set."""
        return self._field

    @property
    def expr(self):
        """The expression to apply."""
        return self._expr

    def get_edited_fields(self, sample_collection, frames=False):
        field_name, is_frame_field = sample_collection._handle_frame_field(
            self._field
        )

        if frames == is_frame_field:
            return [field_name]

        return None

    def to_mongo(self, sample_collection):
        if self._pipeline is None:
            raise ValueError(
                "`validate()` must be called before using a %s stage"
                % self.__class__
            )

        return self._pipeline

    def _needs_frames(self, sample_collection):
        if not sample_collection._contains_videos():
            return False

        is_frame_field = sample_collection._is_frame_field(self._field)
        is_frame_expr = foe.is_frames_expr(self._get_mongo_expr())
        return is_frame_field or is_frame_expr

    def _needs_group_slices(self, sample_collection):
        if sample_collection.media_type != fom.GROUP:
            return None

        group_slices = set()
        group_slices.update(sample_collection._get_group_slices(self._field))
        group_slices.update(foe.get_group_slices(self._get_mongo_expr()))

        return list(group_slices)

    def _kwargs(self):
        return [
            ["field", self._field],
            ["expr", self._get_mongo_expr()],
            ["_allow_missing", self._allow_missing],
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "field", "type": "field|str"},
            {"name": "expr", "type": "json", "placeholder": ""},
            {"name": "_allow_missing", "type": "bool", "default": "False"},
        ]

    def _get_mongo_expr(self):
        if self._expr_dict is not None:
            return self._expr_dict

        #
        # This won't be correct if there are list fields involved
        #
        # Note, however, that this code path won't be taken when this stage has
        # been added to a view; this is purely for `ViewStage.__repr__`
        #
        if "." in self._field:
            prefix = "$" + self._field.rsplit(".", 1)[0]
        else:
            prefix = None

        return foe.to_mongo(self._expr, prefix=prefix)

    def validate(self, sample_collection):
        if not self._allow_missing:
            sample_collection.validate_fields_exist(self._field)

        pipeline, expr_dict = sample_collection._make_set_field_pipeline(
            self._field,
            self._expr,
            embedded_root=True,
            allow_missing=self._allow_missing,
        )
        self._pipeline = pipeline
        self._expr_dict = expr_dict


class Match(ViewStage):
    """Filters the samples in the collection by the given filter.

    Examples::

        import fiftyone as fo
        from fiftyone import ViewField as F

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    weather=fo.Classification(label="sunny"),
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="cat",
                                bounding_box=[0.1, 0.1, 0.5, 0.5],
                                confidence=0.9,
                            ),
                            fo.Detection(
                                label="dog",
                                bounding_box=[0.2, 0.2, 0.3, 0.3],
                                confidence=0.8,
                            ),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image2.jpg",
                    weather=fo.Classification(label="cloudy"),
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="cat",
                                bounding_box=[0.5, 0.5, 0.4, 0.4],
                                confidence=0.95,
                            ),
                            fo.Detection(label="rabbit"),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    weather=fo.Classification(label="partly cloudy"),
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="squirrel",
                                bounding_box=[0.25, 0.25, 0.5, 0.5],
                                confidence=0.5,
                            ),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image4.jpg",
                    predictions=None,
                ),
            ]
        )

        #
        # Only include samples whose `filepath` ends with ".jpg"
        #

        stage = fo.Match(F("filepath").ends_with(".jpg"))
        view = dataset.add_stage(stage)

        #
        # Only include samples whose `weather` field is "sunny"
        #

        stage = fo.Match(F("weather").label == "sunny")
        view = dataset.add_stage(stage)

        #
        # Only include samples with at least 2 objects in their `predictions`
        # field
        #

        stage = fo.Match(F("predictions").detections.length() >= 2)
        view = dataset.add_stage(stage)

        #
        # Only include samples whose `predictions` field contains at least one
        # object with area smaller than 0.2
        #

        # Bboxes are in [top-left-x, top-left-y, width, height] format
        bbox = F("bounding_box")
        bbox_area = bbox[2] * bbox[3]

        small_boxes = F("predictions.detections").filter(bbox_area < 0.2)
        stage = fo.Match(small_boxes.length() > 0)
        view = dataset.add_stage(stage)

    Args:
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
    """

    def __init__(self, filter):
        self._filter = filter
        self._validate_params()

    @property
    def filter(self):
        """The filter expression."""
        return self._filter

    def to_mongo(self, _):
        return [{"$match": self._get_mongo_expr()}]

    def _needs_frames(self, sample_collection):
        if not sample_collection._contains_videos():
            return False

        return foe.is_frames_expr(self._get_mongo_expr())

    def _needs_group_slices(self, sample_collection):
        if sample_collection.media_type != fom.GROUP:
            return None

        return foe.get_group_slices(self._get_mongo_expr())

    def _get_mongo_expr(self):
        if not isinstance(self._filter, foe.ViewExpression):
            return self._filter

        return {"$expr": self._filter.to_mongo()}

    def _kwargs(self):
        return [["filter", self._get_mongo_expr()]]

    def _validate_params(self):
        if not isinstance(self._filter, (foe.ViewExpression, dict, bool)):
            raise ValueError(
                "Filter must be a ViewExpression or a MongoDB aggregation "
                "expression defining a filter; found '%s'" % self._filter
            )

    @classmethod
    def _params(cls):
        return [{"name": "filter", "type": "json", "placeholder": ""}]


class SelectGroupSlices(ViewStage):
    """Selects the specified group slice(s) from a grouped collection.

    When ``flat==True``, the returned view is a flattened non-grouped view
    containing the samples from the slice(s) of interest.

    When ``flat=False``, the returned view is a grouped collection containing
    only the slice(s) of interest.

    .. note::

        When ``flat=True``, this stage performs a ``$lookup`` that pulls the
        requested slice(s) for each sample in the input collection from the
        source dataset. As a result, the stage emits *unfiltered samples*.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_group_field("group", default="ego")

        group1 = fo.Group()
        group2 = fo.Group()

        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/left-image1.jpg",
                    group=group1.element("left"),
                ),
                fo.Sample(
                    filepath="/path/to/video1.mp4",
                    group=group1.element("ego"),
                ),
                fo.Sample(
                    filepath="/path/to/right-image1.jpg",
                    group=group1.element("right"),
                ),
                fo.Sample(
                    filepath="/path/to/left-image2.jpg",
                    group=group2.element("left"),
                ),
                fo.Sample(
                    filepath="/path/to/video2.mp4",
                    group=group2.element("ego"),
                ),
                fo.Sample(
                    filepath="/path/to/right-image2.jpg",
                    group=group2.element("right"),
                ),
            ]
        )

        #
        # Retrieve the samples from the "ego" group slice
        #

        stage = fo.SelectGroupSlices("ego")
        view = dataset.add_stage(stage)

        #
        # Retrieve the samples from the "left" or "right" group slices
        #

        stage = fo.SelectGroupSlices(["left", "right"])
        view = dataset.add_stage(stage)

        #
        # Select only the "left" and "right" group slices
        #

        stage = fo.SelectGroupSlices(["left", "right"], flat=False)
        view = dataset.add_stage(stage)

        #
        # Retrieve all image samples
        #

        stage = fo.SelectGroupSlices(media_type="image")
        view = dataset.add_stage(stage)

    Args:
        slices (None): a group slice or iterable of group slices to select.
            If neither argument is provided, a flattened list of all samples is
            returned
        media_type (None): a media type or iterable of media types whose
            slice(s) to select
        flat (True): whether to return a flattened collection (True) or a
            grouped collection (False)
    """

    def __init__(
        self,
        slices=None,
        media_type=None,
        flat=True,
        _allow_mixed=False,
        _force_mixed=False,
    ):
        self._slices = slices
        self._media_type = media_type
        self._flat = flat
        self._allow_mixed = _allow_mixed
        self._force_mixed = _force_mixed

    @property
    def slices(self):
        """The group slice(s) to select."""
        return self._slices

    @property
    def media_type(self):
        """The media type(s) whose slices to select."""
        return self._media_type

    @property
    def flat(self):
        """Whether to generate a flattened collection."""
        return self._flat

    @property
    def flattens_groups(self):
        return self._flat

    def to_mongo(self, sample_collection):
        if not self._flat:
            return []

        if isinstance(sample_collection, fod.Dataset) or (
            isinstance(sample_collection, fov.DatasetView)
            and len(sample_collection._stages) == 0
        ):
            return self._make_root_pipeline(sample_collection)

        return self._make_pipeline(sample_collection)

    def _make_root_pipeline(self, sample_collection):
        group_path = sample_collection.group_field + ".name"
        slices = self._get_slices(sample_collection)

        if etau.is_container(slices):
            return [{"$match": {"$expr": {"$in": ["$" + group_path, slices]}}}]

        if slices is not None:
            return [{"$match": {"$expr": {"$eq": ["$" + group_path, slices]}}}]

        return []

    def _make_pipeline(self, sample_collection):
        group_field = sample_collection.group_field
        id_field = group_field + "._id"
        name_field = group_field + ".name"

        slices = self._get_slices(sample_collection)

        # No $lookup needed because active slice is the only one requested
        if (
            etau.is_str(slices) and slices == sample_collection.group_slice
        ) or (slices is None and len(sample_collection.group_slices) == 1):
            return []

        expr = F(id_field) == "$$group_id"
        if isinstance(slices, list):
            expr &= F(name_field).is_in(slices)
        elif slices is not None:
            expr &= F(name_field) == slices

        pipeline = [
            {"$project": {group_field: True}},
            {
                "$lookup": {
                    "from": sample_collection._dataset._sample_collection_name,
                    "let": {"group_id": "$" + id_field},
                    "pipeline": [{"$match": {"$expr": expr.to_mongo()}}],
                    "as": "groups",
                }
            },
            {"$unwind": "$groups"},
            {"$replaceRoot": {"newRoot": "$groups"}},
        ]

        # Must re-apply field selection/exclusion after the $lookup
        if isinstance(sample_collection, fov.DatasetView):
            selected_fields, excluded_fields = _get_selected_excluded_fields(
                sample_collection
            )

            if selected_fields:
                stage = SelectFields(selected_fields, _allow_missing=True)
                pipeline.extend(stage.to_mongo(sample_collection))

            if excluded_fields:
                stage = ExcludeFields(excluded_fields, _allow_missing=True)
                pipeline.extend(stage.to_mongo(sample_collection))

        return pipeline

    def get_media_type(self, sample_collection):
        if not self._flat:
            return sample_collection.media_type

        if self._force_mixed:
            return fom.MIXED

        group_media_types = sample_collection.group_media_types

        slices = self._get_slices(sample_collection)

        # All group slices
        if slices is None:
            media_types = set(group_media_types.values())

            if len(media_types) > 1:
                if self._allow_mixed:
                    return fom.MIXED

                raise ValueError(
                    "Cannot select all groups when dataset contains multiple "
                    "media types %s" % media_types
                )

            return next(iter(group_media_types.values()), None)

        # Multiple group slices
        if isinstance(slices, list):
            media_types = set()

            for _slice in slices:
                if _slice not in group_media_types:
                    raise ValueError(
                        "%s has no group slice '%s'"
                        % (type(sample_collection), _slice)
                    )

                media_types.add(group_media_types[_slice])

            if len(media_types) > 1:
                if self._allow_mixed:
                    return fom.MIXED

                raise ValueError(
                    "Cannot select slices %s with different media types %s"
                    % (slices, media_types)
                )

            return next(iter(media_types), None)

        # One group slice
        if slices not in group_media_types:
            raise ValueError(
                "%s has no group slice '%s'"
                % (type(sample_collection), slices)
            )

        return group_media_types[slices]

    def validate(self, sample_collection):
        if sample_collection.media_type != fom.GROUP:
            raise ValueError("%s has no groups" % type(sample_collection))

    def _get_slices(self, sample_collection):
        if self._media_type is not None:
            if etau.is_str(self._media_type):
                media_types = {self._media_type}
            else:
                media_types = set(self._media_type)

            group_media_types = sample_collection.group_media_types
            slices = [
                slice_name
                for slice_name, media_type in group_media_types.items()
                if media_type in media_types
            ]
        else:
            slices = self._slices

        if slices is None:
            group_slices = sample_collection.group_slices
            if group_slices != sample_collection._dataset.group_slices:
                slices = group_slices

        if not etau.is_container(slices):
            return slices

        slices = list(slices)

        if len(slices) == 1:
            return slices[0]

        return slices

    def get_group_media_types(self, sample_collection):
        group_media_types = sample_collection.group_media_types
        slices = self._get_slices(sample_collection)

        if etau.is_container(slices):
            slices = set(slices)
        elif slices is not None:
            slices = {slices}
        else:
            slices = set(group_media_types.keys())

        return {
            slice_name: media_type
            for slice_name, media_type in group_media_types.items()
            if slice_name in slices or self._force_mixed
        }

    def _kwargs(self):
        return [
            ["slices", self._slices],
            ["media_type", self._media_type],
            ["flat", self._flat],
            ["_allow_mixed", self._allow_mixed],
            ["_force_mixed", self._force_mixed],
        ]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "slices",
                "type": "NoneType|list<str>|str",
                "placeholder": "slices (default=None)",
                "default": "None",
            },
            {
                "name": "media_type",
                "type": "NoneType|list<str>|str",
                "placeholder": "media_type (default=None)",
                "default": "None",
            },
            {
                "name": "flat",
                "type": "bool",
                "default": "True",
                "placeholder": "flat (default=True)",
            },
            {
                "name": "_allow_mixed",
                "type": "NoneType|bool",
                "default": "None",
            },
            {
                "name": "_force_mixed",
                "type": "NoneType|bool",
                "default": "None",
            },
        ]


class ExcludeGroupSlices(ViewStage):
    """Excludes the specified group slice(s) from a grouped collection.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_group_field("group", default="ego")

        group1 = fo.Group()
        group2 = fo.Group()

        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/left-image1.jpg",
                    group=group1.element("left"),
                ),
                fo.Sample(
                    filepath="/path/to/video1.mp4",
                    group=group1.element("ego"),
                ),
                fo.Sample(
                    filepath="/path/to/right-image1.jpg",
                    group=group1.element("right"),
                ),
                fo.Sample(
                    filepath="/path/to/left-image2.jpg",
                    group=group2.element("left"),
                ),
                fo.Sample(
                    filepath="/path/to/video2.mp4",
                    group=group2.element("ego"),
                ),
                fo.Sample(
                    filepath="/path/to/right-image2.jpg",
                    group=group2.element("right"),
                ),
            ]
        )

        #
        # Exclude the "ego" group slice
        #

        stage = fo.ExcludeGroupSlices("ego")
        view = dataset.add_stage(stage)

        #
        # Exclude the "left" and "right" group slices
        #

        stage = fo.ExcludeGroupSlices(["left", "right"])
        view = dataset.add_stage(stage)

        #
        # Exclude all image slices
        #

        stage = fo.ExcludeGroupSlices(media_type="image")
        view = dataset.add_stage(stage)

    Args:
        slices (None): a group slice or iterable of group slices to exclude.
        media_type (None): a media type or iterable of media types whose
            slice(s) to exclude
    """

    def __init__(self, slices=None, media_type=None):
        self._slices = slices
        self._media_type = media_type

    @property
    def slices(self):
        """The group slice(s) to exclude."""
        return self._slices

    @property
    def media_type(self):
        """The media type(s) whose slices to exclude."""
        return self._media_type

    def to_mongo(self, sample_collection):
        return []

    def validate(self, sample_collection):
        if sample_collection.media_type != fom.GROUP:
            raise ValueError("%s has no groups" % type(sample_collection))

    def _get_slices(self, sample_collection):
        if self._media_type is not None:
            if etau.is_str(self._media_type):
                media_types = {self._media_type}
            else:
                media_types = set(self._media_type)

            group_media_types = sample_collection.group_media_types
            return [
                slice_name
                for slice_name, media_type in group_media_types.items()
                if media_type not in media_types
            ]

        if self._slices is not None:
            if etau.is_str(self._slices):
                slices = {self._slices}
            else:
                slices = set(self._slices)

            return [
                slice_name
                for slice_name in sample_collection.group_slices
                if slice_name not in slices
            ]

        return sample_collection.group_slices

    def get_group_media_types(self, sample_collection):
        group_media_types = sample_collection.group_media_types
        slices = set(self._get_slices(sample_collection))

        return {
            slice_name: media_type
            for slice_name, media_type in group_media_types.items()
            if slice_name in slices
        }

    def _kwargs(self):
        return [
            ["slices", self._slices],
            ["media_type", self._media_type],
        ]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "slices",
                "type": "NoneType|list<str>|str",
                "placeholder": "slices (default=None)",
                "default": "None",
            },
            {
                "name": "media_type",
                "type": "NoneType|list<str>|str",
                "placeholder": "media_type (default=None)",
                "default": "None",
            },
        ]


class MatchFrames(ViewStage):
    """Filters the frames in a video collection by the given filter.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("quickstart-video")

        #
        # Match frames with at least 10 detections
        #

        num_objects = F("detections.detections").length()
        stage = fo.MatchFrames(num_objects > 10)
        view = dataset.add_stage(stage)

        print(dataset.count())
        print(view.count())

        print(dataset.count("frames"))
        print(view.count("frames"))

    Args:
        filter: a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing the filter to apply
        omit_empty (True): whether to omit samples with no frame labels after
            filtering
    """

    def __init__(self, filter, omit_empty=True):
        self._filter = filter
        self._omit_empty = omit_empty
        self._validate_params()

    @property
    def filter(self):
        """The filter expression."""
        return self._filter

    @property
    def omit_empty(self):
        """Whether to omit samples that have no frames after filtering."""
        return self._omit_empty

    def _get_mongo_expr(self):
        if not isinstance(self._filter, foe.ViewExpression):
            return self._filter

        return self._filter.to_mongo(prefix="$$this")

    def to_mongo(self, _):
        pipeline = [
            {
                "$addFields": {
                    "frames": {
                        "$filter": {
                            "input": "$frames",
                            "as": "this",
                            "cond": self._get_mongo_expr(),
                        }
                    }
                }
            }
        ]

        if self._omit_empty:
            non_empty_expr = F("frames").length() > 0
            pipeline.append({"$match": {"$expr": non_empty_expr.to_mongo()}})

        return pipeline

    def _kwargs(self):
        return [
            ["filter", self._get_mongo_expr()],
            ["omit_empty", self._omit_empty],
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "filter", "type": "json", "placeholder": ""},
            {
                "name": "omit_empty",
                "type": "bool",
                "default": "True",
                "placeholder": "omit empty (default=True)",
            },
        ]

    def _validate_params(self):
        if not isinstance(self._filter, (foe.ViewExpression, dict, bool)):
            raise ValueError(
                "Filter must be a ViewExpression or a MongoDB aggregation "
                "expression defining a filter; found '%s'" % self._filter
            )

    def _needs_frames(self, _):
        return True

    def validate(self, sample_collection):
        fova.validate_video_collection(sample_collection)


class MatchLabels(ViewStage):
    """Selects the samples from a collection that contain (or do not contain)
    at least one label that matches the specified criteria.

    Note that, unlike :class:`SelectLabels` and :class:`FilterLabels`, this
    stage will not filter the labels themselves; it only selects the
    corresponding samples.

    You can perform a selection via one or more of the following methods:

    -   Provide the ``labels`` argument, which should contain a list of dicts
        in the format returned by
        :attr:`fiftyone.core.session.Session.selected_labels`, to match
        specific labels

    -   Provide the ``ids`` argument to match labels with specific IDs

    -   Provide the ``tags`` argument to match labels with specific tags

    -   Provide the ``filter`` argument to match labels based on a boolean
        :class:`fiftyone.core.expressions.ViewExpression` that is applied to
        each individual :class:`fiftyone.core.labels.Label` element

    -   Pass ``bool=False`` to negate the operation and instead match samples
        that *do not* contain at least one label matching the specified
        criteria

    If multiple criteria are specified, labels must match all of them in order
    to trigger a sample match.

    By default, the selection is applied to all
    :class:`fiftyone.core.labels.Label` fields, but you can provide the
    ``fields`` argument to explicitly define the field(s) in which to search.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("quickstart")

        #
        # Only show samples whose labels are currently selected in the App
        #

        session = fo.launch_app(dataset)

        # Select some labels in the App...

        stage = fo.MatchLabels(labels=session.selected_labels)
        view = dataset.add_stage(stage)

        #
        # Only include samples that contain labels with the specified IDs
        #

        # Grab some label IDs
        ids = [
            dataset.first().ground_truth.detections[0].id,
            dataset.last().predictions.detections[0].id,
        ]

        stage = fo.MatchLabels(ids=ids)
        view = dataset.add_stage(stage)

        print(len(view))
        print(view.count("ground_truth.detections"))
        print(view.count("predictions.detections"))

        #
        # Only include samples that contain labels with the specified tags
        #

        # Grab some label IDs
        ids = [
            dataset.first().ground_truth.detections[0].id,
            dataset.last().predictions.detections[0].id,
        ]

        # Give the labels a "test" tag
        dataset = dataset.clone()  # create copy since we're modifying data
        dataset.select_labels(ids=ids).tag_labels("test")

        print(dataset.count_values("ground_truth.detections.tags"))
        print(dataset.count_values("predictions.detections.tags"))

        # Retrieve the labels via their tag
        stage = fo.MatchLabels(tags="test")
        view = dataset.add_stage(stage)

        print(len(view))
        print(view.count("ground_truth.detections"))
        print(view.count("predictions.detections"))

        #
        # Only include samples that contain labels matching a filter
        #

        filter = F("confidence") > 0.99
        stage = fo.MatchLabels(filter=filter, fields="predictions")
        view = dataset.add_stage(stage)

        print(len(view))
        print(view.count("ground_truth.detections"))
        print(view.count("predictions.detections"))

    Args:
        labels (None): a list of dicts specifying the labels to select in the
            format returned by
            :attr:`fiftyone.core.session.Session.selected_labels`
        ids (None): an ID or iterable of IDs of the labels to select
        tags (None): a tag or iterable of tags of labels to select
        filter (None): a :class:`fiftyone.core.expressions.ViewExpression` or
            `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
            that returns a boolean describing whether to select a given label.
            In the case of list fields like
            :class:`fiftyone.core.labels.Detections`, the filter is applied to
            the list elements, not the root field
        fields (None): a field or iterable of fields from which to select
        bool (None): whether to match samples that have (None or True) or do
            not have (False) at least one label that matches the specified
            criteria
    """

    _FILTER_PREFIX = "$$FIELD"

    def __init__(
        self,
        labels=None,
        ids=None,
        tags=None,
        filter=None,
        fields=None,
        bool=None,
    ):
        if labels is not None:
            sample_ids, labels_map = _parse_labels(labels)
        else:
            sample_ids, labels_map = None, None

        if etau.is_str(ids):
            ids = [ids]
        elif ids is not None:
            ids = list(ids)

        if etau.is_str(tags):
            tags = [tags]
        elif tags is not None:
            tags = list(tags)

        if etau.is_str(fields):
            fields = [fields]
        elif fields is not None:
            fields = list(fields)

        if bool is None:
            bool = True

        self._labels = labels
        self._ids = ids
        self._tags = tags
        self._filter = filter
        self._fields = fields
        self._bool = bool
        self._sample_ids = sample_ids
        self._labels_map = labels_map
        self._pipeline = None

    @property
    def labels(self):
        """A list of dicts specifying the labels to match."""
        return self._labels

    @property
    def ids(self):
        """A list of IDs of labels to match."""
        return self._ids

    @property
    def tags(self):
        """A list of tags of labels to match."""
        return self._tags

    @property
    def filter(self):
        """A filter expression that defines the labels to match."""
        return self._filter

    @property
    def fields(self):
        """A list of fields from which labels are being matched."""
        return self._fields

    @property
    def bool(self):
        """Whether to match samples that have (None or True) or do not have
        (False) at least one label that matches the specified criteria.
        """
        return self._bool

    def to_mongo(self, _):
        if self._pipeline is None:
            raise ValueError(
                "`validate()` must be called before using a %s stage"
                % self.__class__
            )

        return self._pipeline

    def _kwargs(self):
        return [
            ["labels", self._labels],
            ["ids", self._ids],
            ["tags", self._tags],
            ["filter", self._get_mongo_filter()],
            ["fields", self._fields],
            ["bool", self._bool],
        ]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "labels",
                "type": "NoneType|json",
                "placeholder": "[{...}]",
                "default": "None",
            },
            {
                "name": "ids",
                "type": "NoneType|list<id>|id",
                "placeholder": "ids",
                "default": "None",
            },
            {
                "name": "tags",
                "type": "NoneType|list<str>|str",
                "placeholder": "tags",
                "default": "None",
            },
            {
                "name": "filter",
                "type": "NoneType|json",
                "placeholder": "filter",
                "default": "None",
            },
            {
                "name": "fields",
                "type": "NoneType|list<field>|field|list<str>|str",
                "placeholder": "fields",
                "default": "None",
            },
            {
                "name": "bool",
                "type": "bool",
                "default": "None",
                "placeholder": "bool (default=None)",
            },
        ]

    def _get_mongo_filter(self):
        if isinstance(self._filter, foe.ViewExpression):
            return self._filter.to_mongo(prefix=self._FILTER_PREFIX)

        return self._filter

    def _needs_frames(self, sample_collection):
        if not sample_collection._contains_videos():
            return False

        if self._labels is not None:
            fields = self._labels_map.keys()
        elif self._fields is not None:
            fields = self._fields
        else:
            fields = sample_collection._get_label_fields()

        return any(sample_collection._is_frame_field(f) for f in fields)

    def _needs_group_slices(self, sample_collection):
        if sample_collection.media_type != fom.GROUP:
            return None

        if self._labels is not None:
            fields = self._labels_map.keys()
        elif self._fields is not None:
            fields = self._fields
        else:
            fields = sample_collection._get_label_fields()

        return sample_collection._get_group_slices(fields)

    def _make_labels_pipeline(self, sample_collection):
        if self._bool:
            stage = Select(self._sample_ids)
        else:
            stage = Exclude(self._sample_ids)

        stage.validate(sample_collection)
        return stage.to_mongo(sample_collection)

    def _make_pipeline(self, sample_collection):
        if self._ids is None and self._tags is None and self._filter is None:
            if self._bool:
                return [{"$match": {"$expr": False}}]

            return []

        if self._fields is not None:
            fields = self._fields
        else:
            fields = sample_collection._get_label_fields()

        id_tag_expr = None

        if self._ids is not None:
            id_tag_expr = F("_id").is_in([ObjectId(_id) for _id in self._ids])

        if self._tags is not None:
            tag_expr = (F("tags") != None).if_else(
                F("tags").contains(self._tags), False
            )
            if id_tag_expr is None:
                id_tag_expr = tag_expr
            else:
                id_tag_expr &= tag_expr

        pipeline = []

        # Create temporary fields containing only the selected labels
        fields_map = {}
        for field in fields:
            if sample_collection._is_frame_field(field):
                frames, leaf = field.split(".", 1)
                new_field = frames + ".__" + leaf
            else:
                new_field = "__" + field

            fields_map[field] = new_field

            filter_expr = _render_filter(
                sample_collection,
                id_tag_expr,
                self._filter,
                field,
                self._FILTER_PREFIX,
            )

            stage = FilterLabels(
                field, filter_expr, only_matches=False, _new_field=new_field
            )
            stage.validate(sample_collection)
            pipeline.extend(stage.to_mongo(sample_collection))

        # Select samples that have (or do not have) the selected labels
        pipeline.extend(
            _make_match_empty_labels_pipeline(
                sample_collection, fields_map, match_empty=not self._bool
            )
        )

        # Delete temporary fields
        if fields_map:
            pipeline.append(
                {"$project": {f: False for f in fields_map.values()}}
            )

        return pipeline

    def validate(self, sample_collection):
        if self._labels is not None:
            self._pipeline = self._make_labels_pipeline(sample_collection)
        else:
            self._pipeline = self._make_pipeline(sample_collection)


def _render_filter(
    sample_collection, id_tag_expr, filter_expr_or_dict, field, var_prefix
):
    if filter_expr_or_dict is None:
        return id_tag_expr

    if isinstance(filter_expr_or_dict, foe.ViewExpression):
        if id_tag_expr is not None:
            return id_tag_expr & filter_expr_or_dict

        return filter_expr_or_dict

    _, is_list_field, is_frame_field = _parse_labels_field(
        sample_collection, field
    )

    if is_list_field:
        prefix = "$$this"
    elif is_frame_field:
        prefix = "$frame." + field.split(".", 1)[1]
    else:
        prefix = "$" + field

    filter_dict = _replace_prefix(filter_expr_or_dict, var_prefix, prefix)

    if id_tag_expr is not None:
        return {"$and": [id_tag_expr.to_mongo(prefix=prefix), filter_dict]}

    return filter_dict


def _replace_prefix(val, old, new):
    if isinstance(val, dict):
        return {
            _replace_prefix(k, old, new): _replace_prefix(v, old, new)
            for k, v in val.items()
        }

    if isinstance(val, list):
        return [_replace_prefix(v, old, new) for v in val]

    if etau.is_str(val):
        if val == old:
            return new

        if val.startswith(old + "."):
            return new + val[len(old) :]

    return val


class MatchTags(ViewStage):
    """Returns a view containing the samples in the collection that have or
    don't have any/all of the given tag(s).

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(filepath="image1.png", tags=["train"]),
                fo.Sample(filepath="image2.png", tags=["test"]),
                fo.Sample(filepath="image3.png", tags=["train", "test"]),
                fo.Sample(filepath="image4.png"),
            ]
        )

        #
        # Only include samples that have the "test" tag
        #

        stage = fo.MatchTags("test")
        view = dataset.add_stage(stage)

        #
        # Only include samples that do not have the "test" tag
        #

        stage = fo.MatchTags("test", bool=False)
        view = dataset.add_stage(stage)

        #
        # Only include samples that have the "test" or "train" tags
        #

        stage = fo.MatchTags(["test", "train"])
        view = dataset.add_stage(stage)

        #
        # Only include samples that have the "test" and "train" tags
        #

        stage = fo.MatchTags(["test", "train"], all=True)
        view = dataset.add_stage(stage)

        #
        # Only include samples that do not have the "test" or "train" tags
        #

        stage = fo.MatchTags(["test", "train"], bool=False)
        view = dataset.add_stage(stage)

        #
        # Only include samples that do not have the "test" and "train" tags
        #

        stage = fo.MatchTags(["test", "train"], bool=False, all=True)
        view = dataset.add_stage(stage)

    Args:
        tags: the tag or iterable of tags to match
        bool (None): whether to match samples that have (None or True) or do
            not have (False) the given tags
        all (False): whether to match samples that have (or don't have) all
            (True) or any (None or False) of the given tags
    """

    def __init__(self, tags, bool=None, all=False):
        if etau.is_str(tags):
            tags = [tags]
        else:
            tags = list(tags)
            if not builtins.all(etau.is_str(t) for t in tags):
                raise ValueError(
                    "The `tags` argument must be a string or iterable of "
                    "strings."
                )

        if bool is None:
            bool = True

        self._tags = tags
        self._bool = bool
        self._all = all

    @property
    def tags(self):
        """The list of tags to match."""
        return self._tags

    @property
    def bool(self):
        """Whether to match samples that have (True) or do not have (False) any
        of the given tags.
        """
        return self._bool

    @property
    def all(self):
        """Whether to match samples that have (or don't have) all (True) or any
        (False) of the given tags.
        """
        return self._all

    def to_mongo(self, _):
        if self._bool:
            if self._all:
                # All of the tags
                return [{"$match": {"tags": {"$all": self._tags}}}]

            # Any of the tags
            return [{"$match": {"tags": {"$in": self._tags}}}]

        if self._all:
            # Not all of the tags
            return [{"$match": {"tags": {"$not": {"$all": self._tags}}}}]

        # Not any of the tags
        return [{"$match": {"tags": {"$nin": self._tags}}}]

    def _kwargs(self):
        return [["tags", self._tags], ["bool", self._bool], ["all", self._all]]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "tags",
                "type": "list<str>|str",
                "placeholder": "list,of,tags",
            },
            {
                "name": "bool",
                "type": "bool",
                "default": "None",
                "placeholder": "bool (default=None)",
            },
            {
                "name": "all",
                "type": "bool",
                "default": "False",
                "placeholder": "all (default=False)",
            },
        ]


class Mongo(ViewStage):
    """A view stage defined by a raw MongoDB aggregation pipeline.

    See `MongoDB aggregation pipelines <https://docs.mongodb.com/manual/core/aggregation-pipeline/>`_
    for more details.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="cat",
                                bounding_box=[0.1, 0.1, 0.5, 0.5],
                                confidence=0.9,
                            ),
                            fo.Detection(
                                label="dog",
                                bounding_box=[0.2, 0.2, 0.3, 0.3],
                                confidence=0.8,
                            ),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="cat",
                                bounding_box=[0.5, 0.5, 0.4, 0.4],
                                confidence=0.95,
                            ),
                            fo.Detection(label="rabbit"),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="squirrel",
                                bounding_box=[0.25, 0.25, 0.5, 0.5],
                                confidence=0.5,
                            ),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="/path/to/image4.png",
                    predictions=None,
                ),
            ]
        )

        #
        # Extract a view containing the second and third samples in the dataset
        #

        stage = fo.Mongo([{"$skip": 1}, {"$limit": 2}])
        view = dataset.add_stage(stage)

        #
        # Sort by the number of objects in the `precictions` field
        #

        stage = fo.Mongo([
            {
                "$addFields": {
                    "_sort_field": {
                        "$size": {"$ifNull": ["$predictions.detections", []]}
                    }
                }
            },
            {"$sort": {"_sort_field": -1}},
            {"$project": {"_sort_field": False}},
        ])
        view = dataset.add_stage(stage)

    Args:
        pipeline: a MongoDB aggregation pipeline (list of dicts)
    """

    def __init__(self, pipeline, _needs_frames=None, _group_slices=None):
        self._pipeline = pipeline
        self._needs_frames_manual = _needs_frames
        self._group_slices_manual = _group_slices

    @property
    def pipeline(self):
        """The MongoDB aggregation pipeline."""
        return self._pipeline

    def to_mongo(self, _):
        return self._pipeline

    def _needs_frames(self, sample_collection):
        if self._needs_frames_manual is not None:
            return self._needs_frames_manual

        if not sample_collection._contains_videos():
            return False

        # The pipeline could be anything; always attach frames
        return True

    def _needs_group_slices(self, sample_collection):
        if self._group_slices_manual is not None:
            if etau.is_str(self._group_slices_manual):
                return [self._group_slices_manual]

            return self._group_slices_manual

        if sample_collection.media_type != fom.GROUP:
            return None

        # The pipeline could by anything; always attach all group slices
        return list(sample_collection.group_media_types.keys())

    def _kwargs(self):
        return [
            ["pipeline", self._pipeline],
            ["_needs_frames", self._needs_frames_manual],
            ["_group_slices", self._group_slices_manual],
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "pipeline", "type": "json", "placeholder": ""},
            {
                "name": "_needs_frames",
                "type": "NoneType|bool",
                "default": "None",
            },
            {
                "name": "_group_slices",
                "type": "NoneType|list<str>|str",
                "default": "None",
            },
        ]


class Select(ViewStage):
    """Selects the samples with the given IDs from a collection.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart")

        #
        # Create a view containing the currently selected samples in the App
        #

        session = fo.launch_app(dataset)

        # Select samples in the App...

        stage = fo.Select(session.selected)
        view = dataset.add_stage(stage)

    Args:
        sample_ids: the samples to select. Can be any of the following:

            -   a sample ID
            -   an iterable of sample IDs
            -   an iterable of booleans of same length as the collection
                encoding which samples to select
            -   a :class:`fiftyone.core.sample.Sample` or
                :class:`fiftyone.core.sample.SampleView`
            -   an iterable of :class:`fiftyone.core.sample.Sample` or
                :class:`fiftyone.core.sample.SampleView` instances
            -   a :class:`fiftyone.core.collections.SampleCollection`

        ordered (False): whether to sort the samples in the returned view to
            match the order of the provided IDs
    """

    def __init__(self, sample_ids, ordered=False):
        sample_ids, bools = _parse_sample_ids(sample_ids)
        self._sample_ids = sample_ids
        self._bools = bools
        self._ordered = ordered

    @property
    def sample_ids(self):
        """The list of sample IDs to select."""
        return self._sample_ids

    @property
    def ordered(self):
        """Whether to sort the samples in the same order as the IDs."""
        return self._ordered

    def to_mongo(self, _):
        if self._bools:
            raise ValueError(
                "`validate()` must be called before using this stage"
            )

        ids = [ObjectId(_id) for _id in self._sample_ids]

        pipeline = [{"$match": {"_id": {"$in": ids}}}]

        if self._ordered:
            pipeline.extend(
                [
                    {
                        "$addFields": {
                            "_select_order": {"$indexOfArray": [ids, "$_id"]}
                        }
                    },
                    {"$sort": {"_select_order": 1}},
                    {"$project": {"_select_order": False}},
                ]
            )

        return pipeline

    def _kwargs(self):
        return [["sample_ids", self._sample_ids], ["ordered", self._ordered]]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "sample_ids",
                "type": "list<id>|id",
                "placeholder": "list,of,sample,ids",
            },
            {
                "name": "ordered",
                "type": "bool",
                "default": "False",
                "placeholder": "ordered (default=False)",
            },
        ]

    def validate(self, sample_collection):
        if self._bools:
            ids = sample_collection.values("id")
            selectors = self._sample_ids
            self._sample_ids = list(itertools.compress(ids, selectors))
            self._bools = False


class SelectBy(ViewStage):
    """Selects the samples with the given field values from a collection.

    This stage is typically used to work with categorical fields (strings,
    ints, and bools). If you want to select samples based on floating point
    fields, use :class:`Match`.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(filepath="image%d.jpg" % i, int=i, str=str(i))
                for i in range(100)
            ]
        )

        #
        # Create a view containing samples whose `int` field have the given
        # values
        #

        stage = fo.SelectBy("int", [1, 51, 11, 41, 21, 31])
        view = dataset.add_stage(stage)
        print(view.head(6))

        #
        # Create a view containing samples whose `str` field have the given
        # values, in order
        #

        stage = fo.SelectBy(
            "str", ["1", "51", "11", "41", "21", "31"], ordered=True
        )
        view = dataset.add_stage(stage)
        print(view.head(6))

    Args:
        field: a field or ``embedded.field.name``
        values: a value or iterable of values to select by
        ordered (False): whether to sort the samples in the returned view to
            match the order of the provided values
    """

    def __init__(self, field, values, ordered=False):
        if etau.is_container(values):
            values = list(values)
        else:
            values = [values]

        self._field = field
        self._values = values
        self._ordered = ordered

    @property
    def field(self):
        """The field whose values to select by."""
        return self._field

    @property
    def values(self):
        """The list of values to select by."""
        return self._values

    @property
    def ordered(self):
        """Whether to sort the samples in the same order as the IDs."""
        return self._ordered

    def to_mongo(self, sample_collection):
        path, is_id_field, _ = sample_collection._handle_id_fields(self._field)

        if is_id_field:
            values = [
                value if isinstance(value, ObjectId) else ObjectId(value)
                for value in self._values
            ]
        else:
            values = self._values

        pipeline = [{"$match": {path: {"$in": values}}}]

        if self._ordered:
            pipeline.extend(
                [
                    {
                        "$addFields": {
                            "_select_order": {
                                "$indexOfArray": [values, "$" + path]
                            }
                        }
                    },
                    {"$sort": {"_select_order": 1}},
                    {"$project": {"_select_order": False}},
                ]
            )

        return pipeline

    def _kwargs(self):
        return [
            ["field", self._field],
            ["values", self._values],
            ["ordered", self._ordered],
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "field", "type": "field|str", "placeholder": "field"},
            {
                "name": "values",
                "type": "json",
                "placeholder": "list,of,values",
            },
            {
                "name": "ordered",
                "type": "bool",
                "default": "False",
                "placeholder": "ordered (default=False)",
            },
        ]


class SelectFields(ViewStage):
    """Selects only the fields with the given names from the samples in the
    collection. All other fields are excluded.

    Note that default sample fields are always selected.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    uniqueness=1.0,
                    ground_truth=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="cat",
                                bounding_box=[0.1, 0.1, 0.5, 0.5],
                                mood="surly",
                                age=51,
                            ),
                            fo.Detection(
                                label="dog",
                                bounding_box=[0.2, 0.2, 0.3, 0.3],
                                mood="happy",
                                age=52,
                            ),
                        ]
                    )
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    uniqueness=0.0,
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                ),
            ]
        )

        #
        # Include only the default fields on each sample
        #

        stage = fo.SelectFields()
        view = dataset.add_stage(stage)

        #
        # Include only the `uniqueness` field (and the default fields) on each
        # sample
        #

        stage = fo.SelectFields("uniqueness")
        view = dataset.add_stage(stage)

        #
        # Include only the `mood` attribute (and the default attributes) of
        # each `Detection` in the `ground_truth` field
        #

        stage = fo.SelectFields("ground_truth.detections.mood")
        view = dataset.add_stage(stage)

    Args:
        field_names (None): a field name or iterable of field names to select.
            May contain ``embedded.field.name`` as well
        meta_filter (None): a filter that dynamically selects fields in
            the collection's schema according to the specified rule, which
            can be matched against the field's ``name``, ``type``,
            ``description``, and/or ``info``. For example:

            -   Use ``meta_filter="2023"`` or ``meta_filter={"any": "2023"}``
                to select fields that have the string "2023" anywhere in their
                name, type, description, or info
            -   Use ``meta_filter={"type": "StringField"}`` or
                ``meta_filter={"type": "Classification"}`` to select all string
                or classification fields, respectively
            -   Use ``meta_filter={"description": "my description"}`` to
                select fields whose description contains the string
                "my description"
            -   Use ``meta_filter={"info": "2023"}`` to select fields that
                have the string "2023" anywhere in their info
            -   Use ``meta_filter={"info.key": "value"}}`` to select
                fields that have a specific key/value pair in their info
            -   Include ``meta_filter={"include_nested_fields": True, ...}`` in
                your meta filter to include all nested fields in the filter
    """

    def __init__(
        self,
        field_names=None,
        meta_filter=None,
        _allow_missing=False,
        _media_types=None,
    ):
        if etau.is_str(field_names):
            field_names = [field_names]
        elif field_names is not None:
            field_names = list(field_names)

        self._field_names = field_names
        self._meta_filter = meta_filter
        self._allow_missing = _allow_missing
        self._media_types = _media_types

    @property
    def field_names(self):
        """A list of field names to select."""
        return self._field_names

    @property
    def meta_filter(self):
        """A filter that dynamically selects fields."""
        return self._meta_filter

    def get_selected_fields(self, sample_collection, frames=False):
        if frames:
            return self._get_selected_frame_fields(sample_collection)

        return self._get_selected_fields(sample_collection)

    def _get_selected_fields(self, sample_collection, use_db_fields=False):
        contains_videos = sample_collection._contains_videos()
        selected_paths = set()

        if self._field_names is not None:
            if contains_videos:
                paths, _ = fou.split_frame_fields(self._field_names)
            else:
                paths = self._field_names

            selected_paths.update(paths)

        if self._meta_filter is not None:
            paths = _get_meta_filtered_fields(
                sample_collection, self._meta_filter
            )
            selected_paths.update(paths)

        roots = {None}  # None ensures default fields are always selected
        for path in selected_paths:
            roots.update(_get_roots(path))

        for path in roots:
            default_paths = sample_collection._get_default_sample_fields(
                path=path, include_private=True, media_types=self._media_types
            )
            selected_paths.update(default_paths)

        if contains_videos:
            selected_paths.add("frames")

        _remove_path_collisions(selected_paths)
        selected_paths = list(selected_paths)

        if use_db_fields:
            return sample_collection._handle_db_fields(selected_paths)

        return {path for path in selected_paths if path is not None}

    def _get_selected_frame_fields(
        self, sample_collection, use_db_fields=False
    ):
        if not sample_collection._contains_videos():
            return None

        selected_paths = set()

        if self._field_names is not None:
            _, paths = fou.split_frame_fields(self._field_names)
            selected_paths.update(paths)

        if self._meta_filter is not None:
            paths = _get_meta_filtered_fields(
                sample_collection, self._meta_filter, frames=True
            )
            selected_paths.update(paths)

        roots = {None}  # None ensures default fields are always selected
        for path in selected_paths:
            roots.update(_get_roots(path))

        for path in roots:
            default_paths = sample_collection._get_default_frame_fields(
                path=path, include_private=True
            )
            selected_paths.update(default_paths)

        _remove_path_collisions(selected_paths)
        selected_paths = list(selected_paths)

        if use_db_fields:
            return sample_collection._handle_db_fields(
                selected_paths, frames=True
            )

        return {path for path in selected_paths if path is not None}

    def to_mongo(self, sample_collection):
        selected_paths = self._get_selected_fields(
            sample_collection, use_db_fields=True
        )

        if sample_collection._contains_videos():
            selected_frame_paths = self._get_selected_frame_fields(
                sample_collection, use_db_fields=True
            )
            _merge_frame_paths(selected_paths, selected_frame_paths)

        if not selected_paths:
            return []

        return [{"$project": {f: True for f in selected_paths}}]

    def _needs_frames(self, sample_collection):
        if not sample_collection._contains_videos():
            return False

        if self._field_names is None:
            return False

        # @todo consider `meta_filter` here too?
        return any(
            sample_collection._is_frame_field(f) for f in self._field_names
        )

    def _needs_group_slices(self, sample_collection):
        if sample_collection.media_type != fom.GROUP:
            return None

        if self._field_names is None:
            return None

        return sample_collection._get_group_slices(self._field_names)

    def _kwargs(self):
        return [
            ["field_names", self._field_names],
            ["meta_filter", self._meta_filter],
            ["_allow_missing", self._allow_missing],
        ]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "field_names",
                "type": "NoneType|list<field>|field|list<str>|str",
                "default": "None",
                "placeholder": "field_names",
            },
            {
                "name": "meta_filter",
                "type": "NoneType|str|json",
                "default": "None",
                "placeholder": "meta_filter",
            },
            {"name": "_allow_missing", "type": "bool", "default": "False"},
        ]

    def validate(self, sample_collection):
        if self._allow_missing:
            return

        if self._field_names is not None:
            sample_collection.validate_fields_exist(self._field_names)


def _get_roots(path):
    chunks = path.split(".")
    return {".".join(chunks[:i]) for i in range(1, len(chunks))}


class SelectFrames(ViewStage):
    """Selects the frames with the given IDs from a video collection.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart-video")

        #
        # Select some specific frames
        #

        frame_ids = [
            dataset.first().frames.first().id,
            dataset.last().frames.last().id,
        ]

        stage = fo.SelectFrames(frame_ids)
        view = dataset.add_stage(stage)

        print(dataset.count())
        print(view.count())

        print(dataset.count("frames"))
        print(view.count("frames"))

    Args:
        frame_ids: the frames to select. Can be any of the following:

            -   a frame ID
            -   an iterable of frame IDs
            -   a :class:`fiftyone.core.frame.Frame` or
                :class:`fiftyone.core.frame.FrameView`
            -   an iterable of :class:`fiftyone.core.frame.Frame` or
                :class:`fiftyone.core.frame.FrameView` instances
            -   a :class:`fiftyone.core.collections.SampleCollection` whose
                frames to select

        omit_empty (True): whether to omit samples that have no frames after
            selecting the specified frames
    """

    def __init__(self, frame_ids, omit_empty=True):
        self._frame_ids = _parse_frame_ids(frame_ids)
        self._omit_empty = omit_empty

    @property
    def frame_ids(self):
        """The list of frame IDs to select."""
        return self._frame_ids

    @property
    def omit_empty(self):
        """Whether to omit samples that have no labels after filtering."""
        return self._omit_empty

    def to_mongo(self, _):
        frame_ids = [ObjectId(_id) for _id in self._frame_ids]
        select_expr = F("frames").filter(F("_id").is_in(frame_ids))
        pipeline = [{"$addFields": {"frames": select_expr.to_mongo()}}]

        if self._omit_empty:
            non_empty_expr = F("frames").length() > 0
            pipeline.append({"$match": {"$expr": non_empty_expr.to_mongo()}})

        return pipeline

    def _kwargs(self):
        return [
            ["frame_ids", self._frame_ids],
            ["omit_empty", self._omit_empty],
        ]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "frame_ids",
                "type": "list<id>|id",
                "placeholder": "list,of,frame,ids",
            },
            {
                "name": "omit_empty",
                "type": "bool",
                "default": "True",
                "placeholder": "omit empty (default=True)",
            },
        ]

    def _needs_frames(self, _):
        return True

    def validate(self, sample_collection):
        fova.validate_video_collection(sample_collection)


class SelectGroups(ViewStage):
    """Selects the groups with the given IDs from a grouped collection.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart-groups")

        #
        # Select some specific groups by ID
        #

        group_ids = dataset.take(10).values("group.id")

        stage = fo.SelectGroups(group_ids)
        view = dataset.add_stage(stage)

        assert set(view.values("group.id")) == set(group_ids)

        stage = fo.SelectGroups(group_ids, ordered=True)
        view = dataset.add_stage(stage)

        assert view.values("group.id") == group_ids

    Args:
        groups_ids: the groups to select. Can be any of the following:

            -   a group ID
            -   an iterable of group IDs
            -   a :class:`fiftyone.core.sample.Sample` or
                :class:`fiftyone.core.sample.SampleView`
            -   a group dict returned by
                :meth:`get_group() <fiftyone.core.collections.SampleCollection.get_group>`
            -   an iterable of :class:`fiftyone.core.sample.Sample` or
                :class:`fiftyone.core.sample.SampleView` instances
            -   an iterable of group dicts returned by
                :meth:`get_group() <fiftyone.core.collections.SampleCollection.get_group>`
            -   a :class:`fiftyone.core.collections.SampleCollection`

        ordered (False): whether to sort the groups in the returned view to
            match the order of the provided IDs
    """

    def __init__(self, group_ids, ordered=False):
        self._group_ids = _parse_group_ids(group_ids)
        self._ordered = ordered

    @property
    def group_ids(self):
        """The list of group IDs to select."""
        return self._group_ids

    @property
    def ordered(self):
        """Whether to sort the groups in the same order as the IDs."""
        return self._ordered

    def to_mongo(self, sample_collection):
        id_path = sample_collection.group_field + "._id"
        ids = [ObjectId(_id) for _id in self._group_ids]

        pipeline = [{"$match": {id_path: {"$in": ids}}}]

        if self._ordered:
            pipeline.extend(
                [
                    {
                        "$addFields": {
                            "_select_order": {
                                "$indexOfArray": [ids, "$" + id_path]
                            }
                        }
                    },
                    {"$sort": {"_select_order": 1}},
                    {"$project": {"_select_order": False}},
                ]
            )

        return pipeline

    def _kwargs(self):
        return [["group_ids", self._group_ids], ["ordered", self._ordered]]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "group_ids",
                "type": "list<id>|id",
                "placeholder": "list,of,group,ids",
            },
            {
                "name": "ordered",
                "type": "bool",
                "default": "False",
                "placeholder": "ordered (default=False)",
            },
        ]

    def validate(self, sample_collection):
        if sample_collection.media_type != fom.GROUP:
            raise ValueError("%s has no groups" % type(sample_collection))


class SelectLabels(ViewStage):
    """Selects only the specified labels from a collection.

    The returned view will omit samples, sample fields, and individual labels
    that do not match the specified selection criteria.

    You can perform a selection via one or more of the following methods:

    -   Provide the ``labels`` argument, which should contain a list of dicts
        in the format returned by
        :attr:`fiftyone.core.session.Session.selected_labels`, to select
        specific labels

    -   Provide the ``ids`` argument to select labels with specific IDs

    -   Provide the ``tags`` argument to select labels with specific tags

    If multiple criteria are specified, labels must match all of them in order
    to be selected.

    By default, the selection is applied to all
    :class:`fiftyone.core.labels.Label` fields, but you can provide the
    ``fields`` argument to explicitly define the field(s) in which to select.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart")

        #
        # Only include the labels currently selected in the App
        #

        session = fo.launch_app(dataset)

        # Select some labels in the App...

        stage = fo.SelectLabels(labels=session.selected_labels)
        view = dataset.add_stage(stage)

        #
        # Only include labels with the specified IDs
        #

        # Grab some label IDs
        ids = [
            dataset.first().ground_truth.detections[0].id,
            dataset.last().predictions.detections[0].id,
        ]

        stage = fo.SelectLabels(ids=ids)
        view = dataset.add_stage(stage)

        print(view.count("ground_truth.detections"))
        print(view.count("predictions.detections"))

        #
        # Only include labels with the specified tags
        #

        # Grab some label IDs
        ids = [
            dataset.first().ground_truth.detections[0].id,
            dataset.last().predictions.detections[0].id,
        ]

        # Give the labels a "test" tag
        dataset = dataset.clone()  # create copy since we're modifying data
        dataset.select_labels(ids=ids).tag_labels("test")

        print(dataset.count_values("ground_truth.detections.tags"))
        print(dataset.count_values("predictions.detections.tags"))

        # Retrieve the labels via their tag
        stage = fo.SelectLabels(tags="test")
        view = dataset.add_stage(stage)

        print(view.count("ground_truth.detections"))
        print(view.count("predictions.detections"))

    Args:
        labels (None): a list of dicts specifying the labels to select in the
            format returned by
            :attr:`fiftyone.core.session.Session.selected_labels`
        ids (None): an ID or iterable of IDs of the labels to select
        tags (None): a tag or iterable of tags of labels to select
        fields (None): a field or iterable of fields from which to select
        omit_empty (True): whether to omit samples that have no labels after
            filtering
    """

    def __init__(
        self, labels=None, ids=None, tags=None, fields=None, omit_empty=True
    ):
        if labels is not None:
            sample_ids, labels_map = _parse_labels(labels)
        else:
            sample_ids, labels_map = None, None

        if etau.is_str(ids):
            ids = [ids]
        elif ids is not None:
            ids = list(ids)

        if etau.is_str(tags):
            tags = [tags]
        elif tags is not None:
            tags = list(tags)

        if etau.is_str(fields):
            fields = [fields]
        elif fields is not None:
            fields = list(fields)

        self._labels = labels
        self._ids = ids
        self._tags = tags
        self._fields = fields
        self._omit_empty = omit_empty
        self._sample_ids = sample_ids
        self._labels_map = labels_map
        self._pipeline = None

    @property
    def labels(self):
        """A list of dicts specifying the labels to select."""
        return self._labels

    @property
    def ids(self):
        """A list of IDs of labels to select."""
        return self._ids

    @property
    def tags(self):
        """A list of tags of labels to select."""
        return self._tags

    @property
    def fields(self):
        """A list of fields from which labels are being selected."""
        return self._fields

    @property
    def omit_empty(self):
        """Whether to omit samples that have no labels after filtering."""
        return self._omit_empty

    def get_edited_fields(self, sample_collection, frames=False):
        if self._labels is not None:
            fields = self._labels_map.keys()
        elif self._fields is not None:
            fields = self._fields
        else:
            fields = sample_collection._get_label_fields()

        edited_fields = []

        for field in fields:
            field_name, is_frame_field = sample_collection._handle_frame_field(
                field
            )
            if frames == is_frame_field:
                edited_fields.append(field_name)

        if edited_fields:
            return edited_fields

        return None

    def get_filtered_fields(self, sample_collection, frames=False):
        if self._labels is not None:
            fields = self._labels_map.keys()
        elif self._fields is not None:
            fields = self._fields
        else:
            fields = sample_collection._get_label_fields()

        filtered_fields = []

        for field in fields:
            list_path, is_list_field, is_frame_field = _parse_labels_field(
                sample_collection, field
            )
            if is_list_field and frames == is_frame_field:
                list_path, _ = sample_collection._handle_frame_field(list_path)
                filtered_fields.append(list_path)

        if filtered_fields:
            return filtered_fields

        return None

    def to_mongo(self, _):
        if self._pipeline is None:
            raise ValueError(
                "`validate()` must be called before using a %s stage"
                % self.__class__
            )

        return self._pipeline

    def _kwargs(self):
        return [
            ["labels", self._labels],
            ["ids", self._ids],
            ["tags", self._tags],
            ["fields", self._fields],
            ["omit_empty", self._omit_empty],
        ]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "labels",
                "type": "NoneType|json",
                "placeholder": "[{...}]",
                "default": "None",
            },
            {
                "name": "ids",
                "type": "NoneType|list<id>|id",
                "placeholder": "ids",
                "default": "None",
            },
            {
                "name": "tags",
                "type": "NoneType|list<str>|str",
                "placeholder": "tags",
                "default": "None",
            },
            {
                "name": "fields",
                "type": "NoneType|list<field>|field|list<str>|str",
                "placeholder": "fields",
                "default": "None",
            },
            {
                "name": "omit_empty",
                "type": "bool",
                "default": "True",
                "placeholder": "omit empty (default=True)",
            },
        ]

    def _needs_frames(self, sample_collection):
        if not sample_collection._contains_videos():
            return False

        if self._labels is not None:
            fields = self._labels_map.keys()
        elif self._fields is not None:
            fields = self._fields
        else:
            fields = sample_collection._get_label_fields()

        return any(sample_collection._is_frame_field(f) for f in fields)

    def _needs_group_slices(self, sample_collection):
        if sample_collection.media_type != fom.GROUP:
            return None

        if self._labels is not None:
            fields = self._labels_map.keys()
        elif self._fields is not None:
            fields = self._fields
        else:
            fields = sample_collection._get_label_fields()

        return sample_collection._get_group_slices(fields)

    def _make_labels_pipeline(self, sample_collection):
        pipeline = []

        if self._omit_empty:
            # Filter samples with no selected labels
            stage = Select(self._sample_ids)
            stage.validate(sample_collection)
            pipeline.extend(stage.to_mongo(sample_collection))

        #
        # We know that only fields in `_labels_map` will have matches, so
        # exclude other label fields
        #
        # Note that we don't implement `get_excluded_fields()` here, because
        # our intention is not to remove other fields from the schema, only to
        # empty their sample fields in the returned view
        #

        exclude_fields = list(
            set(sample_collection._get_label_fields())
            - set(self._labels_map.keys())
        )
        if exclude_fields:
            stage = ExcludeFields(exclude_fields)
            stage.validate(sample_collection)
            pipeline.extend(stage.to_mongo(sample_collection))

        # Select specified labels
        for field, labels_map in self._labels_map.items():
            label_filter = F("_id").is_in(
                [foe.ObjectId(_id) for _id in labels_map]
            )
            stage = FilterLabels(field, label_filter, only_matches=False)
            stage.validate(sample_collection)
            pipeline.extend(stage.to_mongo(sample_collection))

        return pipeline

    def _make_pipeline(self, sample_collection):
        if self._fields is not None:
            fields = self._fields
        else:
            fields = sample_collection._get_label_fields()

        pipeline = []

        #
        # We know that only `fields` will have matches, so exclude other label
        # fields
        #
        # Note that we don't implement `get_excluded_fields()` here, because
        # our intention is not to remove other fields from the schema, only to
        # empty their sample fields in the returned view
        #

        exclude_fields = list(
            set(sample_collection._get_label_fields()) - set(fields)
        )
        if exclude_fields:
            stage = ExcludeFields(exclude_fields)
            stage.validate(sample_collection)
            pipeline.extend(stage.to_mongo(sample_collection))

        #
        # Filter labels that don't match `tags` and `ids
        #

        filter_expr = None

        if self._ids is not None:
            filter_expr = F("_id").is_in([ObjectId(_id) for _id in self._ids])

        if self._tags is not None:
            tag_expr = (F("tags") != None).if_else(
                F("tags").contains(self._tags), False
            )
            if filter_expr is not None:
                filter_expr &= tag_expr
            else:
                filter_expr = tag_expr

        # Filter to only retain selected labels
        if filter_expr is not None:
            for field in fields:
                stage = FilterLabels(field, filter_expr, only_matches=False)
                stage.validate(sample_collection)
                pipeline.extend(stage.to_mongo(sample_collection))

        # Filter samples with no labels, if requested
        if self._omit_empty:
            pipeline.extend(
                _make_omit_empty_labels_pipeline(sample_collection, fields)
            )

        return pipeline

    def validate(self, sample_collection):
        if self._labels is not None:
            self._pipeline = self._make_labels_pipeline(sample_collection)
        else:
            self._pipeline = self._make_pipeline(sample_collection)


class Shuffle(ViewStage):
    """Randomly shuffles the samples in a collection.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    ground_truth=fo.Classification(label="cat"),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    ground_truth=fo.Classification(label="dog"),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    ground_truth=None,
                ),
            ]
        )

        #
        # Return a view that contains a randomly shuffled version of the
        # samples in the dataset
        #

        stage = fo.Shuffle()
        view = dataset.add_stage(stage)

        #
        # Shuffle the samples with a fixed random seed
        #

        stage = fo.Shuffle(seed=51)
        view = dataset.add_stage(stage)

    Args:
        seed (None): an optional random seed to use when shuffling the samples
    """

    def __init__(self, seed=None, _randint=None):
        self._seed = seed
        self._randint = _randint or _get_rng(seed).randint(int(1e7), int(1e10))

    @property
    def seed(self):
        """The random seed to use, or ``None``."""
        return self._seed

    def to_mongo(self, _):
        # @todo can we avoid creating a new field here?
        return [
            {
                "$addFields": {
                    "_rand_shuffle": {"$mod": [self._randint, "$_rand"]}
                }
            },
            {"$sort": {"_rand_shuffle": 1}},
            {"$project": {"_rand_shuffle": False}},
        ]

    def _kwargs(self):
        return [["seed", self._seed], ["_randint", self._randint]]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "seed",
                "type": "NoneType|float",
                "default": "None",
                "placeholder": "seed (default=None)",
            },
            {"name": "_randint", "type": "NoneType|int", "default": "None"},
        ]


class Skip(ViewStage):
    """Omits the given number of samples from the head of a collection.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    ground_truth=fo.Classification(label="cat"),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    ground_truth=fo.Classification(label="dog"),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    ground_truth=fo.Classification(label="rabbit"),
                ),
                fo.Sample(
                    filepath="/path/to/image4.png",
                    ground_truth=None,
                ),
            ]
        )

        #
        # Omit the first two samples from the dataset
        #

        stage = fo.Skip(2)
        view = dataset.add_stage(stage)

    Args:
        skip: the number of samples to skip. If a non-positive number is
            provided, no samples are omitted
    """

    def __init__(self, skip):
        self._skip = skip

    @property
    def skip(self):
        """The number of samples to skip."""
        return self._skip

    def to_mongo(self, _):
        if self._skip <= 0:
            return []

        return [{"$skip": self._skip}]

    def _kwargs(self):
        return [["skip", self._skip]]

    @classmethod
    def _params(cls):
        return [{"name": "skip", "type": "int", "placeholder": "int"}]


class SortBy(ViewStage):
    """Sorts the samples in a collection by the given field(s) or
    expression(s).

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("quickstart")

        #
        # Sort the samples by their `uniqueness` field in ascending order
        #

        stage = fo.SortBy("uniqueness", reverse=False)
        view = dataset.add_stage(stage)

        #
        # Sorts the samples in descending order by the number of detections in
        # their `predictions` field whose bounding box area is less than 0.2
        #

        # Bboxes are in [top-left-x, top-left-y, width, height] format
        bbox = F("bounding_box")
        bbox_area = bbox[2] * bbox[3]

        small_boxes = F("predictions.detections").filter(bbox_area < 0.2)
        stage = fo.SortBy(small_boxes.length(), reverse=True)
        view = dataset.add_stage(stage)

        #
        # Performs a compound sort where samples are first sorted in descending
        # order by number of detections and then in ascending order of
        # uniqueness for samples with the same number of predictions
        #

        stage = fo.SortBy(
            [
                (F("predictions.detections").length(), -1),
                ("uniqueness", 1),
            ]
        )
        view = dataset.add_stage(stage)

        num_objects, uniqueness = view[:5].values(
            [F("predictions.detections").length(), "uniqueness"]
        )
        print(list(zip(num_objects, uniqueness)))

    Args:
        field_or_expr: the field(s) or expression(s) to sort by. This can be
            any of the following:

            -   a field to sort by
            -   an ``embedded.field.name`` to sort by
            -   a :class:`fiftyone.core.expressions.ViewExpression` or a
                `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that defines the quantity to sort by
            -   a list of ``(field_or_expr, order)`` tuples defining a compound
                sort criteria, where ``field_or_expr`` is a field or expression
                as defined above, and ``order`` can be 1 or any string starting
                with "a" for ascending order, or -1 or any string starting with
                "d" for descending order
        reverse (False): whether to return the results in descending order
        create_index (True): whether to create an index, if necessary, to
            optimize the sort. Only applicable when sorting by field(s), not
            expressions
    """

    def __init__(self, field_or_expr, reverse=False, create_index=True):
        self._field_or_expr = field_or_expr
        self._reverse = reverse
        self._create_index = create_index

    @property
    def field_or_expr(self):
        """The field or expression to sort by."""
        return self._field_or_expr

    @property
    def reverse(self):
        """Whether to return the results in descending order."""
        return self._reverse

    @property
    def create_index(self):
        """Whether to create an index, if necessary, to optimize the sort."""
        return self._create_index

    def to_mongo(self, sample_collection):
        field_or_expr = self._get_mongo_field_or_expr()

        if not isinstance(field_or_expr, (list, tuple)):
            field_or_expr = [(field_or_expr, 1)]

        if self._reverse:
            field_or_expr = [(f, -order) for f, order in field_or_expr]

        set_dict = {}
        sort_dict = OrderedDict()
        for idx, (expr, order) in enumerate(field_or_expr, 1):
            if etau.is_str(expr):
                expr, _, _ = sample_collection._handle_id_fields(expr)
                field = expr
            else:
                field = "_sort_field%d" % idx
                set_dict[field] = expr

            sort_dict[field] = order

        pipeline = []

        if set_dict:
            pipeline.append({"$addFields": set_dict})

        pipeline.append({"$sort": sort_dict})

        if set_dict:
            pipeline.append({"$project": {f: False for f in set_dict.keys()}})

        return pipeline

    def _needs_frames(self, sample_collection):
        if not sample_collection._contains_videos():
            return False

        field_or_expr = self._get_mongo_field_or_expr()

        if not isinstance(field_or_expr, (list, tuple)):
            field_or_expr = [(field_or_expr, None)]

        needs_frames = False
        for expr, _ in field_or_expr:
            if etau.is_str(expr):
                needs_frames |= sample_collection._is_frame_field(expr)
            else:
                needs_frames |= foe.is_frames_expr(expr)

        return needs_frames

    def _needs_group_slices(self, sample_collection):
        if sample_collection.media_type != fom.GROUP:
            return None

        field_or_expr = self._get_mongo_field_or_expr()

        if not isinstance(field_or_expr, (list, tuple)):
            field_or_expr = [(field_or_expr, None)]

        group_slices = set()
        for expr, _ in field_or_expr:
            if etau.is_str(expr):
                group_slices.update(sample_collection._get_group_slices(expr))
            else:
                group_slices.update(foe.get_group_slices(expr))

        return list(group_slices)

    def _get_mongo_field_or_expr(self):
        return _serialize_sort_expr(self._field_or_expr)

    def _kwargs(self):
        return [
            ["field_or_expr", self._get_mongo_field_or_expr()],
            ["reverse", self._reverse],
            ["create_index", self._create_index],
        ]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "field_or_expr",
                "type": "field|str|json",
                "placeholder": "field or expression",
            },
            {
                "name": "reverse",
                "type": "bool",
                "default": "False",
                "placeholder": "reverse (default=False)",
            },
            {
                "name": "create_index",
                "type": "bool",
                "default": "True",
                "placeholder": "create_index (default=True)",
            },
        ]

    def validate(self, sample_collection):
        if not self._create_index:
            return

        field_or_expr = self._get_mongo_field_or_expr()

        if etau.is_str(field_or_expr):
            index_spec = field_or_expr.lstrip("$")
            sample_collection.create_index(index_spec)
        elif isinstance(field_or_expr, (list, tuple)) and all(
            etau.is_str(i[0]) for i in field_or_expr
        ):
            index_spec = [(f.lstrip("$"), d) for f, d in field_or_expr]
            sample_collection.create_index(index_spec)


def _serialize_sort_expr(field_or_expr):
    if isinstance(field_or_expr, foe.ViewField):
        return field_or_expr._expr

    if isinstance(field_or_expr, foe.ViewExpression):
        return field_or_expr.to_mongo()

    if isinstance(field_or_expr, (list, tuple)):
        return [
            (_serialize_sort_expr(expr), _parse_sort_order(order))
            for expr, order in field_or_expr
        ]

    return field_or_expr


def _parse_sort_order(order):
    if etau.is_str(order):
        if order:
            if order.lower()[0] == "a":
                return 1

            if order.lower()[0] == "d":
                return -1

    if order in {-1, 1}:
        return order

    raise ValueError(
        "Invalid sort order %s. Supported values are 1 or any string starting "
        "with 'a' for ascending order, or -1 or any string starting with 'd' "
        "for descending order"
    )


class SortBySimilarity(ViewStage):
    """Sorts a collection by similarity to a specified query.

    In order to use this stage, you must first use
    :meth:`fiftyone.brain.compute_similarity` to index your dataset by
    similarity.

    Examples::

        import fiftyone as fo
        import fiftyone.brain as fob
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart")

        fob.compute_similarity(
            dataset, model="clip-vit-base32-torch", brain_key="clip"
        )

        #
        # Sort samples by their similarity to a sample by its ID
        #

        query_id = dataset.first().id

        stage = fo.SortBySimilarity(query_id, k=5)
        view = dataset.add_stage(stage)

        #
        # Sort samples by their similarity to a manually computed vector
        #

        model = foz.load_zoo_model("clip-vit-base32-torch")
        embeddings = dataset.take(2, seed=51).compute_embeddings(model)
        query = embeddings.mean(axis=0)

        stage = fo.SortBySimilarity(query, k=5)
        view = dataset.add_stage(stage)

        #
        # Sort samples by their similarity to a text prompt
        #

        query = "kites high in the air"

        stage = fo.SortBySimilarity(query, k=5)
        view = dataset.add_stage(stage)

    Args:
        query: the query, which can be any of the following:

            -   an ID or iterable of IDs
            -   a ``num_dims`` vector or ``num_queries x num_dims`` array of
                vectors
            -   a prompt or iterable of prompts (if supported by the index)

        k (None): the number of matches to return. By default, the entire
            collection is sorted
        reverse (False): whether to sort by least similarity (True) or greatest
            similarity (False). Some backends may not support least similarity
        dist_field (None): the name of a float field in which to store the
            distance of each example to the specified query. The field is
            created if necessary
        brain_key (None): the brain key of an existing
            :meth:`fiftyone.brain.compute_similarity` run on the dataset. If
            not specified, the dataset must have an applicable run, which will
            be used by default
    """

    def __init__(
        self,
        query,
        k=None,
        reverse=False,
        dist_field=None,
        brain_key=None,
        _state=None,
    ):
        query, query_kwarg, is_prompt = _parse_similarity_query(query)

        self._query = query
        self._query_kwarg = query_kwarg
        self._is_prompt = is_prompt
        self._k = k
        self._reverse = reverse
        self._dist_field = dist_field
        self._brain_key = brain_key
        self._state = _state
        self._pipeline = None

    @property
    def query(self):
        """The query."""
        return self._query

    @property
    def k(self):
        """The number of matches to return."""
        return self._k

    @property
    def reverse(self):
        """Whether to sort by least similarity."""
        return self._reverse

    @property
    def dist_field(self):
        """The field to store similarity distances, if any."""
        return self._dist_field

    @property
    def brain_key(self):
        """The brain key of the similarity index to use."""
        return self._brain_key

    def to_mongo(self, _):
        if self._pipeline is None:
            raise ValueError(
                "`validate()` must be called before using a %s stage"
                % self.__class__
            )

        return self._pipeline

    def _kwargs(self):
        return [
            ["query", self._query_kwarg],
            ["k", self._k],
            ["reverse", self._reverse],
            ["dist_field", self._dist_field],
            ["brain_key", self._brain_key],
            ["_state", self._state],
        ]

    @classmethod
    def _params(cls):
        return [
            {
                "name": "query",
                "type": "list<str>|str",
                "placeholder": "query",
            },
            {
                "name": "k",
                "type": "NoneType|int",
                "default": "None",
                "placeholder": "k (default=None)",
            },
            {
                "name": "reverse",
                "type": "bool",
                "default": "False",
                "placeholder": "reverse (default=False)",
            },
            {
                "name": "dist_field",
                "type": "NoneType|field|str",
                "default": "None",
                "placeholder": "dist_field (default=None)",
            },
            {
                "name": "brain_key",
                "type": "NoneType|str",
                "default": "None",
                "placeholder": "brain key",
            },
            {"name": "_state", "type": "NoneType|json", "default": "None"},
        ]

    def validate(self, sample_collection):
        state = {
            "dataset": sample_collection.dataset_name,
            "stages": sample_collection.view()._serialize(include_uuids=False),
            "query": self._query_kwarg,
            "k": self._k,
            "reverse": self._reverse,
            "dist_field": self._dist_field,
            "brain_key": self._brain_key,
        }

        last_state = deepcopy(self._state)
        if last_state is not None:
            pipeline = last_state.pop("pipeline", None)
        else:
            pipeline = None

        if state != last_state or pipeline is None:
            pipeline = self._make_pipeline(sample_collection)

            state["pipeline"] = pipeline
            self._state = state

        self._pipeline = pipeline

    def _make_pipeline(self, sample_collection):
        if self._brain_key is not None:
            brain_key = self._brain_key
        else:
            brain_key = _get_default_similarity_run(
                sample_collection, supports_prompts=self._is_prompt
            )

        results = sample_collection.load_brain_results(brain_key)

        with contextlib.ExitStack() as context:
            if sample_collection.view() != results.view.view():
                results.use_view(sample_collection)
                context.enter_context(results)

            return results.sort_by_similarity(
                self._query,
                k=self._k,
                reverse=self._reverse,
                dist_field=self._dist_field,
                _mongo=True,
            )


def _parse_similarity_query(query):
    if isinstance(query, np.ndarray):
        # Query vector(s)
        query_kwarg = fou.serialize_numpy_array(query, ascii=True)
        return query, query_kwarg, False

    if not etau.is_str(query):
        # Query IDs or prompts
        query = list(query)

        if query:
            try:
                # Query IDs
                ObjectId(query[0])
                is_prompt = False
            except:
                # Query prompts
                is_prompt = True
        else:
            is_prompt = False

        return query, query, is_prompt

    try:
        # Query ID
        ObjectId(query)
        return query, query, False
    except:
        pass

    try:
        # Already serialized query vector(s)
        query_kwarg = query
        query = fou.deserialize_numpy_array(query, ascii=True)
        return query, query_kwarg, False
    except:
        pass

    # Query prompt
    return query, query, True


class Take(ViewStage):
    """Randomly samples the given number of samples from a collection.

    Examples::

        import fiftyone as fo

        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/path/to/image1.png",
                    ground_truth=fo.Classification(label="cat"),
                ),
                fo.Sample(
                    filepath="/path/to/image2.png",
                    ground_truth=fo.Classification(label="dog"),
                ),
                fo.Sample(
                    filepath="/path/to/image3.png",
                    ground_truth=fo.Classification(label="rabbit"),
                ),
                fo.Sample(
                    filepath="/path/to/image4.png",
                    ground_truth=None,
                ),
            ]
        )

        #
        # Take two random samples from the dataset
        #

        stage = fo.Take(2)
        view = dataset.add_stage(stage)

        #
        # Take two random samples from the dataset with a fixed seed
        #

        stage = fo.Take(2, seed=51)
        view = dataset.add_stage(stage)

    Args:
        size: the number of samples to return. If a non-positive number is
            provided, an empty view is returned
        seed (None): an optional random seed to use when selecting the samples
    """

    def __init__(self, size, seed=None, _randint=None):
        self._seed = seed
        self._size = size
        self._randint = _randint or _get_rng(seed).randint(int(1e7), int(1e10))

    @property
    def size(self):
        """The number of samples to return."""
        return self._size

    @property
    def seed(self):
        """The random seed to use, or ``None``."""
        return self._seed

    def to_mongo(self, _):
        if self._size <= 0:
            return [{"$match": {"_id": None}}]

        # @todo can we avoid creating a new field here?
        return [
            {
                "$addFields": {
                    "_rand_take": {"$mod": [self._randint, "$_rand"]}
                }
            },
            {"$sort": {"_rand_take": 1}},
            {"$limit": self._size},
            {"$project": {"_rand_take": False}},
        ]

    def _kwargs(self):
        return [
            ["size", self._size],
            ["seed", self._seed],
            ["_randint", self._randint],
        ]

    @classmethod
    def _params(cls):
        return [
            {"name": "size", "type": "int", "placeholder": "int"},
            {
                "name": "seed",
                "type": "NoneType|float",
                "default": "None",
                "placeholder": "seed (default=None)",
            },
            {"name": "_randint", "type": "NoneType|int", "default": "None"},
        ]


class ToPatches(ViewStage):
    """Creates a view that contains one sample per object patch in the
    specified field of a collection.

    A ``sample_id`` field will be added that records the sample ID from which
    each patch was taken.

    By default, fields other than ``field`` and the default sample fields will
    not be included in the returned view.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart")

        session = fo.launch_app(dataset)

        #
        # Create a view containing the ground truth patches
        #

        stage = fo.ToPatches("ground_truth")
        view = dataset.add_stage(stage)
        print(view)

        session.view = view

    Args:
        field: the patches field, which must be of type
            :class:`fiftyone.core.labels.Detections`,
            :class:`fiftyone.core.labels.Polylines`, or
            :class:`fiftyone.core.labels.Keypoints`
        config (None): an optional dict of keyword arguments for
            :meth:`fiftyone.core.patches.make_patches_dataset` specifying how
            to perform the conversion
        **kwargs: optional keyword arguments for
            :meth:`fiftyone.core.patches.make_patches_dataset` specifying how
            to perform the conversion
    """

    def __init__(self, field, config=None, _state=None, **kwargs):
        if kwargs:
            if config is None:
                config = kwargs
            else:
                config.update(kwargs)

        self._field = field
        self._config = config
        self._state = _state

    @property
    def has_view(self):
        return True

    @property
    def field(self):
        """The patches field."""
        return self._field

    @property
    def config(self):
        """Parameters specifying how to perform the conversion."""
        return self._config

    def load_view(self, sample_collection):
        state = {
            "dataset": sample_collection.dataset_name,
            "stages": sample_collection.view()._serialize(include_uuids=False),
            "field": self._field,
            "config": self._config,
        }

        last_state = deepcopy(self._state)
        if last_state is not None:
            name = last_state.pop("name", None)
        else:
            name = None

        if state != last_state or not fod.dataset_exists(name):
            kwargs = self._config or {}
            patches_dataset = fop.make_patches_dataset(
                sample_collection,
                self._field,
                _generated=True,
                **kwargs,
            )

            # Other views may use the same generated dataset, so reuse the old
            # name if possible
            if name is not None and state == last_state:
                patches_dataset.name = name

            state["name"] = patches_dataset.name
            self._state = state
        else:
            patches_dataset = fod.load_dataset(name)

        return fop.PatchesView(sample_collection, self, patches_dataset)

    def _kwargs(self):
        return [
            ["field", self._field],
            ["config", self._config],
            ["_state", self._state],
        ]

    @classmethod
    def _params(self):
        return [
            {"name": "field", "type": "field", "placeholder": "label field"},
            {
                "name": "config",
                "type": "NoneType|json",
                "default": "None",
                "placeholder": "config (default=None)",
            },
            {"name": "_state", "type": "NoneType|json", "default": "None"},
        ]


class ToEvaluationPatches(ViewStage):
    """Creates a view based on the results of the evaluation with the given key
    that contains one sample for each true positive, false positive, and false
    negative example in the collection, respectively.

    True positive examples will result in samples with both their ground truth
    and predicted fields populated, while false positive/negative examples wilL
    only have one of their corresponding predicted/ground truth fields
    populated, respectively.

    If multiple predictions are matched to a ground truth object (e.g., if the
    evaluation protocol includes a crowd attribute), then all matched
    predictions will be stored in the single sample along with the ground truth
    object.

    The returned dataset will also have top-level ``type`` and ``iou`` fields
    populated based on the evaluation results for that example, as well as a
    ``sample_id`` field recording the sample ID of the example, and a ``crowd``
    field if the evaluation protocol defines a crowd attribute.

    .. note::

        The returned view will contain patches for the contents of this
        collection, which may differ from the view on which the ``eval_key``
        evaluation was performed. This may exclude some labels that were
        evaluated and/or include labels that were not evaluated.

        If you would like to see patches for the exact view on which an
        evaluation was performed, first call
        :meth:`load_evaluation_view() <fiftyone.core.collections.SampleCollection.load_evaluation_view>`
        to load the view and then convert to patches.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart")
        dataset.evaluate_detections("predictions", eval_key="eval")

        session = fo.launch_app(dataset)

        #
        # Create a patches view for the evaluation results
        #

        stage = fo.ToEvaluationPatches("eval")
        view = dataset.add_stage(stage)
        print(view)

        session.view = view

    Args:
        eval_key: an evaluation key that corresponds to the evaluation of
            ground truth/predicted fields that are of type
            :class:`fiftyone.core.labels.Detections`,
            :class:`fiftyone.core.labels.Polylines, or
            :class:`fiftyone.core.labels.Keypoints`
        config (None): an optional dict of keyword arguments for
            :meth:`fiftyone.core.patches.make_evaluation_patches_dataset`
            specifying how to perform the conversion
        **kwargs: optional keyword arguments for
            :meth:`fiftyone.core.patches.make_evaluation_patches_dataset`
            specifying how to perform the conversion
    """

    def __init__(self, eval_key, config=None, _state=None, **kwargs):
        if kwargs:
            if config is None:
                config = kwargs
            else:
                config.update(kwargs)

        self._eval_key = eval_key
        self._config = config
        self._state = _state

    @property
    def has_view(self):
        return True

    @property
    def eval_key(self):
        """The evaluation key to extract patches for."""
        return self._eval_key

    @property
    def config(self):
        """Parameters specifying how to perform the conversion."""
        return self._config

    def load_view(self, sample_collection):
        state = {
            "dataset": sample_collection.dataset_name,
            "stages": sample_collection.view()._serialize(include_uuids=False),
            "eval_key": self._eval_key,
            "config": self._config,
        }

        last_state = deepcopy(self._state)
        if last_state is not None:
            name = last_state.pop("name", None)
        else:
            name = None

        if state != last_state or not fod.dataset_exists(name):
            kwargs = self._config or {}
            eval_patches_dataset = fop.make_evaluation_patches_dataset(
                sample_collection,
                self._eval_key,
                _generated=True,
                **kwargs,
            )

            # Other views may use the same generated dataset, so reuse the old
            # name if possible
            if name is not None and state == last_state:
                eval_patches_dataset.name = name

            state["name"] = eval_patches_dataset.name
            self._state = state
        else:
            eval_patches_dataset = fod.load_dataset(name)

        return fop.EvaluationPatchesView(
            sample_collection, self, eval_patches_dataset
        )

    def _kwargs(self):
        return [
            ["eval_key", self._eval_key],
            ["config", self._config],
            ["_state", self._state],
        ]

    @classmethod
    def _params(self):
        return [
            {"name": "eval_key", "type": "str", "placeholder": "eval key"},
            {
                "name": "config",
                "type": "NoneType|json",
                "default": "None",
                "placeholder": "config (default=None)",
            },
            {"name": "_state", "type": "NoneType|json", "default": "None"},
        ]


class ToClips(ViewStage):
    """Creates a view that contains one sample per clip defined by the given
    field or expression in a video collection.

    The returned view will contain:

    -   A ``sample_id`` field that records the sample ID from which each clip
        was taken
    -   A ``support`` field that records the ``[first, last]`` frame support of
        each clip
    -   All frame-level information from the underlying dataset of the input
        collection

    Refer to :meth:`fiftyone.core.clips.make_clips_dataset` to see the
    available configuration options for generating clips.

    .. note::

        The clip generation logic will respect any frame-level modifications
        defined in the input collection, but the output clips will always
        contain all frame-level labels.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("quickstart-video")

        #
        # Create a clips view that contains one clip for each contiguous
        # segment that contains at least one road sign in every frame
        #

        stage1 = fo.FilterLabels("frames.detections", F("label") == "road sign")
        stage2 = fo.ToClips("frames.detections")
        clips = dataset.add_stage(stage1).add_stage(stage2)
        print(clips)

        #
        # Create a clips view that contains one clip for each contiguous
        # segment that contains at least two road signs in every frame
        #

        signs = F("detections.detections").filter(F("label") == "road sign")
        stage = fo.ToClips(signs.length() >= 2)
        clips = dataset.add_stage(stage)
        print(clips)

    Args:
        field_or_expr: can be any of the following:

            -   a :class:`fiftyone.core.labels.TemporalDetection`,
                :class:`fiftyone.core.labels.TemporalDetections`,
                :class:`fiftyone.core.fields.FrameSupportField`, or list of
                :class:`fiftyone.core.fields.FrameSupportField` field
            -   a frame-level label list field of any of the following types:

                -   :class:`fiftyone.core.labels.Classifications`
                -   :class:`fiftyone.core.labels.Detections`
                -   :class:`fiftyone.core.labels.Polylines`
                -   :class:`fiftyone.core.labels.Keypoints`
            -   a :class:`fiftyone.core.expressions.ViewExpression` that
                returns a boolean to apply to each frame of the input
                collection to determine if the frame should be clipped
            -   a list of ``[(first1, last1), (first2, last2), ...]`` lists
                defining the frame numbers of the clips to extract from each
                sample
        config (None): an optional dict of keyword arguments for
            :meth:`fiftyone.core.clips.make_clips_dataset` specifying how to
            perform the conversion
        **kwargs: optional keyword arguments for
            :meth:`fiftyone.core.clips.make_clips_dataset` specifying how to
            perform the conversion
    """

    def __init__(self, field_or_expr, config=None, _state=None, **kwargs):
        if kwargs:
            if config is None:
                config = kwargs
            else:
                config.update(kwargs)

        self._field_or_expr = field_or_expr
        self._config = config
        self._state = _state

    @property
    def has_view(self):
        return True

    @property
    def field_or_expr(self):
        """The field or expression defining how to extract the clips."""
        return self._field_or_expr

    @property
    def config(self):
        """Parameters specifying how to perform the conversion."""
        return self._config

    def load_view(self, sample_collection):
        state = {
            "dataset": sample_collection.dataset_name,
            "stages": sample_collection.view()._serialize(include_uuids=False),
            "field_or_expr": self._get_mongo_field_or_expr(),
            "config": self._config,
        }

        last_state = deepcopy(self._state)
        if last_state is not None:
            name = last_state.pop("name", None)
        else:
            name = None

        if state != last_state or not fod.dataset_exists(name):
            kwargs = self._config or {}
            clips_dataset = focl.make_clips_dataset(
                sample_collection,
                self._field_or_expr,
                _generated=True,
                **kwargs,
            )

            # Other views may use the same generated dataset, so reuse the old
            # name if possible
            if name is not None and state == last_state:
                clips_dataset.name = name

            state["name"] = clips_dataset.name
            self._state = state
        else:
            clips_dataset = fod.load_dataset(name)

        return focl.ClipsView(sample_collection, self, clips_dataset)

    def _get_mongo_field_or_expr(self):
        if isinstance(self._field_or_expr, foe.ViewExpression):
            return self._field_or_expr.to_mongo()

        return self._field_or_expr

    def _kwargs(self):
        return [
            ["field_or_expr", self._get_mongo_field_or_expr()],
            ["config", self._config],
            ["_state", self._state],
        ]

    @classmethod
    def _params(self):
        return [
            {
                "name": "field_or_expr",
                "type": "field|str|json",
                "placeholder": "field or expression",
            },
            {
                "name": "config",
                "type": "NoneType|json",
                "default": "None",
                "placeholder": "config (default=None)",
            },
            {"name": "_state", "type": "NoneType|json", "default": "None"},
        ]


class ToTrajectories(ViewStage):
    """Creates a view that contains one clip for each unique object trajectory
    defined by their ``(label, index)`` in a frame-level field of a video
    collection.

    The returned view will contain:

    -   A ``sample_id`` field that records the sample ID from which each clip
        was taken
    -   A ``support`` field that records the ``[first, last]`` frame support of
        each clip
    -   A sample-level label field that records the ``label`` and ``index`` of
        each trajectory

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("quickstart-video")

        #
        # Create a trajectories view for the vehicles in the dataset
        #

        stage1 = fo.FilterLabels("frames.detections", F("label") == "vehicle")
        stage2 = fo.ToTrajectories("frames.detections")
        trajectories = dataset.add_stage(stage1).add_stage(stage2)

        print(trajectories)

    Args:
        field: a frame-level label list field of any of the following types:

            -   :class:`fiftyone.core.labels.Detections`
            -   :class:`fiftyone.core.labels.Polylines`
            -   :class:`fiftyone.core.labels.Keypoints`
        config (None): an optional dict of keyword arguments for
            :meth:`fiftyone.core.clips.make_clips_dataset` specifying how to
            perform the conversion
        **kwargs: optional keyword arguments for
            :meth:`fiftyone.core.clips.make_clips_dataset` specifying how to
            perform the conversion
    """

    def __init__(self, field, config=None, _state=None, **kwargs):
        if kwargs:
            if config is None:
                config = kwargs
            else:
                config.update(kwargs)

        self._field = field
        self._config = config
        self._state = _state

    @property
    def has_view(self):
        return True

    @property
    def field(self):
        """The label field for which to extract trajectories."""
        return self._field

    @property
    def config(self):
        """Parameters specifying how to perform the conversion."""
        return self._config

    def load_view(self, sample_collection):
        state = {
            "dataset": sample_collection.dataset_name,
            "stages": sample_collection.view()._serialize(include_uuids=False),
            "field": self._field,
            "config": self._config,
        }

        last_state = deepcopy(self._state)
        if last_state is not None:
            name = last_state.pop("name", None)
        else:
            name = None

        if state != last_state or not fod.dataset_exists(name):
            kwargs = self._config or {}
            clips_dataset = focl.make_clips_dataset(
                sample_collection,
                self._field,
                trajectories=True,
                _generated=True,
                **kwargs,
            )

            state["name"] = clips_dataset.name
            self._state = state
        else:
            clips_dataset = fod.load_dataset(name)

        return focl.TrajectoriesView(sample_collection, self, clips_dataset)

    def _kwargs(self):
        return [
            ["field", self._field],
            ["config", self._config],
            ["_state", self._state],
        ]

    @classmethod
    def _params(self):
        return [
            {
                "name": "field",
                "type": "field",
                "placeholder": "field",
            },
            {
                "name": "config",
                "type": "NoneType|json",
                "default": "None",
                "placeholder": "config (default=None)",
            },
            {"name": "_state", "type": "NoneType|json", "default": "None"},
        ]


class ToFrames(ViewStage):
    """Creates a view that contains one sample per frame in a video collection.

    The returned view will contain all frame-level fields and the ``tags`` of
    each video as sample-level fields, as well as a ``sample_id`` field that
    records the IDs of the parent sample for each frame.

    By default, ``sample_frames`` is False and this method assumes that the
    frames of the input collection have ``filepath`` fields populated pointing
    to each frame image. Any frames without a ``filepath`` populated will be
    omitted from the returned view.

    When ``sample_frames`` is True, this method samples each video in the
    collection into a directory of per-frame images and stores the filepaths in
    the ``filepath`` frame field of the source dataset. By default, each folder
    of images is written using the same basename as the input video. For
    example, if ``frames_patt = "%%06d.jpg"``, then videos with the following
    paths::

        /path/to/video1.mp4
        /path/to/video2.mp4
        ...

    would be sampled as follows::

        /path/to/video1/
            000001.jpg
            000002.jpg
            ...
        /path/to/video2/
            000001.jpg
            000002.jpg
            ...

    However, you can use the optional ``output_dir`` and ``rel_dir`` parameters
    to customize the location and shape of the sampled frame folders. For
    example, if ``output_dir = "/tmp"`` and ``rel_dir = "/path/to"``, then
    videos with the following paths::

        /path/to/folderA/video1.mp4
        /path/to/folderA/video2.mp4
        /path/to/folderB/video3.mp4
        ...

    would be sampled as follows::

        /tmp/folderA/
            video1/
                000001.jpg
                000002.jpg
                ...
            video2/
                000001.jpg
                000002.jpg
                ...
        /tmp/folderB/
            video3/
                000001.jpg
                000002.jpg
                ...

    By default, samples will be generated for every video frame at full
    resolution, but this method provides a variety of parameters that can be
    used to customize the sampling behavior.

    .. note::

        If this method is run multiple times with ``sample_frames`` set to
        True, existing frames will not be resampled unless you set
        ``force_sample`` to True.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("quickstart-video")

        session = fo.launch_app(dataset)

        #
        # Create a frames view for an entire video dataset
        #

        stage = fo.ToFrames(sample_frames=True)
        frames = dataset.add_stage(stage)
        print(frames)

        session.view = frames

        #
        # Create a frames view that only contains frames with at least 10
        # objects, sampled at a maximum frame rate of 1fps
        #

        num_objects = F("detections.detections").length()
        view = dataset.match_frames(num_objects > 10)

        stage = fo.ToFrames(max_fps=1)
        frames = view.add_stage(stage)
        print(frames)

        session.view = frames

    Args:
        config (None): an optional dict of keyword arguments for
            :meth:`fiftyone.core.video.make_frames_dataset` specifying how to
            perform the conversion
        **kwargs: optional keyword arguments for
            :meth:`fiftyone.core.video.make_frames_dataset` specifying how to
            perform the conversion
    """

    def __init__(self, config=None, _state=None, **kwargs):
        if kwargs:
            if config is None:
                config = kwargs
            else:
                config.update(kwargs)

        self._config = config
        self._state = _state

    @property
    def has_view(self):
        return True

    @property
    def config(self):
        """Parameters specifying how to perform the conversion."""
        return self._config

    def load_view(self, sample_collection):
        state = {
            "dataset": sample_collection.dataset_name,
            "stages": sample_collection.view()._serialize(include_uuids=False),
            "config": self._config,
        }

        last_state = deepcopy(self._state)
        if last_state is not None:
            name = last_state.pop("name", None)
        else:
            name = None

        if state != last_state or not fod.dataset_exists(name):
            kwargs = self._config or {}
            frames_dataset = fovi.make_frames_dataset(
                sample_collection,
                _generated=True,
                **kwargs,
            )

            # Other views may use the same generated dataset, so reuse the old
            # name if possible
            if name is not None and state == last_state:
                frames_dataset.name = name

            state["name"] = frames_dataset.name
            self._state = state
        else:
            frames_dataset = fod.load_dataset(name)

        return fovi.FramesView(sample_collection, self, frames_dataset)

    def _kwargs(self):
        return [
            ["config", self._config],
            ["_state", self._state],
        ]

    @classmethod
    def _params(self):
        return [
            {
                "name": "config",
                "type": "NoneType|json",
                "default": "None",
                "placeholder": "config (default=None)",
            },
            {"name": "_state", "type": "NoneType|json", "default": "None"},
        ]


def _parse_sample_ids(arg):
    if etau.is_str(arg):
        return [arg], False

    if isinstance(arg, (fos.Sample, fos.SampleView)):
        return [arg.id], False

    if isinstance(arg, foc.SampleCollection):
        return arg.values("id"), False

    arg = list(arg)

    if not arg:
        return [], False

    if isinstance(arg[0], (fos.Sample, fos.SampleView)):
        return [s.id for s in arg], False

    if isinstance(arg[0], (bool, np.bool_)):
        return arg, True

    return arg, False


def _parse_frame_ids(arg):
    if etau.is_str(arg):
        return [arg]

    if isinstance(arg, (fofr.Frame, fofr.FrameView)):
        return [arg.id]

    if isinstance(arg, foc.SampleCollection):
        return arg.values("frames.id", unwind=True)

    arg = list(arg)

    if not arg:
        return []

    if isinstance(arg[0], (fofr.Frame, fofr.FrameView)):
        return [s.id for s in arg]

    return arg


def _parse_group_ids(arg):
    if etau.is_str(arg):
        return [arg]

    if isinstance(arg, (dict, fos.Sample, fos.SampleView)):
        return [_get_group_id(arg)]

    if isinstance(arg, foc.SampleCollection):
        if arg.media_type != fom.GROUP:
            raise ValueError("%s is not a grouped collection" % type(arg))

        return arg.values(arg.group_field + ".id")

    arg = list(arg)

    if not arg:
        return []

    if isinstance(arg[0], (dict, fos.Sample, fos.SampleView)):
        return [_get_group_id(a) for a in arg]

    return arg


def _get_group_id(sample_or_group):
    if isinstance(sample_or_group, dict):
        sample = next(iter(sample_or_group.values()))
    else:
        sample = sample_or_group

    for field, value in sample.iter_fields():
        if isinstance(value, fog.Group):
            return value.id

    raise ValueError("Sample '%s' has no group" % sample.id)


def _get_rng(seed):
    if seed is None:
        return random

    _random = random.Random()
    _random.seed(seed)
    return _random


def _parse_labels_field(sample_collection, field_path):
    path, is_list_field = sample_collection._get_label_field_root(field_path)
    is_frame_field = sample_collection._is_frame_field(field_path)

    prefix = ""
    real_path = path
    if is_frame_field:
        prefix = sample_collection._FRAMES_PREFIX
        real_path = real_path[len(prefix) :]

    hidden = False

    # for fiftyone.core.stages hidden results
    if real_path.startswith("__"):
        hidden = True
        real_path = real_path[2:]

    if hidden:
        real_field = sample_collection.get_field(prefix + real_path)
        is_list_field = isinstance(real_field, ListField)

    return path, is_list_field, is_frame_field


def _remove_path_collisions(paths):
    # https://docs.mongodb.com/manual/reference/operator/aggregation/project/#path-collision-errors-in-embedded-fields
    roots = set()
    for path in paths:
        chunks = path.split(".")
        for i in range(1, len(chunks)):
            roots.add(".".join(chunks[:i]))

    for root in roots:
        paths.discard(root)


def _merge_frame_paths(paths, frame_paths):
    if not frame_paths:
        return

    try:
        # https://docs.mongodb.com/manual/reference/operator/aggregation/project/#path-collision-errors-in-embedded-fields
        paths.remove("frames")
    except:
        pass

    paths.extend(["frames." + f for f in frame_paths])


def _parse_labels(labels):
    sample_ids = set()
    labels_map = defaultdict(set)
    for label in labels:
        sample_ids.add(label["sample_id"])
        labels_map[label["field"]].add(label["label_id"])

    return sample_ids, labels_map


def _get_label_field_only_matches_expr(
    sample_collection, field, new_field=None, prefix=""
):
    path, is_list_field = sample_collection._get_label_field_root(field)

    if new_field is not None:
        path = new_field + path[len(field) :]

    path, is_frame_field = sample_collection._handle_frame_field(path)

    if is_frame_field:
        if is_list_field:
            match_fcn = _get_frames_list_field_only_matches_expr
        else:
            match_fcn = _get_frames_field_only_matches_expr
    else:
        if is_list_field:
            match_fcn = _get_list_field_only_matches_expr
        else:
            match_fcn = _get_field_only_matches_expr

    return match_fcn(prefix + path)


def _make_omit_empty_labels_pipeline(sample_collection, fields):
    match_exprs = []
    for field in fields:
        match_exprs.append(
            _get_label_field_only_matches_expr(sample_collection, field)
        )

    stage = Match(F.any(match_exprs))
    stage.validate(sample_collection)
    return stage.to_mongo(sample_collection)


def _make_match_empty_labels_pipeline(
    sample_collection, fields_map, match_empty=False
):
    match_exprs = []
    for field, new_field in fields_map.items():
        match_exprs.append(
            _get_label_field_only_matches_expr(
                sample_collection, field, new_field=new_field
            )
        )

    expr = F.any(match_exprs)

    if match_empty:
        expr = ~expr  # match *empty* rather than non-empty samples

    stage = Match(expr)
    stage.validate(sample_collection)
    return stage.to_mongo(sample_collection)


def _get_default_similarity_run(sample_collection, supports_prompts=False):
    if supports_prompts:
        kwargs = dict(supports_prompts=True)
    else:
        kwargs = {}

    if isinstance(sample_collection, fop.PatchesView):
        patches_field = sample_collection.patches_field

        brain_keys = sample_collection.list_brain_runs(
            type=fob.Similarity,
            patches_field=patches_field,
            **kwargs,
        )

        if not brain_keys:
            raise ValueError(
                "Dataset '%s' has no compatible%s similarity results for "
                "field '%s'"
                % (
                    sample_collection.dataset_name,
                    " %s" % kwargs if kwargs else "",
                    patches_field,
                )
            )

    elif isinstance(sample_collection, fop.EvaluationPatchesView):
        gt_field = sample_collection.gt_field
        pred_field = sample_collection.pred_field

        brain_keys = sample_collection.list_brain_runs(
            type=fob.Similarity,
            patches_field=gt_field,
            **kwargs,
        )
        brain_keys += sample_collection.list_brain_runs(
            type=fob.Similarity,
            patches_field=pred_field,
            **kwargs,
        )

        if not brain_keys:
            raise ValueError(
                "Dataset '%s' has no compatible%s similarity results for its "
                "'%s' or '%s' fields"
                % (
                    sample_collection.dataset_name,
                    " %s" % kwargs if kwargs else "",
                    gt_field,
                    pred_field,
                )
            )
    else:
        # Try sample indexes first
        brain_keys = sample_collection.list_brain_runs(
            type=fob.Similarity,
            patches_field=None,
            **kwargs,
        )

        # It's allowable to use a patches index too
        if not brain_keys:
            brain_keys = sample_collection.list_brain_runs(
                type=fob.Similarity,
                **kwargs,
            )

        if not brain_keys:
            raise ValueError(
                "Dataset '%s' has no compatible%s similarity results for its "
                "samples"
                % (
                    sample_collection.dataset_name,
                    " %s" % kwargs if kwargs else "",
                )
            )

    brain_key = brain_keys[0]

    if len(brain_keys) > 1:
        msg = "Multiple similarity runs found; using '%s'" % brain_key
        warnings.warn(msg)

    return brain_key


def _get_selected_excluded_fields(view):
    selected_fields, excluded_fields = view._get_selected_excluded_fields()

    if not view._has_frame_fields():
        return selected_fields, excluded_fields

    _selected_fields, _excluded_fields = view._get_selected_excluded_fields(
        frames=True
    )

    if _selected_fields:
        _selected_fields = {view._FRAMES_PREFIX + f for f in _selected_fields}
        if selected_fields:
            selected_fields.update(_selected_fields)
        else:
            selected_fields = _selected_fields

    if _excluded_fields:
        _excluded_fields = {view._FRAMES_PREFIX + f for f in _excluded_fields}
        if excluded_fields:
            excluded_fields.update(_excluded_fields)
        else:
            excluded_fields = _excluded_fields

    return selected_fields, excluded_fields


class _ViewStageRepr(reprlib.Repr):
    def repr_ViewExpression(self, expr, level):
        return self.repr1(expr.to_mongo(), level=level - 1)


_repr = _ViewStageRepr()
_repr.maxlevel = 2
_repr.maxdict = 3
_repr.maxlist = 3
_repr.maxtuple = 3
_repr.maxset = 3
_repr.maxstring = 30
_repr.maxother = 30

# Simple registry for the server to grab available view stages
_STAGES = [
    Concat,
    Exclude,
    ExcludeBy,
    ExcludeFields,
    ExcludeFrames,
    ExcludeGroups,
    ExcludeGroupSlices,
    ExcludeLabels,
    Exists,
    FilterField,
    FilterLabels,
    FilterKeypoints,
    Flatten,
    GeoNear,
    GeoWithin,
    GroupBy,
    Limit,
    LimitLabels,
    MapLabels,
    Match,
    MatchFrames,
    MatchLabels,
    MatchTags,
    Mongo,
    Select,
    SelectBy,
    SelectFields,
    SelectFrames,
    SelectGroups,
    SelectGroupSlices,
    SelectLabels,
    SetField,
    Shuffle,
    Skip,
    SortBy,
    SortBySimilarity,
    Take,
    ToPatches,
    ToEvaluationPatches,
    ToClips,
    ToTrajectories,
    ToFrames,
]

# Registry of stages that promise to only reorder/select documents
_STAGES_THAT_SELECT_OR_REORDER = {
    # View stages that only reorder documents
    GroupBy,
    SortBy,
    SortBySimilarity,
    Shuffle,
    # View stages that only select documents
    Exclude,
    ExcludeBy,
    ExcludeGroupSlices,
    Exists,
    GeoNear,
    GeoWithin,
    Limit,
    Match,
    MatchLabels,
    MatchTags,
    Select,
    SelectBy,
    SelectGroupSlices,
    Skip,
    Take,
}

# Registry of select stages that should select first
_STAGES_THAT_SELECT_FIRST = {
    ExcludeGroupSlices,
    SelectGroupSlices,
}
