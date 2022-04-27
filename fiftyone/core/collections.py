"""
Interface for sample collections.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import fnmatch
import itertools
import logging
import os
import random
import string
import warnings

from bson import ObjectId
from deprecated import deprecated
from fiftyone.core.odm.embedded_document import DynamicEmbeddedDocument
from pymongo import InsertOne, UpdateOne

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone.core.aggregations as foa
import fiftyone.core.annotation as foan
import fiftyone.core.brain as fob
import fiftyone.core.expressions as foe
from fiftyone.core.expressions import ViewField as F
import fiftyone.core.evaluation as foev
import fiftyone.core.fields as fof
import fiftyone.core.frame as fofr
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.metadata as fomt
import fiftyone.core.models as fomo
import fiftyone.core.odm as foo
import fiftyone.core.sample as fosa
import fiftyone.core.utils as fou

fod = fou.lazy_import("fiftyone.core.dataset")
fos = fou.lazy_import("fiftyone.core.stages")
fov = fou.lazy_import("fiftyone.core.view")
foua = fou.lazy_import("fiftyone.utils.annotations")
foud = fou.lazy_import("fiftyone.utils.data")
foue = fou.lazy_import("fiftyone.utils.eval")


logger = logging.getLogger(__name__)


def _make_registrar():
    registry = {}

    def registrar(func):
        registry[func.__name__] = func
        # Normally a decorator returns a wrapped function, but here we return
        # `func` unmodified, after registering it
        return func

    registrar.all = registry
    return registrar


# Keeps track of all `ViewStage` methods
view_stage = _make_registrar()

# Keeps track of all `Aggregation` methods
aggregation = _make_registrar()


class SampleCollection(object):
    """Abstract class representing an ordered collection of
    :class:`fiftyone.core.sample.Sample` instances in a
    :class:`fiftyone.core.dataset.Dataset`.
    """

    _FRAMES_PREFIX = "frames."

    def __str__(self):
        return repr(self)

    def __repr__(self):
        return self.summary()

    def __bool__(self):
        return len(self) > 0

    def __len__(self):
        raise NotImplementedError("Subclass must implement __len__()")

    def __contains__(self, sample_id):
        try:
            self[sample_id]
        except KeyError:
            return False

        return True

    def __getitem__(self, id_filepath_slice):
        raise NotImplementedError("Subclass must implement __getitem__()")

    def __iter__(self):
        return self.iter_samples()

    def __add__(self, samples):
        return self.concat(samples)

    @property
    def _dataset(self):
        """The :class:`fiftyone.core.dataset.Dataset` that serves the samples
        in this collection.
        """
        raise NotImplementedError("Subclass must implement _dataset")

    @property
    def _root_dataset(self):
        """The root :class:`fiftyone.core.dataset.Dataset` from which this
        collection is derived.

        This is typically the same as :meth:`_dataset` but may differ in cases
        such as patches views.
        """
        raise NotImplementedError("Subclass must implement _root_dataset")

    @property
    def _is_generated(self):
        """Whether this collection's contents is generated from another
        collection.
        """
        raise NotImplementedError("Subclass must implement _is_generated")

    @property
    def _is_patches(self):
        """Whether this collection contains patches."""
        raise NotImplementedError("Subclass must implement _is_patches")

    @property
    def _is_frames(self):
        """Whether this collection contains frames of a video dataset."""
        raise NotImplementedError("Subclass must implement _is_frames")

    @property
    def _is_clips(self):
        """Whether this collection contains clips."""
        raise NotImplementedError("Subclass must implement _is_clips")

    @property
    def _element_str(self):
        return "sample"

    @property
    def _elements_str(self):
        return "samples"

    @property
    def name(self):
        """The name of the collection."""
        raise NotImplementedError("Subclass must implement name")

    @property
    def media_type(self):
        """The media type of the collection."""
        raise NotImplementedError("Subclass must implement media_type")

    @property
    def info(self):
        """The info dict of the underlying dataset.

        See :meth:`fiftyone.core.dataset.Dataset.info` for more information.
        """
        raise NotImplementedError("Subclass must implement info")

    @info.setter
    def info(self, info):
        raise NotImplementedError("Subclass must implement info")

    @property
    def classes(self):
        """The classes of the underlying dataset.

        See :meth:`fiftyone.core.dataset.Dataset.classes` for more information.
        """
        raise NotImplementedError("Subclass must implement classes")

    @classes.setter
    def classes(self, classes):
        raise NotImplementedError("Subclass must implement classes")

    @property
    def default_classes(self):
        """The default classes of the underlying dataset.

        See :meth:`fiftyone.core.dataset.Dataset.default_classes` for more
        information.
        """
        raise NotImplementedError("Subclass must implement default_classes")

    @default_classes.setter
    def default_classes(self, classes):
        raise NotImplementedError("Subclass must implement default_classes")

    def has_classes(self, field):
        """Determines whether this collection has a classes list for the given
        field.

        Classes may be defined either in :meth:`classes` or
        :meth:`default_classes`.

        Args:
            field: a field name

        Returns:
            True/False
        """
        return field in self.classes or bool(self.default_classes)

    def get_classes(self, field):
        """Gets the classes list for the given field, or None if no classes
        are available.

        Classes are first retrieved from :meth:`classes` if they exist,
        otherwise from :meth:`default_classes`.

        Args:
            field: a field name

        Returns:
            a list of classes, or None
        """
        if field in self.classes:
            return self.classes[field]

        if self.default_classes:
            return self.default_classes

        return None

    @property
    def mask_targets(self):
        """The mask targets of the underlying dataset.

        See :meth:`fiftyone.core.dataset.Dataset.mask_targets` for more
        information.
        """
        raise NotImplementedError("Subclass must implement mask_targets")

    @mask_targets.setter
    def mask_targets(self, targets):
        raise NotImplementedError("Subclass must implement mask_targets")

    @property
    def default_mask_targets(self):
        """The default mask targets of the underlying dataset.

        See :meth:`fiftyone.core.dataset.Dataset.default_mask_targets` for more
        information.
        """
        raise NotImplementedError(
            "Subclass must implement default_mask_targets"
        )

    @default_mask_targets.setter
    def default_mask_targets(self, targets):
        raise NotImplementedError(
            "Subclass must implement default_mask_targets"
        )

    def has_mask_targets(self, field):
        """Determines whether this collection has mask targets for the given
        field.

        Mask targets may be defined either in :meth:`mask_targets` or
        :meth:`default_mask_targets`.

        Args:
            field: a field name

        Returns:
            True/False
        """
        return field in self.mask_targets or bool(self.default_mask_targets)

    def get_mask_targets(self, field):
        """Gets the mask targets for the given field, or None if no mask
        targets are available.

        Mask targets are first retrieved from :meth:`mask_targets` if they
        exist, otherwise from :meth:`default_mask_targets`.

        Args:
            field: a field name

        Returns:
            a list of classes, or None
        """
        if field in self.mask_targets:
            return self.mask_targets[field]

        if self.default_mask_targets:
            return self.default_mask_targets

        return None

    @property
    def skeletons(self):
        """The keypoint skeletons of the underlying dataset.

        See :meth:`fiftyone.core.dataset.Dataset.skeletons` for more
        information.
        """
        raise NotImplementedError("Subclass must implement skeletons")

    @skeletons.setter
    def skeletons(self, skeletons):
        raise NotImplementedError("Subclass must implement skeletons")

    @property
    def default_skeleton(self):
        """The default keypoint skeleton of the underlying dataset.

        See :meth:`fiftyone.core.dataset.Dataset.default_skeleton` for more
        information.
        """
        raise NotImplementedError("Subclass must implement default_skeleton")

    @default_skeleton.setter
    def default_skeleton(self, skeleton):
        raise NotImplementedError("Subclass must implement default_skeleton")

    def has_skeleton(self, field):
        """Determines whether this collection has a keypoint skeleton for the
        given field.

        Keypoint skeletons may be defined either in :meth:`skeletons` or
        :meth:`default_skeleton`.

        Args:
            field: a field name

        Returns:
            True/False
        """
        return field in self.skeletons or bool(self.default_skeleton)

    def get_skeleton(self, field):
        """Gets the keypoint skeleton for the given field, or None if no
        skeleton is available.

        Skeletons are first retrieved from :meth:`skeletons` if they exist,
        otherwise from :meth:`default_skeleton`.

        Args:
            field: a field name

        Returns:
            a list of classes, or None
        """
        if field in self.skeletons:
            return self.skeletons[field]

        if self.default_skeleton:
            return self.default_skeleton

        return None

    def summary(self):
        """Returns a string summary of the collection.

        Returns:
            a string summary
        """
        raise NotImplementedError("Subclass must implement summary()")

    def first(self):
        """Returns the first sample in the collection.

        Returns:
            a :class:`fiftyone.core.sample.Sample` or
            :class:`fiftyone.core.sample.SampleView`
        """
        try:
            return next(iter(self))
        except StopIteration:
            raise ValueError("%s is empty" % self.__class__.__name__)

    def last(self):
        """Returns the last sample in the collection.

        Returns:
            a :class:`fiftyone.core.sample.Sample` or
            :class:`fiftyone.core.sample.SampleView`
        """
        return self[-1:].first()

    def head(self, num_samples=3):
        """Returns a list of the first few samples in the collection.

        If fewer than ``num_samples`` samples are in the collection, only
        the available samples are returned.

        Args:
            num_samples (3): the number of samples

        Returns:
            a list of :class:`fiftyone.core.sample.Sample` objects
        """
        return [s for s in self[:num_samples]]

    def tail(self, num_samples=3):
        """Returns a list of the last few samples in the collection.

        If fewer than ``num_samples`` samples are in the collection, only
        the available samples are returned.

        Args:
            num_samples (3): the number of samples

        Returns:
            a list of :class:`fiftyone.core.sample.Sample` objects
        """
        return [s for s in self[-num_samples:]]

    def one(self, expr, exact=False):
        """Returns a single sample in this collection matching the expression.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            #
            # Get a sample by filepath
            #

            # A random filepath in the dataset
            filepath = dataset.take(1).first().filepath

            # Get sample by filepath
            sample = dataset.one(F("filepath") == filepath)

            #
            # Dealing with multiple matches
            #

            # Get a sample whose image is JPEG
            sample = dataset.one(F("filepath").ends_with(".jpg"))

            # Raises an error since there are multiple JPEGs
            dataset.one(F("filepath").ends_with(".jpg"), exact=True)

        Args:
            expr: a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that evaluates to ``True`` for the sample to match
            exact (False): whether to raise an error if multiple samples match
                the expression

        Returns:
            a :class:`fiftyone.core.sample.SampleView`
        """
        view = self.match(expr)
        matches = iter(view)

        try:
            sample = next(matches)
        except StopIteration:
            raise ValueError("No samples match the given expression")

        if exact:
            try:
                next(matches)
                raise ValueError(
                    "Expected one matching sample, but found %d matches"
                    % len(view)
                )
            except StopIteration:
                pass

        return sample

    def view(self):
        """Returns a :class:`fiftyone.core.view.DatasetView` containing the
        collection.

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        raise NotImplementedError("Subclass must implement view()")

    def iter_samples(self, progress=False):
        """Returns an iterator over the samples in the collection.

        Args:
            progress (False): whether to render a progress bar tracking the
                iterator's progress

        Returns:
            an iterator over :class:`fiftyone.core.sample.Sample` or
            :class:`fiftyone.core.sample.SampleView` instances
        """
        raise NotImplementedError("Subclass must implement iter_samples()")

    def _get_default_sample_fields(
        self, include_private=False, use_db_fields=False
    ):
        return fosa.get_default_sample_fields(
            include_private=include_private, use_db_fields=use_db_fields
        )

    def _get_default_frame_fields(
        self, include_private=False, use_db_fields=False
    ):
        return fofr.get_default_frame_fields(
            include_private=include_private, use_db_fields=use_db_fields
        )

    def get_field(self, path, include_private=False):
        """Returns the field instance of the provided path, or ``None`` if one
        does not exist.

        Args:
            path: a field path
            include_private (False): whether to include fields that start with
                ``_`` in the returned schema

        Returns:
            a :class:`fiftyone.core.fields.Field` instance or ``None``
        """
        keys = path.split(".")

        if not keys:
            return None

        if self.media_type == fom.VIDEO and keys[0] == "frames":
            schema = self.get_frame_field_schema(
                include_private=include_private
            )
            keys = keys[1:]
        else:
            schema = self.get_field_schema()

        field = None
        include_private and _add_mapped_fields_as_private_fields(schema)

        last = len(keys) - 1
        for idx, field_name in enumerate(keys):
            field = schema.get(field_name, None)
            if field is None:
                return None

            if idx != last and isinstance(field, fof.ListField):
                field = field.field

            if isinstance(field, fof.EmbeddedDocumentField):
                schema = field.get_field_schema()
                include_private and _add_mapped_fields_as_private_fields(
                    schema
                )

        return field

    def _resolve_field(self, path):
        keys = path.split(".")

        if not keys:
            return None

        resolved_keys = []
        if self.media_type == fom.VIDEO and keys[0] == "frames":
            schema = self.get_frame_field_schema()
            keys = keys[1:]
            resolved_keys.append("frames")
        else:
            schema = self.get_field_schema()

        _add_mapped_fields_as_private_fields(schema)

        last = len(keys) - 1
        for idx, field_name in enumerate(keys):
            field = schema.get(field_name, None)
            if field is None:
                return None

            resolved_keys.append(field.db_field or field_name)
            if idx != last and isinstance(field, fof.ListField):
                field = field.field

            if isinstance(field, fof.EmbeddedDocumentField):
                schema = field.get_field_schema()
                _add_mapped_fields_as_private_fields(schema)

        return ".".join(resolved_keys)

    def get_field_schema(
        self, ftype=None, embedded_doc_type=None, include_private=False
    ):
        """Returns a schema dictionary describing the fields of the samples in
        the collection.

        Args:
            ftype (None): an optional field type to which to restrict the
                returned schema. Must be a subclass of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): an optional embedded document type to
                which to restrict the returned schema. Must be a subclass of
                :class:`fiftyone.core.odm.BaseEmbeddedDocument`
            include_private (False): whether to include fields that start with
                ``_`` in the returned schema

        Returns:
             a dictionary mapping field names to field types
        """
        raise NotImplementedError("Subclass must implement get_field_schema()")

    def get_frame_field_schema(
        self, ftype=None, embedded_doc_type=None, include_private=False
    ):
        """Returns a schema dictionary describing the fields of the frames of
        the samples in the collection.

        Only applicable for video collections.

        Args:
            ftype (None): an optional field type to which to restrict the
                returned schema. Must be a subclass of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): an optional embedded document type to
                which to restrict the returned schema. Must be a subclass of
                :class:`fiftyone.core.odm.BaseEmbeddedDocument`
            include_private (False): whether to include fields that start with
                ``_`` in the returned schema

        Returns:
            a dictionary mapping field names to field types, or ``None`` if
            the collection is not a video collection
        """
        raise NotImplementedError(
            "Subclass must implement get_frame_field_schema()"
        )

    def make_unique_field_name(self, root=""):
        """Makes a unique field name with the given root name for the
        collection.

        Args:
            root (""): an optional root for the output field name

        Returns:
            the field name
        """
        if not root:
            root = _get_random_characters(6)

        fields = self.get_field_schema()

        field_name = root
        if field_name in fields:
            field_name += "_" + _get_random_characters(6)

        while field_name in fields:
            field_name += _get_random_characters(1)

        return field_name

    def has_sample_field(self, field_name):
        """Determines whether the collection has a sample field with the given
        name.

        Args:
            field_name: the field name

        Returns:
            True/False
        """
        return field_name in self.get_field_schema()

    def has_frame_field(self, field_name):
        """Determines whether the collection has a frame-level field with the
        given name.

        Args:
            field_name: the field name

        Returns:
            True/False
        """
        if self.media_type != fom.VIDEO:
            return False

        return field_name in self.get_frame_field_schema()

    def validate_fields_exist(self, fields, include_private=False):
        """Validates that the collection has field(s) with the given name(s).

        If embedded field names are provided, only the root field is checked.

        Args:
            fields: a field name or iterable of field names
            include_private (False): whether to include private fields when
                checking for existence

        Raises:
            ValueError: if one or more of the fields do not exist
        """
        fields, frame_fields = self._split_frame_fields(fields)

        if fields:
            existing_fields = set(
                self.get_field_schema(include_private=include_private).keys()
            )
            if self.media_type == fom.VIDEO:
                existing_fields.add("frames")

            for field in fields:
                # We only validate that the root field exists
                field_name = field.split(".", 1)[0]
                if field_name not in existing_fields:
                    raise ValueError("Field '%s' does not exist" % field_name)

        if frame_fields:
            existing_frame_fields = set(
                self.get_frame_field_schema(
                    include_private=include_private
                ).keys()
            )

            for field in frame_fields:
                # We only validate that the root field exists
                field_name = field.split(".", 1)[0]
                if field_name not in existing_frame_fields:
                    raise ValueError(
                        "Frame field '%s' does not exist" % field_name
                    )

    def validate_field_type(
        self, field_name, ftype, embedded_doc_type=None, subfield=None
    ):
        """Validates that the collection has a field of the given type.

        Args:
            field_name: the field name
            ftype: the expected field type. Must be a subclass of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): the
                :class:`fiftyone.core.odm.BaseEmbeddedDocument` type of the
                field. Used only when ``ftype`` is an embedded
                :class:`fiftyone.core.fields.EmbeddedDocumentField`
            subfield (None): the type of the contained field. Used only when
                ``ftype`` is a :class:`fiftyone.core.fields.ListField` or
                :class:`fiftyone.core.fields.DictField`

        Raises:
            ValueError: if the field does not exist or does not have the
                expected type
        """
        field_name, is_frame_field = self._handle_frame_field(field_name)
        if is_frame_field:
            schema = self.get_frame_field_schema()
        else:
            schema = self.get_field_schema()

        if field_name not in schema:
            ftype = "Frame field" if is_frame_field else "Field"
            raise ValueError(
                "%s '%s' does not exist on collection '%s'"
                % (ftype, field_name, self.name)
            )

        field = schema[field_name]

        if embedded_doc_type is not None:
            if not isinstance(field, fof.EmbeddedDocumentField) or (
                field.document_type is not embedded_doc_type
            ):
                raise ValueError(
                    "Field '%s' must be an instance of %s; found %s"
                    % (field_name, ftype(embedded_doc_type), field)
                )
        elif subfield is not None:
            if not isinstance(field, (fof.ListField, fof.DictField)):
                raise ValueError(
                    "Field type %s must be an instance of %s when a subfield "
                    "is provided" % (ftype, (fof.ListField, fof.DictField))
                )

            if not isinstance(field, ftype) or not isinstance(
                field.field, subfield
            ):
                raise ValueError(
                    "Field '%s' must be an instance of %s; found %s"
                    % (field_name, ftype(field=subfield()), field)
                )
        else:
            if not isinstance(field, ftype):
                raise ValueError(
                    "Field '%s' must be an instance of %s; found %s"
                    % (field_name, ftype, field)
                )

    def tag_samples(self, tags):
        """Adds the tag(s) to all samples in this collection, if necessary.

        Args:
            tags: a tag or iterable of tags
        """
        if etau.is_str(tags):
            tags = [tags]
        else:
            tags = list(tags)

        def _add_tags(_tags):
            if not _tags:
                return tags

            for tag in tags:
                if tag not in _tags:
                    _tags.append(tag)

            return _tags

        self._edit_sample_tags(_add_tags)

    def untag_samples(self, tags):
        """Removes the tag(s) from all samples in this collection, if
        necessary.

        Args:
            tags: a tag or iterable of tags
        """
        if etau.is_str(tags):
            tags = [tags]
        else:
            tags = list(tags)

        def _remove_tags(_tags):
            if not _tags:
                return _tags

            return [t for t in _tags if t not in tags]

        self._edit_sample_tags(_remove_tags)

    def _edit_sample_tags(self, edit_fcn):
        tags = self.values("tags")
        tags = _transform_values(tags, edit_fcn, level=1)
        self.set_values("tags", tags)

    def count_sample_tags(self):
        """Counts the occurrences of sample tags in this collection.

        Returns:
            a dict mapping tags to counts
        """
        return self.count_values("tags")

    def tag_labels(self, tags, label_fields=None):
        """Adds the tag(s) to all labels in the specified label field(s) of
        this collection, if necessary.

        Args:
            tags: a tag or iterable of tags
            label_fields (None): an optional name or iterable of names of
                :class:`fiftyone.core.labels.Label` fields. By default, all
                label fields are used
        """
        if etau.is_str(tags):
            tags = [tags]
        else:
            tags = list(tags)

        def _add_tags(_tags):
            if not _tags:
                return tags

            for tag in tags:
                if tag not in _tags:
                    _tags.append(tag)

            return _tags

        self._edit_label_tags(_add_tags, label_fields=label_fields)

    def untag_labels(self, tags, label_fields=None):
        """Removes the tag from all labels in the specified label field(s) of
        this collection, if necessary.

        Args:
            tags: a tag or iterable of tags
            label_fields (None): an optional name or iterable of names of
                :class:`fiftyone.core.labels.Label` fields. By default, all
                label fields are used
        """
        if etau.is_str(tags):
            tags = [tags]
        else:
            tags = list(tags)

        def _remove_tags(_tags):
            if not _tags:
                return _tags

            return [t for t in _tags if t not in tags]

        self._edit_label_tags(_remove_tags, label_fields=label_fields)

    def _edit_label_tags(self, edit_fcn, label_fields=None):
        if label_fields is None:
            label_fields = self._get_label_fields()
        elif etau.is_str(label_fields):
            label_fields = [label_fields]

        for label_field in label_fields:
            label_type, tags_path = self._get_label_field_path(
                label_field, "tags"
            )

            level = 1
            level += issubclass(label_type, fol._LABEL_LIST_FIELDS)
            level += self._is_frame_field(tags_path)

            # Omit samples/frames with no labels
            view = self.exists(label_field)

            tags = view.values(tags_path)
            tags = _transform_values(tags, edit_fcn, level=level)
            view.set_values(tags_path, tags)

    def _get_selected_labels(self, ids=None, tags=None, fields=None):
        if ids is not None or tags is not None:
            view = self.select_labels(ids=ids, tags=tags, fields=fields)
        else:
            view = self

        if fields is None:
            label_fields = view._get_label_fields()
        elif etau.is_str(fields):
            label_fields = [fields]
        else:
            label_fields = fields

        if not label_fields:
            return []

        paths = ["id"]
        is_list_fields = []
        is_frame_fields = []
        for label_field in label_fields:
            label_type, id_path = view._get_label_field_path(label_field, "id")
            is_list_field = issubclass(label_type, fol._LABEL_LIST_FIELDS)
            is_frame_field = view._is_frame_field(label_field)

            paths.append(id_path)
            is_list_fields.append(is_list_field)
            is_frame_fields.append(is_frame_field)

        has_frame_fields = any(is_frame_fields)

        if has_frame_fields:
            paths.insert(0, "frames.frame_number")

        results = list(view.values(paths))

        if has_frame_fields:
            frame_numbers = results.pop(0)

        sample_ids = results[0]
        all_label_ids = results[1:]

        labels = []

        for label_field, label_ids, is_list_field, is_frame_field in zip(
            label_fields, all_label_ids, is_list_fields, is_frame_fields
        ):
            if is_frame_field:
                for sample_id, sample_frame_numbers, sample_label_ids in zip(
                    sample_ids, frame_numbers, label_ids
                ):
                    for frame_number, frame_label_ids in zip(
                        sample_frame_numbers, sample_label_ids
                    ):
                        if not frame_label_ids:
                            continue

                        if not is_list_field:
                            frame_label_ids = [frame_label_ids]

                        for label_id in frame_label_ids:
                            labels.append(
                                {
                                    "sample_id": sample_id,
                                    "frame_number": frame_number,
                                    "field": label_field,
                                    "label_id": label_id,
                                }
                            )
            else:
                for sample_id, sample_label_ids in zip(sample_ids, label_ids):
                    if not sample_label_ids:
                        continue

                    if not is_list_field:
                        sample_label_ids = [sample_label_ids]

                    for label_id in sample_label_ids:
                        labels.append(
                            {
                                "sample_id": sample_id,
                                "field": label_field,
                                "label_id": label_id,
                            }
                        )

        return labels

    def _get_label_ids(self, tags=None, fields=None):
        labels = self._get_selected_labels(tags=tags, fields=fields)
        return [l["label_id"] for l in labels]

    def count_label_tags(self, label_fields=None):
        """Counts the occurrences of all label tags in the specified label
        field(s) of this collection.

        Args:
            label_fields (None): an optional name or iterable of names of
                :class:`fiftyone.core.labels.Label` fields. By default, all
                label fields are used

        Returns:
            a dict mapping tags to counts
        """
        if label_fields is None:
            label_fields = self._get_label_fields()
        elif etau.is_str(label_fields):
            label_fields = [label_fields]

        aggregations = []
        for label_field in label_fields:
            _, tags_path = self._get_label_field_path(label_field, "tags")
            aggregations.append(foa.CountValues(tags_path))

        counts = defaultdict(int)
        for result in self.aggregate(aggregations):
            for tag, count in result.items():
                counts[tag] += count

        return dict(counts)

    def split_labels(self, in_field, out_field, filter=None):
        """Splits the labels from the given input field into the given output
        field of the collection.

        This method is typically invoked on a view that has filtered the
        contents of the specified input field, so that the labels in the view
        are moved to the output field and the remaining labels are left
        in-place.

        Alternatively, you can provide a ``filter`` expression that selects the
        labels of interest to move in this collection.

        Args:
            in_field: the name of the input label field
            out_field: the name of the output label field, which will be
                created if necessary
            filter (None): a boolean
                :class:`fiftyone.core.expressions.ViewExpression` to apply to
                each label in the input field to determine whether to move it
                (True) or leave it (False)
        """
        if filter is not None:
            move_view = self.filter_labels(in_field, filter)
        else:
            move_view = self

        move_view.merge_labels(in_field, out_field)

    def merge_labels(self, in_field, out_field):
        """Merges the labels from the given input field into the given output
        field of the collection.

        If this collection is a dataset, the input field is deleted after the
        merge.

        If this collection is a view, the input field will still exist on the
        underlying dataset but will only contain the labels not present in this
        view.

        Args:
            in_field: the name of the input label field
            out_field: the name of the output label field, which will be
                created if necessary
        """
        if not isinstance(self, fod.Dataset):
            # The label IDs that we'll need to delete from `in_field`
            _, id_path = self._get_label_field_path(in_field, "id")
            del_ids = self.values(id_path, unwind=True)

        dataset = self._dataset
        dataset.merge_samples(
            self,
            key_field="id",
            skip_existing=False,
            insert_new=False,
            fields={in_field: out_field},
            merge_lists=True,
            overwrite=True,
            expand_schema=True,
            include_info=False,
        )

        if isinstance(self, fod.Dataset):
            dataset.delete_sample_field(in_field)
        else:
            dataset.delete_labels(ids=del_ids, fields=in_field)

    def set_values(
        self,
        field_name,
        values,
        key_field=None,
        skip_none=False,
        expand_schema=True,
        _allow_missing=False,
        _sample_ids=None,
        _frame_ids=None,
    ):
        """Sets the field or embedded field on each sample or frame in the
        collection to the given values.

        When setting a sample field ``embedded.field.name``, this function is
        an efficient implementation of the following loop::

            for sample, value in zip(sample_collection, values):
                sample.embedded.field.name = value
                sample.save()

        When setting an embedded field that contains an array, say
        ``embedded.array.field.name``, this function is an efficient
        implementation of the following loop::

            for sample, array_values in zip(sample_collection, values):
                for doc, value in zip(sample.embedded.array, array_values):
                    doc.field.name = value

                sample.save()

        When setting a frame field ``frames.embedded.field.name``, this
        function is an efficient implementation of the following loop::

            for sample, frame_values in zip(sample_collection, values):
                for frame, value in zip(sample.frames.values(), frame_values):
                    frame.embedded.field.name = value

                sample.save()

        When setting an embedded frame field that contains an array, say
        ``frames.embedded.array.field.name``, this function is an efficient
        implementation of the following loop::

            for sample, frame_values in zip(sample_collection, values):
                for frame, array_values in zip(sample.frames.values(), frame_values):
                    for doc, value in zip(frame.embedded.array, array_values):
                        doc.field.name = value

                sample.save()

        When ``values`` is a dict mapping keys in ``key_field`` to values, then
        this function is an efficient implementation of the following loop::

            for key, value in values.items():
                sample = sample_collection.one(F(key_field) == key)
                sample.embedded.field.name = value
                sample.save()

        When setting frame fields using the dict ``values`` syntax, each value
        in ``values`` may either be a list corresponding to the frames of the
        sample matching the given key, or each value may itself be a dict
        mapping frame numbers to values. In the latter case, this function
        is an efficient implementation of the following loop::

            for key, frame_values in values.items():
                sample = sample_collection.one(F(key_field) == key)
                for frame_number, value in frame_values.items():
                    frame = sample[frame_number]
                    frame.embedded.field.name = value

                sample.save()

        You can also update list fields using the dict ``values`` syntax, in
        which case this method is an efficient implementation of the natural
        nested list modifications of the above sample/frame loops.

        The dual function of :meth:`set_values` is :meth:`values`, which can be
        used to efficiently extract the values of a field or embedded field of
        all samples in a collection as lists of values in the same structure
        expected by this method.

        .. note::

            If the values you are setting can be described by a
            :class:`fiftyone.core.expressions.ViewExpression` applied to the
            existing dataset contents, then consider using :meth:`set_field` +
            :meth:`save` for an even more efficient alternative to explicitly
            iterating over the dataset or calling :meth:`values` +
            :meth:`set_values` to perform the update in-memory.

        Examples::

            import random

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            #
            # Create a new sample field
            #

            values = [random.random() for _ in range(len(dataset))]
            dataset.set_values("random", values)

            print(dataset.bounds("random"))

            #
            # Add a tag to all low confidence labels
            #

            view = dataset.filter_labels("predictions", F("confidence") < 0.06)

            detections = view.values("predictions.detections")
            for sample_detections in detections:
                for detection in sample_detections:
                    detection.tags.append("low_confidence")

            view.set_values("predictions.detections", detections)

            print(dataset.count_label_tags())

        Args:
            field_name: a field or ``embedded.field.name``
            values: an iterable of values, one for each sample in the
                collection. When setting frame fields, each element can either
                be an iterable of values (one for each existing frame of the
                sample) or a dict mapping frame numbers to values. If
                ``field_name`` contains array fields, the corresponding
                elements of ``values`` must be arrays of the same lengths. This
                argument can also be a dict mapping keys to values (each value
                as described previously), in which case the keys are used to
                match samples by their ``key_field``
            key_field (None): a key field to use when choosing which samples to
                update when ``values`` is a dict
            skip_none (False): whether to treat None data in ``values`` as
                missing data that should not be set
            expand_schema (True): whether to dynamically add new sample/frame
                fields encountered to the dataset schema. If False, an error is
                raised if the root ``field_name`` does not exist
        """
        if isinstance(values, dict):
            if key_field is None:
                raise ValueError(
                    "You must provide a `key_field` when `values` is a dict"
                )

            _sample_ids, values = _parse_values_dict(self, key_field, values)

        is_frame_field = self._is_frame_field(field_name)

        if is_frame_field:
            _frame_ids, values = _parse_frame_values_dicts(
                self, _sample_ids, values
            )

        if expand_schema and self.get_field(field_name) is None:
            self._expand_schema_from_values(field_name, values)

        field_name, _, list_fields, _, id_to_str = self._parse_field_name(
            field_name, omit_terminal_lists=True, allow_missing=_allow_missing
        )

        to_mongo = None
        if id_to_str:
            to_mongo = lambda _id: ObjectId(_id)
        else:
            field_type = self.get_field(field_name)
            if field_type is not None:
                to_mongo = field_type.to_mongo

        # Setting an entire label list document whose label elements have been
        # filtered is not allowed because this would delete the filtered labels
        if (
            isinstance(field_type, fof.EmbeddedDocumentField)
            and issubclass(field_type.document_type, fol._LABEL_LIST_FIELDS)
            and isinstance(self, fov.DatasetView)
        ):
            label_type = field_type.document_type
            list_field = label_type._LABEL_LIST_FIELD
            path = field_name + "." + list_field
            if is_frame_field:
                path = self._FRAMES_PREFIX + path

            # pylint: disable=no-member
            if path in self._get_filtered_fields():
                msg = (
                    "Detected a label list field '%s' with filtered elements; "
                    "only the list elements will be updated"
                ) % path
                warnings.warn(msg)

                fcn = lambda l: l[list_field]
                level = 1 + is_frame_field
                list_values = _transform_values(values, fcn, level=level)

                return self.set_values(
                    path,
                    list_values,
                    key_field=key_field,
                    skip_none=skip_none,
                    expand_schema=expand_schema,
                    _allow_missing=_allow_missing,
                    _sample_ids=_sample_ids,
                    _frame_ids=_frame_ids,
                )

        # If we're directly updating a document list field of a dataset view,
        # then update list elements by ID in case the field has been filtered
        if (
            isinstance(field_type, fof.ListField)
            and isinstance(field_type.field, fof.EmbeddedDocumentField)
            and isinstance(self, fov.DatasetView)
        ):
            list_fields = sorted(set(list_fields + [field_name]))

        if is_frame_field:
            self._set_frame_values(
                field_name,
                values,
                list_fields,
                sample_ids=_sample_ids,
                frame_ids=_frame_ids,
                to_mongo=to_mongo,
                skip_none=skip_none,
            )
        else:
            self._set_sample_values(
                field_name,
                values,
                list_fields,
                sample_ids=_sample_ids,
                to_mongo=to_mongo,
                skip_none=skip_none,
            )

    def _expand_schema_from_values(self, field_name, values):
        field_name, is_frame_field = self._handle_frame_field(field_name)
        root = field_name.split(".", 1)[0]

        if is_frame_field:
            schema = self._dataset.get_frame_field_schema(include_private=True)

            if root in schema:
                return

            if root != field_name:
                raise ValueError(
                    "Cannot infer an appropriate type for new frame "
                    "field '%s' when setting embedded field '%s'"
                    % (root, field_name)
                )

            value = _get_non_none_value(itertools.chain.from_iterable(values))

            if value is None:
                if list(values):
                    raise ValueError(
                        "Cannot infer an appropriate type for new frame "
                        "field '%s' because all provided values are None"
                        % field_name
                    )
                else:
                    raise ValueError(
                        "Cannot infer an appropriate type for new frame "
                        "field '%s' from empty values" % field_name
                    )

            self._dataset._add_implied_frame_field(field_name, value)
        else:
            schema = self._dataset.get_field_schema(include_private=True)

            if root in schema:
                return

            if root != field_name:
                raise ValueError(
                    "Cannot infer an appropriate type for new sample "
                    "field '%s' when setting embedded field '%s'"
                    % (root, field_name)
                )

            value = _get_non_none_value(values)

            if value is None:
                if list(values):
                    raise ValueError(
                        "Cannot infer an appropriate type for new sample "
                        "field '%s' because all provided values are None"
                        % field_name
                    )
                else:
                    raise ValueError(
                        "Cannot infer an appropriate type for new sample "
                        "field '%s' from empty values" % field_name
                    )

            self._dataset._add_implied_sample_field(field_name, value)

    def _set_sample_values(
        self,
        field_name,
        values,
        list_fields,
        sample_ids=None,
        to_mongo=None,
        skip_none=False,
    ):
        if len(list_fields) > 1:
            raise ValueError(
                "At most one array field can be unwound when setting values"
            )

        if list_fields:
            list_field = list_fields[0]
            elem_id_field = list_field + "._id"

            if sample_ids is not None:
                view = self.select(sample_ids, ordered=True)
                sample_ids = [ObjectId(_id) for _id in sample_ids]
                elem_ids = view.values(elem_id_field)
            else:
                sample_ids, elem_ids = self.values(["_id", elem_id_field])

            self._set_list_values_by_id(
                field_name,
                sample_ids,
                elem_ids,
                values,
                list_field,
                to_mongo=to_mongo,
                skip_none=skip_none,
            )
        else:
            if sample_ids is not None:
                sample_ids = [ObjectId(_id) for _id in sample_ids]
            else:
                sample_ids = self.values("_id")

            self._set_doc_values(
                field_name,
                sample_ids,
                values,
                to_mongo=to_mongo,
                skip_none=skip_none,
            )

    def _set_frame_values(
        self,
        field_name,
        values,
        list_fields,
        sample_ids=None,
        frame_ids=None,
        to_mongo=None,
        skip_none=False,
    ):
        if len(list_fields) > 1:
            raise ValueError(
                "At most one array field can be unwound when setting values"
            )

        if sample_ids is not None:
            view = self.select(sample_ids, ordered=True)
        else:
            view = self

        if list_fields:
            list_field = list_fields[0]
            elem_id_field = "frames." + list_field + "._id"

            if frame_ids is None:
                frame_ids, elem_ids = view.values(
                    ["frames._id", elem_id_field]
                )
            else:
                elem_ids = view.values(elem_id_field)

            frame_ids = itertools.chain.from_iterable(frame_ids)
            elem_ids = itertools.chain.from_iterable(elem_ids)
            values = itertools.chain.from_iterable(values)

            self._set_list_values_by_id(
                field_name,
                frame_ids,
                elem_ids,
                values,
                list_field,
                to_mongo=to_mongo,
                skip_none=skip_none,
                frames=True,
            )
        else:
            if frame_ids is None:
                frame_ids = view.values("frames._id")

            frame_ids = itertools.chain.from_iterable(frame_ids)
            values = itertools.chain.from_iterable(values)

            self._set_doc_values(
                field_name,
                frame_ids,
                values,
                to_mongo=to_mongo,
                skip_none=skip_none,
                frames=True,
            )

    def _set_doc_values(
        self,
        field_name,
        ids,
        values,
        to_mongo=None,
        skip_none=False,
        frames=False,
    ):
        ops = []
        for _id, value in zip(ids, values):
            if value is None and skip_none:
                continue

            if etau.is_str(_id):
                _id = ObjectId(_id)

            if to_mongo is not None:
                value = to_mongo(value)

            ops.append(UpdateOne({"_id": _id}, {"$set": {field_name: value}}))

        self._dataset._bulk_write(ops, frames=frames)

    def _set_list_values_by_id(
        self,
        field_name,
        ids,
        elem_ids,
        values,
        list_field,
        to_mongo=None,
        skip_none=False,
        frames=False,
    ):
        root = list_field
        leaf = field_name[len(root) + 1 :]
        elem_id = root + "._id"
        if leaf:
            elem = root + ".$." + leaf
        else:
            elem = root + ".$"

        ops = []
        for _id, _elem_ids, _values in zip(ids, elem_ids, values):
            if not _elem_ids:
                continue

            if etau.is_str(_id):
                _id = ObjectId(_id)

            for _elem_id, value in zip(_elem_ids, _values):
                if value is None and skip_none:
                    continue

                if to_mongo is not None:
                    value = to_mongo(value)

                if _elem_id is None:
                    raise ValueError(
                        "Can only set values of array documents with IDs"
                    )

                if etau.is_str(_elem_id):
                    _elem_id = ObjectId(_elem_id)

                ops.append(
                    UpdateOne(
                        {"_id": _id, elem_id: _elem_id},
                        {"$set": {elem: value}},
                    )
                )

        self._dataset._bulk_write(ops, frames=frames)

    def _set_labels(self, field_name, sample_ids, label_docs):
        label_type = self._get_label_field_type(field_name)
        field_name, is_frame_field = self._handle_frame_field(field_name)

        ops = []
        if issubclass(label_type, fol._LABEL_LIST_FIELDS):
            root = field_name + "." + label_type._LABEL_LIST_FIELD
            elem_id = root + "._id"
            set_path = root + ".$"

            for _id, _docs in zip(sample_ids, label_docs):
                if not _docs:
                    continue

                if etau.is_str(_id):
                    _id = ObjectId(_id)

                if not isinstance(_docs, (list, tuple)):
                    _docs = [_docs]

                for doc in _docs:
                    ops.append(
                        UpdateOne(
                            {"_id": _id, elem_id: doc["_id"]},
                            {"$set": {set_path: doc}},
                        )
                    )
        else:
            elem_id = field_name + "._id"

            for _id, doc in zip(sample_ids, label_docs):
                if etau.is_str(_id):
                    _id = ObjectId(_id)

                ops.append(
                    UpdateOne(
                        {"_id": _id, elem_id: doc["_id"]},
                        {"$set": {field_name: doc}},
                    )
                )

        self._dataset._bulk_write(ops, frames=is_frame_field)

    def _delete_labels(self, ids, fields=None):
        self._dataset.delete_labels(ids=ids, fields=fields)

    def compute_metadata(
        self, overwrite=False, num_workers=None, skip_failures=True
    ):
        """Populates the ``metadata`` field of all samples in the collection.

        Any samples with existing metadata are skipped, unless
        ``overwrite == True``.

        Args:
            overwrite (False): whether to overwrite existing metadata
            num_workers (None): the number of processes to use. By default,
                ``multiprocessing.cpu_count()`` is used
            skip_failures (True): whether to gracefully continue without
                raising an error if metadata cannot be computed for a sample
        """
        fomt.compute_metadata(
            self,
            overwrite=overwrite,
            num_workers=num_workers,
            skip_failures=skip_failures,
        )

    def apply_model(
        self,
        model,
        label_field="predictions",
        confidence_thresh=None,
        store_logits=False,
        batch_size=None,
        num_workers=None,
        skip_failures=True,
        **kwargs,
    ):
        """Applies the :class:`FiftyOne model <fiftyone.core.models.Model>` or
        :class:`Lightning Flash model <flash:flash.core.model.Task>` to the
        samples in the collection.

        This method supports all of the following cases:

        -   Applying an image :class:`fiftyone.core.models.Model` to an image
            collection
        -   Applying an image :class:`fiftyone.core.models.Model` to the frames
            of a video collection
        -   Applying a video :class:`fiftyone.core.models.Model` to a video
            collection
        -   Applying a :class:`flash:flash.core.model.Task` to an image or
            video collection

        Args:
            model: a :class:`fiftyone.core.models.Model` or
                :class:`flash:flash.core.model.Task`
            label_field ("predictions"): the name of the field in which to
                store the model predictions. When performing inference on video
                frames, the "frames." prefix is optional
            confidence_thresh (None): an optional confidence threshold to apply
                to any applicable labels generated by the model
            store_logits (False): whether to store logits for the model
                predictions. This is only supported when the provided ``model``
                has logits, ``model.has_logits == True``
            batch_size (None): an optional batch size to use, if the model
                supports batching
            num_workers (None): the number of workers for the
                :class:`torch:torch.utils.data.DataLoader` to use. Only
                applicable for Torch-based models
            skip_failures (True): whether to gracefully continue without
                raising an error if predictions cannot be generated for a
                sample. Only applicable to :class:`fiftyone.core.models.Model`
                instances
            **kwargs: optional model-specific keyword arguments passed through
                to the underlying inference implementation
        """
        fomo.apply_model(
            self,
            model,
            label_field=label_field,
            confidence_thresh=confidence_thresh,
            store_logits=store_logits,
            batch_size=batch_size,
            num_workers=num_workers,
            skip_failures=skip_failures,
            **kwargs,
        )

    def compute_embeddings(
        self,
        model,
        embeddings_field=None,
        batch_size=None,
        num_workers=None,
        skip_failures=True,
        **kwargs,
    ):
        """Computes embeddings for the samples in the collection using the
        given :class:`FiftyOne model <fiftyone.core.models.Model>` or
        :class:`Lightning Flash model <flash:flash.core.model.Task>`.

        This method supports all the following cases:

        -   Using an image :class:`fiftyone.core.models.Model` to compute
            embeddings for an image collection
        -   Using an image :class:`fiftyone.core.models.Model` to compute frame
            embeddings for a video collection
        -   Using a video :class:`fiftyone.core.models.Model` to compute
            embeddings for a video collection
        -   Using an :ref:`ImageEmbedder <flash:image_embedder>` to compute
            embeddings for an image collection

        When using a :class:`FiftyOne model <fiftyone.core.models.Model>`, the
        model must expose embeddings, i.e.,
        :meth:`fiftyone.core.models.Model.has_embeddings` must return ``True``.

        If an ``embeddings_field`` is provided, the embeddings are saved to the
        samples; otherwise, the embeddings are returned in-memory.

        Args:
            model: a :class:`fiftyone.core.models.Model` or
                :class:`flash:flash.core.model.Task`
            embeddings_field (None): the name of a field in which to store the
                embeddings. When computing video frame embeddings, the
                "frames." prefix is optional
            batch_size (None): an optional batch size to use, if the model
                supports batching
            num_workers (None): the number of workers for the
                :class:`torch:torch.utils.data.DataLoader` to use. Only
                applicable for Torch-based models
            skip_failures (True): whether to gracefully continue without
                raising an error if embeddings cannot be generated for a
                sample. Only applicable to :class:`fiftyone.core.models.Model`
                instances
            **kwargs: optional model-specific keyword arguments passed through
                to the underlying inference implementation

        Returns:
            one of the following:

            -   ``None``, if an ``embeddings_field`` is provided
            -   a ``num_samples x num_dim`` array of embeddings, when computing
                embeddings for image/video collections with image/video models,
                respectively, and no ``embeddings_field`` is provided. If
                ``skip_failures`` is ``True`` and any errors are detected, a
                list of length ``num_samples`` is returned instead containing
                all successfully computed embedding vectors along with ``None``
                entries for samples for which embeddings could not be computed
            -   a dictionary mapping sample IDs to ``num_frames x num_dim``
                arrays of embeddings, when computing frame embeddings for video
                collections using an image model. If ``skip_failures`` is
                ``True`` and any errors are detected, the values of this
                dictionary will contain arrays of embeddings for all frames
                1, 2, ... until the error occurred, or ``None`` if no
                embeddings were computed at all
        """
        return fomo.compute_embeddings(
            self,
            model,
            embeddings_field=embeddings_field,
            batch_size=batch_size,
            num_workers=num_workers,
            skip_failures=skip_failures,
            **kwargs,
        )

    def compute_patch_embeddings(
        self,
        model,
        patches_field,
        embeddings_field=None,
        force_square=False,
        alpha=None,
        handle_missing="skip",
        batch_size=None,
        num_workers=None,
        skip_failures=True,
    ):
        """Computes embeddings for the image patches defined by
        ``patches_field`` of the samples in the collection using the given
        :class:`fiftyone.core.models.Model`.

        This method supports all the following cases:

        -   Using an image model to compute patch embeddings for an image
            collection
        -   Using an image model to compute frame patch embeddings for a video
            collection

        The ``model`` must expose embeddings, i.e.,
        :meth:`fiftyone.core.models.Model.has_embeddings` must return ``True``.

        If an ``embeddings_field`` is provided, the embeddings are saved to the
        samples; otherwise, the embeddings are returned in-memory.

        Args:
            model: a :class:`fiftyone.core.models.Model`
            patches_field: the name of the field defining the image patches in
                each sample to embed. Must be of type
                :class:`fiftyone.core.labels.Detection`,
                :class:`fiftyone.core.labels.Detections`,
                :class:`fiftyone.core.labels.Polyline`, or
                :class:`fiftyone.core.labels.Polylines`. When computing video
                frame embeddings, the "frames." prefix is optional
            embeddings_field (None): the name of a field in which to store the
                embeddings. When computing video frame embeddings, the
                "frames." prefix is optional
            force_square (False): whether to minimally manipulate the patch
                bounding boxes into squares prior to extraction
            alpha (None): an optional expansion/contraction to apply to the
                patches before extracting them, in ``[-1, inf)``. If provided,
                the length and width of the box are expanded (or contracted,
                when ``alpha < 0``) by ``(100 * alpha)%``. For example, set
                ``alpha = 1.1`` to expand the boxes by 10%, and set
                ``alpha = 0.9`` to contract the boxes by 10%
            handle_missing ("skip"): how to handle images with no patches.
                Supported values are:

                -   "skip": skip the image and assign its embedding as ``None``
                -   "image": use the whole image as a single patch
                -   "error": raise an error

            batch_size (None): an optional batch size to use, if the model
                supports batching
            num_workers (None): the number of workers for the
                :class:`torch:torch.utils.data.DataLoader` to use. Only
                applicable for Torch-based models
            skip_failures (True): whether to gracefully continue without
                raising an error if embeddings cannot be generated for a sample

        Returns:
            one of the following:

            -   ``None``, if an ``embeddings_field`` is provided
            -   a dict mapping sample IDs to ``num_patches x num_dim`` arrays
                of patch embeddings, when computing patch embeddings for image
                collections and no ``embeddings_field`` is provided. If
                ``skip_failures`` is ``True`` and any errors are detected, this
                dictionary will contain ``None`` values for any samples for
                which embeddings could not be computed
            -   a dict of dicts mapping sample IDs to frame numbers to
                ``num_patches x num_dim`` arrays of patch embeddings, when
                computing patch embeddings for the frames of video collections
                and no ``embeddings_field`` is provided. If ``skip_failures``
                is ``True`` and any errors are detected, this nested dict will
                contain missing or ``None`` values to indicate uncomputable
                embeddings
        """
        return fomo.compute_patch_embeddings(
            self,
            model,
            patches_field,
            embeddings_field=embeddings_field,
            batch_size=batch_size,
            num_workers=num_workers,
            force_square=force_square,
            alpha=alpha,
            handle_missing=handle_missing,
            skip_failures=skip_failures,
        )

    def evaluate_regressions(
        self,
        pred_field,
        gt_field="ground_truth",
        eval_key=None,
        missing=None,
        method="simple",
        **kwargs,
    ):
        """Evaluates the regression predictions in this collection with respect
        to the specified ground truth values.

        You can customize the evaluation method by passing additional
        parameters for the method's config class as ``kwargs``.

        The supported ``method`` values and their associated configs are:

        -   ``"simple"``: :class:`fiftyone.utils.eval.regression.SimpleEvaluationConfig`

        If an ``eval_key`` is specified, then this method will record some
        statistics on each sample:

        -   When evaluating sample-level fields, an ``eval_key`` field will be
            populated on each sample recording the error of that sample's
            prediction.

        -   When evaluating frame-level fields, an ``eval_key`` field will be
            populated on each frame recording the error of that frame's
            prediction. In addition, an ``eval_key`` field will be populated on
            each sample that records the average error of the frame predictions
            of the sample.

        Args:
            pred_field: the name of the field containing the predicted
                :class:`fiftyone.core.labels.Regression` instances
            gt_field ("ground_truth"): the name of the field containing the
                ground truth :class:`fiftyone.core.labels.Regression` instances
            eval_key (None): a string key to use to refer to this evaluation
            missing (None): a missing value. Any None-valued regressions are
                given this value for results purposes
            method ("simple"): a string specifying the evaluation method to use.
                Supported values are ``("simple")``
            **kwargs: optional keyword arguments for the constructor of the
                :class:`fiftyone.utils.eval.regression.RegressionEvaluationConfig`
                being used

        Returns:
            a :class:`fiftyone.utils.eval.regression.RegressionResults`
        """
        return foue.evaluate_regressions(
            self,
            pred_field,
            gt_field=gt_field,
            eval_key=eval_key,
            missing=missing,
            method=method,
            **kwargs,
        )

    def evaluate_classifications(
        self,
        pred_field,
        gt_field="ground_truth",
        eval_key=None,
        classes=None,
        missing=None,
        method="simple",
        **kwargs,
    ):
        """Evaluates the classification predictions in this collection with
        respect to the specified ground truth labels.

        By default, this method simply compares the ground truth and prediction
        for each sample, but other strategies such as binary evaluation and
        top-k matching can be configured via the ``method`` parameter.

        You can customize the evaluation method by passing additional
        parameters for the method's config class as ``kwargs``.

        The supported ``method`` values and their associated configs are:

        -   ``"simple"``: :class:`fiftyone.utils.eval.classification.SimpleEvaluationConfig`
        -   ``"top-k"``: :class:`fiftyone.utils.eval.classification.TopKEvaluationConfig`
        -   ``"binary"``: :class:`fiftyone.utils.eval.classification.BinaryEvaluationConfig`

        If an ``eval_key`` is specified, then this method will record some
        statistics on each sample:

        -   When evaluating sample-level fields, an ``eval_key`` field will be
            populated on each sample recording whether that sample's prediction
            is correct.

        -   When evaluating frame-level fields, an ``eval_key`` field will be
            populated on each frame recording whether that frame's prediction
            is correct. In addition, an ``eval_key`` field will be populated on
            each sample that records the average accuracy of the frame
            predictions of the sample.

        Args:
            pred_field: the name of the field containing the predicted
                :class:`fiftyone.core.labels.Classification` instances
            gt_field ("ground_truth"): the name of the field containing the
                ground truth :class:`fiftyone.core.labels.Classification`
                instances
            eval_key (None): a string key to use to refer to this evaluation
            classes (None): the list of possible classes. If not provided,
                classes are loaded from
                :meth:`fiftyone.core.dataset.Dataset.classes` or
                :meth:`fiftyone.core.dataset.Dataset.default_classes` if
                possible, or else the observed ground truth/predicted labels
                are used
            missing (None): a missing label string. Any None-valued labels
                are given this label for results purposes
            method ("simple"): a string specifying the evaluation method to use.
                Supported values are ``("simple", "binary", "top-k")``
            **kwargs: optional keyword arguments for the constructor of the
                :class:`fiftyone.utils.eval.classification.ClassificationEvaluationConfig`
                being used

        Returns:
            a :class:`fiftyone.utils.eval.classification.ClassificationResults`
        """
        return foue.evaluate_classifications(
            self,
            pred_field,
            gt_field=gt_field,
            eval_key=eval_key,
            classes=classes,
            missing=missing,
            method=method,
            **kwargs,
        )

    def evaluate_detections(
        self,
        pred_field,
        gt_field="ground_truth",
        eval_key=None,
        classes=None,
        missing=None,
        method=None,
        iou=0.50,
        use_masks=False,
        use_boxes=False,
        classwise=True,
        **kwargs,
    ):
        """Evaluates the specified predicted detections in this collection with
        respect to the specified ground truth detections.

        This method supports evaluating the following spatial data types:

        -   Object detections in :class:`fiftyone.core.labels.Detections` format
        -   Instance segmentations in :class:`fiftyone.core.labels.Detections`
            format with their ``mask`` attributes populated
        -   Polygons in :class:`fiftyone.core.labels.Polylines` format
        -   Temporal detections in
            :class:`fiftyone.core.labels.TemporalDetections` format

        For spatial object detection evaluation, this method uses COCO-style
        evaluation by default.

        For temporal segment detection, this method uses ActivityNet-style
        evaluation by default.

        You can use the ``method`` parameter to select a different method, and
        you can optionally customize the method by passing additional
        parameters for the method's config class as ``kwargs``.

        The supported ``method`` values and their associated configs are:

        -   ``"coco"``: :class:`fiftyone.utils.eval.coco.COCOEvaluationConfig`
        -   ``"open-images"``: :class:`fiftyone.utils.eval.openimages.OpenImagesEvaluationConfig`
        -   ``"activitynet"``: :class:`fiftyone.utils.eval.activitynet.ActivityNetEvaluationConfig`

        If an ``eval_key`` is provided, a number of fields are populated at the
        object- and sample-level recording the results of the evaluation:

        -   True positive (TP), false positive (FP), and false negative (FN)
            counts for the each sample are saved in top-level fields of each
            sample::

                TP: sample.<eval_key>_tp
                FP: sample.<eval_key>_fp
                FN: sample.<eval_key>_fn

            In addition, when evaluating frame-level objects, TP/FP/FN counts
            are recorded for each frame::

                TP: frame.<eval_key>_tp
                FP: frame.<eval_key>_fp
                FN: frame.<eval_key>_fn

        -   The fields listed below are populated on each individual object;
            these fields tabulate the TP/FP/FN status of the object, the ID of
            the matching object (if any), and the matching IoU::

                TP/FP/FN: object.<eval_key>
                      ID: object.<eval_key>_id
                     IoU: object.<eval_key>_iou

        Args:
            pred_field: the name of the field containing the predicted
                :class:`fiftyone.core.labels.Detections`,
                :class:`fiftyone.core.labels.Polylines`,
                or :class:`fiftyone.core.labels.TemporalDetections`
            gt_field ("ground_truth"): the name of the field containing the
                ground truth :class:`fiftyone.core.labels.Detections`,
                :class:`fiftyone.core.labels.Polylines`,
                or :class:`fiftyone.core.labels.TemporalDetections`
            eval_key (None): a string key to use to refer to this evaluation
            classes (None): the list of possible classes. If not provided,
                classes are loaded from
                :meth:`fiftyone.core.dataset.Dataset.classes` or
                :meth:`fiftyone.core.dataset.Dataset.default_classes` if
                possible, or else the observed ground truth/predicted labels
                are used
            missing (None): a missing label string. Any unmatched objects are
                given this label for results purposes
            method (None): a string specifying the evaluation method to use.
                For spatial object detection, the supported values are
                ``("coco", "open-images")`` and the default is ``"coco"``. For
                temporal detection, the supported values are
                ``("activitynet")`` and the default is ``"activitynet"``
            iou (0.50): the IoU threshold to use to determine matches
            use_masks (False): whether to compute IoUs using the instances
                masks in the ``mask`` attribute of the provided objects, which
                must be :class:`fiftyone.core.labels.Detection` instances
            use_boxes (False): whether to compute IoUs using the bounding boxes
                of the provided :class:`fiftyone.core.labels.Polyline`
                instances rather than using their actual geometries
            classwise (True): whether to only match objects with the same class
                label (True) or allow matches between classes (False)
            **kwargs: optional keyword arguments for the constructor of the
                :class:`fiftyone.utils.eval.detection.DetectionEvaluationConfig`
                being used

        Returns:
            a :class:`fiftyone.utils.eval.detection.DetectionResults`
        """
        return foue.evaluate_detections(
            self,
            pred_field,
            gt_field=gt_field,
            eval_key=eval_key,
            classes=classes,
            missing=missing,
            method=method,
            iou=iou,
            use_masks=use_masks,
            use_boxes=use_boxes,
            classwise=classwise,
            **kwargs,
        )

    def evaluate_segmentations(
        self,
        pred_field,
        gt_field="ground_truth",
        eval_key=None,
        mask_targets=None,
        method="simple",
        **kwargs,
    ):
        """Evaluates the specified semantic segmentation masks in this
        collection with respect to the specified ground truth masks.

        If the size of a predicted mask does not match the ground truth mask,
        it is resized to match the ground truth.

        By default, this method simply performs pixelwise evaluation of the
        full masks, but other strategies such as boundary-only evaluation can
        be configured by passing additional parameters for the method's
        config class as ``kwargs``.

        The supported ``method`` values and their associated configs are:

        -   ``"simple"``: :class:`fiftyone.utils.eval.segmentation.SimpleEvaluationConfig`

        If an ``eval_key`` is provided, the accuracy, precision, and recall of
        each sample is recorded in top-level fields of each sample::

             Accuracy: sample.<eval_key>_accuracy
            Precision: sample.<eval_key>_precision
               Recall: sample.<eval_key>_recall

        In addition, when evaluating frame-level masks, the accuracy,
        precision, and recall of each frame if recorded in the following
        frame-level fields::

             Accuracy: frame.<eval_key>_accuracy
            Precision: frame.<eval_key>_precision
               Recall: frame.<eval_key>_recall

        .. note::

            The mask value ``0`` is treated as a background class for the
            purposes of computing evaluation metrics like precision and recall.

        Args:
            pred_field: the name of the field containing the predicted
                :class:`fiftyone.core.labels.Segmentation` instances
            gt_field ("ground_truth"): the name of the field containing the
                ground truth :class:`fiftyone.core.labels.Segmentation`
                instances
            eval_key (None): a string key to use to refer to this evaluation
            mask_targets (None): a dict mapping mask values to labels. If not
                provided, mask targets are loaded from
                :meth:`fiftyone.core.dataset.Dataset.mask_targets` or
                :meth:`fiftyone.core.dataset.Dataset.default_mask_targets` if
                possible, or else the observed pixel values are used
            method ("simple"): a string specifying the evaluation method to
                use. Supported values are ``("simple")``
            **kwargs: optional keyword arguments for the constructor of the
                :class:`fiftyone.utils.eval.segmentation.SegmentationEvaluationConfig`
                being used

        Returns:
            a :class:`fiftyone.utils.eval.segmentation.SegmentationResults`
        """
        return foue.evaluate_segmentations(
            self,
            pred_field,
            gt_field=gt_field,
            eval_key=eval_key,
            mask_targets=mask_targets,
            method=method,
            **kwargs,
        )

    @property
    def has_evaluations(self):
        """Whether this colection has any evaluation results."""
        return bool(self.list_evaluations())

    def has_evaluation(self, eval_key):
        """Whether this collection has an evaluation with the given key.

        Args:
            eval_key: an evaluation key

        Returns:
            True/False
        """
        return eval_key in self.list_evaluations()

    def list_evaluations(self):
        """Returns a list of all evaluation keys on this collection.

        Returns:
            a list of evaluation keys
        """
        return foev.EvaluationMethod.list_runs(self)

    def get_evaluation_info(self, eval_key):
        """Returns information about the evaluation with the given key on this
        collection.

        Args:
            eval_key: an evaluation key

        Returns:
            an :class:`fiftyone.core.evaluation.EvaluationInfo`
        """
        return foev.EvaluationMethod.get_run_info(self, eval_key)

    def load_evaluation_results(self, eval_key):
        """Loads the results for the evaluation with the given key on this
        collection.

        Args:
            eval_key: an evaluation key

        Returns:
            a :class:`fiftyone.core.evaluation.EvaluationResults`
        """
        return foev.EvaluationMethod.load_run_results(self, eval_key)

    def load_evaluation_view(self, eval_key, select_fields=False):
        """Loads the :class:`fiftyone.core.view.DatasetView` on which the
        specified evaluation was performed on this collection.

        Args:
            eval_key: an evaluation key
            select_fields (False): whether to select only the fields involved
                in the evaluation

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return foev.EvaluationMethod.load_run_view(
            self, eval_key, select_fields=select_fields
        )

    def delete_evaluation(self, eval_key):
        """Deletes the evaluation results associated with the given evaluation
        key from this collection.

        Args:
            eval_key: an evaluation key
        """
        foev.EvaluationMethod.delete_run(self, eval_key)

    def delete_evaluations(self):
        """Deletes all evaluation results from this collection."""
        foev.EvaluationMethod.delete_runs(self)

    @property
    def has_brain_runs(self):
        """Whether this colection has any brain runs."""
        return bool(self.list_brain_runs())

    def has_brain_run(self, brain_key):
        """Whether this collection has a brain method run with the given key.

        Args:
            brain_key: a brain key

        Returns:
            True/False
        """
        return brain_key in self.list_brain_runs()

    def list_brain_runs(self):
        """Returns a list of all brain keys on this collection.

        Returns:
            a list of brain keys
        """
        return fob.BrainMethod.list_runs(self)

    def get_brain_info(self, brain_key):
        """Returns information about the brain method run with the given key on
        this collection.

        Args:
            brain_key: a brain key

        Returns:
            a :class:`fiftyone.core.brain.BrainInfo`
        """
        return fob.BrainMethod.get_run_info(self, brain_key)

    def load_brain_results(self, brain_key):
        """Loads the results for the brain method run with the given key on
        this collection.

        Args:
            brain_key: a brain key

        Returns:
            a :class:`fiftyone.core.brain.BrainResults`
        """
        return fob.BrainMethod.load_run_results(self, brain_key)

    def load_brain_view(self, brain_key, select_fields=False):
        """Loads the :class:`fiftyone.core.view.DatasetView` on which the
        specified brain method run was performed on this collection.

        Args:
            brain_key: a brain key
            select_fields (False): whether to select only the fields involved
                in the brain method run

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return fob.BrainMethod.load_run_view(
            self, brain_key, select_fields=select_fields
        )

    def delete_brain_run(self, brain_key):
        """Deletes the brain method run with the given key from this
        collection.

        Args:
            brain_key: a brain key
        """
        fob.BrainMethod.delete_run(self, brain_key)

    def delete_brain_runs(self):
        """Deletes all brain method runs from this collection."""
        fob.BrainMethod.delete_runs(self)

    def _get_similarity_keys(self, **kwargs):
        from fiftyone.brain import SimilarityConfig

        return self._get_brain_runs_with_type(SimilarityConfig, **kwargs)

    def _get_visualization_keys(self, **kwargs):
        from fiftyone.brain import VisualizationConfig

        return self._get_brain_runs_with_type(VisualizationConfig, **kwargs)

    def _get_brain_runs_with_type(self, run_type, **kwargs):
        brain_keys = []
        for brain_key in self.list_brain_runs():
            try:
                brain_info = self.get_brain_info(brain_key)
            except:
                logger.warning(
                    "Failed to load info for brain method run '%s'", brain_key
                )
                continue

            run_cls = etau.get_class(brain_info.config.cls)
            if not issubclass(run_cls, run_type):
                continue

            if any(
                getattr(brain_info.config, key, None) != value
                for key, value in kwargs.items()
            ):
                continue

            brain_keys.append(brain_key)

        return brain_keys

    @classmethod
    def list_view_stages(cls):
        """Returns a list of all available methods on this collection that
        apply :class:`fiftyone.core.stages.ViewStage` operations to this
        collection.

        Returns:
            a list of :class:`SampleCollection` method names
        """
        return list(view_stage.all)

    def add_stage(self, stage):
        """Applies the given :class:`fiftyone.core.stages.ViewStage` to the
        collection.

        Args:
            stage: a :class:`fiftyone.core.stages.ViewStage`

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(stage)

    @view_stage
    def concat(self, samples):
        """Concatenates the contents of the given :class:`SampleCollection` to
        this collection.

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

            view = view1.concat(view2)

            print(view1)
            print(view2)
            print(view)

            #
            # Concatenate two patches views
            #

            gt_objects = dataset.to_patches("ground_truth")

            patches1 = gt_objects[:50]
            patches2 = gt_objects[-50:]
            patches = patches1.concat(patches2)

            print(patches1)
            print(patches2)
            print(patches)

        Args:
            samples: a :class:`SampleCollection` whose contents to append to
                this collection

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Concat(samples))

    @view_stage
    def exclude(self, sample_ids):
        """Excludes the samples with the given IDs from the collection.

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
            view = dataset.exclude(sample_id)

            #
            # Exclude the first and last samples from the dataset
            #

            sample_ids = [dataset.first().id, dataset.last().id]
            view = dataset.exclude(sample_ids)

        Args:
            sample_ids: the samples to exclude. Can be any of the following:

                -   a sample ID
                -   an iterable of sample IDs
                -   a :class:`fiftyone.core.sample.Sample` or
                    :class:`fiftyone.core.sample.SampleView`
                -   an iterable of :class:`fiftyone.core.sample.Sample` or
                    :class:`fiftyone.core.sample.SampleView` instances
                -   a :class:`fiftyone.core.collections.SampleCollection`

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Exclude(sample_ids))

    @view_stage
    def exclude_by(self, field, values):
        """Excludes the samples with the given field values from the
        collection.

        This stage is typically used to work with categorical fields (strings,
        ints, and bools). If you want to exclude samples based on floating
        point fields, use :meth:`match`.

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

            view = dataset.exclude_by("int", [1, 9, 3, 7, 5])
            print(view.head(5))

            #
            # Create a view excluding samples whose `str` field have the given
            # values
            #

            view = dataset.exclude_by("str", ["1", "9", "3", "7", "5"])
            print(view.head(5))

        Args:
            field: a field or ``embedded.field.name``
            values: a value or iterable of values to exclude by

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.ExcludeBy(field, values))

    @view_stage
    def exclude_fields(self, field_names, _allow_missing=False):
        """Excludes the fields with the given names from the samples in the
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
                        predictions=fo.Classification(label="cat", confidence=0.9),
                    ),
                    fo.Sample(
                        filepath="/path/to/image2.png",
                        ground_truth=fo.Classification(label="dog"),
                        predictions=fo.Classification(label="dog", confidence=0.8),
                    ),
                    fo.Sample(
                        filepath="/path/to/image3.png",
                        ground_truth=None,
                        predictions=None,
                    ),
                ]
            )

            #
            # Exclude the `predictions` field from all samples
            #

            view = dataset.exclude_fields("predictions")

        Args:
            field_names: a field name or iterable of field names to exclude

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.ExcludeFields(field_names, _allow_missing=_allow_missing)
        )

    @view_stage
    def exclude_frames(self, frame_ids, omit_empty=True):
        """Excludes the frames with the given IDs from the video collection.

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

            view = dataset.exclude_frames(frame_ids)

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

            omit_empty (True): whether to omit samples that have no frames
                after excluding the specified frames

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.ExcludeFrames(frame_ids, omit_empty=omit_empty)
        )

    @view_stage
    def exclude_labels(
        self, labels=None, ids=None, tags=None, fields=None, omit_empty=True
    ):
        """Excludes the specified labels from the collection.

        The returned view will omit samples, sample fields, and individual
        labels that do not match the specified selection criteria.

        You can perform an exclusion via one or more of the following methods:

        -   Provide the ``labels`` argument, which should contain a list of
            dicts in the format returned by
            :meth:`fiftyone.core.session.Session.selected_labels`, to exclude
            specific labels

        -   Provide the ``ids`` argument to exclude labels with specific IDs

        -   Provide the ``tags`` argument to exclude labels with specific tags

        If multiple criteria are specified, labels must match all of them in
        order to be excluded.

        By default, the exclusion is applied to all
        :class:`fiftyone.core.labels.Label` fields, but you can provide the
        ``fields`` argument to explicitly define the field(s) in which to
        exclude.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart")

            #
            # Exclude the labels currently selected in the App
            #

            session = fo.launch_app(dataset)

            # Select some labels in the App...

            view = dataset.exclude_labels(labels=session.selected_labels)

            #
            # Exclude labels with the specified IDs
            #

            # Grab some label IDs
            ids = [
                dataset.first().ground_truth.detections[0].id,
                dataset.last().predictions.detections[0].id,
            ]

            view = dataset.exclude_labels(ids=ids)

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
            view = dataset.exclude_labels(tags="test")

            print(dataset.count("ground_truth.detections"))
            print(view.count("ground_truth.detections"))

            print(dataset.count("predictions.detections"))
            print(view.count("predictions.detections"))

        Args:
            labels (None): a list of dicts specifying the labels to exclude in
                the format returned by
                :meth:`fiftyone.core.session.Session.selected_labels`
            ids (None): an ID or iterable of IDs of the labels to exclude
            tags (None): a tag or iterable of tags of labels to exclude
            fields (None): a field or iterable of fields from which to exclude
            omit_empty (True): whether to omit samples that have no labels
                after filtering

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.ExcludeLabels(
                labels=labels,
                ids=ids,
                tags=tags,
                fields=fields,
                omit_empty=omit_empty,
            )
        )

    @view_stage
    def exists(self, field, bool=None):
        """Returns a view containing the samples in the collection that have
        (or do not have) a non-``None`` value for the given field or embedded
        field.

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
            # Only include samples that have a value in their `predictions`
            # field
            #

            view = dataset.exists("predictions")

            #
            # Only include samples that do NOT have a value in their
            # `predictions` field
            #

            view = dataset.exists("predictions", False)

            #
            # Only include samples that have prediction confidences
            #

            view = dataset.exists("predictions.confidence")

        Args:
            field: the field name or ``embedded.field.name``
            bool (None): whether to check if the field exists (None or True) or
                does not exist (False)

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Exists(field, bool=bool))

    @view_stage
    def filter_field(self, field, filter, only_matches=True):
        """Filters the values of a field or embedded field of each sample in
        the collection.

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

            view = dataset.filter_field("predictions", F("label") == "cat")

            #
            # Only include samples whose `numeric_field` value is positive
            #

            view = dataset.filter_field("numeric_field", F() > 0)

        Args:
            field: the field name or ``embedded.field.name``
            filter: a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that returns a boolean describing the filter to apply
            only_matches (True): whether to only include samples that match
                the filter (True) or include all samples (False)

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.FilterField(field, filter, only_matches=only_matches)
        )

    @view_stage
    def filter_labels(
        self, field, filter, only_matches=True, trajectories=False
    ):
        """Filters the :class:`fiftyone.core.labels.Label` field of each
        sample in the collection.

        If the specified ``field`` is a single
        :class:`fiftyone.core.labels.Label` type, fields for which ``filter``
        returns ``False`` are replaced with ``None``:

        -   :class:`fiftyone.core.labels.Classification`
        -   :class:`fiftyone.core.labels.Detection`
        -   :class:`fiftyone.core.labels.Polyline`
        -   :class:`fiftyone.core.labels.Keypoint`

        If the specified ``field`` is a :class:`fiftyone.core.labels.Label`
        list type, the label elements for which ``filter`` returns ``False``
        are omitted from the view:

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

            view = dataset.filter_labels("predictions", F("confidence") > 0.8)

            #
            # Only include classifications in the `predictions` field whose
            # `label` is "cat" or "dog"
            #

            view = dataset.filter_labels(
                "predictions", F("label").is_in(["cat", "dog"])
            )

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
            # Only include detections in the `predictions` field whose
            # `confidence` is greater than 0.8
            #

            view = dataset.filter_labels("predictions", F("confidence") > 0.8)

            #
            # Only include detections in the `predictions` field whose `label`
            # is "cat" or "dog"
            #

            view = dataset.filter_labels(
                "predictions", F("label").is_in(["cat", "dog"])
            )

            #
            # Only include detections in the `predictions` field whose bounding
            # box area is smaller than 0.2
            #

            # Bboxes are in [top-left-x, top-left-y, width, height] format
            bbox_area = F("bounding_box")[2] * F("bounding_box")[3]

            view = dataset.filter_labels("predictions", bbox_area < 0.2)

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

            view = dataset.filter_labels("predictions", F("filled") == True)

            #
            # Only include polylines in the `predictions` field whose `label`
            # is "lane"
            #

            view = dataset.filter_labels("predictions", F("label") == "lane")

            #
            # Only include polylines in the `predictions` field with at least
            # 3 vertices
            #

            num_vertices = F("points").map(F().length()).sum()
            view = dataset.filter_labels("predictions", num_vertices >= 3)

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
            # Only include keypoints in the `predictions` field whose `label`
            # is "house"
            #

            view = dataset.filter_labels("predictions", F("label") == "house")

            #
            # Only include keypoints in the `predictions` field with less than
            # four points
            #

            view = dataset.filter_labels("predictions", F("points").length() < 4)

        Args:
            field: the label field to filter
            filter: a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that returns a boolean describing the filter to apply
            only_matches (True): whether to only include samples with at least
                one label after filtering (True) or include all samples (False)
            trajectories (False): whether to match entire object trajectories
                for which the object matches the given filter on at least one
                frame. Only applicable to video datasets and frame-level label
                fields whose objects have their ``index`` attributes populated

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.FilterLabels(
                field,
                filter,
                only_matches=only_matches,
                trajectories=trajectories,
            )
        )

    @view_stage
    def filter_keypoints(
        self, field, filter=None, labels=None, only_matches=True
    ):
        """Filters the individual :attr:`fiftyone.core.labels.Keypoint.points`
        elements in the specified keypoints field of each sample in the
        collection.

        .. note::

            Use :meth:`filter_labels` if you simply want to filter entire
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

            view = dataset.filter_keypoints(
                "predictions", filter=F("confidence") > 0.9
            )

            #
            # Only include keypoints in the `predictions` field with less than
            # four points
            #

            view = dataset.filter_keypoints(
                "predictions", labels=["left eye", "right eye"]
            )

        Args:
            field: the :class:`fiftyone.core.labels.Keypoint` or
                :class:`fiftyone.core.labels.Keypoints` field to filter
            filter (None): a :class:`fiftyone.core.expressions.ViewExpression`
                or `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that returns a boolean, like ``F("confidence") > 0.5`` or
                ``F("occluded") == False``, to apply elementwise to the
                specified field, which must be a list of same length as
                :attr:`fiftyone.core.labels.Keypoint.points`
            labels (None): a label or iterable of keypoint skeleton labels to
                keep
            only_matches (True): whether to only include keypoints/samples with
                at least one point after filtering (True) or include all
                keypoints/samples (False)

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.FilterKeypoints(
                field,
                filter=filter,
                labels=labels,
                only_matches=only_matches,
            )
        )

    @view_stage
    def geo_near(
        self,
        point,
        location_field=None,
        min_distance=None,
        max_distance=None,
        query=None,
    ):
        """Sorts the samples in the collection by their proximity to a
        specified geolocation.

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

            view = dataset.geo_near(TIMES_SQUARE)

            #
            # Sort the samples by their proximity to Times Square, and only
            # include samples within 5km
            #

            view = dataset.geo_near(TIMES_SQUARE, max_distance=5000)

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

            view = dataset.geo_near(
                TIMES_SQUARE, location_field="location", query=in_manhattan
            )

        Args:
            point: the reference point to compute distances to. Can be any of
                the following:

                -   A ``[longitude, latitude]`` list
                -   A GeoJSON dict with ``Point`` type
                -   A :class:`fiftyone.core.labels.GeoLocation` instance whose
                    ``point`` attribute contains the point

            location_field (None): the location data of each sample to use. Can
                be any of the following:

                -   The name of a :class:`fiftyone.core.fields.GeoLocation`
                    field whose ``point`` attribute to use as location data
                -   An ``embedded.field.name`` containing GeoJSON data to use
                    as location data
                -   ``None``, in which case there must be a single
                    :class:`fiftyone.core.fields.GeoLocation` field on the
                    samples, which is used by default

            min_distance (None): filter samples that are less than this
                distance (in meters) from ``point``
            max_distance (None): filter samples that are greater than this
                distance (in meters) from ``point``
            query (None): an optional dict defining a
                `MongoDB read query <https://docs.mongodb.com/manual/tutorial/query-documents/#read-operations-query-argument>`_
                that samples must match in order to be included in this view

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.GeoNear(
                point,
                location_field=location_field,
                min_distance=min_distance,
                max_distance=max_distance,
                query=query,
            )
        )

    @view_stage
    def geo_within(self, boundary, location_field=None, strict=True):
        """Filters the samples in this collection to only include samples whose
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

            view = dataset.geo_within(MANHATTAN)

        Args:
            boundary: a :class:`fiftyone.core.labels.GeoLocation`,
                :class:`fiftyone.core.labels.GeoLocations`, GeoJSON dict, or
                list of coordinates that define a ``Polygon`` or
                ``MultiPolygon`` to search within
            location_field (None): the location data of each sample to use. Can
                be any of the following:

                -   The name of a :class:`fiftyone.core.fields.GeoLocation`
                    field whose ``point`` attribute to use as location data
                -   An ``embedded.field.name`` that directly contains the
                    GeoJSON location data to use
                -   ``None``, in which case there must be a single
                    :class:`fiftyone.core.fields.GeoLocation` field on the
                    samples, which is used by default

            strict (True): whether a sample's location data must strictly fall
                within boundary (True) in order to match, or whether any
                intersection suffices (False)

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.GeoWithin(
                boundary, location_field=location_field, strict=strict
            )
        )

    @view_stage
    def group_by(self, field_or_expr, sort_expr=None, reverse=False):
        """Creates a view that reorganizes the samples in the collection so
        that they are grouped by a specified field or expression.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("cifar10", split="test")

            # Take a random sample of 1000 samples and organize them by ground
            # truth label with groups arranged in decreasing order of size
            view = dataset.take(1000).group_by(
                "ground_truth.label",
                sort_expr=F().length(),
                reverse=True,
            )

            print(view.values("ground_truth.label"))
            print(
                sorted(
                    view.count_values("ground_truth.label").items(),
                    key=lambda kv: kv[1],
                    reverse=True,
                )
            )

        Args:
            field_or_expr: the field or ``embedded.field.name`` to group by, or
                a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that defines the value to group by
            sort_expr (None): an optional
                :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that defines how to sort the groups in the output view. If
                provided, this expression will be evaluated on the list of
                samples in each group
            reverse (False): whether to return the results in descending order

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.GroupBy(field_or_expr, sort_expr=sort_expr, reverse=reverse)
        )

    @view_stage
    def limit(self, limit):
        """Returns a view with at most the given number of samples.

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

            view = dataset.limit(2)

        Args:
            limit: the maximum number of samples to return. If a non-positive
                number is provided, an empty view is returned

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Limit(limit))

    @view_stage
    def limit_labels(self, field, limit):
        """Limits the number of :class:`fiftyone.core.labels.Label` instances
        in the specified labels list field of each sample in the collection.

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
            # Only include the first detection in the `predictions` field of
            # each sample
            #

            view = dataset.limit_labels("predictions", 1)

        Args:
            field: the labels list field to filter
            limit: the maximum number of labels to include in each labels list.
                If a non-positive number is provided, all lists will be empty

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.LimitLabels(field, limit))

    @view_stage
    def map_labels(self, field, map):
        """Maps the ``label`` values of a :class:`fiftyone.core.labels.Label`
        field to new values for each sample in the collection.

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

            view = dataset.map_labels("weather", {"partly cloudy": "cloudy"})

            #
            # Map "rabbit" and "squirrel" predictions to "other"
            #

            view = dataset.map_labels(
                "predictions", {"rabbit": "other", "squirrel": "other"}
            )

        Args:
            field: the labels field to map
            map: a dict mapping label values to new label values

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.MapLabels(field, map))

    @view_stage
    def set_field(self, field, expr, _allow_missing=False):
        """Sets a field or embedded field on each sample in a collection by
        evaluating the given expression.

        This method can process embedded list fields. To do so, simply append
        ``[]`` to any list component(s) of the field path.

        .. note::

            There are two cases where FiftyOne will automatically unwind array
            fields without requiring you to explicitly specify this via the
            ``[]`` syntax:

            **Top-level lists:** when you specify a ``field`` path that refers
            to a top-level list field of a dataset; i.e., ``list_field`` is
            automatically coerced to ``list_field[]``, if necessary.

            **List fields:** When you specify a ``field`` path that refers to
            the list field of a |Label| class, such as the
            :attr:`Detections.detections <fiftyone.core.labels.Detections.detections>`
            attribute; i.e., ``ground_truth.detections.label`` is automatically
            coerced to ``ground_truth.detections[].label``, if necessary.

            See the examples below for demonstrations of this behavior.

        The provided ``expr`` is interpreted relative to the document on which
        the embedded field is being set. For example, if you are setting a
        nested field ``field="embedded.document.field"``, then the expression
        ``expr`` you provide will be applied to the ``embedded.document``
        document. Note that you can override this behavior by defining an
        expression that is bound to the root document by prepending ``"$"`` to
        any field name(s) in the expression.

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
            # Replace all values of the `uniqueness` field that are less than
            # 0.5 with `None`
            #

            view = dataset.set_field(
                "uniqueness",
                (F("uniqueness") >= 0.5).if_else(F("uniqueness"), None)
            )
            print(view.bounds("uniqueness"))

            #
            # Lower bound all object confidences in the `predictions` field at
            # 0.5
            #

            view = dataset.set_field(
                "predictions.detections.confidence", F("confidence").max(0.5)
            )
            print(view.bounds("predictions.detections.confidence"))

            #
            # Add a `num_predictions` property to the `predictions` field that
            # contains the number of objects in the field
            #

            view = dataset.set_field(
                "predictions.num_predictions",
                F("$predictions.detections").length(),
            )
            print(view.bounds("predictions.num_predictions"))

            #
            # Set an `is_animal` field on each object in the `predictions` field
            # that indicates whether the object is an animal
            #

            ANIMALS = [
                "bear", "bird", "cat", "cow", "dog", "elephant", "giraffe",
                "horse", "sheep", "zebra"
            ]

            view = dataset.set_field(
                "predictions.detections.is_animal", F("label").is_in(ANIMALS)
            )
            print(view.count_values("predictions.detections.is_animal"))

        Args:
            field: the field or ``embedded.field.name`` to set
            expr: a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that defines the field value to set

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.SetField(field, expr, _allow_missing=_allow_missing)
        )

    @view_stage
    def match(self, filter):
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

            view = dataset.match(F("filepath").ends_with(".jpg"))

            #
            # Only include samples whose `weather` field is "sunny"
            #

            view = dataset.match(F("weather").label == "sunny")

            #
            # Only include samples with at least 2 objects in their
            # `predictions` field
            #

            view = dataset.match(F("predictions").detections.length() >= 2)

            #
            # Only include samples whose `predictions` field contains at least
            # one object with area smaller than 0.2
            #

            # Bboxes are in [top-left-x, top-left-y, width, height] format
            bbox = F("bounding_box")
            bbox_area = bbox[2] * bbox[3]

            small_boxes = F("predictions.detections").filter(bbox_area < 0.2)
            view = dataset.match(small_boxes.length() > 0)

        Args:
            filter: a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that returns a boolean describing the filter to apply

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Match(filter))

    @view_stage
    def match_frames(self, filter, omit_empty=True):
        """Filters the frames in the video collection by the given filter.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart-video")

            #
            # Match frames with at least 10 detections
            #

            num_objects = F("detections.detections").length()
            view = dataset.match_frames(num_objects > 10)

            print(dataset.count())
            print(view.count())

            print(dataset.count("frames"))
            print(view.count("frames"))

        Args:
            filter: a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that returns a boolean describing the filter to apply
            omit_empty (True): whether to omit samples with no frame labels
                after filtering

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.MatchFrames(filter, omit_empty=omit_empty)
        )

    @view_stage
    def match_labels(
        self,
        labels=None,
        ids=None,
        tags=None,
        filter=None,
        fields=None,
        bool=None,
    ):
        """Selects the samples from the collection that contain (or do not
        contain) at least one label that matches the specified criteria.

        Note that, unlike :meth:`select_labels` and :meth:`filter_labels`, this
        stage will not filter the labels themselves; it only selects the
        corresponding samples.

        You can perform a selection via one or more of the following methods:

        -   Provide the ``labels`` argument, which should contain a list of
            dicts in the format returned by
            :meth:`fiftyone.core.session.Session.selected_labels`, to match
            specific labels

        -   Provide the ``ids`` argument to match labels with specific IDs

        -   Provide the ``tags`` argument to match labels with specific tags

        -   Provide the ``filter`` argument to match labels based on a boolean
            :class:`fiftyone.core.expressions.ViewExpression` that is applied
            to each individual :class:`fiftyone.core.labels.Label` element

        -   Pass ``bool=False`` to negate the operation and instead match
            samples that *do not* contain at least one label matching the
            specified criteria

        If multiple criteria are specified, labels must match all of them in
        order to trigger a sample match.

        By default, the selection is applied to all
        :class:`fiftyone.core.labels.Label` fields, but you can provide the
        ``fields`` argument to explicitly define the field(s) in which to
        search.

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

            view = dataset.match_labels(labels=session.selected_labels)

            #
            # Only include samples that contain labels with the specified IDs
            #

            # Grab some label IDs
            ids = [
                dataset.first().ground_truth.detections[0].id,
                dataset.last().predictions.detections[0].id,
            ]

            view = dataset.match_labels(ids=ids)

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
            view = dataset.match_labels(tags="test")

            print(len(view))
            print(view.count("ground_truth.detections"))
            print(view.count("predictions.detections"))

            #
            # Only include samples that contain labels matching a filter
            #

            filter = F("confidence") > 0.99
            view = dataset.match_labels(filter=filter, fields="predictions")

            print(len(view))
            print(view.count("ground_truth.detections"))
            print(view.count("predictions.detections"))

        Args:
            labels (None): a list of dicts specifying the labels to select in
                the format returned by
                :meth:`fiftyone.core.session.Session.selected_labels`
            ids (None): an ID or iterable of IDs of the labels to select
            tags (None): a tag or iterable of tags of labels to select
            filter (None): a :class:`fiftyone.core.expressions.ViewExpression`
                or `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that returns a boolean describing whether to select a given
                label. In the case of list fields like
                :class:`fiftyone.core.labels.Detections`, the filter is applied
                to the list elements, not the root field
            fields (None): a field or iterable of fields from which to select
            bool (None): whether to match samples that have (None or True) or
                do not have (False) at least one label that matches the
                specified criteria

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.MatchLabels(
                labels=labels,
                ids=ids,
                tags=tags,
                filter=filter,
                fields=fields,
                bool=bool,
            )
        )

    @view_stage
    def match_tags(self, tags, bool=None):
        """Returns a view containing the samples in the collection that have
        (or do not have) any of the given tag(s).

        To match samples that must contain multiple tags, chain multiple
        :meth:`match_tags` calls together.

        Examples::

            import fiftyone as fo

            dataset = fo.Dataset()
            dataset.add_samples(
                [
                    fo.Sample(
                        filepath="/path/to/image1.png",
                        tags=["train"],
                        ground_truth=fo.Classification(label="cat"),
                    ),
                    fo.Sample(
                        filepath="/path/to/image2.png",
                        tags=["test"],
                        ground_truth=fo.Classification(label="cat"),
                    ),
                    fo.Sample(
                        filepath="/path/to/image3.png",
                        ground_truth=None,
                    ),
                ]
            )

            #
            # Only include samples that have the "test" tag
            #

            view = dataset.match_tags("test")

            #
            # Only include samples that have either the "test" or "train" tag
            #

            view = dataset.match_tags(["test", "train"])

            #
            # Only include samples that do not have the "train" tag
            #

            view = dataset.match_tags("train", bool=False)

        Args:
            tags: the tag or iterable of tags to match
            bool (None): whether to match samples that have (None or True) or
                do not have (False) the given tags

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.MatchTags(tags, bool=bool))

    @view_stage
    def mongo(self, pipeline):
        """Adds a view stage defined by a raw MongoDB aggregation pipeline.

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
            # Extract a view containing the second and third samples in the
            # dataset
            #

            view = dataset.mongo([{"$skip": 1}, {"$limit": 2}])

            #
            # Sort by the number of objects in the `precictions` field
            #

            view = dataset.mongo([
                {
                    "$addFields": {
                        "_sort_field": {
                            "$size": {"$ifNull": ["$predictions.detections", []]}
                        }
                    }
                },
                {"$sort": {"_sort_field": -1}},
                {"$unset": "_sort_field"}
            ])

        Args:
            pipeline: a MongoDB aggregation pipeline (list of dicts)

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Mongo(pipeline))

    @view_stage
    def select(self, sample_ids, ordered=False):
        """Selects the samples with the given IDs from the collection.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart")

            #
            # Create a view containing the currently selected samples in the App
            #

            session = fo.launch_app(dataset)

            # Select samples in the App...

            view = dataset.select(session.selected)

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

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Select(sample_ids, ordered=ordered))

    @view_stage
    def select_by(self, field, values, ordered=False):
        """Selects the samples with the given field values from the collection.

        This stage is typically used to work with categorical fields (strings,
        ints, and bools). If you want to select samples based on floating point
        fields, use :meth:`match`.

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

            view = dataset.select_by("int", [1, 51, 11, 41, 21, 31])
            print(view.head(6))

            #
            # Create a view containing samples whose `str` field have the given
            # values, in order
            #

            view = dataset.select_by(
                "str", ["1", "51", "11", "41", "21", "31"], ordered=True
            )
            print(view.head(6))

        Args:
            field: a field or ``embedded.field.name``
            values: a value or iterable of values to select by
            ordered (False): whether to sort the samples in the returned view
                to match the order of the provided values

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.SelectBy(field, values, ordered=ordered)
        )

    @view_stage
    def select_fields(self, field_names=None, _allow_missing=False):
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
                        numeric_field=1.0,
                        numeric_list_field=[-1, 0, 1],
                    ),
                    fo.Sample(
                        filepath="/path/to/image2.png",
                        numeric_field=-1.0,
                        numeric_list_field=[-2, -1, 0, 1],
                    ),
                    fo.Sample(
                        filepath="/path/to/image3.png",
                        numeric_field=None,
                    ),
                ]
            )

            #
            # Include only the default fields on each sample
            #

            view = dataset.select_fields()

            #
            # Include only the `numeric_field` field (and the default fields)
            # on each sample
            #

            view = dataset.select_fields("numeric_field")

        Args:
            field_names (None): a field name or iterable of field names to
                select

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.SelectFields(field_names, _allow_missing=_allow_missing)
        )

    @view_stage
    def select_frames(self, frame_ids, omit_empty=True):
        """Selects the frames with the given IDs from the video collection.

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

            view = dataset.select_frames(frame_ids)

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
                -   a :class:`fiftyone.core.collections.SampleCollection`
                    whose frames to select

            omit_empty (True): whether to omit samples that have no frames
                after selecting the specified frames

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.SelectFrames(frame_ids, omit_empty=omit_empty)
        )

    @view_stage
    def select_labels(
        self, labels=None, ids=None, tags=None, fields=None, omit_empty=True
    ):
        """Selects only the specified labels from the collection.

        The returned view will omit samples, sample fields, and individual
        labels that do not match the specified selection criteria.

        You can perform a selection via one or more of the following methods:

        -   Provide the ``labels`` argument, which should contain a list of
            dicts in the format returned by
            :meth:`fiftyone.core.session.Session.selected_labels`, to select
            specific labels

        -   Provide the ``ids`` argument to select labels with specific IDs

        -   Provide the ``tags`` argument to select labels with specific tags

        If multiple criteria are specified, labels must match all of them in
        order to be selected.

        By default, the selection is applied to all
        :class:`fiftyone.core.labels.Label` fields, but you can provide the
        ``fields`` argument to explicitly define the field(s) in which to
        select.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart")

            #
            # Only include the labels currently selected in the App
            #

            session = fo.launch_app(dataset)

            # Select some labels in the App...

            view = dataset.select_labels(labels=session.selected_labels)

            #
            # Only include labels with the specified IDs
            #

            # Grab some label IDs
            ids = [
                dataset.first().ground_truth.detections[0].id,
                dataset.last().predictions.detections[0].id,
            ]

            view = dataset.select_labels(ids=ids)

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

            print(dataset.count_label_tags())

            # Retrieve the labels via their tag
            view = dataset.select_labels(tags="test")

            print(view.count("ground_truth.detections"))
            print(view.count("predictions.detections"))

        Args:
            labels (None): a list of dicts specifying the labels to select in
                the format returned by
                :meth:`fiftyone.core.session.Session.selected_labels`
            ids (None): an ID or iterable of IDs of the labels to select
            tags (None): a tag or iterable of tags of labels to select
            fields (None): a field or iterable of fields from which to select
            omit_empty (True): whether to omit samples that have no labels
                after filtering

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.SelectLabels(
                labels=labels,
                ids=ids,
                tags=tags,
                fields=fields,
                omit_empty=omit_empty,
            )
        )

    @view_stage
    def shuffle(self, seed=None):
        """Randomly shuffles the samples in the collection.

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

            view = dataset.shuffle()

            #
            # Shuffle the samples with a fixed random seed
            #

            view = dataset.shuffle(seed=51)

        Args:
            seed (None): an optional random seed to use when shuffling the
                samples

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Shuffle(seed=seed))

    @view_stage
    def skip(self, skip):
        """Omits the given number of samples from the head of the collection.

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

            view = dataset.skip(2)

        Args:
            skip: the number of samples to skip. If a non-positive number is
                provided, no samples are omitted

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Skip(skip))

    @view_stage
    def sort_by(self, field_or_expr, reverse=False):
        """Sorts the samples in the collection by the given field(s) or
        expression(s).

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            #
            # Sort the samples by their `uniqueness` field in ascending order
            #

            view = dataset.sort_by("uniqueness", reverse=False)

            #
            # Sorts the samples in descending order by the number of detections
            # in their `predictions` field whose bounding box area is less than
            # 0.2
            #

            # Bboxes are in [top-left-x, top-left-y, width, height] format
            bbox = F("bounding_box")
            bbox_area = bbox[2] * bbox[3]

            small_boxes = F("predictions.detections").filter(bbox_area < 0.2)
            view = dataset.sort_by(small_boxes.length(), reverse=True)

            #
            # Performs a compound sort where samples are first sorted in
            # descending or by number of detections and then in ascending order
            # of uniqueness for samples with the same number of predictions
            #

            view = dataset.sort_by(
                [
                    (F("predictions.detections").length(), -1),
                    ("uniqueness", 1),
                ]
            )

            num_objects, uniqueness = view[:5].values(
                [F("predictions.detections").length(), "uniqueness"]
            )
            print(list(zip(num_objects, uniqueness)))

        Args:
            field_or_expr: the field(s) or expression(s) to sort by. This can
                be any of the following:

                -   a field to sort by
                -   an ``embedded.field.name`` to sort by
                -   a :class:`fiftyone.core.expressions.ViewExpression` or a
                    `MongoDB aggregation expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                    that defines the quantity to sort by
                -   a list of ``(field_or_expr, order)`` tuples defining a
                    compound sort criteria, where ``field_or_expr`` is a field
                    or expression as defined above, and ``order`` can be 1 or
                    any string starting with "a" for ascending order, or -1 or
                    any string starting with "d" for descending order

            reverse (False): whether to return the results in descending order

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.SortBy(field_or_expr, reverse=reverse))

    @view_stage
    def sort_by_similarity(
        self, query_ids, k=None, reverse=False, dist_field=None, brain_key=None
    ):
        """Sorts the samples in the collection by visual similiarity to a
        specified set of query ID(s).

        In order to use this stage, you must first use
        :meth:`fiftyone.brain.compute_similarity` to index your dataset by
        visual similiarity.

        Examples::

            import fiftyone as fo
            import fiftyone.brain as fob
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart")

            fob.compute_similarity(dataset, brain_key="similarity")

            #
            # Sort the samples by their visual similarity to the first sample
            # in the dataset
            #

            query_id = dataset.first().id
            view = dataset.sort_by_similarity(query_id)

        Args:
            query_ids: an ID or iterable of query IDs. These may be sample IDs
                or label IDs depending on ``brain_key``
            k (None): the number of matches to return. By default, the entire
                collection is sorted
            reverse (False): whether to sort by least similarity
            dist_field (None): the name of a float field in which to store the
                distance of each example to the specified query. The field is
                created if necessary
            brain_key (None): the brain key of an existing
                :meth:`fiftyone.brain.compute_similarity` run on the dataset.
                If not specified, the dataset must have an applicable run,
                which will be used by default

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.SortBySimilarity(
                query_ids,
                k=k,
                reverse=reverse,
                dist_field=dist_field,
                brain_key=brain_key,
            )
        )

    @view_stage
    def take(self, size, seed=None):
        """Randomly samples the given number of samples from the collection.

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

            view = dataset.take(2)

            #
            # Take two random samples from the dataset with a fixed seed
            #

            view = dataset.take(2, seed=51)

        Args:
            size: the number of samples to return. If a non-positive number is
                provided, an empty view is returned
            seed (None): an optional random seed to use when selecting the
                samples

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Take(size, seed=seed))

    @view_stage
    def to_patches(self, field, **kwargs):
        """Creates a view that contains one sample per object patch in the
        specified field of the collection.

        Fields other than ``field`` and the default sample fields will not be
        included in the returned view. A ``sample_id`` field will be added that
        records the sample ID from which each patch was taken.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart")

            session = fo.launch_app(dataset)

            #
            # Create a view containing the ground truth patches
            #

            view = dataset.to_patches("ground_truth")
            print(view)

            session.view = view

        Args:
            field: the patches field, which must be of type
                :class:`fiftyone.core.labels.Detections` or
                :class:`fiftyone.core.labels.Polylines`
            other_fields (None): controls whether fields other than ``field``
                and the default sample fields are included. Can be any of the
                following:

                -   a field or list of fields to include
                -   ``True`` to include all other fields
                -   ``None``/``False`` to include no other fields
            keep_label_lists (False): whether to store the patches in label
                list fields of the same type as the input collection rather
                than using their single label variants

        Returns:
            a :class:`fiftyone.core.patches.PatchesView`
        """
        return self._add_view_stage(fos.ToPatches(field, **kwargs))

    @view_stage
    def to_evaluation_patches(self, eval_key, **kwargs):
        """Creates a view based on the results of the evaluation with the
        given key that contains one sample for each true positive, false
        positive, and false negative example in the collection, respectively.

        True positive examples will result in samples with both their ground
        truth and predicted fields populated, while false positive/negative
        examples will only have one of their corresponding predicted/ground
        truth fields populated, respectively.

        If multiple predictions are matched to a ground truth object (e.g., if
        the evaluation protocol includes a crowd attribute), then all matched
        predictions will be stored in the single sample along with the ground
        truth object.

        The returned dataset will also have top-level ``type`` and ``iou``
        fields populated based on the evaluation results for that example, as
        well as a ``sample_id`` field recording the sample ID of the example,
        and a ``crowd`` field if the evaluation protocol defines a crowd
        attribute.

        .. note::

            The returned view will contain patches for the contents of this
            collection, which may differ from the view on which the
            ``eval_key`` evaluation was performed. This may exclude some labels
            that were evaluated and/or include labels that were not evaluated.

            If you would like to see patches for the exact view on which an
            evaluation was performed, first call :meth:`load_evaluation_view`
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

            view = dataset.to_evaluation_patches("eval")
            print(view)

            session.view = view

        Args:
            eval_key: an evaluation key that corresponds to the evaluation of
                ground truth/predicted fields that are of type
                :class:`fiftyone.core.labels.Detections` or
                :class:`fiftyone.core.labels.Polylines`
            other_fields (None): controls whether fields other than the
                ground truth/predicted fields and the default sample fields are
                included. Can be any of the following:

                -   a field or list of fields to include
                -   ``True`` to include all other fields
                -   ``None``/``False`` to include no other fields

        Returns:
            a :class:`fiftyone.core.patches.EvaluationPatchesView`
        """
        return self._add_view_stage(
            fos.ToEvaluationPatches(eval_key, **kwargs)
        )

    @view_stage
    def to_clips(self, field_or_expr, **kwargs):
        """Creates a view that contains one sample per clip defined by the
        given field or expression in the video collection.

        The returned view will contain:

        -   A ``sample_id`` field that records the sample ID from which each
            clip was taken
        -   A ``support`` field that records the ``[first, last]`` frame
            support of each clip
        -   All frame-level information from the underlying dataset of the
            input collection

        Refer to :meth:`fiftyone.core.clips.make_clips_dataset` to see the
        available configuration options for generating clips.

        .. note::

            The clip generation logic will respect any frame-level
            modifications defined in the input collection, but the output clips
            will always contain all frame-level labels.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart-video")

            #
            # Create a clips view that contains one clip for each contiguous
            # segment that contains at least one road sign in every frame
            #

            clips = (
                dataset
                .filter_labels("frames.detections", F("label") == "road sign")
                .to_clips("frames.detections")
            )
            print(clips)

            #
            # Create a clips view that contains one clip for each contiguous
            # segment that contains at least two road signs in every frame
            #

            signs = F("detections.detections").filter(F("label") == "road sign")
            clips = dataset.to_clips(signs.length() >= 2)
            print(clips)

        Args:
            field_or_expr: can be any of the following:

                -   a :class:`fiftyone.core.labels.TemporalDetection`,
                    :class:`fiftyone.core.labels.TemporalDetections`,
                    :class:`fiftyone.core.fields.FrameSupportField`, or list of
                    :class:`fiftyone.core.fields.FrameSupportField` field
                -   a frame-level label list field of any of the following
                    types:

                    -   :class:`fiftyone.core.labels.Classifications`
                    -   :class:`fiftyone.core.labels.Detections`
                    -   :class:`fiftyone.core.labels.Polylines`
                    -   :class:`fiftyone.core.labels.Keypoints`
                -   a :class:`fiftyone.core.expressions.ViewExpression` that
                    returns a boolean to apply to each frame of the input
                    collection to determine if the frame should be clipped
                -   a list of ``[(first1, last1), (first2, last2), ...]`` lists
                    defining the frame numbers of the clips to extract from
                    each sample
            other_fields (None): controls whether sample fields other than the
                default sample fields are included. Can be any of the
                following:

                -   a field or list of fields to include
                -   ``True`` to include all other fields
                -   ``None``/``False`` to include no other fields
            tol (0): the maximum number of false frames that can be overlooked
                when generating clips. Only applicable when ``field_or_expr``
                is a frame-level list field or expression
            min_len (0): the minimum allowable length of a clip, in frames.
                Only applicable when ``field_or_expr`` is a frame-level list
                field or an expression
            trajectories (False): whether to create clips for each unique
                object trajectory defined by their ``(label, index)``. Only
                applicable when ``field_or_expr`` is a frame-level field

        Returns:
            a :class:`fiftyone.core.clips.ClipsView`
        """
        return self._add_view_stage(fos.ToClips(field_or_expr, **kwargs))

    @view_stage
    def to_frames(self, **kwargs):
        """Creates a view that contains one sample per frame in the video
        collection.

        The returned view will contain all frame-level fields and the ``tags``
        of each video as sample-level fields, as well as a ``sample_id`` field
        that records the IDs of the parent sample for each frame.

        By default, ``sample_frames`` is False and this method assumes that the
        frames of the input collection have ``filepath`` fields populated
        pointing to each frame image. Any frames without a ``filepath``
        populated will be omitted from the returned view.

        When ``sample_frames`` is True, this method samples each video in the
        input collection into a directory of per-frame images with the same
        basename as the input video with frame numbers/format specified by
        ``frames_patt``, and stores the resulting frame paths in a ``filepath``
        field of the input collection.

        For example, if ``frames_patt = "%%06d.jpg"``, then videos with the
        following paths::

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

        By default, samples will be generated for every video frame at full
        resolution, but this method provides a variety of parameters that can
        be used to customize the sampling behavior.

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

            frames = dataset.to_frames(sample_frames=True)
            print(frames)

            session.view = frames

            #
            # Create a frames view that only contains frames with at least 10
            # objects, sampled at a maximum frame rate of 1fps
            #

            num_objects = F("detections.detections").length()
            view = dataset.match_frames(num_objects > 10)

            frames = view.to_frames(max_fps=1)
            print(frames)

            session.view = frames

        Args:
            sample_frames (False): whether to assume that the frame images have
                already been sampled at locations stored in the ``filepath``
                field of each frame (False), or whether to sample the video
                frames now according to the specified parameters (True)
            fps (None): an optional frame rate at which to sample each video's
                frames
            max_fps (None): an optional maximum frame rate at which to sample.
                Videos with frame rate exceeding this value are downsampled
            size (None): an optional ``(width, height)`` at which to sample
                frames. A dimension can be -1, in which case the aspect ratio
                is preserved. Only applicable when ``sample_frames=True``
            min_size (None): an optional minimum ``(width, height)`` for each
                frame. A dimension can be -1 if no constraint should be
                applied. The frames are resized (aspect-preserving) if
                necessary to meet this constraint. Only applicable when
                ``sample_frames=True``
            max_size (None): an optional maximum ``(width, height)`` for each
                frame. A dimension can be -1 if no constraint should be
                applied. The frames are resized (aspect-preserving) if
                necessary to meet this constraint. Only applicable when
                ``sample_frames=True``
            sparse (False): whether to only sample frame images for frame
                numbers for which :class:`fiftyone.core.frame.Frame` instances
                exist in the input collection. This parameter has no effect
                when ``sample_frames==False`` since frames must always exist in
                order to have ``filepath`` information use
            frames_patt (None): a pattern specifying the filename/format to use
                to write or check or existing sampled frames, e.g.,
                ``"%%06d.jpg"``. The default value is
                ``fiftyone.config.default_sequence_idx + fiftyone.config.default_image_ext``
            force_sample (False): whether to resample videos whose sampled
                frames already exist. Only applicable when
                ``sample_frames=True``
            skip_failures (True): whether to gracefully continue without
                raising an error if a video cannot be sampled
            verbose (False): whether to log information about the frames that
                will be sampled, if any

        Returns:
            a :class:`fiftyone.core.video.FramesView`
        """
        return self._add_view_stage(fos.ToFrames(**kwargs))

    @classmethod
    def list_aggregations(cls):
        """Returns a list of all available methods on this collection that
        apply :class:`fiftyone.core.aggregations.Aggregation` operations to
        this collection.

        Returns:
            a list of :class:`SampleCollection` method names
        """
        return list(aggregation.all)

    @aggregation
    def bounds(self, field_or_expr, expr=None, safe=False):
        """Computes the bounds of a numeric field of the collection.

        ``None``-valued fields are ignored.

        This aggregation is typically applied to *numeric* field types (or
        lists of such types):

        -   :class:`fiftyone.core.fields.IntField`
        -   :class:`fiftyone.core.fields.FloatField`

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.Dataset()
            dataset.add_samples(
                [
                    fo.Sample(
                        filepath="/path/to/image1.png",
                        numeric_field=1.0,
                        numeric_list_field=[1, 2, 3],
                    ),
                    fo.Sample(
                        filepath="/path/to/image2.png",
                        numeric_field=4.0,
                        numeric_list_field=[1, 2],
                    ),
                    fo.Sample(
                        filepath="/path/to/image3.png",
                        numeric_field=None,
                        numeric_list_field=None,
                    ),
                ]
            )

            #
            # Compute the bounds of a numeric field
            #

            bounds = dataset.bounds("numeric_field")
            print(bounds)  # (min, max)

            #
            # Compute the a bounds of a numeric list field
            #

            bounds = dataset.bounds("numeric_list_field")
            print(bounds)  # (min, max)

            #
            # Compute the bounds of a transformation of a numeric field
            #

            bounds = dataset.bounds(2 * (F("numeric_field") + 1))
            print(bounds)  # (min, max)

        Args:
            field_or_expr: a field name, ``embedded.field.name``,
                :class:`fiftyone.core.expressions.ViewExpression`, or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                defining the field or expression to aggregate. This can also
                be a list or tuple of such arguments, in which case a tuple of
                corresponding aggregation results (each receiving the same
                additional keyword arguments, if any) will be returned
            expr (None): a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                to apply to ``field_or_expr`` (which must be a field) before
                aggregating
            safe (False): whether to ignore nan/inf values when dealing with
                floating point values

        Returns:
            the ``(min, max)`` bounds
        """
        make = lambda field_or_expr: foa.Bounds(
            field_or_expr, expr=expr, safe=safe
        )
        return self._make_and_aggregate(make, field_or_expr)

    @aggregation
    def count(self, field_or_expr=None, expr=None, safe=False):
        """Counts the number of field values in the collection.

        ``None``-valued fields are ignored.

        If no field is provided, the samples themselves are counted.

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
                                fo.Detection(label="cat"),
                                fo.Detection(label="dog"),
                            ]
                        ),
                    ),
                    fo.Sample(
                        filepath="/path/to/image2.png",
                        predictions=fo.Detections(
                            detections=[
                                fo.Detection(label="cat"),
                                fo.Detection(label="rabbit"),
                                fo.Detection(label="squirrel"),
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
            # Count the number of samples in the dataset
            #

            count = dataset.count()
            print(count)  # the count

            #
            # Count the number of samples with `predictions`
            #

            count = dataset.count("predictions")
            print(count)  # the count

            #
            # Count the number of objects in the `predictions` field
            #

            count = dataset.count("predictions.detections")
            print(count)  # the count

            #
            # Count the number of objects in samples with > 2 predictions
            #

            count = dataset.count(
                (F("predictions.detections").length() > 2).if_else(
                    F("predictions.detections"), None
                )
            )
            print(count)  # the count

        Args:
            field_or_expr (None): a field name, ``embedded.field.name``,
                :class:`fiftyone.core.expressions.ViewExpression`, or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                defining the field or expression to aggregate. If neither
                ``field_or_expr`` or ``expr`` is provided, the samples
                themselves are counted. This can also be a list or tuple of
                such arguments, in which case a tuple of corresponding
                aggregation results (each receiving the same additional keyword
                arguments, if any) will be returned
            expr (None): a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                to apply to ``field_or_expr`` (which must be a field) before
                aggregating
            safe (False): whether to ignore nan/inf values when dealing with
                floating point values

        Returns:
            the count
        """
        make = lambda field_or_expr: foa.Count(
            field_or_expr, expr=expr, safe=safe
        )
        return self._make_and_aggregate(make, field_or_expr)

    @aggregation
    def count_values(self, field_or_expr, expr=None, safe=False):
        """Counts the occurrences of field values in the collection.

        This aggregation is typically applied to *countable* field types (or
        lists of such types):

        -   :class:`fiftyone.core.fields.BooleanField`
        -   :class:`fiftyone.core.fields.IntField`
        -   :class:`fiftyone.core.fields.StringField`

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.Dataset()
            dataset.add_samples(
                [
                    fo.Sample(
                        filepath="/path/to/image1.png",
                        tags=["sunny"],
                        predictions=fo.Detections(
                            detections=[
                                fo.Detection(label="cat"),
                                fo.Detection(label="dog"),
                            ]
                        ),
                    ),
                    fo.Sample(
                        filepath="/path/to/image2.png",
                        tags=["cloudy"],
                        predictions=fo.Detections(
                            detections=[
                                fo.Detection(label="cat"),
                                fo.Detection(label="rabbit"),
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
            # Compute the tag counts in the dataset
            #

            counts = dataset.count_values("tags")
            print(counts)  # dict mapping values to counts

            #
            # Compute the predicted label counts in the dataset
            #

            counts = dataset.count_values("predictions.detections.label")
            print(counts)  # dict mapping values to counts

            #
            # Compute the predicted label counts after some normalization
            #

            counts = dataset.count_values(
                F("predictions.detections.label").map_values(
                    {"cat": "pet", "dog": "pet"}
                ).upper()
            )
            print(counts)  # dict mapping values to counts

        Args:
            field_or_expr: a field name, ``embedded.field.name``,
                :class:`fiftyone.core.expressions.ViewExpression`, or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                defining the field or expression to aggregate. This can also
                be a list or tuple of such arguments, in which case a tuple of
                corresponding aggregation results (each receiving the same
                additional keyword arguments, if any) will be returned
            expr (None): a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                to apply to ``field_or_expr`` (which must be a field) before
                aggregating
            safe (False): whether to treat nan/inf values as None when dealing
                with floating point values

        Returns:
            a dict mapping values to counts
        """
        make = lambda field_or_expr: foa.CountValues(
            field_or_expr, expr=expr, safe=safe
        )
        return self._make_and_aggregate(make, field_or_expr)

    @aggregation
    def distinct(self, field_or_expr, expr=None, safe=False):
        """Computes the distinct values of a field in the collection.

        ``None``-valued fields are ignored.

        This aggregation is typically applied to *countable* field types (or
        lists of such types):

        -   :class:`fiftyone.core.fields.BooleanField`
        -   :class:`fiftyone.core.fields.IntField`
        -   :class:`fiftyone.core.fields.StringField`

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.Dataset()
            dataset.add_samples(
                [
                    fo.Sample(
                        filepath="/path/to/image1.png",
                        tags=["sunny"],
                        predictions=fo.Detections(
                            detections=[
                                fo.Detection(label="cat"),
                                fo.Detection(label="dog"),
                            ]
                        ),
                    ),
                    fo.Sample(
                        filepath="/path/to/image2.png",
                        tags=["sunny", "cloudy"],
                        predictions=fo.Detections(
                            detections=[
                                fo.Detection(label="cat"),
                                fo.Detection(label="rabbit"),
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
            # Get the distinct tags in a dataset
            #

            values = dataset.distinct("tags")
            print(values)  # list of distinct values

            #
            # Get the distinct predicted labels in a dataset
            #

            values = dataset.distinct("predictions.detections.label")
            print(values)  # list of distinct values

            #
            # Get the distinct predicted labels after some normalization
            #

            values = dataset.distinct(
                F("predictions.detections.label").map_values(
                    {"cat": "pet", "dog": "pet"}
                ).upper()
            )
            print(values)  # list of distinct values

        Args:
            field_or_expr: a field name, ``embedded.field.name``,
                :class:`fiftyone.core.expressions.ViewExpression`, or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                defining the field or expression to aggregate. This can also
                be a list or tuple of such arguments, in which case a tuple of
                corresponding aggregation results (each receiving the same
                additional keyword arguments, if any) will be returned
            expr (None): a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                to apply to ``field_or_expr`` (which must be a field) before
                aggregating
            safe (False): whether to ignore nan/inf values when dealing with
                floating point values

        Returns:
            a sorted list of distinct values
        """
        make = lambda field_or_expr: foa.Distinct(
            field_or_expr, expr=expr, safe=safe
        )
        return self._make_and_aggregate(make, field_or_expr)

    @aggregation
    def histogram_values(
        self, field_or_expr, expr=None, bins=None, range=None, auto=False
    ):
        """Computes a histogram of the field values in the collection.

        This aggregation is typically applied to *numeric* field types (or
        lists of such types):

        -   :class:`fiftyone.core.fields.IntField`
        -   :class:`fiftyone.core.fields.FloatField`

        Examples::

            import numpy as np
            import matplotlib.pyplot as plt

            import fiftyone as fo
            from fiftyone import ViewField as F

            samples = []
            for idx in range(100):
                samples.append(
                    fo.Sample(
                        filepath="/path/to/image%d.png" % idx,
                        numeric_field=np.random.randn(),
                        numeric_list_field=list(np.random.randn(10)),
                    )
                )

            dataset = fo.Dataset()
            dataset.add_samples(samples)

            def plot_hist(counts, edges):
                counts = np.asarray(counts)
                edges = np.asarray(edges)
                left_edges = edges[:-1]
                widths = edges[1:] - edges[:-1]
                plt.bar(left_edges, counts, width=widths, align="edge")

            #
            # Compute a histogram of a numeric field
            #

            counts, edges, other = dataset.histogram_values(
                "numeric_field", bins=50, range=(-4, 4)
            )

            plot_hist(counts, edges)
            plt.show(block=False)

            #
            # Compute the histogram of a numeric list field
            #

            counts, edges, other = dataset.histogram_values(
                "numeric_list_field", bins=50
            )

            plot_hist(counts, edges)
            plt.show(block=False)

            #
            # Compute the histogram of a transformation of a numeric field
            #

            counts, edges, other = dataset.histogram_values(
                2 * (F("numeric_field") + 1), bins=50
            )

            plot_hist(counts, edges)
            plt.show(block=False)

        Args:
            field_or_expr: a field name, ``embedded.field.name``,
                :class:`fiftyone.core.expressions.ViewExpression`, or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                defining the field or expression to aggregate. This can also
                be a list or tuple of such arguments, in which case a tuple of
                corresponding aggregation results (each receiving the same
                additional keyword arguments, if any) will be returned
            expr (None): a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                to apply to ``field_or_expr`` (which must be a field) before
                aggregating
            bins (None): can be either an integer number of bins to generate or
                a monotonically increasing sequence specifying the bin edges to
                use. By default, 10 bins are created. If ``bins`` is an integer
                and no ``range`` is specified, bin edges are automatically
                distributed in an attempt to evenly distribute the counts in
                each bin
            range (None): a ``(lower, upper)`` tuple specifying a range in
                which to generate equal-width bins. Only applicable when
                ``bins`` is an integer
            auto (False): whether to automatically choose bin edges in an
                attempt to evenly distribute the counts in each bin. If this
                option is chosen, ``bins`` will only be used if it is an
                integer, and the ``range`` parameter is ignored

        Returns:
            a tuple of

            -   counts: a list of counts in each bin
            -   edges: an increasing list of bin edges of length
                ``len(counts) + 1``. Note that each bin is treated as having an
                inclusive lower boundary and exclusive upper boundary,
                ``[lower, upper)``, including the rightmost bin
            -   other: the number of items outside the bins
        """
        make = lambda field_or_expr: foa.HistogramValues(
            field_or_expr, expr=expr, bins=bins, range=range, auto=auto
        )
        return self._make_and_aggregate(make, field_or_expr)

    @aggregation
    def mean(self, field_or_expr, expr=None, safe=False):
        """Computes the arithmetic mean of the field values of the collection.

        ``None``-valued fields are ignored.

        This aggregation is typically applied to *numeric* field types (or
        lists of such types):

        -   :class:`fiftyone.core.fields.IntField`
        -   :class:`fiftyone.core.fields.FloatField`

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.Dataset()
            dataset.add_samples(
                [
                    fo.Sample(
                        filepath="/path/to/image1.png",
                        numeric_field=1.0,
                        numeric_list_field=[1, 2, 3],
                    ),
                    fo.Sample(
                        filepath="/path/to/image2.png",
                        numeric_field=4.0,
                        numeric_list_field=[1, 2],
                    ),
                    fo.Sample(
                        filepath="/path/to/image3.png",
                        numeric_field=None,
                        numeric_list_field=None,
                    ),
                ]
            )

            #
            # Compute the mean of a numeric field
            #

            mean = dataset.mean("numeric_field")
            print(mean)  # the mean

            #
            # Compute the mean of a numeric list field
            #

            mean = dataset.mean("numeric_list_field")
            print(mean)  # the mean

            #
            # Compute the mean of a transformation of a numeric field
            #

            mean = dataset.mean(2 * (F("numeric_field") + 1))
            print(mean)  # the mean

        Args:
            field_or_expr: a field name, ``embedded.field.name``,
                :class:`fiftyone.core.expressions.ViewExpression`, or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                defining the field or expression to aggregate. This can also
                be a list or tuple of such arguments, in which case a tuple of
                corresponding aggregation results (each receiving the same
                additional keyword arguments, if any) will be returned
            expr (None): a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                to apply to ``field_or_expr`` (which must be a field) before
                aggregating
            safe (False): whether to ignore nan/inf values when dealing with
                floating point values

        Returns:
            the mean
        """
        make = lambda field_or_expr: foa.Mean(
            field_or_expr, expr=expr, safe=safe
        )
        return self._make_and_aggregate(make, field_or_expr)

    @aggregation
    def std(self, field_or_expr, expr=None, safe=False, sample=False):
        """Computes the standard deviation of the field values of the
        collection.

        ``None``-valued fields are ignored.

        This aggregation is typically applied to *numeric* field types (or
        lists of such types):

        -   :class:`fiftyone.core.fields.IntField`
        -   :class:`fiftyone.core.fields.FloatField`

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.Dataset()
            dataset.add_samples(
                [
                    fo.Sample(
                        filepath="/path/to/image1.png",
                        numeric_field=1.0,
                        numeric_list_field=[1, 2, 3],
                    ),
                    fo.Sample(
                        filepath="/path/to/image2.png",
                        numeric_field=4.0,
                        numeric_list_field=[1, 2],
                    ),
                    fo.Sample(
                        filepath="/path/to/image3.png",
                        numeric_field=None,
                        numeric_list_field=None,
                    ),
                ]
            )

            #
            # Compute the standard deviation of a numeric field
            #

            std = dataset.std("numeric_field")
            print(std)  # the standard deviation

            #
            # Compute the standard deviation of a numeric list field
            #

            std = dataset.std("numeric_list_field")
            print(std)  # the standard deviation

            #
            # Compute the standard deviation of a transformation of a numeric field
            #

            std = dataset.std(2 * (F("numeric_field") + 1))
            print(std)  # the standard deviation

        Args:
            field_or_expr: a field name, ``embedded.field.name``,
                :class:`fiftyone.core.expressions.ViewExpression`, or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                defining the field or expression to aggregate. This can also
                be a list or tuple of such arguments, in which case a tuple of
                corresponding aggregation results (each receiving the same
                additional keyword arguments, if any) will be returned
            expr (None): a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                to apply to ``field_or_expr`` (which must be a field) before
                aggregating
            safe (False): whether to ignore nan/inf values when dealing with
                floating point values
            sample (False): whether to compute the sample standard deviation rather
                than the population standard deviation

        Returns:
            the standard deviation
        """
        make = lambda field_or_expr: foa.Std(
            field_or_expr, expr=expr, safe=safe, sample=sample
        )
        return self._make_and_aggregate(make, field_or_expr)

    @aggregation
    def sum(self, field_or_expr, expr=None, safe=False):
        """Computes the sum of the field values of the collection.

        ``None``-valued fields are ignored.

        This aggregation is typically applied to *numeric* field types (or
        lists of such types):

        -   :class:`fiftyone.core.fields.IntField`
        -   :class:`fiftyone.core.fields.FloatField`

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.Dataset()
            dataset.add_samples(
                [
                    fo.Sample(
                        filepath="/path/to/image1.png",
                        numeric_field=1.0,
                        numeric_list_field=[1, 2, 3],
                    ),
                    fo.Sample(
                        filepath="/path/to/image2.png",
                        numeric_field=4.0,
                        numeric_list_field=[1, 2],
                    ),
                    fo.Sample(
                        filepath="/path/to/image3.png",
                        numeric_field=None,
                        numeric_list_field=None,
                    ),
                ]
            )

            #
            # Compute the sum of a numeric field
            #

            total = dataset.sum("numeric_field")
            print(total)  # the sum

            #
            # Compute the sum of a numeric list field
            #

            total = dataset.sum("numeric_list_field")
            print(total)  # the sum

            #
            # Compute the sum of a transformation of a numeric field
            #

            total = dataset.sum(2 * (F("numeric_field") + 1))
            print(total)  # the sum

        Args:
            field_or_expr: a field name, ``embedded.field.name``,
                :class:`fiftyone.core.expressions.ViewExpression`, or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                defining the field or expression to aggregate. This can also
                be a list or tuple of such arguments, in which case a tuple of
                corresponding aggregation results (each receiving the same
                additional keyword arguments, if any) will be returned
            expr (None): a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                to apply to ``field_or_expr`` (which must be a field) before
                aggregating
            safe (False): whether to ignore nan/inf values when dealing with
                floating point values

        Returns:
            the sum
        """
        make = lambda field_or_expr: foa.Sum(
            field_or_expr, expr=expr, safe=safe
        )
        return self._make_and_aggregate(make, field_or_expr)

    @aggregation
    def values(
        self,
        field_or_expr,
        expr=None,
        missing_value=None,
        unwind=False,
        _allow_missing=False,
        _big_result=True,
        _raw=False,
    ):
        """Extracts the values of a field from all samples in the collection.

        Values aggregations are useful for efficiently extracting a slice of
        field or embedded field values across all samples in a collection. See
        the examples below for more details.

        The dual function of :meth:`values` is :meth:`set_values`, which can be
        used to efficiently set a field or embedded field of all samples in a
        collection by providing lists of values of same structure returned by
        this aggregation.

        .. note::

            Unlike other aggregations, :meth:`values` does not automatically
            unwind list fields, which ensures that the returned values match
            the potentially-nested structure of the documents.

            You can opt-in to unwinding specific list fields using the ``[]``
            syntax, or you can pass the optional ``unwind=True`` parameter to
            unwind all supported list fields. See
            :ref:`aggregations-list-fields` for more information.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = fo.Dataset()
            dataset.add_samples(
                [
                    fo.Sample(
                        filepath="/path/to/image1.png",
                        numeric_field=1.0,
                        numeric_list_field=[1, 2, 3],
                    ),
                    fo.Sample(
                        filepath="/path/to/image2.png",
                        numeric_field=4.0,
                        numeric_list_field=[1, 2],
                    ),
                    fo.Sample(
                        filepath="/path/to/image3.png",
                        numeric_field=None,
                        numeric_list_field=None,
                    ),
                ]
            )

            #
            # Get all values of a field
            #

            values = dataset.values("numeric_field")
            print(values)  # [1.0, 4.0, None]

            #
            # Get all values of a list field
            #

            values = dataset.values("numeric_list_field")
            print(values)  # [[1, 2, 3], [1, 2], None]

            #
            # Get all values of transformed field
            #

            values = dataset.values(2 * (F("numeric_field") + 1))
            print(values)  # [4.0, 10.0, None]

            #
            # Get values from a label list field
            #

            dataset = foz.load_zoo_dataset("quickstart")

            # list of `Detections`
            detections = dataset.values("ground_truth")

            # list of lists of `Detection` instances
            detections = dataset.values("ground_truth.detections")

            # list of lists of detection labels
            labels = dataset.values("ground_truth.detections.label")

        Args:
            field_or_expr: a field name, ``embedded.field.name``,
                :class:`fiftyone.core.expressions.ViewExpression`, or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                defining the field or expression to aggregate. This can also
                be a list or tuple of such arguments, in which case a tuple of
                corresponding aggregation results (each receiving the same
                additional keyword arguments, if any) will be returned
            expr (None): a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                to apply to ``field_or_expr`` (which must be a field) before
                aggregating
            missing_value (None): a value to insert for missing or
                ``None``-valued fields
            unwind (False): whether to automatically unwind all recognized list
                fields (True) or unwind all list fields except the top-level
                sample field (-1)

        Returns:
            the list of values
        """
        make = lambda field_or_expr: foa.Values(
            field_or_expr,
            expr=expr,
            missing_value=missing_value,
            unwind=unwind,
            _allow_missing=_allow_missing,
            _big_result=_big_result,
            _raw=_raw,
        )
        return self._make_and_aggregate(make, field_or_expr)

    def draw_labels(
        self,
        output_dir,
        label_fields=None,
        overwrite=False,
        config=None,
        **kwargs,
    ):
        """Renders annotated versions of the media in the collection with the
        specified label data overlaid to the given directory.

        The filenames of the sample media are maintained, unless a name
        conflict would occur in ``output_dir``, in which case an index of the
        form ``"-%d" % count`` is appended to the base filename.

        Images are written in format ``fo.config.default_image_ext``, and
        videos are written in format ``fo.config.default_video_ext``.

        Args:
            output_dir: the directory to write the annotated media
            label_fields (None): a label field or list of label fields to
                render. By default, all :class:`fiftyone.core.labels.Label`
                fields are drawn
            overwrite (False): whether to delete ``output_dir`` if it exists
                before rendering
            config (None): an optional
                :class:`fiftyone.utils.annotations.DrawConfig` configuring how
                to draw the labels
            **kwargs: optional keyword arguments specifying parameters of the
                default :class:`fiftyone.utils.annotations.DrawConfig` to
                override

        Returns:
            the list of paths to the rendered media
        """
        if os.path.isdir(output_dir):
            if overwrite:
                etau.delete_dir(output_dir)
            else:
                logger.warning(
                    "Directory '%s' already exists; outputs will be merged "
                    "with existing files",
                    output_dir,
                )

        if label_fields is None:
            label_fields = self._get_label_fields()

        if self.media_type == fom.VIDEO:
            return foua.draw_labeled_videos(
                self,
                output_dir,
                label_fields=label_fields,
                config=config,
                **kwargs,
            )

        return foua.draw_labeled_images(
            self,
            output_dir,
            label_fields=label_fields,
            config=config,
            **kwargs,
        )

    def export(
        self,
        export_dir=None,
        dataset_type=None,
        data_path=None,
        labels_path=None,
        export_media=None,
        dataset_exporter=None,
        label_field=None,
        frame_labels_field=None,
        overwrite=False,
        **kwargs,
    ):
        """Exports the samples in the collection to disk.

        You can perform exports with this method via the following basic
        patterns:

        (a) Provide ``export_dir`` and ``dataset_type`` to export the content
            to a directory in the default layout for the specified format, as
            documented in :ref:`this page <exporting-datasets>`

        (b) Provide ``dataset_type`` along with ``data_path``, ``labels_path``,
            and/or ``export_media`` to directly specify where to export the
            source media and/or labels (if applicable) in your desired format.
            This syntax provides the flexibility to, for example, perform
            workflows like labels-only exports

        (c) Provide a ``dataset_exporter`` to which to feed samples to perform
            a fully-customized export

        In all workflows, the remaining parameters of this method can be
        provided to further configure the export.

        See :ref:`this page <exporting-datasets>` for more information about
        the available export formats and examples of using this method.

        See :ref:`this guide <custom-dataset-exporter>` for more details about
        exporting datasets in custom formats by defining your own
        :class:`fiftyone.utils.data.exporters.DatasetExporter`.

        This method will automatically coerce the data to match the requested
        export in the following cases:

        -   When exporting in either an unlabeled image or image classification
            format, if a spatial label field is provided
            (:class:`fiftyone.core.labels.Detection`,
            :class:`fiftyone.core.labels.Detections`,
            :class:`fiftyone.core.labels.Polyline`, or
            :class:`fiftyone.core.labels.Polylines`), then the
            **image patches** of the provided samples will be exported

        -   When exporting in labeled image dataset formats that expect
            list-type labels (:class:`fiftyone.core.labels.Classifications`,
            :class:`fiftyone.core.labels.Detections`,
            :class:`fiftyone.core.labels.Keypoints`, or
            :class:`fiftyone.core.labels.Polylines`), if a label field contains
            labels in non-list format
            (e.g., :class:`fiftyone.core.labels.Classification`), the labels
            will be automatically upgraded to single-label lists

        -   When exporting in labeled image dataset formats that expect
            :class:`fiftyone.core.labels.Detections` labels, if a
            :class:`fiftyone.core.labels.Classification` field is provided, the
            labels will be automatically upgraded to detections that span the
            entire images

        Args:
            export_dir (None): the directory to which to export the samples in
                format ``dataset_type``. This parameter may be omitted if you
                have provided appropriate values for the ``data_path`` and/or
                ``labels_path`` parameters. Alternatively, this can also be an
                archive path with one of the following extensions::

                    .zip, .tar, .tar.gz, .tgz, .tar.bz, .tbz

                If an archive path is specified, the export is performed in a
                directory of same name (minus extension) and then automatically
                archived and the directory then deleted
            dataset_type (None): the
                :class:`fiftyone.types.dataset_types.Dataset` type to write. If
                not specified, the default type for ``label_field`` is used
            data_path (None): an optional parameter that enables explicit
                control over the location of the exported media for certain
                export formats. Can be any of the following:

                -   a folder name like ``"data"`` or ``"data/"`` specifying a
                    subfolder of ``export_dir`` in which to export the media
                -   an absolute directory path in which to export the media. In
                    this case, the ``export_dir`` has no effect on the location
                    of the data
                -   a filename like ``"data.json"`` specifying the filename of
                    a JSON manifest file in ``export_dir`` generated when
                    ``export_media`` is ``"manifest"``
                -   an absolute filepath specifying the location to write the
                    JSON manifest file when ``export_media`` is ``"manifest"``.
                    In this case, ``export_dir`` has no effect on the location
                    of the data

                If None, a default value of this parameter will be chosen based
                on the value of the ``export_media`` parameter. Note that this
                parameter is not applicable to certain export formats such as
                binary types like TF records
            labels_path (None): an optional parameter that enables explicit
                control over the location of the exported labels. Only
                applicable when exporting in certain labeled dataset formats.
                Can be any of the following:

                -   a type-specific folder name like ``"labels"`` or
                    ``"labels/"`` or a filename like ``"labels.json"`` or
                    ``"labels.xml"`` specifying the location in ``export_dir``
                    in which to export the labels
                -   an absolute directory or filepath in which to export the
                    labels. In this case, the ``export_dir`` has no effect on
                    the location of the labels

                For labeled datasets, the default value of this parameter will
                be chosen based on the export format so that the labels will be
                exported into ``export_dir``
            export_media (None): controls how to export the raw media. The
                supported values are:

                -   ``True``: copy all media files into the output directory
                -   ``False``: don't export media. This option is only useful
                    when exporting labeled datasets whose label format stores
                    sufficient information to locate the associated media
                -   ``"move"``: move all media files into the output directory
                -   ``"symlink"``: create symlinks to the media files in the
                    output directory
                -   ``"manifest"``: create a ``data.json`` in the output
                    directory that maps UUIDs used in the labels files to the
                    filepaths of the source media, rather than exporting the
                    actual media

                If None, an appropriate default value of this parameter will be
                chosen based on the value of the ``data_path`` parameter. Note
                that some dataset formats may not support certain values for
                this parameter (e.g., when exporting in binary formats such as
                TF records, "symlink" is not an option)
            dataset_exporter (None): a
                :class:`fiftyone.utils.data.exporters.DatasetExporter` to use
                to export the samples. When provided, parameters such as
                ``export_dir``, ``dataset_type``, ``data_path``, and
                ``labels_path`` have no effect
            label_field (None): controls the label field(s) to export. Only
                applicable to labeled image datasets or labeled video datasets
                with sample-level labels. Can be any of the following:

                -   the name of a label field to export
                -   a glob pattern of label field(s) to export
                -   a list or tuple of label field(s) to export
                -   a dictionary mapping label field names to keys to use when
                    constructing the label dictionaries to pass to the exporter

                Note that multiple fields can only be specified when the
                exporter used can handle dictionaries of labels. By default,
                the first field of compatible type for the exporter is used
            frame_labels_field (None): controls the frame label field(s) to
                export. Only applicable to labeled video datasets. Can be any
                of the following:

                -   the name of a frame label field to export
                -   a glob pattern of frame label field(s) to export
                -   a list or tuple of frame label field(s) to export
                -   a dictionary mapping frame label field names to keys to use
                    when constructing the frame label dictionaries to pass to
                    the exporter

                Note that multiple fields can only be specified when the
                exporter used can handle dictionaries of frame labels. By
                default, the first field of compatible type for the exporter is
                used
            overwrite (False): whether to delete existing directories before
                performing the export (True) or to merge the export with
                existing files and directories (False)
            **kwargs: optional keyword arguments to pass to the dataset
                exporter's constructor. If you are exporting image patches,
                this can also contain keyword arguments for
                :class:`fiftyone.utils.patches.ImagePatchesExtractor`
        """
        archive_path = None

        # If the user requested an archive, first populate a directory
        if export_dir is not None and etau.is_archive(export_dir):
            archive_path = export_dir
            export_dir, _ = etau.split_archive(archive_path)

        # Perform the export
        _export(
            self,
            export_dir=export_dir,
            dataset_type=dataset_type,
            data_path=data_path,
            labels_path=labels_path,
            export_media=export_media,
            dataset_exporter=dataset_exporter,
            label_field=label_field,
            frame_labels_field=frame_labels_field,
            overwrite=overwrite,
            **kwargs,
        )

        # Make archive, if requested
        if archive_path is not None:
            etau.make_archive(export_dir, archive_path, cleanup=True)

    def annotate(
        self,
        anno_key,
        label_schema=None,
        label_field=None,
        label_type=None,
        classes=None,
        attributes=True,
        mask_targets=None,
        allow_additions=True,
        allow_deletions=True,
        allow_label_edits=True,
        allow_index_edits=True,
        allow_spatial_edits=True,
        media_field="filepath",
        backend=None,
        launch_editor=False,
        **kwargs,
    ):
        """Exports the samples and optional label field(s) in this collection
        to the given annotation backend.

        The ``backend`` parameter controls which annotation backend to use.
        Depending on the backend you use, you may want/need to provide extra
        keyword arguments to this function for the constructor of the backend's
        :class:`fiftyone.utils.annotations.AnnotationBackendConfig` class.

        The natively provided backends and their associated config classes are:

        -   ``"cvat"``: :class:`fiftyone.utils.cvat.CVATBackendConfig`
        -   ``"labelbox"``: :class:`fiftyone.utils.labelbox.LabelboxBackendConfig`

        See :ref:`this page <requesting-annotations>` for more information
        about using this method, including how to define label schemas and how
        to configure login credentials for your annotation provider.

        Args:
            anno_key: a string key to use to refer to this annotation run
            label_schema (None): a dictionary defining the label schema to use.
                If this argument is provided, it takes precedence over the
                other schema-related arguments
            label_field (None): a string indicating a new or existing label
                field to annotate
            label_type (None): a string indicating the type of labels to
                annotate. The possible values are:

                -   ``"classification"``: a single classification stored in
                    :class:`fiftyone.core.labels.Classification` fields
                -   ``"classifications"``: multilabel classifications stored in
                    :class:`fiftyone.core.labels.Classifications` fields
                -   ``"detections"``: object detections stored in
                    :class:`fiftyone.core.labels.Detections` fields
                -   ``"instances"``: instance segmentations stored in
                    :class:`fiftyone.core.labels.Detections` fields with their
                    :attr:`mask <fiftyone.core.labels.Detection.mask>`
                    attributes populated
                -   ``"polylines"``: polylines stored in
                    :class:`fiftyone.core.labels.Polylines` fields with their
                    :attr:`filled <fiftyone.core.labels.Polyline.filled>`
                    attributes set to ``False``
                -   ``"polygons"``: polygons stored in
                    :class:`fiftyone.core.labels.Polylines` fields with their
                    :attr:`filled <fiftyone.core.labels.Polyline.filled>`
                    attributes set to ``True``
                -   ``"keypoints"``: keypoints stored in
                    :class:`fiftyone.core.labels.Keypoints` fields
                -   ``"segmentation"``: semantic segmentations stored in
                    :class:`fiftyone.core.labels.Segmentation` fields
                -   ``"scalar"``: scalar labels stored in
                    :class:`fiftyone.core.fields.IntField`,
                    :class:`fiftyone.core.fields.FloatField`,
                    :class:`fiftyone.core.fields.StringField`, or
                    :class:`fiftyone.core.fields.BooleanField` fields

                All new label fields must have their type specified via this
                argument or in ``label_schema``. Note that annotation backends
                may not support all label types
            classes (None): a list of strings indicating the class options for
                ``label_field`` or all fields in ``label_schema`` without
                classes specified. All new label fields must have a class list
                provided via one of the supported methods. For existing label
                fields, if classes are not provided by this argument nor
                ``label_schema``, they are retrieved from :meth:`get_classes`
                if possible, or else the observed labels on your dataset are
                used
            attributes (True): specifies the label attributes of each label
                field to include (other than their ``label``, which is always
                included) in the annotation export. Can be any of the
                following:

                -   ``True``: export all label attributes
                -   ``False``: don't export any custom label attributes
                -   a list of label attributes to export
                -   a dict mapping attribute names to dicts specifying the
                    ``type``, ``values``, and ``default`` for each attribute

                If provided, this parameter will apply to all label fields in
                ``label_schema`` that do not define their attributes
            mask_targets (None): a dict mapping pixel values to semantic label
                strings. Only applicable when annotating semantic segmentations
            allow_additions (True): whether to allow new labels to be added.
                Only applicable when editing existing label fields
            allow_deletions (True): whether to allow labels to be deleted. Only
                applicable when editing existing label fields
            allow_label_edits (True): whether to allow the ``label`` attribute
                of existing labels to be modified. Only applicable when editing
                existing fields with ``label`` attributes
            allow_index_edits (True): whether to allow the ``index`` attribute
                of existing video tracks to be modified. Only applicable when
                editing existing frame fields with ``index`` attributes
            allow_spatial_edits (True): whether to allow edits to the spatial
                properties (bounding boxes, vertices, keypoints, masks, etc) of
                labels. Only applicable when editing existing spatial label
                fields
            media_field ("filepath"): the field containing the paths to the
                media files to upload
            backend (None): the annotation backend to use. The supported values
                are ``fiftyone.annotation_config.backends.keys()`` and the
                default is ``fiftyone.annotation_config.default_backend``
            launch_editor (False): whether to launch the annotation backend's
                editor after uploading the samples
            **kwargs: keyword arguments for the
                :class:`fiftyone.utils.annotations.AnnotationBackendConfig`

        Returns:
            an :class:`fiftyone.utils.annotations.AnnnotationResults`
        """
        return foua.annotate(
            self,
            anno_key,
            label_schema=label_schema,
            label_field=label_field,
            label_type=label_type,
            classes=classes,
            attributes=attributes,
            mask_targets=mask_targets,
            allow_additions=allow_additions,
            allow_deletions=allow_deletions,
            allow_label_edits=allow_label_edits,
            allow_index_edits=allow_index_edits,
            allow_spatial_edits=allow_spatial_edits,
            media_field=media_field,
            backend=backend,
            launch_editor=launch_editor,
            **kwargs,
        )

    @property
    def has_annotation_runs(self):
        """Whether this colection has any annotation runs."""
        return bool(self.list_annotation_runs())

    def has_annotation_run(self, anno_key):
        """Whether this collection has an annotation run with the given key.

        Args:
            anno_key: an annotation key

        Returns:
            True/False
        """
        return anno_key in self.list_annotation_runs()

    def list_annotation_runs(self):
        """Returns a list of all annotation keys on this collection.

        Returns:
            a list of annotation keys
        """
        return foan.AnnotationMethod.list_runs(self)

    def get_annotation_info(self, anno_key):
        """Returns information about the annotation run with the given key on
        this collection.

        Args:
            anno_key: an annotation key

        Returns:
            a :class:`fiftyone.core.annotation.AnnotationInfo`
        """
        return foan.AnnotationMethod.get_run_info(self, anno_key)

    def load_annotation_results(self, anno_key, **kwargs):
        """Loads the results for the annotation run with the given key on this
        collection.

        The :class:`fiftyone.utils.annotations.AnnotationResults` object
        returned by this method will provide a variety of backend-specific
        methods allowing you to perform actions such as checking the status and
        deleting this run from the annotation backend.

        Use :meth:`load_annotations` to load the labels from an annotation
        run onto your FiftyOne dataset.

        Args:
            anno_key: an annotation key
            **kwargs: optional keyword arguments for
                :meth:`fiftyone.utils.annotations.AnnotationResults.load_credentials`

        Returns:
            a :class:`fiftyone.utils.annotations.AnnotationResults`
        """
        results = foan.AnnotationMethod.load_run_results(self, anno_key)
        results.load_credentials(**kwargs)
        return results

    def load_annotation_view(self, anno_key, select_fields=False):
        """Loads the :class:`fiftyone.core.view.DatasetView` on which the
        specified annotation run was performed on this collection.

        Args:
            anno_key: an annotation key
            select_fields (False): whether to select only the fields involved
                in the annotation run

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return foan.AnnotationMethod.load_run_view(
            self, anno_key, select_fields=select_fields
        )

    def load_annotations(
        self,
        anno_key,
        dest_field=None,
        unexpected="prompt",
        cleanup=False,
        **kwargs,
    ):
        """Downloads the labels from the given annotation run from the
        annotation backend and merges them into this collection.

        See :ref:`this page <loading-annotations>` for more information
        about using this method to import annotations that you have scheduled
        by calling :meth:`annotate`.

        Args:
            anno_key: an annotation key
            dest_field (None): an optional name of a new destination field
                into which to load the annotations, or a dict mapping field names
                in the run's label schema to new desination field names
            unexpected ("prompt"): how to deal with any unexpected labels that
                don't match the run's label schema when importing. The
                supported values are:

                -   ``"prompt"``: present an interactive prompt to
                    direct/discard unexpected labels
                -   ``"ignore"``: automatically ignore any unexpected labels
                -   ``"return"``: return a dict containing all unexpected
                    labels, or ``None`` if there aren't any
            cleanup (False): whether to delete any informtation regarding this
                run from the annotation backend after loading the annotations
            **kwargs: optional keyword arguments for
                :meth:`fiftyone.utils.annotations.AnnotationResults.load_credentials`

        Returns:
            ``None``, unless ``unexpected=="return"`` and unexpected labels are
            found, in which case a dict containing the extra labels is returned
        """
        return foua.load_annotations(
            self,
            anno_key,
            dest_field=dest_field,
            unexpected=unexpected,
            cleanup=cleanup,
            **kwargs,
        )

    def delete_annotation_run(self, anno_key):
        """Deletes the annotation run with the given key from this collection.

        Calling this method only deletes the **record** of the annotation run
        from the collection; it will not delete any annotations loaded onto
        your dataset via :meth:`load_annotations`, nor will it delete any
        associated information from the annotation backend.

        Use :meth:`load_annotation_results` to programmatically manage/delete
        a run from the annotation backend.

        Args:
            anno_key: an annotation key
        """
        foan.AnnotationMethod.delete_run(self, anno_key)

    def delete_annotation_runs(self):
        """Deletes all annotation runs from this collection.

        Calling this method only deletes the **records** of the annotation runs
        from this collection; it will not delete any annotations loaded onto
        your dataset via :meth:`load_annotations`, nor will it delete any
        associated information from the annotation backend.

        Use :meth:`load_annotation_results` to programmatically manage/delete
        runs in the annotation backend.
        """
        foan.AnnotationMethod.delete_runs(self)

    def list_indexes(self):
        """Returns the list of index names on this collection.

        Single-field indexes are referenced by their field name, while compound
        indexes are referenced by more complicated strings. See
        :meth:`pymongo:pymongo.collection.Collection.index_information` for
        details on the compound format.

        Returns:
            the list of index names
        """
        return list(self.get_index_information().keys())

    def get_index_information(self):
        """Returns a dictionary of information about the indexes on this
        collection.

        See :meth:`pymongo:pymongo.collection.Collection.index_information` for
        details on the structure of this dictionary.

        Returns:
            a dict mapping index names to info dicts
        """
        index_info = {}

        # Sample-level indexes
        fields_map = self._get_db_fields_map(reverse=True)
        sample_info = self._dataset._sample_collection.index_information()
        for key, info in sample_info.items():
            if len(info["key"]) == 1:
                field = info["key"][0][0]
                key = fields_map.get(field, field)

            index_info[key] = info

        if self.media_type == fom.VIDEO:
            # Frame-level indexes
            fields_map = self._get_db_fields_map(frames=True, reverse=True)
            frame_info = self._dataset._frame_collection.index_information()
            for key, info in frame_info.items():
                if len(info["key"]) == 1:
                    field = info["key"][0][0]
                    key = fields_map.get(field, field)

                index_info[self._FRAMES_PREFIX + key] = info

        return index_info

    def create_index(self, field_or_spec, unique=False, **kwargs):
        """Creates an index on the given field or with the given specification,
        if necessary.

        Indexes enable efficient sorting, merging, and other such operations.

        Frame-level fields can be indexed by prepending ``"frames."`` to the
        field name.

        If you are indexing a single field and it already has a unique
        constraint, it will be retained regardless of the ``unique`` value you
        specify. Conversely, if the given field already has a non-unique index
        but you requested a unique index, the existing index will be replaced
        with a unique index. Use :meth:`drop_index` to drop an existing index
        first if you wish to modify an existing index in other ways.

        Args:
            field_or_spec: the field name, ``embedded.field.name``, or index
                specification list. See
                :meth:`pymongo:pymongo.collection.Collection.create_index` for
                supported values
            unique (False): whether to add a uniqueness constraint to the index
            **kwargs: optional keyword arguments for
                :meth:`pymongo:pymongo.collection.Collection.create_index`

        Returns:
            the name of the index
        """
        if etau.is_str(field_or_spec):
            input_spec = [(field_or_spec, 1)]
        else:
            input_spec = list(field_or_spec)

        single_field_index = len(input_spec) == 1

        # For single field indexes, provide special handling based on `unique`
        # constraint
        if single_field_index:
            field = input_spec[0][0]

            index_info = self.get_index_information()
            if field in index_info:
                _unique = index_info[field].get("unique", False)
                if _unique or (unique == _unique):
                    # Satisfactory index already exists
                    return field

                _field, is_frame_field = self._handle_frame_field(field)

                if _field == "id":
                    # For some reason ID indexes are not reported by
                    # `get_index_information()` as being unique like other
                    # manually created indexes, but they are, so nothing needs
                    # to be done here
                    return field

                if _field in self._get_default_indexes(frames=is_frame_field):
                    raise ValueError(
                        "Cannot modify default index '%s'" % field
                    )

                # We need to drop existing index and replace with a unique one
                self.drop_index(field)

        is_frame_fields = []
        index_spec = []
        for field, option in input_spec:
            self._validate_root_field(field, include_private=True)
            _field = self._resolve_field(field)
            _field, is_frame_field = self._handle_frame_field(_field)
            is_frame_fields.append(is_frame_field)
            index_spec.append((_field, option))

        if len(set(is_frame_fields)) > 1:
            raise ValueError(
                "Fields in a compound index must be either all sample-level "
                "or all frame-level fields"
            )

        is_frame_index = all(is_frame_fields)

        if is_frame_index:
            coll = self._dataset._frame_collection
        else:
            coll = self._dataset._sample_collection

        name = coll.create_index(index_spec, unique=unique, **kwargs)

        if single_field_index:
            name = input_spec[0][0]
        elif is_frame_index:
            name = self._FRAMES_PREFIX + name

        return name

    def drop_index(self, field_or_name):
        """Drops the index for the given field or name.

        Args:
            field_or_name: a field name, ``embedded.field.name``, or compound
                index name. Use :meth:`list_indexes` to see the available
                indexes
        """
        name, is_frame_index = self._handle_frame_field(field_or_name)

        if is_frame_index:
            if name in self._get_default_indexes(frames=True):
                raise ValueError("Cannot drop default frame index '%s'" % name)

            coll = self._dataset._frame_collection
        else:
            if name in self._get_default_indexes():
                raise ValueError("Cannot drop default index '%s'" % name)

            coll = self._dataset._sample_collection

        index_map = {}
        fields_map = self._get_db_fields_map(
            frames=is_frame_index, reverse=True
        )
        for key, info in coll.index_information().items():
            if len(info["key"]) == 1:
                # We use field name, not pymongo name, for single field indexes
                field = info["key"][0][0]
                index_map[fields_map.get(field, field)] = key
            else:
                index_map[key] = key

        if name not in index_map:
            itype = "frame index" if is_frame_index else "index"
            raise ValueError(
                "%s has no %s '%s'" % (self.__class__.__name__, itype, name)
            )

        coll.drop_index(index_map[name])

    def _get_default_indexes(self, frames=False):
        if frames:
            if self.media_type == fom.VIDEO:
                return ["id", "_sample_id_1_frame_number_1"]

            return []

        return ["id", "filepath"]

    def reload(self):
        """Reloads the collection from the database."""
        raise NotImplementedError("Subclass must implement reload()")

    def to_dict(self, rel_dir=None, frame_labels_dir=None, pretty_print=False):
        """Returns a JSON dictionary representation of the collection.

        Args:
            rel_dir (None): a relative directory to remove from the
                ``filepath`` of each sample, if possible. The path is converted
                to an absolute path (if necessary) via
                :func:`fiftyone.core.utils.normalize_path`. The typical use
                case for this argument is that your source data lives in a
                single directory and you wish to serialize relative, rather
                than absolute, paths to the data within that directory
            frame_labels_dir (None): a directory in which to write per-sample
                JSON files containing the frame labels for video samples. If
                omitted, frame labels will be included directly in the returned
                JSON dict (which can be quite quite large for video datasets
                containing many frames). Only applicable to video datasets
            pretty_print (False): whether to render frame labels JSON in human
                readable format with newlines and indentations. Only applicable
                to video datasets when a ``frame_labels_dir`` is provided

        Returns:
            a JSON dict
        """
        if rel_dir is not None:
            rel_dir = fou.normalize_path(rel_dir) + os.path.sep

        is_video = self.media_type == fom.VIDEO
        write_frame_labels = is_video and frame_labels_dir is not None

        d = {
            "name": self.name,
            "media_type": self.media_type,
            "num_samples": len(self),
            "sample_fields": self._serialize_field_schema(),
        }

        if is_video:
            d["frame_fields"] = self._serialize_frame_field_schema()

        d["info"] = self.info

        if self.classes:
            d["classes"] = self.classes

        if self.default_classes:
            d["default_classes"] = self.default_classes

        if self.mask_targets:
            d["mask_targets"] = self._serialize_mask_targets()

        if self.default_mask_targets:
            d["default_mask_targets"] = self._serialize_default_mask_targets()

        if self.skeletons:
            d["skeletons"] = self._serialize_skeletons()

        if self.default_skeleton:
            d["default_skeleton"] = self._serialize_default_skeleton()

        # Serialize samples
        samples = []
        for sample in self.iter_samples(progress=True):
            sd = sample.to_dict(include_frames=True)

            if write_frame_labels:
                frames = {"frames": sd.pop("frames", {})}
                filename = sample.id + ".json"
                sd["frames"] = filename
                frames_path = os.path.join(frame_labels_dir, filename)
                etas.write_json(frames, frames_path, pretty_print=pretty_print)

            if rel_dir and sd["filepath"].startswith(rel_dir):
                sd["filepath"] = sd["filepath"][len(rel_dir) :]

            samples.append(sd)

        d["samples"] = samples

        return d

    def to_json(self, rel_dir=None, frame_labels_dir=None, pretty_print=False):
        """Returns a JSON string representation of the collection.

        The samples will be written as a list in a top-level ``samples`` field
        of the returned dictionary.

        Args:
            rel_dir (None): a relative directory to remove from the
                ``filepath`` of each sample, if possible. The path is converted
                to an absolute path (if necessary) via
                :func:`fiftyone.core.utils.normalize_path`. The typical use
                case for this argument is that your source data lives in a
                single directory and you wish to serialize relative, rather
                than absolute, paths to the data within that directory
            frame_labels_dir (None): a directory in which to write per-sample
                JSON files containing the frame labels for video samples. If
                omitted, frame labels will be included directly in the returned
                JSON dict (which can be quite quite large for video datasets
                containing many frames). Only applicable to video datasets
            pretty_print (False): whether to render the JSON in human readable
                format with newlines and indentations

        Returns:
            a JSON string
        """
        d = self.to_dict(
            rel_dir=rel_dir,
            frame_labels_dir=frame_labels_dir,
            pretty_print=pretty_print,
        )
        return etas.json_to_str(d, pretty_print=pretty_print)

    def write_json(
        self,
        json_path,
        rel_dir=None,
        frame_labels_dir=None,
        pretty_print=False,
    ):
        """Writes the colllection to disk in JSON format.

        Args:
            json_path: the path to write the JSON
            rel_dir (None): a relative directory to remove from the
                ``filepath`` of each sample, if possible. The path is converted
                to an absolute path (if necessary) via
                :func:`fiftyone.core.utils.normalize_path`. The typical use
                case for this argument is that your source data lives in a
                single directory and you wish to serialize relative, rather
                than absolute, paths to the data within that directory
            frame_labels_dir (None): a directory in which to write per-sample
                JSON files containing the frame labels for video samples. If
                omitted, frame labels will be included directly in the returned
                JSON dict (which can be quite quite large for video datasets
                containing many frames). Only applicable to video datasets
            pretty_print (False): whether to render the JSON in human readable
                format with newlines and indentations
        """
        d = self.to_dict(
            rel_dir=rel_dir,
            frame_labels_dir=frame_labels_dir,
            pretty_print=pretty_print,
        )
        etas.write_json(d, json_path, pretty_print=pretty_print)

    def _add_view_stage(self, stage):
        """Returns a :class:`fiftyone.core.view.DatasetView` containing the
        contents of the collection with the given
        :class:fiftyone.core.stages.ViewStage` appended to its aggregation
        pipeline.

        Subclasses are responsible for performing any validation on the view
        stage to ensure that it is a valid stage to add to this collection.

        Args:
            stage: a :class:fiftyone.core.stages.ViewStage`

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        raise NotImplementedError("Subclass must implement _add_view_stage()")

    def aggregate(self, aggregations):
        """Aggregates one or more
        :class:`fiftyone.core.aggregations.Aggregation` instances.

        Note that it is best practice to group aggregations into a single call
        to :meth:`aggregate`, as this will be more efficient than performing
        multiple aggregations in series.

        Args:
            aggregations: an :class:`fiftyone.core.aggregations.Aggregation` or
                iterable of :class:`fiftyone.core.aggregations.Aggregation`
                instances

        Returns:
            an aggregation result or list of aggregation results corresponding
            to the input aggregation(s)
        """
        if not aggregations:
            return []

        scalar_result = isinstance(aggregations, foa.Aggregation)

        if scalar_result:
            aggregations = [aggregations]

        # Partition aggregations by type
        big_aggs, batch_aggs, facet_aggs = self._parse_aggregations(
            aggregations, allow_big=True
        )

        # Placeholder to store results
        results = [None] * len(aggregations)

        idx_map = {}
        pipelines = []

        # Build batch pipeline
        if batch_aggs:
            pipeline = self._build_batch_pipeline(batch_aggs)
            pipelines.append(pipeline)

        # Build big pipelines
        for idx, aggregation in big_aggs.items():
            pipeline = self._build_big_pipeline(aggregation)
            idx_map[idx] = len(pipelines)
            pipelines.append(pipeline)

        # Build facet-able pipelines
        facet_pipelines = self._build_faceted_pipelines(facet_aggs)
        for idx, pipeline in facet_pipelines.items():
            idx_map[idx] = len(pipelines)
            pipelines.append(pipeline)

        # Run all aggregations
        _results = foo.aggregate(self._dataset._sample_collection, pipelines)

        # Parse batch results
        if batch_aggs:
            result = list(_results[0])

            for idx, aggregation in batch_aggs.items():
                results[idx] = self._parse_big_result(aggregation, result)

        # Parse big results
        for idx, aggregation in big_aggs.items():
            result = list(_results[idx_map[idx]])
            results[idx] = self._parse_big_result(aggregation, result)

        # Parse facet-able results
        for idx, aggregation in facet_aggs.items():
            result = list(_results[idx_map[idx]])
            results[idx] = self._parse_faceted_result(aggregation, result)

        return results[0] if scalar_result else results

    async def _async_aggregate(self, aggregations):
        if not aggregations:
            return []

        scalar_result = isinstance(aggregations, foa.Aggregation)

        if scalar_result:
            aggregations = [aggregations]

        _, _, facet_aggs = self._parse_aggregations(
            aggregations, allow_big=False
        )

        # Placeholder to store results
        results = [None] * len(aggregations)

        idx_map = {}
        pipelines = []

        if facet_aggs:
            # Build facet-able pipelines
            facet_pipelines = self._build_faceted_pipelines(facet_aggs)
            for idx, pipeline in facet_pipelines.items():
                idx_map[idx] = len(pipelines)
                pipelines.append(pipeline)

            # Run all aggregations
            coll_name = self._dataset._sample_collection_name
            collection = foo.get_async_db_conn()[coll_name]
            _results = await foo.aggregate(collection, pipelines)

            # Parse facet-able results
            for idx, aggregation in facet_aggs.items():
                result = list(_results[idx_map[idx]])
                results[idx] = self._parse_faceted_result(aggregation, result)

        return results[0] if scalar_result else results

    def _parse_aggregations(self, aggregations, allow_big=True):
        big_aggs = {}
        batch_aggs = {}
        facet_aggs = {}
        for idx, aggregation in enumerate(aggregations):
            if aggregation._is_big_batchable:
                batch_aggs[idx] = aggregation
            elif aggregation._has_big_result:
                big_aggs[idx] = aggregation
            else:
                facet_aggs[idx] = aggregation

        if not allow_big and (big_aggs or batch_aggs):
            raise ValueError(
                "This method does not support aggregations that return big "
                "results"
            )

        return big_aggs, batch_aggs, facet_aggs

    def _build_batch_pipeline(self, aggs_map):
        project = {}
        attach_frames = False
        for idx, aggregation in aggs_map.items():
            big_field = "value%d" % idx

            _pipeline = aggregation.to_mongo(self, big_field=big_field)
            attach_frames |= aggregation._needs_frames(self)

            try:
                assert len(_pipeline) == 1
                project[big_field] = _pipeline[0]["$project"][big_field]
            except:
                raise ValueError(
                    "Batchable aggregations must have pipelines with a single "
                    "$project stage; found %s" % _pipeline
                )

        return self._pipeline(
            pipeline=[{"$project": project}], attach_frames=attach_frames
        )

    def _build_big_pipeline(self, aggregation):
        return self._pipeline(
            pipeline=aggregation.to_mongo(self, big_field="values"),
            attach_frames=aggregation._needs_frames(self),
        )

    def _build_faceted_pipelines(self, aggs_map):
        pipelines = {}
        for idx, aggregation in aggs_map.items():
            pipelines[idx] = self._pipeline(
                pipeline=aggregation.to_mongo(self),
                attach_frames=aggregation._needs_frames(self),
            )

        return pipelines

    def _parse_big_result(self, aggregation, result):
        if result:
            return aggregation.parse_result(result)

        return aggregation.default_result()

    def _parse_faceted_result(self, aggregation, result):
        if result:
            return aggregation.parse_result(result[0])

        return aggregation.default_result()

    def _pipeline(
        self,
        pipeline=None,
        attach_frames=False,
        detach_frames=False,
        frames_only=False,
    ):
        """Returns the MongoDB aggregation pipeline for the collection.

        Args:
            pipeline (None): a MongoDB aggregation pipeline (list of dicts) to
                append to the current pipeline
            attach_frames (False): whether to attach the frame documents prior
                to executing the pipeline. Only applicable to video datasets
            detach_frames (False): whether to detach the frame documents at the
                end of the pipeline. Only applicable to video datasets
            frames_only (False): whether to generate a pipeline that contains
                *only* the frames in the collection

        Returns:
            the aggregation pipeline
        """
        raise NotImplementedError("Subclass must implement _pipeline()")

    def _aggregate(
        self,
        pipeline=None,
        attach_frames=False,
        detach_frames=False,
        frames_only=False,
    ):
        """Runs the MongoDB aggregation pipeline on the collection and returns
        the result.

        Args:
            pipeline (None): a MongoDB aggregation pipeline (list of dicts) to
                append to the current pipeline
            attach_frames (False): whether to attach the frame documents prior
                to executing the pipeline. Only applicable to video datasets
            detach_frames (False): whether to detach the frame documents at the
                end of the pipeline. Only applicable to video datasets
            frames_only (False): whether to generate a pipeline that contains
                *only* the frames in the collection

        Returns:
            the aggregation result dict
        """
        raise NotImplementedError("Subclass must implement _aggregate()")

    def _make_and_aggregate(self, make, args):
        if isinstance(args, (list, tuple)):
            return tuple(self.aggregate([make(arg) for arg in args]))

        return self.aggregate(make(args))

    def _build_aggregation(self, aggregations):
        scalar_result = isinstance(aggregations, foa.Aggregation)
        if scalar_result:
            aggregations = [aggregations]
        elif not aggregations:
            return False, [], None

        pipelines = {}
        for idx, agg in enumerate(aggregations):
            if not isinstance(agg, foa.Aggregation):
                raise TypeError(
                    "'%s' is not an %s" % (agg.__class__, foa.Aggregation)
                )

            pipelines[str(idx)] = agg.to_mongo(self)

        return scalar_result, aggregations, [{"$facet": pipelines}]

    def _process_aggregations(self, aggregations, result, scalar_result):
        results = []
        for idx, agg in enumerate(aggregations):
            _result = result[str(idx)]
            if _result:
                results.append(agg.parse_result(_result[0]))
            else:
                results.append(agg.default_result())

        return results[0] if scalar_result else results

    def _serialize(self):
        # pylint: disable=no-member
        return self._doc.to_dict(extended=True)

    def _serialize_field_schema(self):
        return self._serialize_schema(self.get_field_schema())

    def _serialize_frame_field_schema(self):
        return self._serialize_schema(self.get_frame_field_schema())

    def _serialize_schema(self, schema):
        return {field_name: str(field) for field_name, field in schema.items()}

    def _serialize_mask_targets(self):
        return self._root_dataset._doc.field_to_mongo("mask_targets")

    def _serialize_default_mask_targets(self):
        return self._root_dataset._doc.field_to_mongo("default_mask_targets")

    def _parse_mask_targets(self, mask_targets):
        if not mask_targets:
            return mask_targets

        return self._root_dataset._doc.field_to_python(
            "mask_targets", mask_targets
        )

    def _parse_default_mask_targets(self, default_mask_targets):
        if not default_mask_targets:
            return default_mask_targets

        return self._root_dataset._doc.field_to_python(
            "default_mask_targets", default_mask_targets
        )

    def _serialize_skeletons(self):
        return self._root_dataset._doc.field_to_mongo("skeletons")

    def _serialize_default_skeleton(self):
        return self._root_dataset._doc.field_to_mongo("default_skeleton")

    def _parse_skeletons(self, skeletons):
        if not skeletons:
            return skeletons

        return self._root_dataset._doc.field_to_python("skeletons", skeletons)

    def _parse_default_skeleton(self, default_skeleton):
        if not default_skeleton:
            return default_skeleton

        return self._root_dataset._doc.field_to_python(
            "default_skeleton", default_skeleton
        )

    def _to_fields_str(self, field_schema):
        max_len = max([len(field_name) for field_name in field_schema]) + 1
        return "\n".join(
            "    %s %s" % ((field_name + ":").ljust(max_len), str(field))
            for field_name, field in field_schema.items()
        )

    def _split_frame_fields(self, fields):
        if etau.is_str(fields):
            fields = [fields]

        if self.media_type != fom.VIDEO:
            return fields, []

        return fou.split_frame_fields(fields)

    def _parse_field_name(
        self,
        field_name,
        auto_unwind=True,
        omit_terminal_lists=False,
        allow_missing=False,
        new_field=None,
    ):
        return _parse_field_name(
            self,
            field_name,
            auto_unwind,
            omit_terminal_lists,
            allow_missing,
            new_field=new_field,
        )

    def _has_field(self, field_path):
        return self.get_field(field_path) is not None

    def _handle_frame_field(self, field_name):
        is_frame_field = self._is_frame_field(field_name)
        if is_frame_field:
            field_name = field_name[len(self._FRAMES_PREFIX) :]

        return field_name, is_frame_field

    def _is_frame_field(self, field_name):
        return (self.media_type == fom.VIDEO) and (
            field_name.startswith(self._FRAMES_PREFIX)
            or field_name == "frames"
        )

    def _handle_id_fields(self, field_name):
        return _handle_id_fields(self, field_name)

    def _is_label_field(self, field_name, label_type_or_types):
        try:
            label_type = self._get_label_field_type(field_name)
        except:
            return False

        try:
            iter(label_type_or_types)
        except:
            label_type_or_types = (label_type_or_types,)

        return any(issubclass(label_type, t) for t in label_type_or_types)

    def _parse_label_field(
        self,
        label_field,
        dataset_exporter=None,
        allow_coercion=False,
        force_dict=False,
        required=False,
    ):
        return _parse_label_field(
            self,
            label_field,
            dataset_exporter=dataset_exporter,
            allow_coercion=allow_coercion,
            force_dict=force_dict,
            required=required,
        )

    def _parse_frame_labels_field(
        self,
        frame_labels_field,
        dataset_exporter=None,
        allow_coercion=False,
        force_dict=False,
        required=False,
    ):
        return _parse_frame_labels_field(
            self,
            frame_labels_field,
            dataset_exporter=dataset_exporter,
            allow_coercion=allow_coercion,
            force_dict=force_dict,
            required=required,
        )

    def _get_db_fields_map(
        self, include_private=False, frames=False, reverse=False
    ):
        if frames:
            schema = self.get_frame_field_schema(
                include_private=include_private
            )
        else:
            schema = self.get_field_schema(include_private=include_private)

        if schema is None:
            return None

        fields_map = {}
        for field_name, field in schema.items():
            if field.db_field != field_name:
                if reverse:
                    fields_map[field.db_field] = field_name
                else:
                    fields_map[field_name] = field.db_field

        return fields_map

    def _get_label_fields(self):
        fields = self._get_sample_label_fields()

        if self.media_type == fom.VIDEO:
            fields.extend(self._get_frame_label_fields())

        return fields

    def _get_sample_label_fields(self):
        return list(
            self.get_field_schema(
                ftype=fof.EmbeddedDocumentField, embedded_doc_type=fol.Label
            ).keys()
        )

    def _get_frame_label_fields(self):
        if self.media_type != fom.VIDEO:
            return None

        return [
            self._FRAMES_PREFIX + field
            for field in self.get_frame_field_schema(
                ftype=fof.EmbeddedDocumentField, embedded_doc_type=fol.Label
            ).keys()
        ]

    def _validate_root_field(self, field_name, include_private=False):
        _ = self._get_root_field_type(
            field_name, include_private=include_private
        )

    def _get_root_field_type(self, field_name, include_private=False):
        field_name, is_frame_field = self._handle_frame_field(field_name)

        if is_frame_field:
            schema = self.get_frame_field_schema(
                include_private=include_private
            )
        else:
            schema = self.get_field_schema(include_private=include_private)

        root = field_name.split(".", 1)[0]

        if root not in schema:
            ftype = "frame field" if is_frame_field else "field"
            raise ValueError(
                "%s has no %s '%s'" % (self.__class__.__name__, ftype, root)
            )

        return schema[root]

    def _get_label_field_type(self, field_name):
        field_name, is_frame_field = self._handle_frame_field(field_name)
        if is_frame_field:
            schema = self.get_frame_field_schema()
        else:
            schema = self.get_field_schema()

        if field_name not in schema:
            ftype = "frame field" if is_frame_field else "field"
            raise ValueError(
                "%s has no %s '%s'"
                % (self.__class__.__name__, ftype, field_name)
            )

        field = schema[field_name]

        if not isinstance(field, fof.EmbeddedDocumentField) or not issubclass(
            field.document_type, fol.Label
        ):
            raise ValueError(
                "Field '%s' is not a Label type; found %s"
                % (field_name, field)
            )

        return field.document_type

    def _get_label_field_path(self, field_name, subfield=None):
        label_type = self._get_label_field_type(field_name)

        if issubclass(label_type, fol._LABEL_LIST_FIELDS):
            field_name += "." + label_type._LABEL_LIST_FIELD

        if subfield:
            field_path = field_name + "." + subfield
        else:
            field_path = field_name

        return label_type, field_path

    def _get_geo_location_field(self):
        geo_schema = self.get_field_schema(
            ftype=fof.EmbeddedDocumentField, embedded_doc_type=fol.GeoLocation
        )
        if not geo_schema:
            raise ValueError("No %s field found to use" % fol.GeoLocation)

        if len(geo_schema) > 1:
            raise ValueError(
                "Multiple %s fields found; you must specify which to use"
                % fol.GeoLocation
            )

        return next(iter(geo_schema.keys()))

    def _unwind_values(self, field_name, values, keep_top_level=False):
        if values is None:
            return None

        list_fields = self._parse_field_name(field_name, auto_unwind=False)[-2]
        level = len(list_fields)

        if keep_top_level:
            return [_unwind_values(v, level - 1) for v in values]

        return _unwind_values(values, level)

    def _make_set_field_pipeline(
        self,
        field,
        expr,
        embedded_root=False,
        allow_missing=False,
        new_field=None,
    ):
        return _make_set_field_pipeline(
            self,
            field,
            expr,
            embedded_root,
            allow_missing=allow_missing,
            new_field=new_field,
        )


