"""
Experimental dataset views.

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

from copy import copy
import random


class DatasetView(object):
    """Class for performing read-only manipulations on a
    :class:`fiftyone.core.data.Dataset`.

    Args:
        context: a :class:`fiftyone.core.contexts.DatasetContext`.
    """

    def __init__(self, context):
        self._context = context
        self._sample_ids = list(context.iter_sample_ids())
        self._orig_sample_ids = copy(self._sample_ids)

    def __len__(self):
        return len(self._sample_ids)

    def __bool__(self):
        return bool(self._sample_ids)

    def __contains__(self, sample_id):
        return sample_id in self._sample_ids

    def __iter__(self):
        return iter(self._sample_ids)

    def shuffle(self):
        """Randomly shuffles the samples in the view.

        Returns:
            a DatasetView
        """
        random.shuffle(self._sample_ids)
        return self

    def take(self, num_samples):
        """Returns a view that contains only the given number of samples taken
        in order from the dataset.

        Args:
            num_samples: the number of samples to take

        Returns:
            a DatasetView
        """
        self._sample_ids = self._sample_ids[:num_samples]
        return self

    def select_samples(self, sample_ids):
        """Returns a view that contains only the samples with the given IDs.

        Args:
            sample_ids: an iterable of sample IDs

        Returns:
            a DatasetView
        """
        self._sample_ids = list(sample_ids)
        return self

    def remove_samples(self, sample_ids):
        """Returns a view with the samples with the given IDs omitted.

        Args:
            sample_ids: an iterable of sample IDs

        Returns:
            a DatasetView
        """
        sample_ids = set(sample_ids)
        self._sample_ids = [s for s in self._sample_ids if s not in sample_ids]
        return self

    def reset(self):
        """Resets the view to the entire dataset.

        Returns:
            a DatasetView
        """
        self._sample_ids = copy(self._orig_sample_ids)
        return self


class ImageView(DatasetView):
    """Class for performing read-only manipulations on a
    :class:`fiftyone.core.contexts.ImageContext`.
    """

    def as_numpy_iterator(self):
        """Returns a Python iterator that emits images for the samples in the
        view.

        Returns:
            an iterator over images
        """
        return self._context._make_numpy_iterator(self._sample_ids)

    def as_tf_dataset(self, num_parallel_calls=None):
        """Returns a ``tf.data.Dataset`` that contains the images for the
        samples in the view.

        Args:
            num_parallel_calls (None): the number of samples to read
                asynchronously in parallel. See
                https://www.tensorflow.org/api_docs/python/tf/data/Dataset#map
                for details

        Returns:
            a ``tf.data.Dataset``
        """
        return self._context._make_tf_dataset(
            self._sample_ids, num_parallel_calls
        )

    def as_torch_dataset(self):
        """Returns a ``torch.utils.data.Dataset`` that contains the images for
        the samples in the view.

        Returns:
            a ``torch.utils.data.Dataset``
        """
        return self._context._make_torch_dataset(self._sample_ids)


class LabeledImageView(DatasetView):
    """Class for performing read-only manipulations on a
    :class:`fiftyone.core.contexts.LabeledImageContext`.
    """

    def as_numpy_iterator(self):
        """Returns a Python iterator that emits ``(img, ImageLabels)`` pairs
        for the samples in the view.

        Returns:
            an iterator over ``(img, ImageLabels)`` pairs
        """
        return self._context._make_numpy_iterator(self._sample_ids)

    def get_active_schema(self):
        """Returns an ``eta.core.images.ImageLabelsSchema`` describing the
        active schema of the view.

        Returns:
            an ``eta.core.images.ImageLabelsSchema``
        """
        return self._context._get_active_schema(self._sample_ids)

    def export(self, dataset_dir):
        """Exports the current view to disk in
        ``eta.core.datasets.LabeledDataset`` format.

        Args:
            dataset_dir: the directory in which to write the dataset
        """
        self._context._export(dataset_dir, self._sample_ids)


class ImageClassificationView(DatasetView):
    """Class for performing read-only manipulations on a
    :class:`fiftyone.core.contexts.ImageClassificationContext`.
    """

    def as_numpy_iterator(self):
        """Returns a Python iterator that emits ``(img, label)`` pairs for the
        samples in the view.

        Returns:
            an iterator over ``(img, label)`` pairs
        """
        return self._context._make_numpy_iterator(self._sample_ids)

    def as_tf_dataset(self, num_parallel_calls=None):
        """Returns a ``tf.data.Dataset`` that contains ``(img, label)`` pairs
        for the samples in the view.

        Args:
            num_parallel_calls (None): the number of samples to read
                asynchronously in parallel. See
                https://www.tensorflow.org/api_docs/python/tf/data/Dataset#map
                for details

        Returns:
            a ``tf.data.Dataset``
        """
        return self._context._make_tf_dataset(
            self._sample_ids, num_parallel_calls
        )

    def as_torch_dataset(self):
        """Returns a ``torch.utils.data.Dataset`` that contains
        ``(img, label)`` for the samples in the view.

        Returns:
            a ``torch.utils.data.Dataset``
        """
        return self._context._make_torch_dataset(self._sample_ids)

    def export(self, dataset_dir):
        """Exports the current view to disk in
        ``eta.core.datasets.LabeledDataset`` format.

        Args:
            dataset_dir: the directory in which to write the dataset
        """
        self._context._export(dataset_dir, self._sample_ids)


class ModelView(DatasetView):
    """Class for performing read-only manipulations on a
    :class:`fiftyone.core.contexts.ModelContext`.
    """

    def as_numpy_iterator(self):
        """Returns a Python iterator that emits ``(img, sample_id)`` pairs for
        the samples in the view.

        Returns:
            an iterator over ``(img, sample_id)`` pairs
        """
        return self._context._make_numpy_iterator(self._sample_ids)

    def as_tf_dataset(self, num_parallel_calls=None):
        """Returns a ``tf.data.Dataset`` that contains ``(img, sample_id)``
        pairs for the samples in the view.

        Args:
            num_parallel_calls (None): the number of samples to read
                asynchronously in parallel. See
                https://www.tensorflow.org/api_docs/python/tf/data/Dataset#map
                for details

        Returns:
            a ``tf.data.Dataset``
        """
        return self._context._make_tf_dataset(
            self._sample_ids, num_parallel_calls
        )

    def as_torch_dataset(self):
        """Returns a ``torch.utils.data.Dataset`` that contains
        ``(img, sample_id)`` for the samples in the view.

        Returns:
            a ``torch.utils.data.Dataset``
        """
        return self._context._make_torch_dataset(self._sample_ids)
