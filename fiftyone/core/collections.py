"""
Interface for sample collections.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import itertools
import inspect
import logging
import os
import random
import string

from deprecated import deprecated
from pymongo import UpdateOne

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone.core.aggregations as foa
import fiftyone.core.brain as fob
import fiftyone.core.expressions as foe
from fiftyone.core.expressions import ViewField as F
import fiftyone.core.evaluation as foev
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.metadata as fomt
import fiftyone.core.models as fomo
from fiftyone.core.odm.frame import DatasetFrameSampleDocument
from fiftyone.core.odm.sample import (
    DatasetSampleDocument,
    default_sample_fields,
)
import fiftyone.core.stages as fos
import fiftyone.core.utils as fou

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

    @property
    def _dataset(self):
        """The underlying :class:`fiftyone.core.dataset.Dataset` for the
        collection.
        """
        raise NotImplementedError("Subclass must implement _dataset")

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

        Raises:
            ValueError: if the collection is empty
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

        Raises:
            ValueError: if the collection is empty
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

    def iter_samples(self):
        """Returns an iterator over the samples in the collection.

        Returns:
            an iterator over :class:`fiftyone.core.sample.Sample` or
            :class:`fiftyone.core.sample.SampleView` instances
        """
        raise NotImplementedError("Subclass must implement iter_samples()")

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
                `_` in the returned schema

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
                `_` in the returned schema

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

    def validate_fields_exist(self, field_or_fields):
        """Validates that the collection has fields with the given names.

        If ``field_or_fields`` contains an embedded field name such as
        ``field_name.document.field``, only the root ``field_name`` is checked
        for existence.

        Args:
            field_or_fields: a field name or iterable of field names

        Raises:
            ValueError: if one or more of the fields do not exist
        """
        if etau.is_str(field_or_fields):
            fields = [field_or_fields]
        else:
            fields = field_or_fields

        if self.media_type == fom.VIDEO:
            frame_fields = list(
                filter(lambda n: n.startswith(self._FRAMES_PREFIX), fields)
            )
            fields = list(
                filter(lambda n: not n.startswith(self._FRAMES_PREFIX), fields)
            )
        else:
            frame_fields = []

        if fields:
            schema = self.get_field_schema(include_private=True)
            default_fields = set(
                default_sample_fields(
                    DatasetSampleDocument,
                    include_private=True,
                    include_id=True,
                )
            )
            for field in fields:
                # We only validate that the root field exists
                field_name = field.split(".", 1)[0]
                if (
                    field_name not in schema
                    and field_name not in default_fields
                    and (
                        field_name == "frames" and self.media_type != fom.VIDEO
                    )
                ):
                    raise ValueError("Field '%s' does not exist" % field_name)

        if frame_fields:
            frame_schema = self.get_frame_field_schema(include_private=True)
            default_frame_fields = set(
                default_sample_fields(
                    DatasetFrameSampleDocument,
                    include_private=True,
                    include_id=True,
                )
            )
            for field in frame_fields:
                # We only validate that the root field exists
                field_name = field.split(".", 2)[1]  # removes "frames."
                if (
                    field_name not in frame_schema
                    and field_name not in default_frame_fields
                ):
                    raise ValueError("Field '%s' does not exist" % field_name)

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

    def tag_samples(self, tag):
        """Adds the tag to all samples in this collection, if necessary.

        Args:
            tag: a tag
        """

        def _add_tag(tags):
            if not tags:
                return [tag]

            if tag in tags:
                return tags

            return tags + [tag]

        self._edit_sample_tags(_add_tag)

    def untag_samples(self, tag):
        """Removes the tag from all samples in this collection, if necessary.

        Args:
            tag: a tag
        """

        def _remove_tag(tags):
            if not tags:
                return tags

            return [t for t in tags if t != tag]

        self._edit_sample_tags(_remove_tag)

    def _edit_sample_tags(self, edit_fcn):
        tags = self.values("tags")
        tags = _transform_values(tags, edit_fcn)
        self.set_values("tags", tags)

    def count_sample_tags(self):
        """Counts the occurrences of sample tags in this collection.

        Returns:
            a dict mapping tags to counts
        """
        return self.count_values("tags")

    def tag_labels(self, tag, label_fields=None):
        """Adds the tag to all labels in the specified label field(s) of this
        collection, if necessary.

        Args:
            tag: a tag
            label_fields (None): an optional name or iterable of names of
                :class:`fiftyone.core.labels.Label` fields. By default, all
                label fields are used
        """

        def _add_tag(tags):
            if not tags:
                return [tag]

            if tag in tags:
                return tags

            return tags + [tag]

        self._edit_label_tags(_add_tag, label_fields=label_fields)

    def untag_labels(self, tag, label_fields=None):
        """Removes the tag from all labels in the specified label field(s) of
        this collection, if necessary.

        Args:
            tag: a tag
            label_fields (None): an optional name or iterable of names of
                :class:`fiftyone.core.labels.Label` fields. By default, all
                label fields are used
        """

        def _remove_tag(tags):
            if not tags:
                return tags

            return [t for t in tags if t != tag]

        self._edit_label_tags(_remove_tag, label_fields=label_fields)

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

            tags = self.values(tags_path)
            tags = _transform_values(tags, edit_fcn, level=level)
            self.set_values(tags_path, tags)

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

    def set_values(self, field_name, values):
        """Sets the field or embedded field on each sample or frame in the
        collection to the given values.

        When setting a sample field ``embedded.field.name``, this function is
        an efficient implementation of the following loop::

            for sample, value in zip(sample_collection, values):
                sample.embedded.field.name = value
                sample.save()

        When modifying a sample field that contains an array, say
        ``embedded.array.field.name``, this function is an efficient
        implementation of the following loop::

            for sample, array_values in zip(sample_collection, values):
                for doc, value in zip(sample.embedded.array):
                    doc.field.name = value

                sample.save()

        When setting a frame field ``frames.embedded.field.name``, this
        function is an efficient implementation of the following loop::

            for sample, frame_values in zip(sample_collection, values):
                for frame, value in zip(sample.frames.values(), frame_values):
                    frame.embedded.field.name = value

                sample.save()

        When modifying a frame field that contains an array, say
        ``frames.embedded.array.field.name``, this function is an efficient
        implementation of the following loop::

            for sample, frame_values in zip(sample_collection, values):
                for frame, array_values in zip(sample.frames.values(), frame_values):
                    for doc, value in zip(frame.embedded.array, array_values):
                        doc.field.name = value

                sample.save()

        Args:
            field_name: a field or ``embedded.field.name``
            values: an iterable of values, one for each sample in the
                collection. When setting frame fields, each element should be
                an iterable of values, one for each frame of the sample. If
                ``field_name`` contains array fields, the corresponding entries
                of ``values`` must be arrays of the same lengths
        """
        field_name, is_frame_field, list_fields, _ = self._parse_field_name(
            field_name
        )

        if list_fields:
            # Don't unroll terminal lists unless explicitly requested
            list_fields = [lf for lf in list_fields if lf != field_name]

        if is_frame_field:
            self._set_frame_values(field_name, values, list_fields)
        else:
            self._set_sample_values(field_name, values, list_fields)

    def _set_sample_values(self, field_name, values, list_fields):
        root = field_name.split(".", 1)[0]
        if root not in self.get_field_schema():
            raise ValueError(
                "Field '%s' does not exist on collection '%s'"
                % (root, self.name)
            )

        if len(list_fields) > 1:
            raise ValueError(
                "At most one array field can be unwound when setting values"
            )

        sample_ids = self._get_sample_ids()

        if list_fields:
            list_field = list_fields[0]
            elem_ids = self.values(list_field + "._id")

            self._set_list_values_by_id(
                field_name, sample_ids, elem_ids, values, list_field
            )
        else:
            self._set_values(field_name, sample_ids, values)

    def _set_frame_values(self, field_name, values, list_fields):
        root = field_name.split(".", 1)[0]
        if root not in self.get_frame_field_schema():
            raise ValueError(
                "Frame field '%s' does not exist on collection '%s'"
                % (root, self.name)
            )

        if len(list_fields) > 1:
            raise ValueError(
                "At most one array field can be unwound when setting values"
            )

        frame_ids = self._get_frame_ids()
        frame_ids = list(itertools.chain.from_iterable(frame_ids))

        values = list(itertools.chain.from_iterable(values))

        if list_fields:
            list_field = list_fields[0]
            elem_ids = self.values(self._FRAMES_PREFIX + list_field + "._id")
            elem_ids = list(itertools.chain.from_iterable(elem_ids))

            self._set_list_values_by_id(
                field_name,
                frame_ids,
                elem_ids,
                values,
                list_field,
                frames=True,
            )
        else:
            self._set_values(field_name, frame_ids, values, frames=True)

    def _set_values(self, field_name, ids, values, frames=False):
        ops = [
            UpdateOne({"_id": _id}, {"$set": {field_name: value}})
            for _id, value in zip(ids, values)
        ]
        self._dataset._bulk_write(ops, frames=frames)

    def _set_list_values_by_id(
        self, field_name, ids, elem_ids, values, list_field, frames=False
    ):
        root = list_field
        leaf = field_name[len(root) + 1 :]

        ops = []
        for _id, _elem_ids, _values in zip(ids, elem_ids, values):
            for _elem_id, value in zip(_elem_ids, _values):
                if _elem_id is None:
                    raise ValueError(
                        "Can only set values of array documents with IDs"
                    )

                update = {"$set": {root + ".$." + leaf: value}}
                op = UpdateOne({"_id": _id, root + "._id": _elem_id}, update)
                ops.append(op)

        self._dataset._bulk_write(ops, frames=frames)

    def _set_all_list_values(
        self, field_name, ids, values, list_field, frames=False
    ):
        # If `self` is a view, this method will only work if the array's
        # elements have not been filtered or reordered, since it updates the
        # entire field on the dataset with one `$set`. Therefore, we do not use
        # this approach currently. However, it does have the advantage that it
        # works if the array contains items that do not have `_id`s, and it
        # might (untested) be faster than `_set_list_values_by_id()`

        root = list_field
        leaf = field_name[len(root) + 1 :]

        ops = []
        for _id, _values in zip(ids, values):
            expr = F.zip(F(root), _values).map(
                F()[0].set_field(leaf, F()[1], relative=False)
            )
            update = [{"$set": {root: expr.to_mongo()}}]
            ops.append(UpdateOne({"_id": _id}, update))

        self._dataset._bulk_write(ops, frames=frames)

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
    ):
        """Applies the :class:`fiftyone.core.models.Model` to the samples in
        the collection.

        Args:
            model: a :class:`fiftyone.core.models.Model`
            label_field ("predictions"): the name (or prefix) of the field in
                which to store the model predictions
            confidence_thresh (None): an optional confidence threshold to apply
                to any applicable labels generated by the model
            store_logits (False): whether to store logits for the model
                predictions. This is only supported when the provided ``model``
                has logits, ``model.has_logits == True``
            batch_size (None): an optional batch size to use. Only applicable
                for image samples
        """
        fomo.apply_model(
            self,
            model,
            label_field=label_field,
            confidence_thresh=confidence_thresh,
            store_logits=store_logits,
            batch_size=batch_size,
        )

    def compute_embeddings(
        self, model, embeddings_field=None, batch_size=None
    ):
        """Computes embeddings for the samples in the collection using the
        given :class:`fiftyone.core.models.Model`.

        The ``model`` must expose embeddings, i.e.,
        :meth:`fiftyone.core.models.Model.has_embeddings` must return ``True``.

        If an ``embeddings_field`` is provided, the embeddings are saved to the
        samples; otherwise, the embeddings are returned in-memory.

        Args:
            model: a :class:`fiftyone.core.models.Model`
            embeddings_field (None): the name of a field in which to store the
                embeddings
            batch_size (None): an optional batch size to use. Only applicable
                for image samples

        Returns:
            ``None``, if an ``embeddings_field`` is provided; otherwise, a
            numpy array whose first dimension is ``len(samples)`` containing
            the embeddings
        """
        return fomo.compute_embeddings(
            self,
            model,
            embeddings_field=embeddings_field,
            batch_size=batch_size,
        )

    def compute_patch_embeddings(
        self,
        model,
        patches_field,
        embeddings_field=None,
        batch_size=None,
        force_square=False,
        alpha=None,
    ):
        """Computes embeddings for the image patches defined by
        ``patches_field`` of the samples in the collection using the given
        :class:`fiftyone.core.models.Model`.

        The ``model`` must expose embeddings, i.e.,
        :meth:`fiftyone.core.models.Model.has_embeddings` must return ``True``.

        If an ``embeddings_field`` is provided, the embeddings are saved to the
        samples; otherwise, the embeddings are returned in-memory.

        Args:
            model: a :class:`fiftyone.core.models.Model`
            patches_field: a :class:`fiftyone.core.labels.Detection`,
                :class:`fiftyone.core.labels.Detections`,
                :class:`fiftyone.core.labels.Polyline`, or
                :class:`fiftyone.core.labels.Polylines` field defining the
                image patches in each sample to embed
            embeddings_field (None): the name of a field in which to store the
                embeddings
            batch_size (None): an optional batch size to use
            force_square (False): whether to minimally manipulate the patch
                bounding boxes into squares prior to extraction
            alpha (None): an optional expansion/contraction to apply to the
                patches before extracting them, in ``[-1, \infty)``. If
                provided, the length and width of the box are expanded (or
                contracted, when ``alpha < 0``) by ``(100 * alpha)%``. For
                example, set ``alpha = 1.1`` to expand the boxes by 10%, and
                set ``alpha = 0.9`` to contract the boxes by 10%

        Returns:
            ``None``, if an ``embeddings_field`` is provided; otherwise, a dict
            mapping sample IDs to arrays of patch embeddings
        """
        return fomo.compute_patch_embeddings(
            self,
            model,
            patches_field,
            embeddings_field=embeddings_field,
            batch_size=batch_size,
            force_square=force_square,
            alpha=alpha,
        )

    def evaluate_classifications(
        self,
        pred_field,
        gt_field="ground_truth",
        eval_key=None,
        classes=None,
        missing="none",
        method="simple",
        config=None,
        **kwargs,
    ):
        """Evaluates the classification predictions in this collection with
        respect to the specified ground truth labels.

        By default, this method simply compares the ground truth and prediction
        for each sample, but other strategies such as binary evaluation and
        top-k matching can be configured via the ``method`` and ``config``
        parameters.

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
            eval_key (None): an evaluation key to use to refer to this
                evaluation
            classes (None): the list of possible classes. If not provided, the
                observed ground truth/predicted labels are used for results
                purposes
            missing ("none"): a missing label string. Any None-valued labels
                are given this label for results purposes
            method ("simple"): a string specifying the evaluation method to use.
                Supported values are ``("simple", "binary", "top-k")``
            config (None): an :class:`ClassificationEvaluationConfig`
                specifying the evaluation method to use. If a ``config`` is
                provided, the ``method`` and ``kwargs`` parameters are ignored
            **kwargs: optional keyword arguments for the constructor of the
                :class:`ClassificationEvaluationConfig` being used

        Returns:
            a :class:`ClassificationResults`
        """
        return foue.evaluate_classifications(
            self,
            pred_field,
            gt_field=gt_field,
            eval_key=eval_key,
            classes=classes,
            missing=missing,
            method=method,
            config=config,
            **kwargs,
        )

    def evaluate_detections(
        self,
        pred_field,
        gt_field="ground_truth",
        eval_key=None,
        classes=None,
        missing="none",
        method="coco",
        iou=0.50,
        classwise=True,
        config=None,
        **kwargs,
    ):
        """Evaluates the specified predicted detections in this collection with
        respect to the specified ground truth detections.

        By default, this method uses COCO-style evaluation, but this can be
        configued via the ``method`` and ``config`` parameters.

        If an ``eval_key`` is provided, a number of fields are populated at the
        detection- and sample-level recording the results of the evaluation:

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

        -   The fields listed below are populated on each individual
            :class:`fiftyone.core.labels.Detection` instance; these fields
            tabulate the TP/FP/FN status of the object, the ID of the matching
            object (if any), and the matching IoU::

                TP/FP/FN: detection.<eval_key>
                      ID: detection.<eval_key>_id
                     IoU: detection.<eval_key>_iou

        Args:
            pred_field: the name of the field containing the predicted
                :class:`fiftyone.core.labels.Detections` to evaluate
            gt_field ("ground_truth"): the name of the field containing the
                ground truth :class:`fiftyone.core.labels.Detections`
            eval_key (None): an evaluation key to use to refer to this
                evaluation
            classes (None): the list of possible classes. If not provided, the
                observed ground truth/predicted labels are used
            missing ("none"): a missing label string. Any unmatched objects are
                given this label for evaluation purposes
            method ("coco"): a string specifying the evaluation method to use.
                Supported values are ``("coco")``
            iou (0.50): the IoU threshold to use to determine matches
            classwise (True): whether to only match objects with the same class
                label (True) or allow matches between classes (False)
            config (None): a
                :class:`fiftyone.utils.eval.detection.DetectionEvaluationConfig`
                specifying the evaluation method to use. If a ``config`` is
                provided, the ``method``, ``iou``, ``classwise``, and
                ``kwargs`` parameters are ignored
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
            classwise=classwise,
            config=config,
            **kwargs,
        )

    def evaluate_segmentations(
        self,
        pred_field,
        gt_field="ground_truth",
        eval_key=None,
        mask_targets=None,
        method="simple",
        config=None,
        **kwargs,
    ):
        """Evaluates the specified semantic segmentation masks in this
        collection with respect to the specified ground truth masks.

        If the size of a predicted mask does not match the ground truth mask,
        it is resized to match the ground truth.

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
            eval_key (None): an evaluation key to use to refer to this
                evaluation
            mask_targets (None): a dict mapping mask values to labels. May
                contain a subset of the possible classes if you wish to
                evaluate a subset of the semantic classes. If not provided,
                mask targets are loaded from
                :meth:`fiftyone.core.dataset.Dataset.mask_targets` or
                :meth:`fiftyone.core.dataset.Dataset.default_mask_targets` if
                possible, or else the observed pixel values are used
            method ("simple"): a string specifying the evaluation method to
                use. Supported values are ``("simple")``
            config (None): a
                :class:`fiftyone.utils.eval.segmentation.SegmentationEvaluationConfig`
                specifying the evaluation method to use. If a ``config`` is
                provided, the ``method`` and ``kwargs`` parameters are ignored
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
            config=config,
            **kwargs,
        )

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
            an :class:`fiftyone.core.brain.BrainInfo`
        """
        return fob.BrainMethod.get_run_info(self, brain_key)

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
        """Deletes the brain method run with the given key from this collection.

        Args:
            brain_key: a brain key
        """
        fob.BrainMethod.delete_run(self, brain_key)

    def delete_brain_runs(self):
        """Deletes all brain method runs from this collection."""
        fob.BrainMethod.delete_runs(self)

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

        Raises:
            :class:`fiftyone.core.stages.ViewStageError`: if the stage was not
                a valid stage for this collection
        """
        return self._add_view_stage(stage)

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
                -   an iterable of sample IDs
                -   a :class:`fiftyone.core.collections.SampleCollection`
                -   an iterable of :class:`fiftyone.core.sample.Sample` or
                    :class:`fiftyone.core.sample.SampleView` instances

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Exclude(sample_ids))

    @view_stage
    def exclude_fields(self, field_names):
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
        return self._add_view_stage(fos.ExcludeFields(field_names))

    @view_stage
    def exclude_labels(self, labels=None, ids=None, tags=None, fields=None):
        """Excludes the specified labels from the collection.

        The returned view will omit samples, sample fields, and individual
        labels that do not match the specified selection criteria.

        You can perform an exclusion via one of the following methods:

        -   Provide one or both of the ``ids`` and ``tags`` arguments, and
            optionally the ``fields`` argument

        -   Provide the ``labels`` argument, which should have the following
            format::

                [
                    {
                        "sample_id": "5f8d254a27ad06815ab89df4",
                        "field": "ground_truth",
                        "label_id": "5f8d254a27ad06815ab89df3",
                    },
                    {
                        "sample_id": "5f8d255e27ad06815ab93bf8",
                        "field": "ground_truth",
                        "label_id": "5f8d255e27ad06815ab93bf6",
                    },
                    ...
                ]

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
            dataset = dataset.clone()  # create a copy since we're modifying data
            dataset.select_labels(ids=ids).tag_labels("test")

            print(dataset.count_values("ground_truth.detections.tags"))
            print(dataset.count_values("predictions.detections.tags"))

            # Exclude the labels via their tag
            view = dataset.exclude_labels(tags=["test"])

            print(dataset.count("ground_truth.detections"))
            print(view.count("ground_truth.detections"))

            print(dataset.count("predictions.detections"))
            print(view.count("predictions.detections"))

        Args:
            labels (None): a list of dicts specifying the labels to exclude
            ids (None): a list of IDs of the labels to exclude
            tags (None): a list of tags of labels to exclude
            fields (None): a list of fields from which to exclude labels
        """
        return self._add_view_stage(
            fos.ExcludeLabels(labels=labels, ids=ids, tags=tags, fields=fields)
        )

    @view_stage
    def exists(self, field, bool=True):
        """Returns a view containing the samples in the collection that have
        (or do not have) a non-``None`` value for the given field.

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
                    fo.Sample(filepath="/path/to/image4.png"),
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

        Args:
            field: the field name
            bool (True): whether to check if the field exists (True) or does
                not exist (False)

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Exists(field, bool=bool))

    @view_stage
    def filter_field(self, field, filter, only_matches=True):
        """Filters the values of a given sample (or embedded document) field
        of each sample in the collection.

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
            field: the name of the field to filter
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
    def filter_labels(self, field, filter, only_matches=True):
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
            field: the labels field to filter
            filter: a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that returns a boolean describing the filter to apply
            only_matches (True): whether to only include samples with at least
                one label after filtering (True) or include all samples (False)

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.FilterLabels(field, filter, only_matches=only_matches)
        )

    @deprecated(reason="Use filter_labels() instead")
    @view_stage
    def filter_classifications(self, field, filter, only_matches=True):
        """Filters the :class:`fiftyone.core.labels.Classification` elements in
        the specified :class:`fiftyone.core.labels.Classifications` field of
        each sample in the collection.

        .. warning::

            This method is deprecated and will be removed in a future release.
            Use the drop-in replacement :meth:`filter_labels` instead.

        Args:
            field: the field to filter, which must be a
                :class:`fiftyone.core.labels.Classifications`
            filter: a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that returns a boolean describing the filter to apply
            only_matches (True): whether to only include samples with at least
                one classification after filtering (True) or include all
                samples (False)

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.FilterClassifications(field, filter, only_matches=only_matches)
        )

    @deprecated(reason="Use filter_labels() instead")
    @view_stage
    def filter_detections(self, field, filter, only_matches=True):
        """Filters the :class:`fiftyone.core.labels.Detection` elements in the
        specified :class:`fiftyone.core.labels.Detections` field of each sample
        in the collection.

        .. warning::

            This method is deprecated and will be removed in a future release.
            Use the drop-in replacement :meth:`filter_labels` instead.

        Args:
            field: the :class:`fiftyone.core.labels.Detections` field
            filter: a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that returns a boolean describing the filter to apply
            only_matches (True): whether to only include samples with at least
                one detection after filtering (True) or include all samples
                (False)

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.FilterDetections(field, filter, only_matches=only_matches)
        )

    @deprecated(reason="Use filter_labels() instead")
    @view_stage
    def filter_polylines(self, field, filter, only_matches=True):
        """Filters the :class:`fiftyone.core.labels.Polyline` elements in the
        specified :class:`fiftyone.core.labels.Polylines` field of each sample
        in the collection.

        .. warning::

            This method is deprecated and will be removed in a future release.
            Use the drop-in replacement :meth:`filter_labels` instead.

        Args:
            field: the :class:`fiftyone.core.labels.Polylines` field
            filter: a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that returns a boolean describing the filter to apply
            only_matches (True): whether to only include samples with at least
                one polyline after filtering (True) or include all samples
                (False)

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.FilterPolylines(field, filter, only_matches=only_matches)
        )

    @deprecated(reason="Use filter_labels() instead")
    @view_stage
    def filter_keypoints(self, field, filter, only_matches=True):
        """Filters the :class:`fiftyone.core.labels.Keypoint` elements in the
        specified :class:`fiftyone.core.labels.Keypoints` field of each sample
        in the collection.

        .. warning::

            This method is deprecated and will be removed in a future release.
            Use the drop-in replacement :meth:`filter_labels` instead.

        Args:
            field: the :class:`fiftyone.core.labels.Keypoints` field
            filter: a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that returns a boolean describing the filter to apply
            only_matches (True): whether to only include samples with at least
                one keypoint after filtering (True) or include all samples
                (False)

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.FilterKeypoints(field, filter, only_matches=only_matches)
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
    def set_field(self, field, expr):
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
            field: the field or embedded field to set
            expr: a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that defines the field value to set

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.SetField(field, expr))

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
    def match_tags(self, tags):
        """Returns a view containing the samples in the collection that have
        any of the given tag(s).

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

        Args:
            tags: the tag or iterable of tags to match

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.MatchTags(tags))

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
    def select(self, sample_ids):
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
                -   a :class:`fiftyone.core.sample.Sample` or
                    :class:`fiftyone.core.sample.SampleView`
                -   an iterable of sample IDs
                -   a :class:`fiftyone.core.collections.SampleCollection`
                -   an iterable of :class:`fiftyone.core.sample.Sample` or
                    :class:`fiftyone.core.sample.SampleView` instances

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Select(sample_ids))

    @view_stage
    def select_fields(self, field_names=None):
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
        return self._add_view_stage(fos.SelectFields(field_names))

    @view_stage
    def select_labels(self, labels=None, ids=None, tags=None, fields=None):
        """Selects only the specified labels from the collection.

        The returned view will omit samples, sample fields, and individual
        labels that do not match the specified selection criteria.

        You can perform a selection via one of the following methods:

        -   Provide one or both of the ``ids`` and ``tags`` arguments, and
            optionally the ``fields`` argument

        -   Provide the ``labels`` argument, which should have the following
            format::

                [
                    {
                        "sample_id": "5f8d254a27ad06815ab89df4",
                        "field": "ground_truth",
                        "label_id": "5f8d254a27ad06815ab89df3",
                    },
                    {
                        "sample_id": "5f8d255e27ad06815ab93bf8",
                        "field": "ground_truth",
                        "label_id": "5f8d255e27ad06815ab93bf6",
                    },
                    ...
                ]

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
            dataset = dataset.clone()  # create a copy since we're modifying data
            dataset.select_labels(ids=ids).tag_labels("test")

            print(dataset.count_label_tags())

            # Retrieve the labels via their tag
            view = dataset.select_labels(tags=["test"])

            print(view.count("ground_truth.detections"))
            print(view.count("predictions.detections"))

        Args:
            labels (None): a list of dicts specifying the labels to select
            ids (None): a list of IDs of the labels to select
            tags (None): a list of tags of labels to select
            fields (None): a list of fields from which to select labels

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.SelectLabels(labels=labels, ids=ids, tags=tags, fields=fields)
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
        """Sorts the samples in the collection by the given field or
        expression.

        When sorting by an expression, ``field_or_expr`` can either be a
        :class:`fiftyone.core.expressions.ViewExpression` or a
        `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
        that defines the quantity to sort by.

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

        Args:
            field_or_expr: the field or expression to sort by
            reverse (False): whether to return the results in descending order

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.SortBy(field_or_expr, reverse=reverse))

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
    def bounds(self, field_name, expr=None):
        """Computes the bounds of a numeric field of the collection.

        ``None``-valued fields are ignored.

        This aggregation is typically applied to *numeric* field types (or
        lists of such types):

        -   :class:`fiftyone.core.fields.IntField`
        -   :class:`fiftyone.core.fields.FloatField`

        Examples::

            import fiftyone as fo

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

            bounds = dataset.bounds("numeric_field", expr=2 * (F() + 1))
            print(bounds)  # (min, max)

        Args:
            field_name: the name of the field to operate on
            expr (None): an optional
                :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                to apply to the field before aggregating

        Returns:
            the ``(min, max)`` bounds
        """
        return self.aggregate(foa.Bounds(field_name, expr=expr))

    @aggregation
    def count(self, field_name=None, expr=None):
        """Counts the number of field values in the collection.

        ``None``-valued fields are ignored.

        If no field is provided, the samples themselves are counted.

        Examples::

            import fiftyone as fo

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
            # Count the number of samples with more than 2 predictions
            #

            expr = (F("detections").length() > 2).if_else(F("detections"), None)
            count = dataset.count("predictions", expr=expr)
            print(count)  # the count

        Args:
            field_name (None): the name of the field to operate on. If none is
                provided, the samples themselves are counted
            expr (None): an optional
                :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                to apply to the field before aggregating

        Returns:
            the count
        """
        return self.aggregate(foa.Count(field_name=field_name, expr=expr))

    @aggregation
    def count_values(self, field_name, expr=None):
        """Counts the occurrences of field values in the collection.

        This aggregation is typically applied to *countable* field types (or
        lists of such types):

        -   :class:`fiftyone.core.fields.BooleanField`
        -   :class:`fiftyone.core.fields.IntField`
        -   :class:`fiftyone.core.fields.StringField`

        Examples::

            import fiftyone as fo

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

            expr = F().map_values({"cat": "pet", "dog": "pet"}).upper()
            counts = dataset.count_values("predictions.detections.label", expr=expr)
            print(counts)  # dict mapping values to counts

        Args:
            field_name: the name of the field to operate on
            expr (None): an optional
                :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                to apply to the field before aggregating

        Returns:
            a dict mapping values to counts
        """
        return self.aggregate(foa.CountValues(field_name, expr=expr))

    @aggregation
    def distinct(self, field_name, expr=None):
        """Computes the distinct values of a field in the collection.

        ``None``-valued fields are ignored.

        This aggregation is typically applied to *countable* field types (or
        lists of such types):

        -   :class:`fiftyone.core.fields.BooleanField`
        -   :class:`fiftyone.core.fields.IntField`
        -   :class:`fiftyone.core.fields.StringField`

        Examples::

            import fiftyone as fo

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

            expr = F().map_values({"cat": "pet", "dog": "pet"}).upper()
            values = dataset.distinct("predictions.detections.label", expr=expr)
            print(values)  # list of distinct values

        Args:
            field_name: the name of the field to operate on
            expr (None): an optional
                :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                to apply to the field before aggregating

        Returns:
            a sorted list of distinct values
        """
        return self.aggregate(foa.Distinct(field_name, expr=expr))

    @aggregation
    def histogram_values(
        self, field_name, expr=None, bins=None, range=None, auto=False
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
                "numeric_field", expr=2 * (F() + 1), bins=50
            )

            plot_hist(counts, edges)
            plt.show(block=False)

        Args:
            field_name: the name of the field to operate on
            expr (None): an optional
                :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                to apply to the field before aggregating
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
        return self.aggregate(
            foa.HistogramValues(
                field_name, expr=expr, bins=bins, range=range, auto=auto
            )
        )

    @aggregation
    def mean(self, field_name, expr=None):
        """Computes the arithmetic mean of the field values of the collection.

        ``None``-valued fields are ignored.

        This aggregation is typically applied to *numeric* field types (or
        lists of such types):

        -   :class:`fiftyone.core.fields.IntField`
        -   :class:`fiftyone.core.fields.FloatField`

        Examples::

            import fiftyone as fo

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

            mean = dataset.mean("numeric_field", expr=2 * (F() + 1))
            print(mean)  # the mean

        Args:
            field_name: the name of the field to operate on
            expr (None): an optional
                :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                to apply to the field before aggregating

        Returns:
            the mean
        """
        return self.aggregate(foa.Mean(field_name, expr=expr))

    @aggregation
    def std(self, field_name, expr=None, sample=False):
        """Computes the standard deviation of the field values of the
        collection.

        ``None``-valued fields are ignored.

        This aggregation is typically applied to *numeric* field types (or
        lists of such types):

        -   :class:`fiftyone.core.fields.IntField`
        -   :class:`fiftyone.core.fields.FloatField`

        Examples::

            import fiftyone as fo

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

            std = dataset.std("numeric_field", expr=2 * (F() + 1))
            print(std)  # the standard deviation

        Args:
            field_name: the name of the field to operate on
            expr (None): an optional
                :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                to apply to the field before aggregating
            sample (False): whether to compute the sample standard deviation rather
                than the population standard deviation

        Returns:
            the standard deviation
        """
        return self.aggregate(foa.Std(field_name, expr=expr, sample=sample))

    @aggregation
    def sum(self, field_name, expr=None):
        """Computes the sum of the field values of the collection.

        ``None``-valued fields are ignored.

        This aggregation is typically applied to *numeric* field types (or
        lists of such types):

        -   :class:`fiftyone.core.fields.IntField`
        -   :class:`fiftyone.core.fields.FloatField`

        Examples::

            import fiftyone as fo

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

            total = dataset.sum("numeric_field", expr=2 * (F() + 1))
            print(total)  # the sum

        Args:
            field_name: the name of the field to operate on
            expr (None): an optional
                :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                to apply to the field before aggregating

        Returns:
            the sum
        """
        return self.aggregate(foa.Sum(field_name, expr=expr))

    @aggregation
    def values(self, field_name, expr=None, missing_value=None):
        """Extracts the values of a field from all samples in the collection.

        .. note::

            Unlike other aggregations, :meth:`values` does not *automatically*
            unwind top-level list fields and label list fields. This default
            behavior ensures that there is a 1-1 correspondence between the
            elements of the output list and the samples in the collection.

            You can opt-in to unwinding list fields using the ``[]`` syntax.

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

            values = dataset.values("numeric_field", expr=2 * (F() + 1))
            print(values)  # [4.0, 10.0, None]

        Args:
            field_name: the name of the field to operate on
            expr (None): an optional
                :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                to apply to the field before aggregating
            missing_value (None): a value to insert for missing or
                ``None``-valued fields

        Returns:
            the list of values
        """
        return self.aggregate(
            foa.Values(field_name, expr=expr, missing_value=missing_value)
        )

    def draw_labels(
        self,
        anno_dir,
        label_fields=None,
        overwrite=False,
        annotation_config=None,
    ):
        """Renders annotated versions of the samples in the collection with
        label field(s) overlaid to the given directory.

        The filenames of the sample data are maintained, unless a name conflict
        would occur in ``anno_dir``, in which case an index of the form
        ``"-%d" % count`` is appended to the base filename.

        Images are written in format ``fo.config.default_image_ext``.

        Args:
            anno_dir: the directory to write the annotated files
            label_fields (None): a list of :class:`fiftyone.core.labels.Label`
                fields to render. By default, all
                :class:`fiftyone.core.labels.Label` fields are drawn
            overwrite (False): whether to delete ``anno_dir`` if it exists
                before rendering the labels
            annotation_config (None): an
                :class:`fiftyone.utils.annotations.AnnotationConfig` specifying
                how to render the annotations

        Returns:
            the list of paths to the labeled images
        """
        if os.path.isdir(anno_dir):
            if overwrite:
                etau.delete_dir(anno_dir)
            else:
                logger.warning(
                    "Directory '%s' already exists; outputs will be merged "
                    "with existing files",
                    anno_dir,
                )

        if self.media_type == fom.VIDEO:
            if label_fields is None:
                label_fields = _get_frame_label_fields(self)

                return foua.draw_labeled_videos(
                    self,
                    anno_dir,
                    label_fields=label_fields,
                    annotation_config=annotation_config,
                )

        if label_fields is None:
            label_fields = _get_image_label_fields(self)

        return foua.draw_labeled_images(
            self,
            anno_dir,
            label_fields=label_fields,
            annotation_config=annotation_config,
        )

    def export(
        self,
        export_dir=None,
        dataset_type=None,
        dataset_exporter=None,
        label_field=None,
        label_prefix=None,
        labels_dict=None,
        frame_labels_field=None,
        frame_labels_prefix=None,
        frame_labels_dict=None,
        overwrite=False,
        **kwargs,
    ):
        """Exports the samples in the collection to disk.

        Provide either ``export_dir`` and ``dataset_type`` or
        ``dataset_exporter`` to perform an export.

        See :ref:`this guide <custom-dataset-exporter>` for more details about
        exporting datasets in custom formats by defining your own
        :class:`DatasetExporter <fiftyone.utils.data.exporters.DatasetExporter>`.

        Args:
            export_dir (None): the directory to which to export the samples in
                format ``dataset_type``
            dataset_type (None): the
                :class:`fiftyone.types.dataset_types.Dataset` type to write. If
                not specified, the default type for ``label_field`` is used
            dataset_exporter (None): a
                :class:`fiftyone.utils.data.exporters.DatasetExporter` to use
                to export the samples
            label_field (None): the name of the label field to export. Only
                applicable to labeled image datasets or labeled video datasets
                with sample-level labels. If none of ``label_field``,
                ``label_prefix``, and ``labels_dict`` are specified and the
                requested output type is a labeled image dataset or labeled
                video dataset with sample-level labels, the first field of
                compatible type for the output format is used
            label_prefix (None): a label field prefix; all fields whose name
                starts with the given prefix will be exported (with the prefix
                removed when constructing the label dicts). Only applicable to
                labeled image datasets or labeled video datasets with
                sample-level labels. This parameter can only be used when the
                exporter can handle dictionaries of labels
            labels_dict (None): a dictionary mapping label field names to keys
                to use when constructing the label dict to pass to the
                exporter. Only applicable to labeled image datasets or labeled
                video datasets with sample-level labels. This parameter can
                only be used when the exporter can handle dictionaries of
                labels
            frame_labels_field (None): the name of the frame labels field to
                export. Only applicable for labeled video datasets. If none of
                ``frame_labels_field``, ``frame_labels_prefix``, and
                ``frame_labels_dict`` are specified and the requested output
                type is a labeled video dataset with frame-level labels, the
                first frame-level field of compatible type for the output
                format is used
            frame_labels_prefix (None): a frame labels field prefix; all
                frame-level fields whose name starts with the given prefix will
                be exported (with the prefix removed when constructing the
                frame label dicts). Only applicable for labeled video datasets.
                This parameter can only be used when the exporter can handle
                dictionaries of frame-level labels
            frame_labels_dict (None): a dictionary mapping frame-level label
                field names to keys to use when constructing the frame labels
                dicts to pass to the exporter. Only applicable for labeled
                video datasets. This parameter can only be used when the
                exporter can handle dictionaries of frame-level labels
            overwrite (False): when an ``export_dir`` is provided, whether to
                delete the existing directory before performing the export
            **kwargs: optional keyword arguments to pass to
                ``dataset_type.get_dataset_exporter_cls(export_dir, **kwargs)``
        """
        if dataset_type is None and dataset_exporter is None:
            raise ValueError(
                "Either `dataset_type` or `dataset_exporter` must be provided"
            )

        if dataset_type is not None and inspect.isclass(dataset_type):
            dataset_type = dataset_type()

        # If no dataset exporter was provided, construct one based on the
        # dataset type
        if dataset_exporter is None:
            if os.path.isdir(export_dir):
                if overwrite:
                    etau.delete_dir(export_dir)
                else:
                    logger.warning(
                        "Directory '%s' already exists; export will be merged "
                        "with existing files",
                        export_dir,
                    )

            dataset_exporter_cls = dataset_type.get_dataset_exporter_cls()

            try:
                dataset_exporter = dataset_exporter_cls(export_dir, **kwargs)
            except Exception as e:
                exporter_name = dataset_exporter_cls.__name__
                raise ValueError(
                    "Failed to construct exporter using syntax "
                    "%s(export_dir, **kwargs); you may need to supply "
                    "mandatory arguments to the constructor via `kwargs`. "
                    "Please consult the documentation of `%s` to learn more"
                    % (
                        exporter_name,
                        etau.get_class_name(dataset_exporter_cls),
                    )
                ) from e

        # Get label field(s) to export
        if isinstance(dataset_exporter, foud.LabeledImageDatasetExporter):
            # Labeled images
            label_field_or_dict = get_label_fields(
                self,
                label_field=label_field,
                label_prefix=label_prefix,
                labels_dict=labels_dict,
                dataset_exporter=dataset_exporter,
                required=True,
            )
            frame_labels_field_or_dict = None
        elif isinstance(dataset_exporter, foud.LabeledVideoDatasetExporter):
            # Labeled videos
            label_field_or_dict = get_label_fields(
                self,
                label_field=label_field,
                label_prefix=label_prefix,
                labels_dict=labels_dict,
                dataset_exporter=dataset_exporter,
                required=False,
            )
            frame_labels_field_or_dict = get_frame_labels_fields(
                self,
                frame_labels_field=frame_labels_field,
                frame_labels_prefix=frame_labels_prefix,
                frame_labels_dict=frame_labels_dict,
                dataset_exporter=dataset_exporter,
                required=False,
            )

            if (
                label_field_or_dict is None
                and frame_labels_field_or_dict is None
            ):
                raise ValueError(
                    "Unable to locate compatible sample or frame-level "
                    "field(s) to export"
                )
        else:
            # Other (unlabeled, entire samples, etc)
            label_field_or_dict = None
            frame_labels_field_or_dict = None

        # Export the dataset
        foud.export_samples(
            self,
            dataset_exporter=dataset_exporter,
            label_field_or_dict=label_field_or_dict,
            frame_labels_field_or_dict=frame_labels_field_or_dict,
        )

    def list_indexes(self):
        """Returns the fields of the dataset that are indexed.

        Returns:
            a list of field names
        """
        raise NotImplementedError("Subclass must implement list_indexes()")

    def create_index(self, field_name, unique=False):
        """Creates an index on the given field.

        If the given field already has a unique index, it will be retained
        regardless of the ``unique`` value you specify.

        If the given field already has a non-unique index but you requested a
        unique index, the existing index will be dropped.

        Indexes enable efficient sorting, merging, and other such operations.

        Args:
            field_name: the field name or ``embedded.field.name``
            unique (False): whether to add a uniqueness constraint to the index
        """
        raise NotImplementedError("Subclass must implement create_index()")

    def drop_index(self, field_name):
        """Drops the index on the given field.

        Args:
            field_name: the field name or ``embedded.field.name``
        """
        raise NotImplementedError("Subclass must implement drop_index()")

    def to_dict(self, rel_dir=None, frame_labels_dir=None, pretty_print=False):
        """Returns a JSON dictionary representation of the collection.

        Args:
            rel_dir (None): a relative directory to remove from the
                ``filepath`` of each sample, if possible. The path is converted
                to an absolute path (if necessary) via
                ``os.path.abspath(os.path.expanduser(rel_dir))``. The typical
                use case for this argument is that your source data lives in
                a single directory and you wish to serialize relative, rather
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
            rel_dir = (
                os.path.abspath(os.path.expanduser(rel_dir)) + os.path.sep
            )
            len_rel_dir = len(rel_dir)

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
        d["default_mask_targets"] = self._serialize_default_mask_targets()
        d["mask_targets"] = self._serialize_mask_targets()

        # Serialize samples
        samples = []
        with fou.ProgressBar() as pb:
            for sample in pb(self):
                sd = sample.to_dict(include_frames=True)

                if write_frame_labels:
                    frames = {"frames": sd.pop("frames", {})}
                    filename = sample.id + ".json"
                    sd["frames"] = filename
                    frames_path = os.path.join(frame_labels_dir, filename)
                    etas.write_json(
                        frames, frames_path, pretty_print=pretty_print
                    )

                if rel_dir and sd["filepath"].startswith(rel_dir):
                    sd["filepath"] = sd["filepath"][len_rel_dir:]

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
                ``os.path.abspath(os.path.expanduser(rel_dir))``. The typical
                use case for this argument is that your source data lives in
                a single directory and you wish to serialize relative, rather
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
                ``os.path.abspath(os.path.expanduser(rel_dir))``. The typical
                use case for this argument is that your source data lives in
                a single directory and you wish to serialize relative, rather
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

        Raises:
            :class:`fiftyone.core.stages.ViewStageError`: if the stage was not
                a valid stage for this collection
        """
        raise NotImplementedError("Subclass must implement _add_view_stage()")

    def aggregate(self, aggregations, _attach_frames=True):
        """Aggregates one or more
        :class:`fiftyone.core.aggregations.Aggregation` instances.

        Note that it is best practice to group aggregations into a single call
        to :meth:`aggregate() <aggregate>`, as this will be more efficient than
        performing multiple aggregations in series.

        Args:
            aggregations: an :class:`fiftyone.core.aggregations.Aggregation` or
                iterable of :class:`<fiftyone.core.aggregations.Aggregation>`
                instances

        Returns:
            an aggregation result or list of aggregation results corresponding
            to the input aggregation(s)
        """
        scalar_result, aggregations, facets = self._build_aggregation(
            aggregations
        )
        if not aggregations:
            return []

        pipeline = self._pipeline(
            pipeline=facets, attach_frames=_attach_frames
        )

        result = self._dataset._sample_collection.aggregate(pipeline)
        result = next(result)

        return self._process_aggregations(aggregations, result, scalar_result)

    def _pipeline(self, pipeline=None, attach_frames=True, frames_only=False):
        """Returns the MongoDB aggregation pipeline for the collection.

        Args:
            pipeline (None): a MongoDB aggregation pipeline (list of dicts) to
                append to the current pipeline
            attach_frames (True): whether to attach the frame documents to the
                result. Only applicable to video datasets
            frames_only (True): whether to generate a pipeline that contains
                *only* the frames in the collection

        Returns:
            the aggregation pipeline
        """
        raise NotImplementedError("Subclass must implement _pipeline()")

    def _aggregate(self, pipeline=None, attach_frames=True):
        """Runs the MongoDB aggregation pipeline on the collection and returns
        the result.

        Args:
            pipeline (None): a MongoDB aggregation pipeline (list of dicts) to
                append to the current pipeline
            attach_frames (True): whether to attach the frame documents to the
                result. Only applicable to video datasets

        Returns:
            the aggregation result dict
        """
        raise NotImplementedError("Subclass must implement _aggregate()")

    def _get_sample_ids(self):
        result = self._aggregate(
            [{"$group": {"_id": None, "result": {"$push": "$_id"}}}],
            attach_frames=False,
        )

        try:
            return next(result)["result"]
        except StopIteration:
            return []

    def _get_frame_ids(self):
        if self.media_type != fom.VIDEO:
            return []

        result = self._aggregate(
            [
                {
                    "$project": {
                        "frames": {
                            "$map": {
                                "input": "$frames",
                                "as": "this",
                                "in": "$$this._id",
                            }
                        }
                    }
                },
                {"$group": {"_id": None, "result": {"$push": "$frames"}}},
            ],
            attach_frames=True,
        )

        try:
            return next(result)["result"]
        except StopIteration:
            return []

    async def _async_aggregate(self, sample_collection, aggregations):
        scalar_result, aggregations, facets = self._build_aggregation(
            aggregations
        )
        if not aggregations:
            return []

        # pylint: disable=no-member
        pipeline = self._pipeline(pipeline=facets)

        result = await sample_collection.aggregate(pipeline).to_list(1)
        result = result[0]

        return self._process_aggregations(aggregations, result, scalar_result)

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
        return self._dataset._doc.field_to_mongo("mask_targets")

    def _serialize_default_mask_targets(self):
        return self._dataset._doc.field_to_mongo("default_mask_targets")

    def _parse_mask_targets(self, mask_targets):
        if not mask_targets:
            return mask_targets

        return self._dataset._doc.field_to_python("mask_targets", mask_targets)

    def _parse_default_mask_targets(self, default_mask_targets):
        if not default_mask_targets:
            return default_mask_targets

        return self._dataset._doc.field_to_python(
            "default_mask_targets", default_mask_targets
        )

    def _parse_field_name(self, field_name, auto_unwind=True):
        return _parse_field_name(self, field_name, auto_unwind)

    def _handle_frame_field(self, field_name):
        is_frame_field = self._is_frame_field(field_name)
        if is_frame_field:
            field_name = field_name = field_name[len(self._FRAMES_PREFIX) :]

        return field_name, is_frame_field

    def _is_frame_field(self, field_name):
        return (self.media_type == fom.VIDEO) and (
            field_name.startswith(self._FRAMES_PREFIX)
            or field_name == "frames"
        )

    def _is_label_field(self, field_name, label_type_or_types):
        label_type = self._get_label_field_type(field_name)

        try:
            iter(label_type_or_types)
        except:
            label_type_or_types = (label_type_or_types,)

        return any(issubclass(label_type, t) for t in label_type_or_types)

    def _get_label_fields(self):
        fields = list(
            self.get_field_schema(
                ftype=fof.EmbeddedDocumentField, embedded_doc_type=fol.Label
            ).keys()
        )

        if self.media_type == fom.VIDEO:
            fields.extend(
                list(
                    self.get_frame_field_schema(
                        ftype=fof.EmbeddedDocumentField,
                        embedded_doc_type=fol.Label,
                    ).keys()
                )
            )

        return fields

    def _get_label_field_type(self, field_name):
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

        if not isinstance(field, fof.EmbeddedDocumentField) or not issubclass(
            field.document_type, fol.Label
        ):
            raise ValueError(
                "Field '%s' is not a Label type; found %s"
                % (field_name, field)
            )

        return field.document_type

    def _get_label_field_path(self, field_name, subfield):
        label_type = self._get_label_field_type(field_name)

        if issubclass(label_type, fol._LABEL_LIST_FIELDS):
            field_name += "." + label_type._LABEL_LIST_FIELD

        field_path = field_name + "." + subfield
        return label_type, field_path

    def _is_array_field(self, field_name):
        return _is_array_field(self, field_name)

    def _add_field_if_necessary(self, field_name, ftype, **kwargs):
        # @todo if field exists, validate that `ftype` and `**kwargs` match
        field_name, is_frame_field = self._handle_frame_field(field_name)
        if is_frame_field:
            if not self.has_frame_field(field_name):
                self._dataset.add_frame_field(field_name, ftype, **kwargs)

            return

        if not self.has_sample_field(field_name):
            self._dataset.add_sample_field(field_name, ftype, **kwargs)

    def _make_set_field_pipeline(self, field, expr, embedded_root=False):
        return _make_set_field_pipeline(self, field, expr, embedded_root)


def get_label_fields(
    sample_collection,
    label_field=None,
    label_prefix=None,
    labels_dict=None,
    dataset_exporter=None,
    required=False,
    force_dict=False,
):
    """Gets the label field(s) of the sample collection matching the specified
    arguments.

    Provide one of ``label_field``, ``label_prefix``, ``labels_dict``, or
    ``dataset_exporter``.

    Args:
        sample_collection: a :class:`SampleCollection`
        label_field (None): the name of the label field to export
        label_prefix (None): a label field prefix; the returned labels dict
            will contain all fields whose name starts with the given prefix
        labels_dict (None): a dictionary mapping label field names to keys
        dataset_exporter (None): a
            :class:`fiftyone.utils.data.exporters.DatasetExporter` to use to
            choose appropriate label field(s)
        required (False): whether at least one matching field must be found
        force_dict (False): whether to always return a labels dict rather than
            an individual label field

    Returns:
        a label field or dict mapping label fields to keys
    """
    if label_prefix is not None:
        labels_dict = _get_labels_dict_for_prefix(
            sample_collection, label_prefix
        )

    if labels_dict is not None:
        return labels_dict

    if label_field is None and dataset_exporter is not None:
        label_field = _get_default_label_fields_for_exporter(
            sample_collection, dataset_exporter, required=required
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


def get_frame_labels_fields(
    sample_collection,
    frame_labels_field=None,
    frame_labels_prefix=None,
    frame_labels_dict=None,
    dataset_exporter=None,
    required=False,
    force_dict=False,
):
    """Gets the frame label field(s) of the sample collection matching the
    specified arguments.

    Provide one of ``frame_labels_field``, ``frame_labels_prefix``,
    ``frame_labels_dict``, or ``dataset_exporter``.

    Args:
        sample_collection: a :class:`SampleCollection`
        frame_labels_field (None): the name of the frame labels field to
            export
        frame_labels_prefix (None): a frame labels field prefix; the returned
            labels dict will contain all frame-level fields whose name starts
            with the given prefix
        frame_labels_dict (None): a dictionary mapping frame-level label field
            names to keys
        dataset_exporter (None): a
            :class:`fiftyone.utils.data.exporters.DatasetExporter` to use to
            choose appropriate frame label field(s)
        required (False): whether at least one matching frame field must be
            found
        force_dict (False): whether to always return a labels dict rather than
            an individual label field

    Returns:
        a frame label field or dict mapping frame label fields to keys
    """
    if frame_labels_prefix is not None:
        frame_labels_dict = _get_frame_labels_dict_for_prefix(
            sample_collection, frame_labels_prefix
        )

    if frame_labels_dict is not None:
        return frame_labels_dict

    if frame_labels_field is None and dataset_exporter is not None:
        frame_labels_field = _get_default_frame_label_fields_for_exporter(
            sample_collection, dataset_exporter, required=required
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


def _get_image_label_fields(sample_collection):
    label_fields = sample_collection.get_field_schema(
        ftype=fof.EmbeddedDocumentField, embedded_doc_type=fol.ImageLabel
    )
    return list(label_fields.keys())


def _get_frame_label_fields(sample_collection):
    label_fields = sample_collection.get_frame_field_schema(
        ftype=fof.EmbeddedDocumentField, embedded_doc_type=fol.ImageLabel
    )
    return list(label_fields.keys())


def _get_labels_dict_for_prefix(sample_collection, label_prefix):
    label_fields = sample_collection.get_field_schema(
        ftype=fof.EmbeddedDocumentField, embedded_doc_type=fol.Label
    )

    return _make_labels_dict_for_prefix(label_fields, label_prefix)


def _get_frame_labels_dict_for_prefix(sample_collection, frame_labels_prefix):
    label_fields = sample_collection.get_frame_field_schema(
        ftype=fof.EmbeddedDocumentField, embedded_doc_type=fol.Label
    )

    return _make_labels_dict_for_prefix(label_fields, frame_labels_prefix)


def _make_labels_dict_for_prefix(label_fields, label_prefix):
    labels_dict = {}
    for field_name in label_fields:
        if field_name.startswith(label_prefix):
            labels_dict[field_name] = field_name[len(label_prefix) :]

    return labels_dict


def _get_default_label_fields_for_exporter(
    sample_collection, dataset_exporter, required=True
):
    label_cls = dataset_exporter.label_cls

    if label_cls is None:
        if required:
            raise ValueError(
                "Cannot select a default field when exporter does not provide "
                "a `label_cls`"
            )

        return None

    label_fields = sample_collection.get_field_schema(
        ftype=fof.EmbeddedDocumentField, embedded_doc_type=fol.Label
    )

    label_field_or_dict = _get_fields_with_types(label_fields, label_cls)

    if label_field_or_dict is not None:
        return label_field_or_dict

    #
    # SPECIAL CASE
    #
    # The export routine can convert `Classification` labels to Detections`
    # format just-in-time, if necessary. So, allow a `Classification` field
    # to be returned here
    #

    if label_cls is fol.Detections:
        for field, field_type in label_fields.items():
            if issubclass(field_type.document_type, fol.Classification):
                return field

    if required:
        raise ValueError("No compatible field(s) of type %s found" % label_cls)

    return None


