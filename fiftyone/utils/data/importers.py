"""
Dataset importers.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import copy
import logging
import os
import random

import eta.core.datasets as etads
import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau
import eta.core.video as etav

import fiftyone.core.frame as fof
import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.media as fomm
import fiftyone.core.sample as fos

from .parsers import (
    FiftyOneImageClassificationSampleParser,
    FiftyOneImageDetectionSampleParser,
    FiftyOneImageLabelsSampleParser,
    FiftyOneVideoLabelsSampleParser,
)


logger = logging.getLogger(__name__)


def import_samples(
    dataset,
    dataset_importer,
    label_field=None,
    tags=None,
    expand_schema=True,
    add_info=True,
):
    """Adds the samples from the given
    :class:`fiftyone.utils.data.importers.DatasetImporter` to the dataset.

    See :ref:`this guide <custom-dataset-importer>` for more details about
    importing datasets in custom formats by defining your own
    :class:`DatasetImporter <fiftyone.utils.data.importers.DatasetImporter>`.

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`
        dataset_importer: a :class:`DatasetImporter`
        label_field (None): the name of the field in which to store the
            imported labels. Only applicable if ``dataset_importer`` is a
            :class:`LabeledImageDatasetImporter`
        tags (None): an optional list of tags to attach to each sample
        expand_schema (True): whether to dynamically add new sample fields
            encountered to the dataset schema. If False, an error is raised
            if a sample's schema is not a subset of the dataset schema
        add_info (True): whether to add dataset info from the importer (if
            any) to the dataset

    Returns:
        a list of IDs of the samples that were added to the dataset
    """
    # Invoke the importer's context manager first, since some of its properies
    # may need to be initialized
    with dataset_importer:

        #
        # Construct function to parse samples
        #

        if isinstance(dataset_importer, GenericSampleDatasetImporter):
            # Generic sample dataset

            #
            # If the importer provides a sample field schema, apply it now
            #
            # This is more efficient than adding samples with
            # `expand_schema == True`. Also, ensures that all fields exist with
            # the appropriate types, even if all of the imported samples have
            # `None` values
            #
            if expand_schema and dataset_importer.has_sample_field_schema:
                dataset._apply_field_schema(
                    dataset_importer.get_sample_field_schema()
                )
                expand_schema = False

            def parse_sample(sample):
                if tags:
                    sample.tags.extend(tags)

                return sample

        elif isinstance(dataset_importer, UnlabeledImageDatasetImporter):
            # Unlabeled image dataset

            # The schema never needs expanding when importing unlabeled samples
            expand_schema = False

            def parse_sample(sample):
                image_path, image_metadata = sample
                return fos.Sample(
                    filepath=image_path, metadata=image_metadata, tags=tags,
                )

        elif isinstance(dataset_importer, UnlabeledVideoDatasetImporter):
            # Unlabeled video dataset

            # The schema never needs expanding when importing unlabeled samples
            expand_schema = False

            def parse_sample(sample):
                video_path, video_metadata = sample
                return fos.Sample(
                    filepath=video_path, metadata=video_metadata, tags=tags,
                )

        elif isinstance(dataset_importer, LabeledImageDatasetImporter):
            # Labeled image dataset

            # Check if a single label field is being imported
            try:
                single_label_field = issubclass(
                    dataset_importer.label_cls, fol.Label
                )

                if label_field is None:
                    raise ValueError(
                        "A `label_field` must be provided when importing "
                        "labeled image samples with a single label field"
                    )
            except:
                single_label_field = False

            if expand_schema and single_label_field:
                # This has the benefit of ensuring that `label_field` exists,
                # even if all of the imported samples are unlabeled (i.e.,
                # return labels that are all `None`)
                dataset._ensure_label_field(
                    label_field, dataset_importer.label_cls
                )

                # The schema now never needs expanding, because we already
                # ensured that `label_field` exists, if necessary
                expand_schema = False

            if label_field:
                label_key = lambda k: label_field + "_" + k
            else:
                label_key = lambda k: k

            def parse_sample(sample):
                image_path, image_metadata, label = sample
                sample = fos.Sample(
                    filepath=image_path, metadata=image_metadata, tags=tags,
                )

                if isinstance(label, dict):
                    sample.update_fields(
                        {label_key(k): v for k, v in label.items()}
                    )
                elif label is not None:
                    sample[label_field] = label

                return sample

        elif isinstance(dataset_importer, LabeledVideoDatasetImporter):
            # Labeled video dataset

            # Check if a single sample-level label field is being imported
            try:
                if (
                    issubclass(dataset_importer.label_cls, fol.Label)
                    and label_field is None
                ):
                    raise ValueError(
                        "A `label_field` must be provided when importing "
                        "labeled video samples with a single sample-level "
                        "field"
                    )
            except:
                pass

            if label_field:
                label_key = lambda k: label_field + "_" + k
            else:
                label_key = lambda k: k

            def parse_sample(sample):
                video_path, video_metadata, label, frames = sample
                sample = fos.Sample(
                    filepath=video_path, metadata=video_metadata, tags=tags,
                )

                if isinstance(label, dict):
                    sample.update_fields(
                        {label_key(k): v for k, v in label.items()}
                    )
                elif label is not None:
                    sample[label_field] = label

                if frames is not None:
                    sample.frames.merge(
                        {
                            frame_number: {
                                label_key(fname): flabel
                                for fname, flabel in frame_dict.items()
                            }
                            for frame_number, frame_dict in frames.items()
                        }
                    )

                return sample

        else:
            raise ValueError(
                "Unsupported DatasetImporter type %s" % type(dataset_importer)
            )

        try:
            num_samples = len(dataset_importer)
        except:
            num_samples = None

        # Import samples
        samples = map(parse_sample, iter(dataset_importer))
        sample_ids = dataset.add_samples(
            samples, expand_schema=expand_schema, num_samples=num_samples
        )

        # Load dataset info
        if add_info and dataset_importer.has_dataset_info:
            info = dataset_importer.get_dataset_info()
            if info:
                # Mask targets are serialized into `info`; extract them if
                # present
                (
                    default_mask_targets,
                    mask_targets,
                ) = dataset._parse_mask_targets(info)

                if default_mask_targets:
                    dataset.default_mask_targets = default_mask_targets

                # Some mask targets may already exist, so update, not overwrite
                if mask_targets:
                    dataset.mask_targets.update(mask_targets)

                dataset.info.update(info)

                dataset.save()

        return sample_ids


class DatasetImporter(object):
    """Base interface for importing datasets stored on disk into FiftyOne.

    .. automethod:: __len__
    .. automethod:: __next__

    Args:
        dataset_dir: the dataset directory
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self, dataset_dir, shuffle=False, seed=None, max_samples=None
    ):
        self.dataset_dir = dataset_dir
        self.shuffle = shuffle
        self.seed = seed
        self.max_samples = max_samples

    def __enter__(self):
        self.setup()
        return self

    def __exit__(self, *args):
        self.close(*args)

    def __iter__(self):
        return self

    def __len__(self):
        """The total number of samples that will be imported.

        Raises:
            TypeError: if the total number is not known
        """
        raise TypeError(
            "The number of samples in a '%s' is not known a priori"
            % etau.get_class_name(self)
        )

    def __next__(self):
        """Returns information about the next sample in the dataset.

        Returns:
            subclass-specific information for the sample

        Raises:
            StopIteration: if there are no more samples to import
        """
        raise NotImplementedError("subclass must implement __next__()")

    @property
    def has_dataset_info(self):
        """Whether this importer produces a dataset info dictionary."""
        raise NotImplementedError("subclass must implement has_dataset_info")

    def setup(self):
        """Performs any necessary setup before importing the first sample in
        the dataset.

        This method is called when the importer's context manager interface is
        entered, :func:`DatasetImporter.__enter__`.
        """
        pass

    def get_dataset_info(self):
        """Returns the dataset info for the dataset.

        By convention, this method should be called after all samples in the
        dataset have been imported.

        Returns:
            a dict of dataset info
        """
        if not self.has_dataset_info:
            raise ValueError(
                "This '%s' does not provide dataset info"
                % etau.get_class_name(self)
            )

        raise NotImplementedError("subclass must implement get_dataset_info()")

    def close(self, *args):
        """Performs any necessary actions after the last sample has been
        imported.

        This method is called when the importer's context manager interface is
        exited, :func:`DatasetImporter.__exit__`.

        Args:
            *args: the arguments to :func:`DatasetImporter.__exit__`
        """
        pass

    def _preprocess_list(self, l):
        """Internal utility that preprocesses the given list---which is
        presumed to be a list defining the samples that should be imported---by
        applying the values of the ``shuffle``, ``seed``, and ``max_samples``
        parameters of the importer.

        Args:
            l: a list

        Returns:
            a processed copy of the list
        """
        if self.shuffle:
            if self.seed is not None:
                random.seed(self.seed)

            l = copy(l)
            random.shuffle(l)

        if self.max_samples is not None:
            l = l[: self.max_samples]

        return l


class GenericSampleDatasetImporter(DatasetImporter):
    """Interface for importing datasets that contain arbitrary
    :class:`fiftyone.core.sample.Sample` instances.

    .. automethod:: __len__
    .. automethod:: __next__

    FiftyOne imports datasets of this type using the pseudocode below::

        import fiftyone as fo

        dataset = fo.Dataset(...)

        importer = GenericSampleDatasetImporter(dataset_dir, ...)
        with importer:
            for sample in importer:
                dataset.add_sample(sample)

            if importer.has_dataset_info:
                dataset.info.update(importer.get_dataset_info())

    Args:
        dataset_dir: the dataset directory
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __next__(self):
        """Returns information about the next sample in the dataset.

        Returns:
            a :class:`fiftyone.core.sample.Sample` instance

        Raises:
            StopIteration: if there are no more samples to import
        """
        raise NotImplementedError("subclass must implement __next__()")

    @property
    def has_sample_field_schema(self):
        """Whether this importer produces a sample field schema."""
        raise NotImplementedError("subclass must implement has_dataset_info")

    def get_sample_field_schema(self):
        """Returns dictionary describing the field schema of the samples loaded
        by this importer.

        The returned dictionary should map field names to to string
        representations of :class:`fiftyone.core.fields.Field` instances
        generated by ``str(field)``.

        Returns:
            a dict
        """
        if not self.has_sample_field_schema:
            raise ValueError(
                "This '%s' does not provide a sample field schema"
                % etau.get_class_name(self)
            )

        raise NotImplementedError(
            "subclass must implement get_sample_field_schema()"
        )


class UnlabeledImageDatasetImporter(DatasetImporter):
    """Interface for importing datasets of unlabeled image samples.

    .. automethod:: __len__
    .. automethod:: __next__

    FiftyOne imports datasets of this type using the pseudocode below::

        import fiftyone as fo

        dataset = fo.Dataset(...)

        importer = UnlabeledImageDatasetImporter(dataset_dir, ...)
        with importer:
            for image_path, image_metadata in importer:
                dataset.add_sample(
                    fo.Sample(filepath=image_path, metadata=image_metadata)
                )

            if importer.has_dataset_info:
                dataset.info.update(importer.get_dataset_info())

    Args:
        dataset_dir: the dataset directory
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __next__(self):
        """Returns information about the next sample in the dataset.

        Returns:
            an ``(image_path, image_metadata)`` tuple, where

            -   ``image_path``: the path to the image on disk
            -   ``image_metadata``: an
                :class:`fiftyone.core.metadata.ImageMetadata` instances for the
                image, or ``None`` if :meth:`has_image_metadata` is ``False``

        Raises:
            StopIteration: if there are no more samples to import
        """
        raise NotImplementedError("subclass must implement __next__()")

    @property
    def has_image_metadata(self):
        """Whether this importer produces
        :class:`fiftyone.core.metadata.ImageMetadata` instances for each image.
        """
        raise NotImplementedError("subclass must implement has_image_metadata")


class UnlabeledVideoDatasetImporter(DatasetImporter):
    """Interface for importing datasets of unlabeled video samples.

    .. automethod:: __len__
    .. automethod:: __next__

    FiftyOne imports datasets of this type using the pseudocode below::

        import fiftyone as fo

        dataset = fo.Dataset(...)

        importer = UnlabeledVideoDatasetImporter(dataset_dir, ...)
        with importer:
            for video_path, video_metadata in importer:
                dataset.add_sample(
                    fo.Sample(filepath=video_path, metadata=video_metadata)
                )

            if importer.has_dataset_info:
                dataset.info.update(importer.get_dataset_info())

    Args:
        dataset_dir: the dataset directory
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __next__(self):
        """Returns information about the next sample in the dataset.

        Returns:
            an ``(video_path, video_metadata)`` tuple, where

            -   ``video_path``: the path to the video on disk
            -   ``video_metadata``: an
                :class:`fiftyone.core.metadata.VideoMetadata` instances for the
                video, or ``None`` if :meth:`has_video_metadata` is ``False``

        Raises:
            StopIteration: if there are no more samples to import
        """
        raise NotImplementedError("subclass must implement __next__()")

    @property
    def has_video_metadata(self):
        """Whether this importer produces
        :class:`fiftyone.core.metadata.VideoMetadata` instances for each video.
        """
        raise NotImplementedError("subclass must implement has_video_metadata")


class LabeledImageDatasetImporter(DatasetImporter):
    """Interface for importing datasets of labeled image samples.

    .. automethod:: __len__
    .. automethod:: __next__

    FiftyOne imports datasets of this type using the pseudocode below::

        import fiftyone as fo

        dataset = fo.Dataset(...)
        label_field = ...

        importer = LabeledImageDatasetImporter(dataset_dir, ...)
        with importer:
            for image_path, image_metadata, label in importer:
                sample = fo.Sample(
                    filepath=image_path, metadata=image_metadata
                )

                if isinstance(label, dict):
                    sample.update_fields(
                        {label_field + "_" + k: v for k, v in label.items()}
                    )
                elif label is not None:
                    sample[label_field] = label

                dataset.add_sample(sample)

            if importer.has_dataset_info:
                dataset.info.update(importer.get_dataset_info())

    Args:
        dataset_dir: the dataset directory
        skip_unlabeled (False): whether to skip unlabeled images when importing
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        skip_unlabeled=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        super().__init__(dataset_dir)
        self.skip_unlabeled = skip_unlabeled
        self.shuffle = shuffle
        self.seed = seed
        self.max_samples = max_samples

    def __next__(self):
        """Returns information about the next sample in the dataset.

        Returns:
            an  ``(image_path, image_metadata, label)`` tuple, where

            -   ``image_path``: the path to the image on disk
            -   ``image_metadata``: an
                :class:`fiftyone.core.metadata.ImageMetadata` instances for the
                image, or ``None`` if :meth:`has_image_metadata` is ``False``
            -   ``label``: an instance of :meth:`label_cls`, or a dictionary
                mapping field names to :class:`fiftyone.core.labels.Label`
                instances, or ``None`` if the sample is unlabeled

        Raises:
            StopIteration: if there are no more samples to import
        """
        raise NotImplementedError("subclass must implement __next__()")

    @property
    def has_image_metadata(self):
        """Whether this importer produces
        :class:`fiftyone.core.metadata.ImageMetadata` instances for each image.
        """
        raise NotImplementedError("subclass must implement has_image_metadata")

    @property
    def label_cls(self):
        """The :class:`fiftyone.core.labels.Label` class(es) returned by this
        importer.

        This can be any of the following:

        -   a :class:`fiftyone.core.labels.Label` class. In this case, the
            importer is guaranteed to return labels of this type
        -   a dict mapping keys to :class:`fiftyone.core.labels.Label` classes.
            In this case, the importer will return label dictionaries with keys
            and value-types specified by this dictionary. Not all keys need be
            present in the imported labels
        -   ``None``. In this case, the importer makes no guarantees about the
            labels that it may return
        """
        raise NotImplementedError("subclass must implement label_cls")


class LabeledVideoDatasetImporter(DatasetImporter):
    """Interface for importing datasets of labeled video samples.

    .. automethod:: __len__
    .. automethod:: __next__

    FiftyOne imports datasets of this type using the pseudocode below::

        import fiftyone as fo

        dataset = fo.Dataset(...)
        label_field = ...

        importer = LabeledVideoDatasetImporter(dataset_dir, ...)
        with importer:
            for video_path, video_metadata, label, frames in importer:
                sample = fo.Sample(
                    filepath=video_path, metadata=video_metadata
                )

                if isinstance(label, dict):
                    sample.update_fields(
                        {label_field + "_" + k: v for k, v in label.items()}
                    )
                elif label is not None:
                    sample[label_field] = label

                if frames is not None:
                    sample.frames.merge(
                        {
                            frame_number: {
                                label_field + "_" + fname: flabel
                                for fname, flabel in frame_dict.items()
                            }
                            for frame_number, frame_dict in frames.items()
                        }
                    )

                dataset.add_sample(sample)

            if importer.has_dataset_info:
                dataset.info.update(importer.get_dataset_info())

    Args:
        dataset_dir: the dataset directory
        skip_unlabeled (False): whether to skip unlabeled videos when importing
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        skip_unlabeled=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        super().__init__(dataset_dir)
        self.skip_unlabeled = skip_unlabeled
        self.shuffle = shuffle
        self.seed = seed
        self.max_samples = max_samples

    def __next__(self):
        """Returns information about the next sample in the dataset.

        Returns:
            an  ``(video_path, video_metadata, labels, frames)`` tuple, where

            -   ``video_path``: the path to the video on disk
            -   ``video_metadata``: an
                :class:`fiftyone.core.metadata.VideoMetadata` instances for the
                video, or ``None`` if :meth:`has_video_metadata` is ``False``
            -   ``labels``: sample-level labels for the video, which can be any
                of the following:

                -   a :class:`fiftyone.core.labels.Label` instance
                -   a dictionary mapping label fields to
                    :class:`fiftyone.core.labels.Label` instances
                -   ``None`` if the sample has no sample-level labels

            -   ``frames``: frame-level labels for the video, which can
                be any of the following:

                -   a dictionary mapping frame numbers to dictionaries that
                    map label fields to :class:`fiftyone.core.labels.Label`
                    instances for each video frame
                -   ``None`` if the sample has no frame-level labels

        Raises:
            StopIteration: if there are no more samples to import
        """
        raise NotImplementedError("subclass must implement __next__()")

    @property
    def has_video_metadata(self):
        """Whether this importer produces
        :class:`fiftyone.core.metadata.VideoMetadata` instances for each video.
        """
        raise NotImplementedError("subclass must implement has_video_metadata")

    @property
    def label_cls(self):
        """The :class:`fiftyone.core.labels.Label` class(es) returned by this
        importer within the sample-level labels that it produces.

        This can be any of the following:

        -   a :class:`fiftyone.core.labels.Label` class. In this case, the
            importer is guaranteed to return sample-level labels of this type
        -   a dict mapping keys to :class:`fiftyone.core.labels.Label` classes.
            In this case, the importer will return sample-level label
            dictionaries with keys and value-types specified by this
            dictionary. Not all keys need be present in the imported labels
        -   ``None``. In this case, the importer makes no guarantees about the
            sample-level labels that it may return
        """
        raise NotImplementedError("subclass must implement label_cls")

    @property
    def frame_labels_cls(self):
        """The :class:`fiftyone.core.labels.Label` class(es) returned by this
        importer within the frame labels that it produces.

        This can be any of the following:

        -   a :class:`fiftyone.core.labels.Label` class. In this case, the
            importer is guaranteed to return frame labels of this type
        -   a dict mapping keys to :class:`fiftyone.core.labels.Label` classes.
            In this case, the importer will return frame label dictionaries
            with keys and value-types specified by this dictionary. Not all
            keys need be present in each frame
        -   ``None``. In this case, the importer makes no guarantees about the
            frame labels that it may return
        """
        raise NotImplementedError("subclass must implement frame_labels_cls")


class FiftyOneDatasetImporter(GenericSampleDatasetImporter):
    """Importer for FiftyOne datasets stored on disk in serialized format.

    See :class:`fiftyone.types.dataset_types.FiftyOneDataset` for format
    details.

    Args:
        dataset_dir: the dataset directory
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self, dataset_dir, shuffle=False, seed=None, max_samples=None
    ):
        dataset_dir = os.path.abspath(os.path.expanduser(dataset_dir))
        super().__init__(
            dataset_dir, shuffle=shuffle, seed=seed, max_samples=max_samples
        )
        self._metadata = None
        self._frame_labels_dir = None
        self._samples = None
        self._iter_samples = None
        self._num_samples = None
        self._is_video_dataset = False

    def __iter__(self):
        self._iter_samples = iter(self._samples)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        """Returns the next sample in the dataset.

        Returns:
            a :class:`fiftyone.core.sample.Sample`

        Raises:
            StopIteration: if there are no more samples to import
        """
        d = next(self._iter_samples)

        # Convert filepath to absolute path
        d["filepath"] = os.path.join(self.dataset_dir, d["filepath"])

        if self._is_video_dataset:
            labels_relpath = d.pop("frames")
            labels_path = os.path.join(self.dataset_dir, labels_relpath)

            sample = fos.Sample.from_dict(d)
            sample._frames = fof.Frames()  # @todo clean up this hack

            self._import_frame_labels(sample, labels_path)
        else:
            sample = fos.Sample.from_dict(d)

        return sample

    @property
    def has_sample_field_schema(self):
        if self._is_video_dataset:
            return False

        return "sample_fields" in self._metadata

    @property
    def has_dataset_info(self):
        return "info" in self._metadata

    def setup(self):
        metadata_path = os.path.join(self.dataset_dir, "metadata.json")
        if os.path.isfile(metadata_path):
            metadata = etas.load_json(metadata_path)
            media_type = metadata.get("media_type", fomm.IMAGE)
            self._metadata = metadata
            self._is_video_dataset = media_type == fomm.VIDEO
        else:
            self._metadata = {}

        self._frame_labels_dir = os.path.join(self.dataset_dir, "frames")

        samples_path = os.path.join(self.dataset_dir, "samples.json")
        samples = etas.load_json(samples_path).get("samples", [])

        self._samples = self._preprocess_list(samples)
        self._num_samples = len(self._samples)

    def get_sample_field_schema(self):
        return self._metadata.get("sample_fields", {})

    def get_dataset_info(self):
        return self._metadata.get("info", {})

    @staticmethod
    def get_classes(dataset_dir):
        metadata_path = os.path.join(dataset_dir, "metadata.json")
        if not os.path.isfile(metadata_path):
            return None

        metadata = etas.load_json(metadata_path)
        return metadata.get("info", {}).get("classes", None)

    @staticmethod
    def get_num_samples(dataset_dir):
        data_dir = os.path.join(dataset_dir, "data")
        if not os.path.isdir(data_dir):
            return 0

        return len(etau.list_files(data_dir))

    def _import_frame_labels(self, sample, labels_path):
        frames_map = etas.load_json(labels_path).get("frames", {})
        for key, value in frames_map.items():
            sample.frames[int(key)] = fof.Frame.from_dict(value)


class ImageDirectoryImporter(UnlabeledImageDatasetImporter):
    """Importer for a directory of images stored on disk.

    See :class:`fiftyone.types.dataset_types.ImageDirectory` for format
    details.

    Args:
        dataset_dir: the dataset directory
        recursive (True): whether to recursively traverse subdirectories
        compute_metadata (False): whether to produce
            :class:`fiftyone.core.metadata.ImageMetadata` instances for each
            image when importing
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        recursive=True,
        compute_metadata=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        super().__init__(
            dataset_dir, shuffle=shuffle, seed=seed, max_samples=max_samples
        )
        self.recursive = recursive
        self.compute_metadata = compute_metadata
        self._filepaths = None
        self._iter_filepaths = None
        self._num_samples = None

    def __iter__(self):
        self._iter_filepaths = iter(self._filepaths)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        image_path = next(self._iter_filepaths)

        if self.compute_metadata:
            image_metadata = fom.ImageMetadata.build_for(image_path)
        else:
            image_metadata = None

        return image_path, image_metadata

    @property
    def has_dataset_info(self):
        return False

    @property
    def has_image_metadata(self):
        return self.compute_metadata

    def setup(self):
        filepaths = etau.list_files(
            self.dataset_dir, abs_paths=True, recursive=self.recursive
        )
        filepaths = [p for p in filepaths if etai.is_image_mime_type(p)]

        self._filepaths = self._preprocess_list(filepaths)
        self._num_samples = len(self._filepaths)

    @staticmethod
    def get_num_samples(dataset_dir, recursive=True):
        filepaths = etau.list_files(dataset_dir, recursive=recursive)
        filepaths = [p for p in filepaths if etai.is_image_mime_type(p)]
        return len(filepaths)


class VideoDirectoryImporter(UnlabeledVideoDatasetImporter):
    """Importer for a directory of videos stored on disk.

    See :class:`fiftyone.types.dataset_types.VideoDirectory` for format
    details.

    Args:
        dataset_dir: the dataset directory
        recursive (True): whether to recursively traverse subdirectories
        compute_metadata (False): whether to produce
            :class:`fiftyone.core.metadata.VideoMetadata` instances for each
            video when importing
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        recursive=True,
        compute_metadata=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        super().__init__(
            dataset_dir, shuffle=shuffle, seed=seed, max_samples=max_samples
        )
        self.recursive = recursive
        self.compute_metadata = compute_metadata
        self._filepaths = None
        self._iter_filepaths = None
        self._num_samples = None

    def __iter__(self):
        self._iter_filepaths = iter(self._filepaths)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        video_path = next(self._iter_filepaths)

        if self.compute_metadata:
            video_metadata = fom.VideoMetadata.build_for(video_path)
        else:
            video_metadata = None

        return video_path, video_metadata

    @property
    def has_dataset_info(self):
        return False

    @property
    def has_video_metadata(self):
        return self.compute_metadata

    def setup(self):
        filepaths = etau.list_files(
            self.dataset_dir, abs_paths=True, recursive=self.recursive
        )
        filepaths = [p for p in filepaths if etav.is_video_mime_type(p)]

        self._filepaths = self._preprocess_list(filepaths)
        self._num_samples = len(self._filepaths)

    @staticmethod
    def get_num_samples(dataset_dir, recursive=True):
        filepaths = etau.list_files(dataset_dir, recursive=recursive)
        filepaths = [p for p in filepaths if etav.is_video_mime_type(p)]
        return len(filepaths)


class FiftyOneImageClassificationDatasetImporter(LabeledImageDatasetImporter):
    """Importer for image classification datasets stored on disk in FiftyOne's
    default format.

    See :class:`fiftyone.types.dataset_types.FiftyOneImageClassificationDataset`
    for format details.

    Args:
        dataset_dir: the dataset directory
        compute_metadata (False): whether to produce
            :class:`fiftyone.core.metadata.ImageMetadata` instances for each
            image when importing
        skip_unlabeled (False): whether to skip unlabeled images when importing
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        compute_metadata=False,
        skip_unlabeled=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        super().__init__(
            dataset_dir,
            skip_unlabeled=skip_unlabeled,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )
        self.compute_metadata = compute_metadata
        self._classes = None
        self._sample_parser = None
        self._image_paths_map = None
        self._labels_map = None
        self._uuids = None
        self._iter_uuids = None
        self._num_samples = None

    def __iter__(self):
        self._iter_uuids = iter(self._uuids)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        uuid = next(self._iter_uuids)

        image_path = self._image_paths_map[uuid]
        target = self._labels_map[uuid]

        self._sample_parser.with_sample((image_path, target))
        label = self._sample_parser.get_label()

        if self.compute_metadata:
            image_metadata = fom.ImageMetadata.build_for(image_path)
        else:
            image_metadata = None

        return image_path, image_metadata, label

    @property
    def has_dataset_info(self):
        return self._classes is not None

    @property
    def has_image_metadata(self):
        return self.compute_metadata

    @property
    def label_cls(self):
        return fol.Classification

    def setup(self):
        self._sample_parser = FiftyOneImageClassificationSampleParser()

        data_dir = os.path.join(self.dataset_dir, "data")
        self._image_paths_map = {
            os.path.splitext(os.path.basename(p))[0]: p
            for p in etau.list_files(data_dir, abs_paths=True)
        }

        labels_path = os.path.join(self.dataset_dir, "labels.json")
        if os.path.isfile(labels_path):
            labels = etas.load_json(labels_path)
        else:
            labels = {}

        self._classes = labels.get("classes", None)
        self._sample_parser.classes = self._classes

        self._labels_map = labels.get("labels", {})
        if self.skip_unlabeled:
            self._labels_map = {
                k: v for k, v in self._labels_map.items() if v is not None
            }

        uuids = sorted(self._labels_map.keys())
        self._uuids = self._preprocess_list(uuids)

        self._num_samples = len(self._uuids)

    def get_dataset_info(self):
        return {"classes": self._classes}

    @staticmethod
    def get_classes(dataset_dir):
        labels_path = os.path.join(dataset_dir, "labels.json")
        labels = etas.read_json(labels_path)
        return labels.get("classes", None)

    @staticmethod
    def get_num_samples(dataset_dir):
        labels_path = os.path.join(dataset_dir, "labels.json")
        labels = etas.read_json(labels_path)
        return len(labels.get("labels", {}))


class ImageClassificationDirectoryTreeImporter(LabeledImageDatasetImporter):
    """Importer for an image classification directory tree stored on disk.

    See :class:`fiftyone.types.dataset_types.ImageClassificationDirectoryTree`
    for format details.

    Args:
        dataset_dir: the dataset directory
        compute_metadata (False): whether to produce
            :class:`fiftyone.core.metadata.ImageMetadata` instances for each
            image when importing
        skip_unlabeled (False): whether to skip unlabeled images when importing
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        compute_metadata=False,
        skip_unlabeled=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        super().__init__(
            dataset_dir,
            skip_unlabeled=skip_unlabeled,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )
        self.compute_metadata = compute_metadata
        self._classes = None
        self._samples = None
        self._iter_samples = None
        self._num_samples = None

    def __iter__(self):
        self._iter_samples = iter(self._samples)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        image_path, label = next(self._iter_samples)

        if self.compute_metadata:
            image_metadata = fom.ImageMetadata.build_for(image_path)
        else:
            image_metadata = None

        label = fol.Classification(label=label)

        return image_path, image_metadata, label

    @property
    def has_image_metadata(self):
        return self.compute_metadata

    @property
    def has_dataset_info(self):
        return True

    @property
    def label_cls(self):
        return fol.Classification

    def setup(self):
        samples = []
        classes = set()
        for class_dir in etau.list_subdirs(self.dataset_dir, abs_paths=True):
            label = os.path.basename(class_dir)
            if label.startswith("."):
                continue

            if label == "_unlabeled":
                if self.skip_unlabeled:
                    continue

                label = None
            else:
                classes.add(label)

            for path in etau.list_files(class_dir, abs_paths=True):
                samples.append((path, label))

        self._samples = self._preprocess_list(samples)
        self._num_samples = len(self._samples)
        self._classes = sorted(classes)

    def get_dataset_info(self):
        return {"classes": self._classes}

    @staticmethod
    def get_classes(dataset_dir):
        return sorted(etau.list_subdirs(dataset_dir))

    @staticmethod
    def get_num_samples(dataset_dir):
        num_samples = 0
        for class_dir in etau.list_subdirs(dataset_dir, abs_paths=True):
            num_samples += len(etau.list_files(class_dir))

        return num_samples


class VideoClassificationDirectoryTreeImporter(LabeledVideoDatasetImporter):
    """Importer for a viideo classification directory tree stored on disk.

    See :class:`fiftyone.types.dataset_types.VideoClassificationDirectoryTree`
    for format details.

    Args:
        dataset_dir: the dataset directory
        compute_metadata (False): whether to produce
            :class:`fiftyone.core.metadata.VideoMetadata` instances for each
            video when importing
        skip_unlabeled (False): whether to skip unlabeled videos when importing
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        compute_metadata=False,
        skip_unlabeled=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        super().__init__(
            dataset_dir,
            skip_unlabeled=skip_unlabeled,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )
        self.compute_metadata = compute_metadata
        self._classes = None
        self._samples = None
        self._iter_samples = None
        self._num_samples = None

    def __iter__(self):
        self._iter_samples = iter(self._samples)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        video_path, label = next(self._iter_samples)

        if self.compute_metadata:
            video_metadata = fom.VideoMetadata.build_for(video_path)
        else:
            video_metadata = None

        label = fol.Classification(label=label)

        return video_path, video_metadata, label, None

    @property
    def has_video_metadata(self):
        return self.compute_metadata

    @property
    def has_dataset_info(self):
        return True

    @property
    def label_cls(self):
        return fol.Classification

    @property
    def frame_labels_cls(self):
        return None

    def setup(self):
        samples = []
        classes = set()
        for class_dir in etau.list_subdirs(self.dataset_dir, abs_paths=True):
            label = os.path.basename(class_dir)
            if label.startswith("."):
                continue

            if label == "_unlabeled":
                if self.skip_unlabeled:
                    continue

                label = None
            else:
                classes.add(label)

            for path in etau.list_files(class_dir, abs_paths=True):
                samples.append((path, label))

        self._samples = self._preprocess_list(samples)
        self._num_samples = len(self._samples)
        self._classes = sorted(classes)

    def get_dataset_info(self):
        return {"classes": self._classes}

    @staticmethod
    def get_classes(dataset_dir):
        return sorted(etau.list_subdirs(dataset_dir))

    @staticmethod
    def get_num_samples(dataset_dir):
        num_samples = 0
        for class_dir in etau.list_subdirs(dataset_dir, abs_paths=True):
            num_samples += len(etau.list_files(class_dir))

        return num_samples


class FiftyOneImageDetectionDatasetImporter(LabeledImageDatasetImporter):
    """Importer for image detection datasets stored on disk in FiftyOne's
    default format.

    See :class:`fiftyone.types.dataset_types.FiftyOneImageDetectionDataset` for
    format details.

    Args:
        dataset_dir: the dataset directory
        compute_metadata (False): whether to produce
            :class:`fiftyone.core.metadata.ImageMetadata` instances for each
            image when importing
        skip_unlabeled (False): whether to skip unlabeled images when importing
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        compute_metadata=False,
        skip_unlabeled=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        super().__init__(
            dataset_dir,
            skip_unlabeled=skip_unlabeled,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )
        self.compute_metadata = compute_metadata
        self._classes = None
        self._sample_parser = None
        self._image_paths_map = None
        self._labels_map = None
        self._uuids = None
        self._iter_uuids = None
        self._num_samples = None
        self._has_labels = False

    def __iter__(self):
        self._iter_uuids = iter(self._uuids)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        uuid = next(self._iter_uuids)

        image_path = self._image_paths_map[uuid]
        target = self._labels_map[uuid]

        if self._has_labels:
            self._sample_parser.with_sample((image_path, target))
            label = self._sample_parser.get_label()
        else:
            label = None

        if self.compute_metadata:
            image_metadata = fom.ImageMetadata.build_for(image_path)
        else:
            image_metadata = None

        return image_path, image_metadata, label

    @property
    def has_dataset_info(self):
        return self._classes is not None

    @property
    def has_image_metadata(self):
        return self.compute_metadata

    @property
    def label_cls(self):
        return fol.Detections

    def setup(self):
        self._sample_parser = FiftyOneImageDetectionSampleParser()

        data_dir = os.path.join(self.dataset_dir, "data")
        self._image_paths_map = {
            os.path.splitext(os.path.basename(p))[0]: p
            for p in etau.list_files(data_dir, abs_paths=True)
        }

        labels_path = os.path.join(self.dataset_dir, "labels.json")
        if os.path.isfile(labels_path):
            labels = etas.load_json(labels_path)
        else:
            labels = {}

        self._classes = labels.get("classes", None)
        self._sample_parser.classes = self._classes

        self._labels_map = labels.get("labels", {})
        if self.skip_unlabeled:
            self._labels_map = {
                k: v for k, v in self._labels_map.items() if v is not None
            }

        self._has_labels = any(self._labels_map.values())

        uuids = sorted(self._labels_map.keys())
        self._uuids = self._preprocess_list(uuids)
        self._num_samples = len(self._uuids)

    def get_dataset_info(self):
        return {"classes": self._classes}

    @staticmethod
    def get_classes(dataset_dir):
        labels_path = os.path.join(dataset_dir, "labels.json")
        labels = etas.read_json(labels_path)
        return labels.get("classes", None)

    @staticmethod
    def get_num_samples(dataset_dir):
        labels_path = os.path.join(dataset_dir, "labels.json")
        labels = etas.read_json(labels_path)
        return len(labels.get("labels", {}))


class FiftyOneImageLabelsDatasetImporter(LabeledImageDatasetImporter):
    """Importer for labeled image datasets whose labels are stored in
    `ETA ImageLabels format <https://github.com/voxel51/eta/blob/develop/docs/image_labels_guide.md>`_.

    See :class:`fiftyone.types.dataset_types.FiftyOneImageLabelsDataset` for
    format details.

    Args:
        dataset_dir: the dataset directory
        compute_metadata (False): whether to produce
            :class:`fiftyone.core.metadata.ImageMetadata` instances for each
            image when importing
        prefix (None): a string prefix to prepend to each label name in the
            expanded label dictionary
        labels_dict (None): a dictionary mapping names of attributes/objects
            in the image labels to field names into which to expand them
        multilabel (False): whether to store frame attributes in a single
            :class:`fiftyone.core.labels.Classifications` instance
        skip_non_categorical (False): whether to skip non-categorical frame
            attributes (True) or cast them to strings (False)
        skip_unlabeled (False): whether to skip unlabeled images when importing
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        compute_metadata=False,
        prefix=None,
        labels_dict=None,
        multilabel=False,
        skip_non_categorical=False,
        skip_unlabeled=False,
        max_samples=None,
        **kwargs
    ):
        for arg in kwargs:
            logger.warning("Ignoring unsupported parameter '%s'", arg)

        super().__init__(
            dataset_dir, skip_unlabeled=skip_unlabeled, max_samples=max_samples
        )
        self.compute_metadata = compute_metadata
        self.prefix = prefix
        self.labels_dict = labels_dict
        self.multilabel = multilabel
        self.skip_non_categorical = skip_non_categorical
        self._description = None
        self._sample_parser = None
        self._labeled_dataset = None
        self._iter_labeled_dataset = None
        self._num_samples = None
        self._num_imported = None

    def __iter__(self):
        self._num_imported = 0
        self._iter_labeled_dataset = zip(
            self._labeled_dataset.iter_data_paths(),
            self._labeled_dataset.iter_labels(),
        )
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        if (
            self.max_samples is not None
            and self._num_imported >= self.max_samples
        ):
            raise StopIteration

        image_path, label = self._parse_next_sample()

        if self.skip_unlabeled:
            while label is None:
                image_path, label = self._parse_next_sample()

        if self.compute_metadata:
            image_metadata = fom.ImageMetadata.build_for(image_path)
        else:
            image_metadata = None

        self._num_imported += 1
        return image_path, image_metadata, label

    def _parse_next_sample(self):
        sample = next(self._iter_labeled_dataset)

        self._sample_parser.with_sample(sample)
        image_path = self._sample_parser.get_image_path()
        label = self._sample_parser.get_label()

        return image_path, label

    @property
    def has_dataset_info(self):
        return bool(self._description)

    @property
    def has_image_metadata(self):
        return self.compute_metadata

    @property
    def label_cls(self):
        return {
            "attributes": fol.Classifications,
            "detections": fol.Detections,
            "polylines": fol.Polylines,
            "keypoints": fol.Keypoints,
        }

    def setup(self):
        self._sample_parser = FiftyOneImageLabelsSampleParser(
            prefix=self.prefix,
            labels_dict=self.labels_dict,
            multilabel=self.multilabel,
            skip_non_categorical=self.skip_non_categorical,
        )
        self._labeled_dataset = etads.load_dataset(self.dataset_dir)
        self._description = self._labeled_dataset.dataset_index.description

        self._num_samples = len(self._labeled_dataset)
        if self.max_samples is not None:
            self._num_samples = min(self._num_samples, self.max_samples)

    def get_dataset_info(self):
        return {"description": self._description}

    @staticmethod
    def get_num_samples(dataset_dir):
        return len(etads.load_dataset(dataset_dir))