def _unwind_values(values, level):
    if not values:
        return values

    while level > 0:
        values = list(itertools.chain.from_iterable(v for v in values if v))
        level -= 1

    return values


def _parse_label_field(
    sample_collection,
    label_field,
    dataset_exporter=None,
    allow_coercion=False,
    force_dict=False,
    required=False,
):
    if isinstance(label_field, dict):
        return label_field

    if _is_glob_pattern(label_field):
        label_field = _get_matching_fields(sample_collection, label_field)

    if etau.is_container(label_field):
        return {f: f for f in label_field}

    if label_field is None and dataset_exporter is not None:
        label_field = _get_default_label_fields_for_exporter(
            sample_collection,
            dataset_exporter,
            allow_coercion=allow_coercion,
            required=required,
        )

    if label_field is None and required:
        raise ValueError(
            "Unable to find any label fields matching the provided arguments"
        )

    if (
        force_dict
        and label_field is not None
        and not isinstance(label_field, dict)
    ):
        return {label_field: label_field}

    return label_field


def _parse_frame_labels_field(
    sample_collection,
    frame_labels_field,
    dataset_exporter=None,
    allow_coercion=False,
    force_dict=False,
    required=False,
):
    if isinstance(frame_labels_field, dict):
        return frame_labels_field

    if _is_glob_pattern(frame_labels_field):
        frame_labels_field = _get_matching_fields(
            sample_collection, frame_labels_field, frames=True
        )

    if etau.is_container(frame_labels_field):
        return {f: f for f in frame_labels_field}

    if frame_labels_field is None and dataset_exporter is not None:
        frame_labels_field = _get_default_frame_label_fields_for_exporter(
            sample_collection,
            dataset_exporter,
            allow_coercion=allow_coercion,
            required=required,
        )

    if frame_labels_field is None and required:
        raise ValueError(
            "Unable to find any frame label fields matching the provided "
            "arguments"
        )

    if (
        force_dict
        and frame_labels_field is not None
        and not isinstance(frame_labels_field, dict)
    ):
        return {frame_labels_field: frame_labels_field}

    return frame_labels_field