def _get_default_frame_label_fields_for_exporter(
    sample_collection, dataset_exporter, required=True
):
    frame_labels_cls = dataset_exporter.frame_labels_cls

    if frame_labels_cls is None:
        if required:
            raise ValueError(
                "Cannot select a default frame field when exporter does not "
                "provide a `frame_labels_cls`"
            )

        return None

    frame_labels_fields = sample_collection.get_frame_field_schema(
        ftype=fof.EmbeddedDocumentField, embedded_doc_type=fol.Label
    )

    frame_labels_field_or_dict = _get_fields_with_types(
        frame_labels_fields, frame_labels_cls
    )

    if frame_labels_field_or_dict is not None:
        return frame_labels_field_or_dict

    if required:
        raise ValueError(
            "No compatible frame field(s) of type %s found" % frame_labels_cls
        )

    return None


def _get_fields_with_types(label_fields, label_cls):
    if isinstance(label_cls, dict):
        # Return first matching field for all dict keys
        labels_dict = {}
        for name, _label_cls in label_cls.items():
            field = _get_field_with_type(label_fields, _label_cls)
            if field is not None:
                labels_dict[field] = name

        return labels_dict if labels_dict else None

    # Return first matching field, if any
    return _get_field_with_type(label_fields, label_cls)


def _get_field_with_type(label_fields, label_cls):
    for field, field_type in label_fields.items():
        if issubclass(field_type.document_type, label_cls):
            return field

    return None