class FiftyOneVideoLabelsDatasetImporter(LabeledVideoDatasetImporter):
    """Importer for labeled video datasets whose labels are stored in
    `ETA VideoLabels format <https://github.com/voxel51/eta/blob/develop/docs/video_labels_guide.md>`_.

    See :class:`fiftyone.types.dataset_types.FiftyOneVideoLabelsDataset` for
    format details.

    Args:
        dataset_dir: the dataset directory
        compute_metadata (False): whether to produce
            :class:`fiftyone.core.metadata.VideoMetadata` instances for each
            video when importing
        prefix (None): a string prefix to prepend to each label name in the
            expanded frame label dictionaries
        labels_dict (None): a dictionary mapping names of attributes/objects
            in the frame labels to field names into which to expand them
        multilabel (False): whether to store frame attributes in a single
            :class:`fiftyone.core.labels.Classifications` instance
        skip_non_categorical (False): whether to skip non-categorical frame
            attributes (True) or cast them to strings (False)
        skip_unlabeled (False): whether to skip unlabeled videos when importing
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        compute_metadata=False,
        prefix=None,
        labels_dict=None,
        multilabel=False,
        skip_non_categorical=False,
        skip_unlabeled=False,
        max_samples=None,
        **kwargs
    ):
        for arg in kwargs:
            logger.warning("Ignoring unsupported parameter '%s'", arg)

        super().__init__(
            dataset_dir, skip_unlabeled=skip_unlabeled, max_samples=max_samples
        )
        self.compute_metadata = compute_metadata
        self.prefix = prefix
        self.labels_dict = labels_dict
        self.multilabel = multilabel
        self.skip_non_categorical = skip_non_categorical
        self._description = None
        self._sample_parser = None
        self._labeled_dataset = None
        self._iter_labeled_dataset = None
        self._num_samples = None
        self._num_imported = None

    def __iter__(self):
        self._num_imported = 0
        self._iter_labeled_dataset = zip(
            self._labeled_dataset.iter_data_paths(),
            self._labeled_dataset.iter_labels(),
        )
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        if (
            self.max_samples is not None
            and self._num_imported >= self.max_samples
        ):
            raise StopIteration

        video_path, frames = self._parse_next_sample()

        if self.skip_unlabeled:
            while frames is None:
                video_path, frames = self._parse_next_sample()

        if self.compute_metadata:
            video_metadata = fom.VideoMetadata.build_for(video_path)
        else:
            video_metadata = None

        self._num_imported += 1
        return video_path, video_metadata, None, frames

    def _parse_next_sample(self):
        sample = next(self._iter_labeled_dataset)

        self._sample_parser.with_sample(sample)
        video_path = self._sample_parser.get_video_path()
        frames = self._sample_parser.get_frame_labels()

        return video_path, frames

    @property
    def has_dataset_info(self):
        return bool(self._description)

    @property
    def has_video_metadata(self):
        return self.compute_metadata

    @property
    def label_cls(self):
        return None

    @property
    def frame_labels_cls(self):
        return None

    def setup(self):
        self._sample_parser = FiftyOneVideoLabelsSampleParser(
            prefix=self.prefix,
            labels_dict=self.labels_dict,
            multilabel=self.multilabel,
            skip_non_categorical=self.skip_non_categorical,
        )
        self._labeled_dataset = etads.load_dataset(self.dataset_dir)
        self._description = self._labeled_dataset.dataset_index.description

        self._num_samples = len(self._labeled_dataset)
        if self.max_samples is not None:
            self._num_samples = min(self._num_samples, self.max_samples)

    def get_dataset_info(self):
        return {"description": self._description}

    @staticmethod
    def get_num_samples(dataset_dir):
        return len(etads.load_dataset(dataset_dir))