def _is_glob_pattern(s):
    if not etau.is_str(s):
        return False

    return "*" in s or "?" in s or "[" in s


def _get_matching_fields(sample_collection, patt, frames=False):
    if frames:
        schema = sample_collection.get_frame_field_schema()
    else:
        schema = sample_collection.get_field_schema()

    return fnmatch.filter(list(schema.keys()), patt)


def _get_default_label_fields_for_exporter(
    sample_collection, dataset_exporter, allow_coercion=True, required=True
):
    label_cls = dataset_exporter.label_cls

    if label_cls is None:
        if required:
            raise ValueError(
                "Cannot select a default field when exporter does not provide "
                "a `label_cls`"
            )

        return None

    media_type = sample_collection.media_type
    label_schema = sample_collection.get_field_schema(
        ftype=fof.EmbeddedDocumentField, embedded_doc_type=fol.Label
    )

    label_field_or_dict = _get_fields_with_types(
        media_type,
        label_schema,
        label_cls,
        frames=False,
        allow_coercion=allow_coercion,
    )

    if label_field_or_dict is not None:
        return label_field_or_dict

    if required:
        # Strange formatting is because `label_cls` may be a tuple
        raise ValueError(
            "No compatible field(s) of type %s found" % (label_cls,)
        )

    return None


