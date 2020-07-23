"""
Dataset views.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
# pragma pylint: disable=redefined-builtin
# pragma pylint: disable=unused-wildcard-import
# pragma pylint: disable=wildcard-import
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals
from builtins import *

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

from copy import copy, deepcopy
import numbers

from bson import ObjectId, json_util

import fiftyone.core.collections as foc
import fiftyone.core.stages as fos


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


# Keeps track of all DatasetView stage methods
view_stage = _make_registrar()


class DatasetView(foc.SampleCollection):
    """A view into a :class:`fiftyone.core.dataset.Dataset`.

    Dataset views represent read-only collections of
    :class:`fiftyone.core.sample.Sample` instances in a dataset.

    Operations on dataset views are designed to be chained together to yield
    the desired subset of the dataset, which is then iterated over to directly
    access the samples.

    Example use::

        # Print the paths for 5 random samples in the dataset
        view = dataset.default_view().take(5)
        for sample in view:
            print(sample.filepath)

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`
    """

    def __init__(self, dataset):
        self._dataset = dataset
        self._pipeline = []

    def __len__(self):
        try:
            result = self.aggregate([{"$count": "count"}])
            return next(result)["count"]
        except StopIteration:
            pass

        return 0

    def __getitem__(self, sample_id):
        if isinstance(sample_id, numbers.Integral):
            raise KeyError(
                "Accessing samples by numeric index is not supported. "
                "Use sample IDs or slices"
            )

        if isinstance(sample_id, slice):
            return self._slice(sample_id)

        # Ensure `sample_id` is in the view
        view = self.match({"_id": ObjectId(sample_id)})
        if not view:
            raise KeyError("No sample found with ID '%s'" % sample_id)

        return self._dataset[sample_id]

    def __copy__(self):
        view = self.__class__(self._dataset)
        view._pipeline = deepcopy(self._pipeline)
        return view

    def summary(self):
        """Returns a string summary of the view.

        Returns:
            a string summary
        """
        fields_str = self._dataset._get_fields_str()

        if self._pipeline:
            pipeline_str = "    " + "\n    ".join(
                [
                    "%d. %s" % (idx, str(d))
                    for idx, d in enumerate(self._pipeline, 1)
                ]
            )
        else:
            pipeline_str = "    ---"

        return "\n".join(
            [
                "Dataset:        %s" % self._dataset.name,
                "Num samples:    %d" % len(self),
                "Tags:           %s" % list(self.get_tags()),
                "Sample fields:",
                fields_str,
                "Pipeline stages:",
                pipeline_str,
            ]
        )

    def iter_samples(self):
        """Returns an iterator over the samples in the view.

        Returns:
            an iterator over :class:`fiftyone.core.sample.Sample` instances
        """
        for d in self.aggregate():
            yield self._dataset._load_sample_from_dict(d)

    def iter_samples_with_index(self):
        """Returns an iterator over the samples in the view together with
        their integer index in the collection.

        Returns:
            an iterator that emits ``(index, sample)`` tuples, where:
                - ``index`` is an integer index relative to the offset, where
                  ``offset <= view_idx < offset + limit``
                - ``sample`` is a :class:`fiftyone.core.sample.Sample`
        """
        offset = self._get_latest_offset()
        iterator = self.iter_samples()
        for idx, sample in enumerate(iterator, start=offset):
            yield idx, sample

    def get_field_schema(self, ftype=None, embedded_doc_type=None):
        """Returns a schema dictionary describing the fields of the samples in
        the view.

        Args:
            ftype (None): an optional field type to which to restrict the
                returned schema. Must be a subclass of
                :class:``fiftyone.core.fields.Field``
            embedded_doc_type (None): an optional embedded document type to
                which to restrict the returned schema. Must be a subclass of
                :class:``fiftyone.core.odm.BaseEmbeddedDocument``

        Returns:
             a dictionary mapping field names to field types
        """
        return self._dataset.get_field_schema(
            ftype=ftype, embedded_doc_type=embedded_doc_type
        )

    def get_tags(self):
        """Returns the list of tags in the collection.

        Returns:
            a list of tags
        """
        pipeline = [
            {"$project": {"tags": "$tags"}},
            {"$unwind": "$tags"},
            {"$group": {"_id": "None", "all_tags": {"$addToSet": "$tags"}}},
        ]
        try:
            return next(self.aggregate(pipeline))["all_tags"]
        except StopIteration:
            pass

        return []

    def get_label_fields(self):
        """Returns the list of label fields in the collection.

        Returns:
            a list of field names
        """
        pipeline = [
            {"$project": {"field": {"$objectToArray": "$$ROOT"}}},
            {"$unwind": "$field"},
            {"$group": {"_id": {"field": "$field.k", "cls": "$field.v._cls"}}},
        ]
        return [f for f in self.aggregate(pipeline)]

    @classmethod
    def list_stage_methods(cls):
        """Returns a list of all available :class:`DatasetView` stage methods,
        i.e., stages that return another :class:`DatasetView`.

        Returns:
            a list of :class:`DatasetView` method names
        """
        return list(view_stage.all)

    def add_stage(self, stage):
        """Adds a :class:`fiftyone.core.stages.ViewStage` to the current view,
        returning a new view.

        Args:
            stage: a :class:`fiftyone.core.stages.ViewStage`
        """
        return self._copy_with_new_stage(stage)

    @view_stage
    def list_filter(self, field, filter):
        """Filters the elements of the given list field.

        Elements of ``field``, which must be a list field, for which ``filter``
        returns ``False`` are omitted from the field.

        Args:
            field: the list field
            filter: a :class:`fiftyone.core.stages.ViewFieldCond` or
                `MongoDB query dict <https://docs.mongodb.com/manual/tutorial/query-documents>`_
                describing the filter to apply

        Returns:
            a :class:`DatasetView`
        """
        return self.add_stage(fos.ListFilter(field, filter))

    @view_stage
    def match(self, filter):
        """Filters the samples in the view by the given filter.

        Samples for which ``filter`` returns ``False`` are omitted.

        See https://docs.mongodb.com/manual/tutorial/query-documents for
        details about passing a MongoDB query dict to this function.

        Args:
            filter: a :class:`fiftyone.core.stages.ViewFieldCond` or
                `MongoDB query dict <https://docs.mongodb.com/manual/tutorial/query-documents>`_
                describing the filter to apply

        Returns:
            a :class:`DatasetView`
        """
        return self.add_stage(fos.Match(filter))

    @view_stage
    def match_tag(self, tag):
        """Returns a view containing the samples that have the given tag.

        Args:
            tag: a tag

        Returns:
            a :class:`DatasetView`
        """
        return self.add_stage(fos.MatchTag(tag))

    @view_stage
    def match_tags(self, tags):
        """Returns a view containing the samples that have any of the given
        tags.

        To match samples that contain multiple tags, simply chain
        :func:`match_tag` or :func:`match_tags` calls together.

        Args:
            tags: an iterable of tags

        Returns:
            a :class:`DatasetView`
        """
        return self.add_stage(fos.MatchTags(tags))

    @view_stage
    def exists(self, field):
        """Returns a view containing the samples that have a non-``None`` value
        for the given field.

        Args:
            field: the field

        Returns:
            a :class:`DatasetView`
        """
        return self.add_stage(fos.Exists(field))

    @view_stage
    def sort_by(self, field, reverse=False):
        """Sorts the samples in the view by the given field.

        Args:
            field: the field to sort by. Example fields::

                filename
                metadata.size_bytes
                metadata.frame_size[0]

            reverse (False): whether to return the results in descending order

        Returns:
            a :class:`DatasetView`
        """
        return self.add_stage(fos.SortBy(field, reverse=reverse))

    @view_stage
    def skip(self, skip):
        """Omits the given number of samples from the head of the view.

        Args:
            skip: the number of samples to skip. If a non-positive number is
                provided, no samples are omitted

        Returns:
            a :class:`DatasetView`
        """
        return self.add_stage(fos.Skip(skip))

    @view_stage
    def limit(self, limit):
        """Limits the view to the given number of samples.

        Args:
            num: the maximum number of samples to return. If a non-positive
                number is provided, an empty view is returned

        Returns:
            a :class:`DatasetView`
        """
        return self.add_stage(fos.Limit(limit))

    @view_stage
    def take(self, size):
        """Randomly samples the given number of samples from the view.

        Args:
            size: the number of samples to return. If a non-positive number is
                provided, an empty view is returned

        Returns:
            a :class:`DatasetView`
        """
        return self.add_stage(fos.Take(size))

    @view_stage
    def select(self, sample_ids):
        """Selects the samples with the given IDs from the view.

        Args:
            sample_ids: an iterable of sample IDs

        Returns:
            a :class:`DatasetView`
        """
        return self.add_stage(fos.Select(sample_ids))

    @view_stage
    def exclude(self, sample_ids):
        """Excludes the samples with the given IDs from the view.

        Args:
            sample_ids: an iterable of sample IDs

        Returns:
            a :class:`DatasetView`
        """
        return self.add_stage(fos.Exclude(sample_ids))

    def aggregate(self, pipeline=None):
        """Calls the current MongoDB aggregation pipeline on the view.

        Args:
            pipeline (None): an optional aggregation pipeline (list of dicts)
                to append to the view's pipeline before aggregation.

        Returns:
            an iterable over the aggregation result
        """
        if pipeline is None:
            pipeline = []

        complete_pipeline = [s.to_mongo() for s in self._pipeline] + pipeline

        return self._dataset.aggregate(complete_pipeline)

    def serialize(self):
        """Serializes the view.

        Returns:
            a JSON representation of the view
        """
        return {
            "dataset": self._dataset.serialize(),
            "view": json_util.dumps([s._serialize() for s in self._pipeline]),
        }

    def to_dict(self):
        """Returns a JSON dictionary representation of the view.

        Returns:
            a JSON dict
        """
        d = {
            "name": self._dataset.name,
            "num_samples": len(self),
            "tags": list(self.get_tags()),
            "sample_fields": self._dataset._get_fields_dict(),
            "pipeline_stages": [str(d) for d in self._pipeline],
        }
        d.update(super().to_dict())
        return d

    def _slice(self, s):
        if s.step is not None and s.step != 1:
            raise ValueError(
                "Unsupported slice '%s'; step is not supported" % s
            )

        _len = None

        start = s.start
        if start is not None:
            if start < 0:
                _len = len(self)
                start += _len

            if start <= 0:
                start = None

        stop = s.stop
        if stop is not None and stop < 0:
            if _len is None:
                _len = len(self)

            stop += _len

        if start is None:
            if stop is None:
                return self

            return self.limit(stop)

        if stop is None:
            return self.skip(start)

        return self.skip(start).limit(stop - start)

    def _copy_with_new_stage(self, stage):
        view = copy(self)
        view._pipeline.append(stage)
        return view

    def _get_latest_offset(self):
        for stage in self._pipeline[::-1]:
            if "$skip" in stage:
                return stage["$skip"]

        return 0