def _parse_field_name(sample_collection, field_name, auto_unwind):
    field_name, is_frame_field = sample_collection._handle_frame_field(
        field_name
    )
    if is_frame_field:
        if not field_name:
            return "frames", True, [], []

        schema = sample_collection.get_frame_field_schema()
    else:
        schema = sample_collection.get_field_schema()

    unwind_list_fields = set()
    other_list_fields = set()

    def _record_list_field(field_name):
        if auto_unwind:
            unwind_list_fields.add(field_name)
        elif field_name not in unwind_list_fields:
            other_list_fields.add(field_name)

    # Parse explicit array references
    chunks = field_name.split("[]")
    for idx in range(len(chunks) - 1):
        unwind_list_fields.add("".join(chunks[: (idx + 1)]))

    # Array references [] have been stripped
    field_name = "".join(chunks)

    # Ensure root field exists
    root_field_name = field_name.split(".", 1)[0]

    try:
        root_field = schema[root_field_name]
    except KeyError:
        ftype = "Frame field" if is_frame_field else "Field"
        raise ValueError(
            "%s '%s' does not exist on collection '%s'"
            % (ftype, root_field_name, sample_collection.name)
        )

    #
    # Detect certain list fields automatically
    #
    # @todo this implementation would be greatly improved by using the schema
    # to detect list fields
    #

    if isinstance(root_field, fof.ListField):
        _record_list_field(root_field_name)

    if isinstance(root_field, fof.EmbeddedDocumentField):
        root_type = root_field.document_type

        if root_type in fol._SINGLE_LABEL_FIELDS:
            if field_name == root_field_name + ".tags":
                _record_list_field(field_name)

        if root_type in fol._LABEL_LIST_FIELDS:
            path = root_field_name + "." + root_type._LABEL_LIST_FIELD

            if field_name.startswith(path):
                _record_list_field(path)

            if field_name == path + ".tags":
                _record_list_field(field_name)

    # Sorting is important here because one must unwind field `x` before
    # embedded field `x.y`
    unwind_list_fields = sorted(unwind_list_fields)
    other_list_fields = sorted(other_list_fields)

    if is_frame_field and not auto_unwind:
        prefix = sample_collection._FRAMES_PREFIX
        field_name = prefix + field_name
        unwind_list_fields = [prefix + f for f in unwind_list_fields]
        other_list_fields = [prefix + f for f in other_list_fields]
        other_list_fields.insert(0, "frames")

    return field_name, is_frame_field, unwind_list_fields, other_list_fields