def _get_default_frame_label_fields_for_exporter(
    sample_collection, dataset_exporter, allow_coercion=True, required=True
):
    frame_labels_cls = dataset_exporter.frame_labels_cls

    if frame_labels_cls is None:
        if required:
            raise ValueError(
                "Cannot select a default frame field when exporter does not "
                "provide a `frame_labels_cls`"
            )

        return None

    media_type = sample_collection.media_type
    frame_label_schema = sample_collection.get_frame_field_schema(
        ftype=fof.EmbeddedDocumentField, embedded_doc_type=fol.Label
    )

    frame_labels_field_or_dict = _get_fields_with_types(
        media_type,
        frame_label_schema,
        frame_labels_cls,
        frames=True,
        allow_coercion=allow_coercion,
    )

    if frame_labels_field_or_dict is not None:
        return frame_labels_field_or_dict

    if required:
        # Strange formatting is because `frame_labels_cls` may be a tuple
        raise ValueError(
            "No compatible frame field(s) of type %s found"
            % (frame_labels_cls,)
        )

    return None


def _get_fields_with_types(
    media_type, label_schema, label_cls, frames=False, allow_coercion=False
):
    if not isinstance(label_cls, dict):
        return _get_field_with_type(
            media_type,
            label_schema,
            label_cls,
            frames=frames,
            allow_coercion=allow_coercion,
        )

    labels_dict = {}
    for name, _label_cls in label_cls.items():
        field = _get_field_with_type(
            media_type,
            label_schema,
            _label_cls,
            frames=frames,
            allow_coercion=allow_coercion,
        )
        if field is not None:
            labels_dict[field] = name

    return labels_dict if labels_dict else None


