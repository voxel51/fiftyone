"""
Experimental dataset contexts.

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

import eta.core.data as etad
import eta.core.image as etai

import fiftyone.experimental.views as foev
import fiftyone.utils.data as foud


class DatasetContext(object):
    """Base class for dataset contexts, which allow for performing operations
    on a :class:`fiftyone.core.data.Dataset` with respect to a specific subset
    of its contents (the "context").

    Args:
        dataset: a :class:`fiftyone.core.data.Dataset`
    """

    def __init__(self, dataset):
        self._dataset = dataset

    def __len__(self):
        return len(self._dataset)

    def __bool__(self):
        return bool(self._dataset)

    def __getitem__(self, sample_id):
        return self._dataset[sample_id]

    def __contains__(self, sample_id):
        return sample_id in self._dataset

    def __iter__(self):
        return iter(self.get_view())

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def iter_sample_ids(self):
        """Returns an iterator over the sample IDs in the context.

        Returns:
            an iterator over sample IDs
        """
        return self._dataset.iter_sample_ids()

    def get_view(self):
        """Returns a :class:`fiftyone.core.views.DatasetView` for the context.

        Returns:
            a :class:`fiftyone.core.views.DatasetView`
        """
        raise NotImplementedError("subclasses must implement get_view()")


class ImageContext(DatasetContext):
    """A context for working with the images in a
    :class:`fiftyone.core.data.Dataset`.

    Args:
        dataset: a :class:`fiftyone.core.data.Dataset`
    """

    def __init__(self, dataset):
        super(ImageContext, self).__init__(dataset)

    def get_view(self):
        """Returns a :class:`fiftyone.core.views.ImageView` for the context.

        Returns:
            a :class:`fiftyone.core.views.ImageView`
        """
        return foev.ImageView(self)

    def _iter_image_paths(self, sample_ids):
        for sample_id in sample_ids:
            sample = self._dataset[sample_id]
            yield sample.data_path

    def _make_numpy_iterator(self, sample_ids):
        for img_path in self._iter_image_paths(sample_ids):
            yield etai.read(img_path)

    def _make_tf_dataset(self, sample_ids, num_parallel_calls):
        from fiftyone.utils.tf import from_images

        image_paths = list(self._iter_image_paths(sample_ids))
        return from_images(image_paths, num_parallel_calls=num_parallel_calls)

    def _make_torch_dataset(self, sample_ids):
        from fiftyone.utils.torch import TorchImageDataset

        image_paths = list(self._iter_image_paths(sample_ids))
        return TorchImageDataset(image_paths)


class LabeledImageContext(DatasetContext):
    """A context for working with a :class:`fiftyone.core.data.Dataset` of
    images and a particular set of labels associated with the images.

    Args:
        dataset: a :class:`fiftyone.core.data.Dataset`
        label_field: the :class:`fiftyone.core.data.DatasetSample` field
            containing the labels for this context
    """

    def __init__(self, dataset, label_field):
        super(LabeledImageContext, self).__init__(dataset)
        self._label_field = label_field

    def get_view(self):
        """Returns a :class:`fiftyone.core.views.LabeledImageView` for the
        context.

        Returns:
            a :class:`fiftyone.core.views.LabeledImageView`
        """
        return foev.LabeledImageView(self)

    def get_classification_context(self, attr_name=None):
        """Returns a :class:`fiftyone.core.contexts.ImageClassificationContext`
        for the specified frame attribute of the labels.

        Args:
            attr_name (None): the name of the frame attribute. If not
                specified, the labels must contain a single frame attribute

        Returns:
            a :class:`fiftyone.core.contexts.ImageClassificationContext`
        """
        if attr_name is None:
            sample_ids = self._dataset.iter_sample_ids()
            schema = self._get_active_schema(sample_ids)
            frame_attrs = list(schema.frames.schema.keys())
            num_frame_attrs = len(frame_attrs)
            if num_frame_attrs != 1:
                raise ValueError(
                    "Dataset must have exactly one frame attribute when "
                    "requesting an ImageClassificationContext without "
                    "specifying `attr_name`, but found %d attribute(s): %s"
                    % (num_frame_attrs, frame_attrs)
                )

            attr_name = frame_attrs[0]

        return ImageClassificationContext(
            self._dataset, self._label_field, attr_name
        )

    def _get_image_labels(self, sample):
        return getattr(sample, self._label_field)

    def _iter_image_paths_and_labels(self, sample_ids):
        for sample_id in sample_ids:
            sample = self._dataset[sample_id]
            img_path = sample.data_path
            image_labels = self._get_image_labels(sample)
            yield img_path, image_labels

    def _make_numpy_iterator(self, sample_ids):
        for img_path, image_labels in self._iter_image_paths_and_labels(
            sample_ids
        ):
            img = etai.read(img_path)
            yield img, image_labels

    def _get_active_schema(self, sample_ids):
        schema = etai.ImageLabelsSchema()
        for _, image_labels in self._iter_image_paths_and_labels(sample_ids):
            schema.merge_schema(
                etai.ImageLabelsSchema.build_active_schema(image_labels)
            )

        return schema

    def _export(self, dataset_dir, sample_ids):
        image_paths = []
        labels = []
        for sample_id in sample_ids:
            sample = self._dataset[sample_id]
            image_paths.append(sample.data_path)
            labels.append(self._get_image_labels(sample))

        foud.write_labeled_image_dataset(image_paths, labels, dataset_dir)


class ImageClassificationContext(DatasetContext):
    """A context for working with a :class:`fiftyone.core.data.Dataset` with
    respect to an image classification task represented by a particular frame
    attribute of a particular set of labels in the dataset.

    Args:
        dataset: a :class:`fiftyone.core.data.Dataset`
        label_field: the DatasetSample field containing the labels for this
            context
        attr_name: the frame attribute of interest from each sample's
            labels
    """

    def __init__(self, dataset, label_field, attr_name):
        super(ImageClassificationContext, self).__init__(dataset)
        self._label_field = label_field
        self._attr_name = attr_name

    def get_view(self):
        """Returns a :class:`fiftyone.core.views.ImageClassificationView` for
        the context.

        Returns:
            a :class:`fiftyone.core.views.ImageClassificationView`
        """
        return foev.ImageClassificationView(self)

    def _get_label(self, sample):
        image_labels = getattr(sample, self._label_field)
        label = image_labels.attrs.get_attr_value_with_name(self._attr_name)
        return label

    def _iter_image_paths_and_labels(self, sample_ids):
        for sample_id in sample_ids:
            sample = self._dataset[sample_id]
            img_path = sample.data_path
            label = self._get_label(sample)
            yield img_path, label

    def _make_numpy_iterator(self, sample_ids):
        for img_path, label in self._iter_image_paths_and_labels(sample_ids):
            img = etai.read(img_path)
            yield img, label

    def _make_tf_dataset(self, sample_ids, num_parallel_calls):
        from fiftyone.utils.tf import from_image_paths_and_labels

        image_paths, labels = zip(
            *self._iter_image_paths_and_labels(sample_ids)
        )
        return from_image_paths_and_labels(
            image_paths, labels, num_parallel_calls=num_parallel_calls
        )

    def _make_torch_dataset(self, sample_ids):
        from fiftyone.utils.torch import TorchImageClassificationDataset

        image_paths, labels = zip(
            *self._iter_image_paths_and_labels(sample_ids)
        )
        return TorchImageClassificationDataset(image_paths, labels)

    def _export(self, dataset_dir, sample_ids):
        image_paths = []
        labels = []
        for sample_id in sample_ids:
            sample = self._dataset[sample_id]
            image_paths.append(sample.data_path)
            label = self._get_label(sample)
            image_labels = etai.ImageLabels()
            image_labels.add_attribute(
                etad.CategoricalAttribute(self._attr_name, label)
            )
            labels.append(image_labels)

        foud.write_labeled_image_dataset(image_paths, labels, dataset_dir)


class ModelContext(DatasetContext):
    """Context class for performing operations on a
    :class:`fiftyone.core.data.Dataset` with respect to a model.

    Args:
        dataset: a :class:`fiftyone.core.data.Dataset`
        name: the name of the model
    """

    def __init__(self, dataset, name):
        super(ModelContext, self).__init__(dataset)
        self._name = name
        self._predictions = {}

    def __enter__(self):
        self.clear()
        return self

    def __exit__(self, *args):
        self.publish()

    @property
    def name(self):
        """The name of the model."""
        return self._name

    @property
    def predictions(self):
        """The predictions generated by the model within this context."""
        return self._predictions

    def get_view(self):
        """Returns a :class:`fiftyone.core.views.ModelView` for the context.

        Returns:
            a :class:`fiftyone.core.views.ModelView`
        """
        return foev.ModelView(self)

    def add_prediction(self, sample_id, prediction):
        """Adds the model prediction for the given sample to the context.

        Args:
            sample_id: the sample ID
            prediction: a prediction dict
        """
        self._predictions[sample_id] = prediction

    def clear(self):
        """Clears the context."""
        self._predictions = {}

    def publish(self):
        """Publishes the context to the parent dataset."""
        self._dataset.publish_model_context(self)

    def _iter_image_paths_and_sample_ids(self, sample_ids):
        for sample_id in sample_ids:
            sample = self._dataset[sample_id]
            img_path = sample.data_path
            yield img_path, sample_id

    def _make_numpy_iterator(self, sample_ids):
        for img_path, sample_id in self._iter_image_paths_and_sample_ids(
            sample_ids
        ):
            img = etai.read(img_path)
            yield img, sample_id

    def _make_tf_dataset(self, sample_ids, num_parallel_calls):
        from fiftyone.utils.tf import from_image_paths_and_labels

        image_paths, sample_ids = zip(
            *self._iter_image_paths_and_sample_ids(sample_ids)
        )
        return from_image_paths_and_labels(
            image_paths, sample_ids, num_parallel_calls=num_parallel_calls
        )

    def _make_torch_dataset(self, sample_ids):
        from fiftyone.utils.torch import TorchImageClassificationDataset

        image_paths, sample_ids = zip(
            *self._iter_image_paths_and_sample_ids(sample_ids)
        )
        return TorchImageClassificationDataset(image_paths, sample_ids)
