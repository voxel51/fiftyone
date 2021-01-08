"""
Base classes for collections of samples.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import inspect
import logging
import os
import random
import string

import eta.core.serial as etas
import eta.core.utils as etau

from fiftyone.core.aggregations import Aggregation
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
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


logger = logging.getLogger(__name__)


def _make_registrar():
    """Makes a decorator that keeps a registry of all functions decorated by
    it.

    Usage::

        my_decorator = _make_registrar()
        my_decorator.all  # dictionary mapping names to functions
    """
    registry = {}

    def registrar(func):
        registry[func.__name__] = func
        # Normally a decorator returns a wrapped function, but here we return
        # `func` unmodified, after registering it
        return func

    registrar.all = registry
    return registrar


# Keeps track of all view stage methods
view_stage = _make_registrar()


class SampleCollection(object):
    """Abstract class representing an ordered collection of
    :class:`fiftyone.core.sample.Sample` instances in a
    :class:`fiftyone.core.dataset.Dataset`.
    """

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

    def __getitem__(self, sample_id_or_slice):
        raise NotImplementedError("Subclass must implement __getitem__()")

    def __iter__(self):
        return self.iter_samples()

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
        """The :meth:`fiftyone.core.dataset.Dataset.info` dict of the dataset
        underlying the collection.
        """
        raise NotImplementedError("Subclass must implement info")

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
            field_or_fields = [field_or_fields]

        if self.media_type == fom.VIDEO:
            frame_fields = list(
                filter(lambda n: n.startswith("frames."), field_or_fields)
            )
            field_or_fields = list(
                filter(lambda n: not n.startswith("frames."), field_or_fields)
            )
        else:
            frame_fields = []

        schema = self.get_field_schema(include_private=True)
        default_fields = set(
            default_sample_fields(
                DatasetSampleDocument, include_private=True, include_id=True
            )
        )
        for field in field_or_fields:
            # We only validate that the root field exists
            field_name = field.split(".", 1)[0]
            if field_name not in schema and field_name not in default_fields:
                raise ValueError("Field '%s' does not exist" % field_name)

        if self.media_type != fom.VIDEO:
            return

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
            field_name = field.split(".", 2)[1]
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
        schema = self.get_field_schema()
        frames = self.media_type == fom.VIDEO and field_name.startswith(
            "frames."
        )
        if frames:
            field_name = field_name[len("frames.") :]

        if frames:
            frame_schema = self.get_frame_field_schema()
            if field_name not in frame_schema:
                raise ValueError("Field '%s' does not exist" % field_name)
            field = frame_schema[field_name]
        else:
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

    def get_tags(self):
        """Returns the list of unique tags of samples in the collection.

        Returns:
            a list of tags
        """
        raise NotImplementedError("Subclass must implement get_tags()")

    def compute_metadata(self, overwrite=False):
        """Populates the ``metadata`` field of all samples in the collection.

        Any samples with existing metadata are skipped, unless
        ``overwrite == True``.

        Args:
            overwrite (False): whether to overwrite existing metadata
        """
        with fou.ProgressBar() as pb:
            for sample in pb(self):
                if sample.metadata is None or overwrite:
                    sample.compute_metadata()

    def apply_model(
        self,
        model,
        label_field="predictions",
        confidence_thresh=None,
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
            batch_size (None): an optional batch size to use. Only applicable
                for image samples
        """
        fomo.apply_model(
            self,
            model,
            label_field=label_field,
            confidence_thresh=confidence_thresh,
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

    @classmethod
    def list_view_stages(cls):
        """Returns a list of all available methods on this collection that
        apply :class:`fiftyone.core.stages.ViewStage` operations that return
        :class:`fiftyone.core.view.DatasetView` instances.

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

            dataset = fo.load_dataset(...)

            #
            # Exclude a single sample from a dataset
            #

            view = dataset.exclude("5f3c298768fd4d3baf422d2f")

            #
            # Exclude a list of samples from a dataset
            #

            view = dataset.exclude([
                "5f3c298768fd4d3baf422d2f",
                "5f3c298768fd4d3baf422d30"
            ])

        Args:
            sample_ids: a sample ID or iterable of sample IDs

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Exclude(sample_ids))

    @view_stage
    def exclude_fields(self, field_names):
        """Excludes the fields with the given names from the returned
        :class:`fiftyone.core.sample.SampleView` instances.

        Note that default fields cannot be excluded.

        Examples::

            import fiftyone as fo

            dataset = fo.load_dataset(...)

            #
            # Exclude a field from all samples in a dataset
            #

            view = dataset.exclude_fields("predictions")

            #
            # Exclude a list of fields from all samples in a dataset
            #

            view = dataset.exclude_fields(["ground_truth", "predictions"])

        Args:
            field_names: a field name or iterable of field names to exclude

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.ExcludeFields(field_names))

    @view_stage
    def exclude_objects(self, objects):
        """Excludes the specified objects from the view.

        The returned view will omit the objects specified in the provided
        ``objects`` argument, which should have the following format::

            [
                {
                    "sample_id": "5f8d254a27ad06815ab89df4",
                    "field": "ground_truth",
                    "object_id": "5f8d254a27ad06815ab89df3",
                },
                {
                    "sample_id": "5f8d255e27ad06815ab93bf8",
                    "field": "ground_truth",
                    "object_id": "5f8d255e27ad06815ab93bf6",
                },
                ...
            ]

        Examples::

            import fiftyone as fo

            dataset = fo.load_dataset(...)

            #
            # Exclude the objects currently selected in the App
            #

            session = fo.launch_app(dataset)

            # Select some objects in the App...

            view = dataset.exclude_objects(session.selected_objects)

        Args:
            objects: a list of dicts specifying the objects to exclude
        """
        return self._add_view_stage(fos.ExcludeObjects(objects))

    @view_stage
    def exists(self, field, bool=True):
        """Returns a view containing the samples that have (or do not have) a
        non-``None`` value for the given field.

        Examples::

            import fiftyone as fo

            dataset = fo.load_dataset(...)

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
            field: the field
            bool (True): whether to check if the field exists (True) or does
                not exist (False)

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Exists(field, bool=bool))

    @view_stage
    def filter_field(self, field, filter, only_matches=False):
        """Filters the values of a given sample (or embedded document) field.

        Values of ``field`` for which ``filter`` returns ``False`` are
        replaced with ``None``.

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.load_dataset(...)

            #
            # Only include classifications in the `predictions` field (assume
            # it is a `Classification` field) whose `label` is "cat"
            #

            view = dataset.filter_field("predictions", F("label") == "cat")

            #
            # Only include classifications in the `predictions` field (assume
            # it is a `Classification` field) whose `confidence` is greater
            # than 0.8
            #

            view = dataset.filter_field("predictions", F("confidence") > 0.8)

        Args:
            field: the field to filter
            filter: a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that returns a boolean describing the filter to apply
            only_matches (False): whether to only include samples that match
                the filter

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.FilterField(field, filter, only_matches=only_matches)
        )

    @view_stage
    def filter_labels(self, field, filter, only_matches=False):
        """Filters the :class:`fiftyone.core.labels.Label` elements in a labels
        list field of each sample.

        The specified ``field`` must be one of the following types:

        -   :class:`fiftyone.core.labels.Classifications`
        -   :class:`fiftyone.core.labels.Detections`
        -   :class:`fiftyone.core.labels.Polylines`
        -   :class:`fiftyone.core.labels.Keypoints`

        Classifications Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.load_dataset(...)

            #
            # Only include classifications in the `predictions` field whose
            # `confidence` greater than 0.8
            #

            view = dataset.filter_labels("predictions", F("confidence") > 0.8)

            #
            # Only include classifications in the `predictions` field whose
            # `label` is "cat" or "dog", and only show samples with at least
            # one classification after filtering
            #

            view = dataset.filter_labels(
                "predictions",
                F("label").is_in(["cat", "dog"]),
                only_matches=True,
            )

        Detections Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.load_dataset(...)

            #
            # Only include detections in the `predictions` field whose
            # `confidence` is greater than 0.8
            #

            stage = filter_labels("predictions", F("confidence") > 0.8)
            view = dataset.add_stage(stage)

            #
            # Only include detections in the `predictions` field whose `label`
            # is "cat" or "dog", and only show samples with at least one
            # detection after filtering
            #

            view = dataset.filter_labels(
                "predictions",
                F("label").is_in(["cat", "dog"]),
                only_matches=True,
            )

            #
            # Only include detections in the `predictions` field whose bounding
            # box area is smaller than 0.2
            #

            # bbox is in [top-left-x, top-left-y, width, height] format
            bbox_area = F("bounding_box")[2] * F("bounding_box")[3]

            view = dataset.filter_labels("predictions", bbox_area < 0.2)

        Polylines Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.load_dataset(...)

            #
            # Only include polylines in the `predictions` field that are filled
            #

            view = dataset.filter_labels("predictions", F("filled"))

            #
            # Only include polylines in the `predictions` field whose `label`
            # is "lane", and only show samples with at least one polyline after
            # filtering
            #

            view = dataset.filter_labels(
                "predictions", F("label") == "lane", only_matches=True
            )

            #
            # Only include polylines in the `predictions` field with at least
            # 10 vertices
            #

            num_vertices = F("points").map(F().length()).sum()
            view = dataset.filter_labels("predictions", num_vertices >= 10)

        Keypoints Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.load_dataset(...)

            #
            # Only include keypoints in the `predictions` field whose `label`
            # is "face", and only show samples with at least one keypoint after
            # filtering
            #

            view = dataset.filter_labels(
                "predictions", F("label") == "face", only_matches=True
            )

            #
            # Only include keypoints in the `predictions` field with at least
            # 10 points
            #

            view = dataset.filter_labels(
                "predictions", F("points").length() >= 10
            )

        Args:
            field: the labels list field to filter
            filter: a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that returns a boolean describing the filter to apply
            only_matches (False): whether to only include samples with at least
                one label after filtering

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.FilterLabels(field, filter, only_matches=only_matches)
        )

    @view_stage
    def filter_classifications(self, field, filter, only_matches=False):
        """Filters the classifications of the given
        :class:`fiftyone.core.labels.Classifications` field.

        Elements of ``<field>.classifications`` for which ``filter`` returns
        ``False`` are omitted from the field.

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.load_dataset(...)

            #
            # Only include classifications in the `predictions` field whose
            # `confidence` greater than 0.8
            #

            view = dataset.filter_classifications(
                "predictions", F("confidence") > 0.8
            )

            #
            # Only include classifications in the `predictions` field whose
            # `label` is "cat" or "dog", and only show samples with at least
            # one classification after filtering
            #

            view = dataset.filter_classifications(
                "predictions", F("label").is_in(["cat", "dog"]), only_matches=True
            )

        Args:
            field: the :class:`fiftyone.core.labels.Classifications` field
            filter: a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that returns a boolean describing the filter to apply
            only_matches (False): whether to only include samples with at least
                one classification after filtering

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.FilterClassifications(field, filter, only_matches=only_matches)
        )

    @view_stage
    def filter_detections(self, field, filter, only_matches=False):
        """Filters the detections of the given
        :class:`fiftyone.core.labels.Detections` field.

        Elements of ``<field>.detections`` for which ``filter`` returns
        ``False`` are omitted from the field.

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.load_dataset(...)

            #
            # Only include detections in the `predictions` field whose
            # `confidence` is greater than 0.8
            #

            view = dataset.filter_detections(
                "predictions", F("confidence") > 0.8
            )

            #
            # Only include detections in the `predictions` field whose `label`
            # is "cat" or "dog", and only show samples with at least one
            # detection after filtering
            #

            view = dataset.filter_detections(
                "predictions", F("label").is_in(["cat", "dog"]), only_matches=True
            )

            #
            # Only include detections in the `predictions` field whose bounding
            # box area is smaller than 0.2
            #

            # bbox is in [top-left-x, top-left-y, width, height] format
            bbox_area = F("bounding_box")[2] * F("bounding_box")[3]

            view = dataset.filter_detections("predictions", bbox_area < 0.2)

        Args:
            field: the :class:`fiftyone.core.labels.Detections` field
            filter: a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that returns a boolean describing the filter to apply
            only_matches (False): whether to only include samples with at least
                one detection after filtering

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.FilterDetections(field, filter, only_matches=only_matches)
        )

    @view_stage
    def filter_polylines(self, field, filter, only_matches=False):
        """Filters the polylines of the given
        :class:`fiftyone.core.labels.Polylines` field.

        Elements of ``<field>.polylines`` for which ``filter`` returns
        ``False`` are omitted from the field.

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F
            from fiftyone.core.stages import FilterPolylines

            dataset = fo.load_dataset(...)

            #
            # Only include polylines in the `predictions` field that are filled
            #

            stage = FilterPolylines("predictions", F("filled"))
            view = dataset.add_stage(stage)

            #
            # Only include polylines in the `predictions` field whose `label`
            # is "lane", and only show samples with at least one polyline after
            # filtering
            #

            stage = FilterPolylines(
                "predictions", F("label") == "lane", only_matches=True
            )
            view = dataset.add_stage(stage)

            #
            # Only include polylines in the `predictions` field with at least
            # 10 vertices
            #

            num_vertices = F("points").map(F().length()).sum()
            stage = FilterPolylines("predictions", num_vertices >= 10)
            view = dataset.add_stage(stage)

        Args:
            field: the :class:`fiftyone.core.labels.Polylines` field
            filter: a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that returns a boolean describing the filter to apply
            only_matches (False): whether to only include samples with at least
                one polyline after filtering

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(
            fos.FilterPolylines(field, filter, only_matches=only_matches)
        )

    @view_stage
    def filter_keypoints(self, field, filter, only_matches=False):
        """Filters the keypoints of the given
        :class:`fiftyone.core.labels.Keypoints` field.

        Elements of ``<field>.keypoints`` for which ``filter`` returns
        ``False`` are omitted from the field.

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F
            from fiftyone.core.stages import FilterKeypoints

            dataset = fo.load_dataset(...)

            #
            # Only include keypoints in the `predictions` field whose `label`
            # is "face", and only show samples with at least one keypoint after
            # filtering
            #

            stage = FilterKeypoints(
                "predictions", F("label") == "face", only_matches=True
            )
            view = dataset.add_stage(stage)

            #
            # Only include keypoints in the `predictions` field with at least
            # 10 points
            #

            stage = FilterKeypoints("predictions", F("points").length() >= 10)
            view = dataset.add_stage(stage)

        Args:
            field: the :class:`fiftyone.core.labels.Keypoints` field
            filter: a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that returns a boolean describing the filter to apply
            only_matches (False): whether to only include samples with at least
                one keypoint after filtering

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

            dataset = fo.load_dataset(...)

            #
            # Only include the first 10 samples in the view
            #

            view = dataset.limit(10)

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
        in the specified labels list field of each sample.

        The specified ``field`` must be one of the following types:

        -   :class:`fiftyone.core.labels.Classifications`
        -   :class:`fiftyone.core.labels.Detections`
        -   :class:`fiftyone.core.labels.Polylines`
        -   :class:`fiftyone.core.labels.Keypoints`

        Examples::

            import fiftyone as fo

            dataset = fo.load_dataset(...)

            #
            # Only include the first 5 detections in the `ground_truth` field of
            # the view
            #

            view = dataset.limit_labels("ground_truth", 5)

        Args:
            field: the labels list field to filter
            limit: the maximum number of labels to include in each labels list.
                If a non-positive number is provided, all lists will be empty
        """
        return self._add_view_stage(fos.LimitLabels(field, limit))

    @view_stage
    def match(self, filter):
        """Filters the samples in the collection by the given filter.

        Samples for which ``filter`` returns ``False`` are omitted.

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.load_dataset(...)

            #
            # Only include samples whose `filepath` ends with ".jpg"
            #

            view = dataset.match(F("filepath").ends_with(".jpg"))

            #
            # Only include samples whose `predictions` field (assume it is a
            # `Classification` field) has `label` of "cat"
            #

            view = dataset.match(F("predictions").label == "cat"))

            #
            # Only include samples whose `predictions` field (assume it is a
            # `Detections` field) has at least 5 detections
            #

            view = dataset.match(F("predictions").detections.length() >= 5)

            #
            # Only include samples whose `predictions` field (assume it is a
            # `Detections` field) has at least one detection with area smaller
            # than 0.2
            #

            # bbox is in [top-left-x, top-left-y, width, height] format
            pred_bbox = F("predictions.detections.bounding_box")
            pred_bbox_area = pred_bbox[2] * pred_bbox[3]

            view = dataset.match((pred_bbox_area < 0.2).length() > 0)

        Args:
            filter: a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that returns a boolean describing the filter to apply

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Match(filter))

    @view_stage
    def match_tag(self, tag):
        """Returns a view containing the samples that have the given tag.

        Examples::

            import fiftyone as fo

            dataset = fo.load_dataset(...)

            #
            # Only include samples that have the "test" tag
            #

            view = dataset.match_tag("test")

        Args:
            tag: a tag

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.MatchTag(tag))

    @view_stage
    def match_tags(self, tags):
        """Returns a view containing the samples that have any of the given
        tags.

        To match samples that must contain multiple tags, chain multiple
        :meth:`match_tag` or :meth:`match_tags` calls together.

        Examples::

            import fiftyone as fo

            dataset = fo.load_dataset(...)

            #
            # Only include samples that have either the "test" or "validation"
            # tag
            #

            view = dataset.match_tags(["test", "validation"])

        Args:
            tags: an iterable of tags

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

            dataset = fo.load_dataset(...)

            #
            # Extract a view containing the 6th through 15th samples in the
            # dataset
            #

            view = dataset.mongo([{"$skip": 5}, {"$limit": 10}])

            #
            # Sort by the number of detections in the `precictions` field of
            # the samples (assume it is a `Detections` field)
            #

            view = dataset.mongo([
                {
                    "$addFields": {
                        "_sort_field": {
                            "$size": {
                                "$ifNull": ["$predictions.detections", []]
                            }
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
        """Returns a view containing only the samples with the given IDs.

        Examples::

            import fiftyone as fo

            dataset = fo.load_dataset(...)

            #
            # Select the samples with the given IDs from the dataset
            #

            view = dataset.select([
                "5f3c298768fd4d3baf422d34",
                "5f3c298768fd4d3baf422d35",
                "5f3c298768fd4d3baf422d36",
            ])

            #
            # Create a view containing the currently selected samples in the
            # App
            #

            session = fo.launch_app(dataset=dataset)

            # Select samples in the App...

            view = dataset.select(session.selected)

        Args:
            sample_ids: a sample ID or iterable of sample IDs

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Select(sample_ids))

    @view_stage
    def select_fields(self, field_names=None):
        """Selects the fields with the given names as the *only* fields
        present in the returned :class:`fiftyone.core.sample.SampleView`
        instances. All other fields are excluded.

        Note that default sample fields are always selected and will be added
        if not included in ``field_names``.

        Examples::

            import fiftyone as fo

            dataset = fo.load_dataset(...)

            #
            # Include only the default fields on each sample
            #

            view = dataset.select_fields()

            #
            # Include only the `ground_truth` field (and the default fields) on
            # each sample
            #

            view = dataset.select_fields("ground_truth")

        Args:
            field_names (None): a field name or iterable of field names to
                select. If not specified, just the default fields will be
                selected

        Returns:
            a :class:`DatasetView`
        """
        return self._add_view_stage(fos.SelectFields(field_names))

    @view_stage
    def select_objects(self, objects):
        """Selects only the specified objects from the view.

        The returned view will omit samples, sample fields, and individual
        objects that do not appear in the provided ``objects`` argument, which
        should have the following format::

            [
                {
                    "sample_id": "5f8d254a27ad06815ab89df4",
                    "field": "ground_truth",
                    "object_id": "5f8d254a27ad06815ab89df3",
                },
                {
                    "sample_id": "5f8d255e27ad06815ab93bf8",
                    "field": "ground_truth",
                    "object_id": "5f8d255e27ad06815ab93bf6",
                },
                ...
            ]

        Examples::

            import fiftyone as fo

            dataset = fo.load_dataset(...)

            #
            # Only include the objects currently selected in the App
            #

            session = fo.launch_app(dataset)

            # Select some objects in the App...

            view = dataset.select_objects(session.selected_objects)

        Args:
            objects: a list of dicts specifying the objects to select
        """
        return self._add_view_stage(fos.SelectObjects(objects))

    @view_stage
    def shuffle(self, seed=None):
        """Randomly shuffles the samples in the collection.

        Examples::

            import fiftyone as fo

            dataset = fo.load_dataset(...)

            #
            # Return a view that contains a randomly shuffled version of the
            # samples in the dataset
            #

            view = dataset.shuffle()

            #
            # Shuffle the samples with a set random seed
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

            dataset = fo.load_dataset(...)

            #
            # Omit the first 10 samples from the dataset
            #

            view = dataset.skip(10)

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
            from fiftyone import ViewField as F

            dataset = fo.load_dataset(...)

            #
            # Sorts the samples in descending order by the `confidence` of
            # their `predictions` field (assume it is a `Classification` field)
            #

            view = dataset.sort_by("predictions.confidence", reverse=True)

            #
            # Sorts the samples in ascending order by the number of detections
            # in their `predictions` field (assume it is a `Detections` field)
            # whose bounding box area is at most 0.2
            #

            # bbox is in [top-left-x, top-left-y, width, height] format
            pred_bbox = F("predictions.detections.bounding_box")
            pred_bbox_area = pred_bbox[2] * pred_bbox[3]

            view = dataset.sort_by((pred_bbox_area < 0.2).length())

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

            dataset = fo.load_dataset(...)

            #
            # Take 10 random samples from the dataset
            #

            view = dataset.take(10)

            #
            # Take 10 random samples from the dataset with a set seed
            #

            view = dataset.take(10, seed=51)

        Args:
            size: the number of samples to return. If a non-positive number is
                provided, an empty view is returned
            seed (None): an optional random seed to use when selecting the
                samples

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return self._add_view_stage(fos.Take(size, seed=seed))

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
        **kwargs
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

    def create_index(self, field, unique=False):
        """Creates an index on the given field.

        If the given field already has a unique index, it will be retained
        regardless of the ``unique`` value you specify.

        If the given field already has a non-unique index but you requested a
        unique index, the existing index will be dropped.

        Indexes enable efficient sorting, merging, and other such operations.

        Args:
            field: the field name or ``embedded.field.name``
            unique (False): whether to add a uniqueness constraint to the index
        """
        raise NotImplementedError("Subclass must implement create_index()")

    def drop_index(self, field):
        """Drops the index on the given field.

        Args:
            field: the field name or ``embedded.field.name``
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
            an :class:`fiftyone.core.aggregations.AggregationResult` or list of
            :class:`fiftyone.core.aggregations.AggregationResult` instances
            corresponding to the input aggregations
        """
        scalar_result, aggregations, facets = self._build_aggregation(
            aggregations
        )
        if len(aggregations) == 0:
            return []

        # pylint: disable=no-member
        pipeline = self._pipeline(
            pipeline=facets, attach_frames=_attach_frames
        )
        try:
            # pylint: disable=no-member
            result = next(self._dataset._sample_collection.aggregate(pipeline))
        except StopIteration:
            pass

        return self._process_aggregations(aggregations, result, scalar_result)

    def _pipeline(
        self,
        pipeline=None,
        attach_frames=True,
        hide_frames=False,
        squash_frames=False,
    ):
        """Returns the MongoDB aggregation pipeline for the collection.

        Args:
            pipeline (None): a MongoDB aggregation pipeline (list of dicts) to
                append to the current pipeline
            attach_frames (True): whether to attach the frame documents to the
                result. Only applicable to video datasets
            hide_frames (False): whether to hide frames in the result. Only
                applicable to video datasets
            squash_frames (False): whether to squash frames in the result. Only
                applicable to video datasets

        Returns:
            the aggregation pipeline
        """
        raise NotImplementedError("Subclass must implement _pipeline()")

    def _aggregate(
        self,
        pipeline=None,
        attach_frames=True,
        hide_frames=False,
        squash_frames=False,
    ):
        """Runs the MongoDB aggregation pipeline on the collection and returns
        the result.

        Args:
            pipeline (None): a MongoDB aggregation pipeline (list of dicts) to
                append to the current pipeline
            attach_frames (True): whether to attach the frame documents to the
                result. Only applicable to video datasets
            hide_frames (False): whether to hide frames in the result. Only
                applicable to video datasets
            squash_frames (False): whether to squash frames in the result. Only
                applicable to video datasets

        Returns:
            the aggregation result dict
        """
        raise NotImplementedError("Subclass must implement _aggregate()")

    def _attach_frames(self, hide_frames=False):
        key = "_frames" if hide_frames else "frames"

        # pylint: disable=no-member
        return [
            {
                "$lookup": {
                    "from": self._frame_collection_name,
                    "localField": "_id",
                    "foreignField": "_sample_id",
                    "as": key,
                }
            }
        ]

    async def _async_aggregate(self, sample_collection, aggregations):
        scalar_result, aggregations, facets = self._build_aggregation(
            aggregations
        )
        if not aggregations:
            return []

        # pylint: disable=no-member
        pipeline = self._pipeline(pipeline=facets)
        try:
            # pylint: disable=no-member
            result = await sample_collection.aggregate(pipeline).to_list(1)
            result = result[0]
        except StopIteration:
            pass

        return self._process_aggregations(aggregations, result, scalar_result)

    def _build_aggregation(self, aggregations):
        scalar_result = isinstance(aggregations, Aggregation)
        if scalar_result:
            aggregations = [aggregations]
        elif not aggregations:
            return False, [], None

        # pylint: disable=no-member
        schema = self.get_field_schema()
        if self.media_type == fom.VIDEO:
            frame_schema = self.get_frame_field_schema()
        else:
            frame_schema = None

        pipelines = {}
        for agg in aggregations:
            if not isinstance(agg, Aggregation):
                raise TypeError("'%s' is not an Aggregation" % agg.__class__)

            field = agg._get_output_field(self)
            pipelines[field] = agg._to_mongo(
                self._dataset, schema, frame_schema
            )

        result_d = {}

        return scalar_result, aggregations, [{"$facet": pipelines}]

    def _process_aggregations(self, aggregations, result, scalar_result):
        results = []
        for agg in aggregations:
            try:
                results.append(
                    agg._get_result(result[agg._get_output_field(self)][0])
                )
            except:
                results.append(agg._get_default_result())

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


def _get_random_characters(n):
    return "".join(
        random.choice(string.ascii_lowercase + string.digits) for _ in range(n)
    )


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