def _get_field_with_type(
    media_type, label_schema, label_cls, frames=False, allow_coercion=False
):
    field = _get_matching_label_field(label_schema, label_cls)
    if field is not None:
        return field

    if not allow_coercion:
        return None

    # Allow for extraction of image patches when exporting image classification
    # datasets
    if media_type == fom.IMAGE and label_cls is fol.Classification:
        field = _get_matching_label_field(label_schema, fol._PATCHES_FIELDS)
        if field is not None:
            return field

    # Allow for extraction of video clips when exporting temporal detection
    # datasets
    if (
        media_type == fom.VIDEO
        and not frames
        and label_cls is fol.Classification
    ):
        field = _get_matching_label_field(
            label_schema, (fol.TemporalDetection, fol.TemporalDetections)
        )
        if field is not None:
            return field

    # Wrap single label fields as list fields
    _label_cls = fol._LABEL_LIST_TO_SINGLE_MAP.get(label_cls, None)
    if _label_cls is not None:
        field = _get_fields_with_types(
            media_type,
            label_schema,
            _label_cls,
            frames=frames,
            allow_coercion=False,
        )
        if field is not None:
            return field

    # Allow for conversion of `Classification` labels to `Detections` format
    if label_cls is fol.Detections:
        field = _get_matching_label_field(label_schema, fol.Classification)
        if field is not None:
            return field

    return None