def _is_array_field(sample_collection, field_name):
    field_name, is_frame_field = sample_collection._handle_frame_field(
        field_name
    )
    if is_frame_field:
        if not field_name:
            return False

        schema = sample_collection.get_frame_field_schema()
    else:
        schema = sample_collection.get_field_schema()

    if "." not in field_name:
        root = field_name
        field_path = None
    else:
        root, field_path = field_name.split(".", 1)

    field = schema.get(root, None)
    return _is_field_type(field, field_path, fof._ARRAY_FIELDS)


def _is_field_type(field, field_path, types):
    if isinstance(field, fof.ListField):
        return _is_field_type(field.field, field_path, types)

    if isinstance(field, fof.EmbeddedDocumentField):
        return _is_field_type(field.document_type, field_path, types)

    if not field_path:
        return isinstance(field, types)

    if "." not in field_path:
        root, field_path = field_path, None
    else:
        root, field_path = field_path.split(".", 1)

    try:
        field = getattr(field, root)
    except AttributeError:
        return False

    return _is_field_type(field, field_path, types)


def _transform_values(values, fcn, level=1):
    if level < 1 or not values:
        return values

    if level == 1:
        return [fcn(v) for v in values]

    return [_transform_values(v, fcn, level - 1) for v in values]


def _make_set_field_pipeline(sample_collection, field, expr, embedded_root):
    path, is_frame_field, list_fields, _ = sample_collection._parse_field_name(
        field
    )

    if is_frame_field and path != "frames":
        path = sample_collection._FRAMES_PREFIX + path
        list_fields = ["frames"] + [
            sample_collection._FRAMES_PREFIX + lf for lf in list_fields
        ]

    # Don't unroll terminal lists unless explicitly requested
    list_fields = [lf for lf in list_fields if lf != field]

    # Case 1: no list fields
    if not list_fields:
        path_expr = _render_expr(expr, path, embedded_root)
        return [{"$set": {path: path_expr}}]

    # Case 2: one list field
    if len(list_fields) == 1:
        list_field = list_fields[0]
        subfield = path[len(list_field) + 1 :]
        expr = _set_terminal_list_field(
            list_field, subfield, expr, embedded_root
        )
        return [{"$set": {list_field: expr.to_mongo()}}]

    # Case 3: multiple list fields

    last_list_field = list_fields[-1]
    terminal_prefix = last_list_field[len(list_fields[-2]) + 1 :]
    subfield = path[len(last_list_field) + 1 :]
    expr = _set_terminal_list_field(
        terminal_prefix, subfield, expr, embedded_root
    )

    for list_field1, list_field2 in zip(
        reversed(list_fields[:-1]), reversed(list_fields[1:])
    ):
        inner_list_field = list_field2[len(list_field1) + 1 :]
        expr = F().map(F().set_field(inner_list_field, expr))

    expr = expr.to_mongo(prefix="$" + list_fields[0])

    return [{"$set": {list_fields[0]: expr}}]


def _set_terminal_list_field(list_field, subfield, expr, embedded_root):
    map_path = "$this"
    if subfield:
        map_path += "." + subfield

    map_expr = _render_expr(expr, map_path, embedded_root)

    if subfield:
        map_expr = F().set_field(subfield, map_expr)
    else:
        map_expr = foe.ViewExpression(map_expr)

    return F(list_field).map(map_expr)


def _render_expr(expr, path, embedded_root):
    if not isinstance(expr, foe.ViewExpression):
        return expr

    if not embedded_root:
        prefix = path
    elif "." in path:
        prefix = path.rsplit(".", 1)[0]
    else:
        prefix = None

    if prefix:
        prefix = "$" + prefix

    return expr.to_mongo(prefix=prefix)


def _get_random_characters(n):
    return "".join(
        random.choice(string.ascii_lowercase + string.digits) for _ in range(n)
    )