def _get_matching_label_field(label_schema, label_type_or_types):
    valid_fields = []
    for field, field_type in label_schema.items():
        if issubclass(field_type.document_type, label_type_or_types):
            valid_fields.append(field)

    if not valid_fields:
        return None

    if len(valid_fields) > 1:
        logger.info(
            "Found multiple fields %s with compatible type %s; exporting '%s'",
            valid_fields,
            label_type_or_types,
            valid_fields[0],
        )

    return valid_fields[0]


def _parse_values_dict(sample_collection, key_field, values):
    if key_field == "id":
        return zip(*values.items())

    if key_field == "_id":
        sample_ids, values = zip(*values.items())
        return [str(_id) for _id in sample_ids], values

    _key_field = key_field
    (
        key_field,
        is_frame_field,
        list_fields,
        other_list_fields,
        id_to_str,
    ) = sample_collection._parse_field_name(key_field)

    if is_frame_field:
        raise ValueError(
            "Invalid key field '%s'; keys cannot be frame fields" % _key_field
        )

    if list_fields or other_list_fields:
        raise ValueError(
            "Invalid key field '%s'; keys cannot be list fields" % _key_field
        )

    keys = list(values.keys())

    if id_to_str:
        keys = [ObjectId(k) for k in keys]

    view = sample_collection.mongo([{"$match": {key_field: {"$in": keys}}}])
    id_map = {k: v for k, v in zip(*view.values([key_field, "id"]))}

    sample_ids = []
    bad_keys = []
    for key in keys:
        sample_id = id_map.get(key, None)
        if sample_id is not None:
            sample_ids.append(sample_id)
        else:
            bad_keys.append(key)

    if bad_keys:
        raise ValueError(
            "Found %d keys (eg: %s) that do not match the '%s' field of any "
            "samples" % (len(bad_keys), bad_keys[0], key_field)
        )

    values = list(values.values())

    return sample_ids, values


def _parse_frame_values_dicts(sample_collection, sample_ids, values):
    value = _get_non_none_value(values)
    if not isinstance(value, dict):
        return None, values

    if sample_ids is not None:
        view = sample_collection.select(sample_ids, ordered=True)
        frame_ids, frame_numbers = view.values(
            ["frames._id", "frames.frame_number"]
        )
    else:
        sample_ids, frame_ids, frame_numbers = sample_collection.values(
            ["id", "frames._id", "frames.frame_number"]
        )

    id_map = {}
    dicts = []
    for _id, _fids, _fns, _vals in zip(
        sample_ids, frame_ids, frame_numbers, values
    ):
        for _fid, fn in zip(_fids, _fns):
            id_map[(_id, fn)] = _fid

        for fn in set(_vals.keys()) - set(_fns):
            dicts.append({"_sample_id": ObjectId(_id), "frame_number": fn})

    # Insert frame documents for new frame numbers
    if dicts:
        sample_collection._dataset._bulk_write(
            [InsertOne(d) for d in dicts], frames=True
        )  # adds `_id` to each dict

        for d in dicts:
            id_map[(str(d["_sample_id"]), d["frame_number"])] = d["_id"]

    _frame_ids = []
    _values = []
    for _id, _frame_values in zip(sample_ids, values):
        _fns, _vals = zip(*_frame_values.items())
        _fids = [id_map[(_id, fn)] for fn in _fns]

        _frame_ids.append(_fids)
        _values.append(_vals)

    return _frame_ids, _values


def _parse_field_name(
    sample_collection,
    field_name,
    auto_unwind,
    omit_terminal_lists,
    allow_missing,
    new_field=None,
):
    unwind_list_fields = []
    other_list_fields = []

    # Parse explicit array references
    # Note: `field[][]` is valid syntax for list-of-list fields
    chunks = field_name.split("[]")
    for idx in range(len(chunks) - 1):
        unwind_list_fields.append("".join(chunks[: (idx + 1)]))

    # Array references [] have been stripped
    field_name = "".join(chunks)

    # Handle public (string) vs private (ObjectId) ID fields
    field_name, is_id_field, id_to_str = _handle_id_fields(
        sample_collection, field_name
    )

    field_name, is_frame_field = sample_collection._handle_frame_field(
        field_name
    )

    if is_frame_field:
        if field_name == "":
            return "frames", True, [], [], False

        prefix = sample_collection._FRAMES_PREFIX
        unwind_list_fields = [f[len(prefix) :] for f in unwind_list_fields]

        if new_field:
            new_field = new_field[len(prefix) :]
    else:
        prefix = ""

    if not allow_missing and not is_id_field:
        root_field_name = field_name.split(".", 1)[0]

        if sample_collection.get_field(prefix + root_field_name) is None:
            ftype = "Frame field" if is_frame_field else "Field"
            raise ValueError(
                "%s '%s' does not exist on collection '%s'"
                % (ftype, root_field_name, sample_collection.name)
            )

    # Detect list fields in schema
    path = None
    for part in field_name.split("."):
        if path is None:
            path = part
        else:
            path += "." + part

        field_type = sample_collection.get_field(prefix + path)

        if field_type is None:
            break

        if isinstance(field_type, fof.ListField):
            if omit_terminal_lists and path == field_name:
                break

            list_count = 1
            while isinstance(field_type.field, fof.ListField):
                list_count += 1
                field_type = field_type.field

            if auto_unwind:
                if path not in unwind_list_fields:
                    unwind_list_fields.extend([path] * list_count)
            elif path not in unwind_list_fields:
                if path not in other_list_fields:
                    other_list_fields.extend([path] * list_count)

    if is_frame_field:
        if auto_unwind:
            unwind_list_fields = [f for f in unwind_list_fields if f != ""]
        else:
            field_name = prefix + field_name
            unwind_list_fields = [
                prefix + f if f else "frames" for f in unwind_list_fields
            ]
            other_list_fields = [
                prefix + f if f else "frames" for f in other_list_fields
            ]
            if "frames" not in unwind_list_fields:
                if "frames" not in other_list_fields:
                    other_list_fields.append("frames")

    # Sorting is important here because one must unwind field `x` before
    # embedded field `x.y`
    unwind_list_fields = sorted(unwind_list_fields)
    other_list_fields = sorted(other_list_fields)

    def _replace(path):
        return ".".join([new_field] + path.split(".")[1:])

    if new_field:
        field_name = _replace(field_name)
        unwind_list_fields = [_replace(p) for p in unwind_list_fields]
        other_list_fields = [_replace(p) for p in other_list_fields]

    return (
        field_name,
        is_frame_field,
        unwind_list_fields,
        other_list_fields,
        id_to_str,
    )


def _handle_id_fields(sample_collection, field_name):
    if not field_name:
        return field_name, False, False

    if "." not in field_name:
        root = None
        leaf = field_name
    else:
        root, leaf = field_name.rsplit(".", 1)

    is_private = leaf.startswith("_")

    if is_private:
        private_field = field_name
        public_field = leaf[1:]
        if root is not None:
            public_field = root + "." + public_field
    else:
        public_field = field_name
        private_field = "_" + leaf
        if root is not None:
            private_field = root + "." + private_field

    public_type = sample_collection.get_field(
        public_field, include_private=True
    )
    private_type = sample_collection.get_field(
        private_field, include_private=True
    )

    if isinstance(public_type, fof.ObjectIdField):
        id_to_str = not is_private
        return private_field, True, id_to_str

    if isinstance(private_type, fof.ObjectIdField):
        id_to_str = not is_private
        return private_field, True, id_to_str

    return field_name, False, False


def _transform_values(values, fcn, level=1):
    if level < 1:
        return fcn(values)

    if values is None:
        return None

    return [_transform_values(v, fcn, level=level - 1) for v in values]


def _make_set_field_pipeline(
    sample_collection,
    field,
    expr,
    embedded_root,
    allow_missing=False,
    new_field=None,
):
    (
        path,
        is_frame_field,
        list_fields,
        _,
        _,
    ) = sample_collection._parse_field_name(
        field,
        auto_unwind=True,
        omit_terminal_lists=True,
        allow_missing=allow_missing,
        new_field=new_field,
    )

    if is_frame_field and path != "frames":
        path = sample_collection._FRAMES_PREFIX + path
        list_fields = ["frames"] + [
            sample_collection._FRAMES_PREFIX + lf for lf in list_fields
        ]

    # Case 1: no list fields
    if not list_fields:
        expr_dict = _render_expr(expr, path, embedded_root)
        pipeline = [{"$set": {path: expr_dict}}]
        return pipeline, expr_dict

    # Case 2: one list field
    if len(list_fields) == 1:
        list_field = list_fields[0]
        subfield = path[len(list_field) + 1 :]
        expr, expr_dict = _set_terminal_list_field(
            list_field, subfield, expr, embedded_root
        )
        pipeline = [{"$set": {list_field: expr.to_mongo()}}]
        return pipeline, expr_dict

    # Case 3: multiple list fields

    last_list_field = list_fields[-1]
    terminal_prefix = last_list_field[len(list_fields[-2]) + 1 :]
    subfield = path[len(last_list_field) + 1 :]
    expr, expr_dict = _set_terminal_list_field(
        terminal_prefix, subfield, expr, embedded_root
    )

    for list_field1, list_field2 in zip(
        reversed(list_fields[:-1]), reversed(list_fields[1:])
    ):
        inner_list_field = list_field2[len(list_field1) + 1 :]
        expr = F().map(F().set_field(inner_list_field, expr))

    expr = expr.to_mongo(prefix="$" + list_fields[0])

    pipeline = [{"$set": {list_fields[0]: expr}}]

    return pipeline, expr_dict


def _set_terminal_list_field(list_field, subfield, expr, embedded_root):
    map_path = "$this"
    if subfield:
        map_path += "." + subfield

    expr_dict = _render_expr(expr, map_path, embedded_root)

    if subfield:
        map_expr = F().set_field(subfield, expr_dict)
    else:
        map_expr = foe.ViewExpression(expr_dict)

    set_expr = F(list_field).map(map_expr)

    return set_expr, expr_dict


def _render_expr(expr, path, embedded_root):
    if not embedded_root:
        prefix = path
    elif "." in path:
        prefix = path.rsplit(".", 1)[0]
    else:
        prefix = None

    if prefix:
        prefix = "$" + prefix

    return foe.to_mongo(expr, prefix=prefix)


def _get_random_characters(n):
    return "".join(
        random.choice(string.ascii_lowercase + string.digits) for _ in range(n)
    )


def _get_non_none_value(values, level=1):
    for value in values:
        if value is None:
            continue
        elif level > 1:
            result = _get_non_none_value(value, level - 1)
            if result is not None:
                return result
        else:
            return value

    return None


def _export(
    sample_collection,
    export_dir=None,
    dataset_type=None,
    data_path=None,
    labels_path=None,
    export_media=None,
    dataset_exporter=None,
    label_field=None,
    frame_labels_field=None,
    overwrite=False,
    **kwargs,
):
    if dataset_type is None and dataset_exporter is None:
        raise ValueError(
            "Either `dataset_type` or `dataset_exporter` must be provided"
        )

    # Overwrite existing directories or warn if files will be merged
    _handle_existing_dirs(
        dataset_exporter=dataset_exporter,
        export_dir=export_dir,
        data_path=data_path,
        labels_path=labels_path,
        export_media=export_media,
        overwrite=overwrite,
    )

    # If no dataset exporter was provided, construct one
    if dataset_exporter is None:
        dataset_exporter, kwargs = foud.build_dataset_exporter(
            dataset_type,
            warn_unused=False,  # don't warn yet, might be patches kwargs
            export_dir=export_dir,
            data_path=data_path,
            labels_path=labels_path,
            export_media=export_media,
            **kwargs,
        )

    # Get label field(s) to export
    if isinstance(dataset_exporter, foud.LabeledImageDatasetExporter):
        # Labeled images
        label_field = sample_collection._parse_label_field(
            label_field,
            dataset_exporter=dataset_exporter,
            allow_coercion=True,
            required=True,
        )
        frame_labels_field = None
    elif isinstance(dataset_exporter, foud.LabeledVideoDatasetExporter):
        # Labeled videos
        label_field = sample_collection._parse_label_field(
            label_field,
            dataset_exporter=dataset_exporter,
            allow_coercion=True,
            required=False,
        )
        frame_labels_field = sample_collection._parse_frame_labels_field(
            frame_labels_field,
            dataset_exporter=dataset_exporter,
            allow_coercion=True,
            required=False,
        )

        if label_field is None and frame_labels_field is None:
            raise ValueError(
                "Unable to locate compatible sample or frame-level "
                "field(s) to export"
            )

    # Perform the export
    foud.export_samples(
        sample_collection,
        dataset_exporter=dataset_exporter,
        label_field=label_field,
        frame_labels_field=frame_labels_field,
        **kwargs,
    )


def _handle_existing_dirs(
    dataset_exporter=None,
    export_dir=None,
    data_path=None,
    labels_path=None,
    export_media=False,
    overwrite=False,
):
    if dataset_exporter is not None:
        try:
            export_dir = dataset_exporter.export_dir
        except:
            pass

        try:
            data_path = dataset_exporter.data_path
        except:
            pass

        try:
            labels_path = dataset_exporter.labels_path
        except:
            pass

        try:
            export_media = dataset_exporter.export_media
        except:
            pass

    if export_dir is not None and os.path.isdir(export_dir):
        if overwrite:
            etau.delete_dir(export_dir)
        else:
            logger.warning(
                "Directory '%s' already exists; export will be merged with "
                "existing files",
                export_dir,
            )

    # When `export_media=False`, `data_path` is used as a relative directory
    # for filename purposes, not a sink for writing data
    if data_path is not None and export_media != False:
        if os.path.isabs(data_path) or export_dir is None:
            _data_path = data_path
        else:
            _data_path = os.path.join(export_dir, data_path)

        if os.path.isdir(_data_path):
            if overwrite:
                etau.delete_dir(_data_path)
            else:
                logger.warning(
                    "Directory '%s' already exists; export will be merged "
                    "with existing files",
                    _data_path,
                )
        elif os.path.isfile(_data_path):
            if overwrite:
                etau.delete_file(_data_path)

    if labels_path is not None:
        if os.path.isabs(labels_path) or export_dir is None:
            _labels_path = labels_path
        else:
            _labels_path = os.path.join(export_dir, labels_path)

        if os.path.isdir(_labels_path):
            if overwrite:
                etau.delete_dir(_labels_path)
            else:
                logger.warning(
                    "Directory '%s' already exists; export will be merged "
                    "with existing files",
                    _labels_path,
                )
        elif os.path.isfile(_labels_path):
            if overwrite:
                etau.delete_file(_labels_path)


def _add_mapped_fields_as_private_fields(schema):
    additions = {}
    for field in schema.values():
        if field.db_field:
            additions[field.db_field] = field

    schema.update(additions)
