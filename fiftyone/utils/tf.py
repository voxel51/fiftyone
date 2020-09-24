"""
TensorFlow utilities.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import contextlib
import logging
import multiprocessing
import os

import eta.core.utils as etau

import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou
import fiftyone.utils.data as foud

fou.ensure_tf()
import tensorflow as tf


logger = logging.getLogger(__name__)


def from_images_dir(images_dir, recursive=True, num_parallel_calls=None):
    """Creates a ``tf.data.Dataset`` for the given directory of images.

    Args:
        images_dir: a directory of images
        recursive (True): whether to recursively traverse subdirectories
        num_parallel_calls (None): the number of samples to read
            asynchronously in parallel. See
            https://www.tensorflow.org/api_docs/python/tf/data/Dataset#map for
            details

    Returns:
        a ``tf.data.Dataset`` that emits decoded images
    """
    image_paths = foud.parse_images_dir(images_dir, recursive=recursive)
    return from_images(image_paths, num_parallel_calls=num_parallel_calls)


def from_images_patt(images_patt, num_parallel_calls=None):
    """Creates a ``tf.data.Dataset`` for the given glob pattern of images.

    Args:
        images_patt: a glob pattern of images like ``/path/to/images/*.jpg``
        num_parallel_calls (None): the number of samples to read
            asynchronously in parallel. See
            https://www.tensorflow.org/api_docs/python/tf/data/Dataset#map for
            details

    Returns:
        a ``tf.data.Dataset`` that emits decoded images
    """
    image_paths = etau.get_glob_matches(images_patt)
    return from_images(image_paths, num_parallel_calls=num_parallel_calls)


def from_images(image_paths, num_parallel_calls=None):
    """Creates a ``tf.data.Dataset`` for the given list of images.

    Args:
        image_paths: an iterable of image paths
        num_parallel_calls (None): the number of samples to read
            asynchronously in parallel. See
            https://www.tensorflow.org/api_docs/python/tf/data/Dataset#map for
            details

    Returns:
        a ``tf.data.Dataset`` that emits decoded images
    """
    return tf.data.Dataset.from_tensor_slices(list(image_paths)).map(
        _parse_image_tf, num_parallel_calls=num_parallel_calls
    )


def from_image_paths_and_labels(image_paths, labels, num_parallel_calls=None):
    """Creates a ``tf.data.Dataset`` for an image classification dataset stored
    as a list of image paths and labels.

    Args:
        image_paths: an iterable of image paths
        labels: an iterable of labels
        num_parallel_calls (None): the number of samples to read
            asynchronously in parallel. See
            https://www.tensorflow.org/api_docs/python/tf/data/Dataset#map for
            details

    Returns:
        a ``tf.data.Dataset`` that emits ``(img, label)`` pairs
    """

    def parse_sample(image_path, label):
        img = _parse_image_tf(image_path)
        return img, label

    return tf.data.Dataset.from_tensor_slices(
        (list(image_paths), list(labels))
    ).map(parse_sample, num_parallel_calls=num_parallel_calls)


def from_image_classification_dir_tree(dataset_dir, num_parallel_calls=None):
    """Creates a ``tf.data.Dataset`` for the given image classification dataset
    directory tree.

    The directory should have the following format::

        <dataset_dir>/
            <classA>/
                <image1>.<ext>
                <image2>.<ext>
                ...
            <classB>/
                <image1>.<ext>
                <image2>.<ext>
                ...

    Args:
        dataset_dir: the dataset directory
        num_parallel_calls (None): the number of samples to read
            asynchronously in parallel. See
            https://www.tensorflow.org/api_docs/python/tf/data/Dataset#map for
            details

    Returns:
        dataset: a ``tf.data.Dataset` that emits ``(img, label)`` pairs
        classes: a list of class label strings
    """
    samples, classes = foud.parse_image_classification_dir_tree(dataset_dir)

    def parse_sample(sample):
        image_path, label = sample
        img = _parse_image_tf(image_path)
        return img, label

    dataset = tf.data.Dataset.from_tensor_slices(samples).map(
        parse_sample, num_parallel_calls=num_parallel_calls
    )
    return dataset, classes


def from_tf_records(
    tf_records_patt, buffer_size=None, num_parallel_reads=None
):
    """Creates a ``tf.data.Dataset`` for the TFRecords at the given path(s).

    Args:
        tf_records_patt: the path (or glob pattern of paths) to the TFRecords
            file(s) to load
        buffer_size (None): an optional buffer size, in bytes, to use when
            reading the records. Reasonable values are 1-100MBs
        num_parallel_reads (None): an optional number of files to read in
            parallel. If a negative value is passed, this parameter is set to
            the number of CPU cores on the host machine. By default, the files
            are read in series

    Returns:
        a ``tf.data.Dataset`` that emits ``tf.train.Example`` protos
    """
    if num_parallel_reads is not None and num_parallel_reads < 0:
        num_parallel_reads = multiprocessing.cpu_count()

    return tf.data.TFRecordDataset(
        tf.data.Dataset.list_files(tf_records_patt),
        buffer_size=buffer_size,
        num_parallel_reads=num_parallel_reads,
    )


def write_tf_records(examples, tf_records_path, num_shards=None):
    """Writes the given ``tf.train.Example`` protos to disk as TFRecords.

    Args:
        examples: an iterable that emits ``tf.train.Example`` protos
        tf_records_path: the path to write the ``.tfrecords`` file. If sharding
            is requested ``-%%05d-%%05d`` is automatically appended to the path
        num_shards (None): an optional number of shards to split the records
            into (using a round robin strategy)
    """
    with TFRecordsWriter(tf_records_path, num_shards=num_shards) as writer:
        for example in examples:
            writer.write(example)


class TFRecordsWriter(object):
    """Class for writing TFRecords to disk.

    Example Usage::

        with TFRecordsWriter("/path/for/tf.records", num_shards=5) as writer:
            for tf_example in tf_examples:
                writer.write(tf_example)

    Args:
        tf_records_path: the path to write the ``.tfrecords`` file. If sharding
            is requested ``-%%05d-%%05d`` is automatically appended to the path
        num_shards (None): an optional number of shards to split the records
            into (using a round robin strategy). If omitted, no sharding is
            used
    """

    def __init__(self, tf_records_path, num_shards=None):
        self.tf_records_path = tf_records_path
        self.num_shards = num_shards
        self._num_shards = None
        self._writers = None
        self._idx = None
        self._writers_context = None

    def __enter__(self):
        self._idx = -1

        etau.ensure_basedir(self.tf_records_path)

        if self.num_shards:
            self._num_shards = self.num_shards
            tf_records_patt = self.tf_records_path + "-%05d-%05d"
            tf_records_paths = [
                tf_records_patt % (i, self.num_shards)
                for i in range(1, self.num_shards + 1)
            ]
        else:
            self._num_shards = 1
            tf_records_paths = [self.tf_records_path]

        self._writers_context = contextlib.ExitStack()
        c = self._writers_context.__enter__()

        self._writers = [
            c.enter_context(tf.io.TFRecordWriter(path))
            for path in tf_records_paths
        ]

        return self

    def __exit__(self, *args):
        self._writers_context.__exit__(*args)

    def write(self, tf_example):
        """Writres the ``tf.train.Example`` proto to disk.

        Args:
            tf_example: a ``tf.train.Example`` proto
        """
        self._idx += 1
        self._writers[self._idx % self._num_shards].write(
            tf_example.SerializeToString()
        )


class TFRecordSampleParser(foud.LabeledImageSampleParser):
    """Base class for sample parsers that ingest ``tf.train.Example`` protos
    containing labeled images.
    """

    # Subclasses must implement this
    _FEATURES = {}

    def __init__(self):
        super().__init__()
        self._current_features_cache = None

    def get_image(self):
        return self._parse_image(self._current_features)

    def get_label(self):
        return self._parse_label(self._current_features)

    def clear_sample(self):
        super().clear_sample()
        self._current_features_cache = None

    @property
    def _current_features(self):
        if self._current_features_cache is None:
            self._current_features_cache = self._parse_features(
                self.current_sample
            )

        return self._current_features_cache

    def _parse_features(self, sample):
        return tf.io.parse_single_example(sample, self._FEATURES)

    def _parse_image(self, features):
        raise NotImplementedError("subclasses must implement _parse_image()")

    def _parse_label(self, features):
        raise NotImplementedError("subclasses must implement _parse_label()")


class TFImageClassificationSampleParser(TFRecordSampleParser):
    """Parser for image classification samples stored as
    `TFRecords <https://www.tensorflow.org/tutorials/load_data/tfrecord>`_.

    This implementation supports samples that are ``tf.train.Example`` protos
    whose features follow the format described in
    :class:`fiftyone.types.dataset_types.TFImageClassificationDataset`.
    """

    _FEATURES = {
        "height": tf.io.FixedLenFeature([], tf.int64),
        "width": tf.io.FixedLenFeature([], tf.int64),
        "depth": tf.io.FixedLenFeature([], tf.int64),
        "filename": tf.io.FixedLenFeature([], tf.string),
        "format": tf.io.FixedLenFeature([], tf.string),
        "image_bytes": tf.io.FixedLenFeature([], tf.string),
        "label": tf.io.FixedLenFeature([], tf.string, default_value=""),
    }

    @property
    def label_cls(self):
        return fol.Classification

    @property
    def has_image_path(self):
        return False

    @property
    def has_image_metadata(self):
        return True

    def get_image_metadata(self):
        return self._parse_image_metadata(self._current_features)

    def _parse_image(self, features):
        img_bytes = features["image_bytes"]
        img = tf.image.decode_image(img_bytes)
        return img.numpy()

    def _parse_image_metadata(self, features):
        return fom.ImageMetadata(
            size_bytes=len(features["image_bytes"].numpy()),
            mime_type="image/" + features["format"].numpy().decode(),
            width=features["width"].numpy(),
            height=features["height"].numpy(),
            num_channels=features["depth"].numpy(),
        )

    def _parse_label(self, features):
        label = features["label"].numpy().decode()
        if not label:
            return None

        return fol.Classification(label=label)


class TFObjectDetectionSampleParser(TFRecordSampleParser):
    """Parser for samples in
    `TF Object Detection API format <https://github.com/tensorflow/models/blob/master/research/object_detection>`_.

    This implementation supports samples that are ``tf.train.Example`` protos
    whose features follow the format described in
    :class:`fiftyone.types.dataset_types.TFObjectDetectionDataset`.
    """

    _FEATURES = {
        "image/height": tf.io.FixedLenFeature([], tf.int64),
        "image/width": tf.io.FixedLenFeature([], tf.int64),
        "image/filename": tf.io.FixedLenFeature([], tf.string),
        "image/source_id": tf.io.FixedLenFeature([], tf.string),
        "image/encoded": tf.io.FixedLenFeature([], tf.string),
        "image/format": tf.io.FixedLenFeature([], tf.string),
        "image/object/bbox/xmin": tf.io.FixedLenSequenceFeature(
            [], tf.float32, allow_missing=True,
        ),
        "image/object/bbox/xmax": tf.io.FixedLenSequenceFeature(
            [], tf.float32, allow_missing=True
        ),
        "image/object/bbox/ymin": tf.io.FixedLenSequenceFeature(
            [], tf.float32, allow_missing=True
        ),
        "image/object/bbox/ymax": tf.io.FixedLenSequenceFeature(
            [], tf.float32, allow_missing=True
        ),
        "image/object/class/text": tf.io.FixedLenSequenceFeature(
            [], tf.string, allow_missing=True
        ),
        "image/object/class/label": tf.io.FixedLenSequenceFeature(
            [], tf.int64, allow_missing=True
        ),
    }

    @property
    def label_cls(self):
        return fol.Detections

    @property
    def has_image_path(self):
        return False

    @property
    def has_image_metadata(self):
        return True

    def get_image_metadata(self):
        return self._parse_image_metadata(self._current_features)

    def _parse_image(self, features):
        img_bytes = features["image/encoded"]
        img = tf.image.decode_image(img_bytes)
        return img.numpy()

    def _parse_image_metadata(self, features):
        return fom.ImageMetadata(
            size_bytes=len(features["image/encoded"].numpy()),
            mime_type="image/" + features["image/format"].numpy().decode(),
            width=features["image/width"].numpy(),
            height=features["image/height"].numpy(),
        )

    def _parse_label(self, features):
        xmins = features["image/object/bbox/xmin"].numpy()
        xmaxs = features["image/object/bbox/xmax"].numpy()
        ymins = features["image/object/bbox/ymin"].numpy()
        ymaxs = features["image/object/bbox/ymax"].numpy()
        texts = features["image/object/class/text"].numpy()
        detections = []
        for xmin, xmax, ymin, ymax, text in zip(
            xmins, xmaxs, ymins, ymaxs, texts
        ):
            label = text.decode()
            detections.append(
                fol.Detection(
                    label=label,
                    bounding_box=[xmin, ymin, xmax - xmin, ymax - ymin],
                )
            )

        return fol.Detections(detections=detections)


class TFRecordsLabeledImageDatasetImporter(foud.LabeledImageDatasetImporter):
    """Base class for
    :class:`fiftyone.utils.data.importers.LabeledImageDatasetImporter`
    instances that import ``tf.train.Example`` protos containing labeled
    images.

    This class assumes that the input TFRecords only contain the images
    themselves and not their paths on disk, and, therefore, the images are read
    in-memory and written to a provided ``images_dir`` during import.

    Args:
        dataset_dir: the dataset directory
        images_dir: the directory in which the images will be written
        image_format (None): the image format to use to write the images to
            disk. By default, ``fiftyone.config.default_image_ext`` is used
        skip_unlabeled (False): whether to skip unlabeled images when importing
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        images_dir,
        image_format=None,
        skip_unlabeled=False,
        max_samples=None,
        **kwargs
    ):
        for arg in kwargs:
            logger.warning("Ignoring unsupported parameter '%s'", arg)

        super().__init__(
            dataset_dir, skip_unlabeled=skip_unlabeled, max_samples=max_samples
        )
        self.images_dir = images_dir
        self.image_format = image_format

        self._sample_parser = self._make_sample_parser()
        self._dataset_ingestor = None
        self._iter_dataset_ingestor = None

    def __iter__(self):
        self._iter_dataset_ingestor = iter(self._dataset_ingestor)
        return self

    def __next__(self):
        return next(self._iter_dataset_ingestor)

    @property
    def has_dataset_info(self):
        return False

    @property
    def has_image_metadata(self):
        return self._sample_parser.has_image_metadata

    def setup(self):
        tf_records_patt = os.path.join(self.dataset_dir, "*")
        tf_dataset = from_tf_records(tf_records_patt)

        self._dataset_ingestor = foud.LabeledImageDatasetIngestor(
            self.images_dir,
            tf_dataset,
            self._sample_parser,
            image_format=self.image_format,
            skip_unlabeled=self.skip_unlabeled,
            max_samples=self.max_samples,
        )
        self._dataset_ingestor.setup()

    def close(self, *args):
        self._dataset_ingestor.close(*args)

    def _make_sample_parser(self):
        """Returns a :class:`TFRecordSampleParser` instance for parsing
        TFRecords read by this importer.
        """
        raise NotImplementedError(
            "subclasses must implement _make_sample_parser()"
        )


class TFImageClassificationDatasetImporter(
    TFRecordsLabeledImageDatasetImporter
):
    """Importer for TF image classification datasets stored on disk.

    See :class:`fiftyone.types.dataset_types.TFImageClassificationDataset` for
    format details.

    This class assumes that the input TFRecords only contain the images
    themselves and not their paths on disk, and, therefore, the images are read
    in-memory and written to a provided ``images_dir`` during import.

    Args:
        dataset_dir: the dataset directory
        images_dir: the directory in which the images will be written
        image_format (None): the image format to use to write the images to
            disk. By default, ``fiftyone.config.default_image_ext`` is used
        skip_unlabeled (False): whether to skip unlabeled images when importing
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    @property
    def label_cls(self):
        return fol.Classification

    def _make_sample_parser(self):
        return TFImageClassificationSampleParser()


class TFObjectDetectionDatasetImporter(TFRecordsLabeledImageDatasetImporter):
    """Importer for TF detection datasets stored on disk.

    See :class:`fiftyone.types.dataset_types.TFObjectDetectionDataset` for
    format details.

    This class assumes that the input TFRecords only contain the images
    themselves and not their paths on disk, and, therefore, the images are read
    in-memory and written to a provided ``images_dir`` during import.

    Args:
        dataset_dir: the dataset directory
        images_dir: the directory in which the images will be written
        image_format (None): the image format to use to write the images to
            disk. By default, ``fiftyone.config.default_image_ext`` is used
        skip_unlabeled (False): whether to skip unlabeled images when importing
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    @property
    def label_cls(self):
        return fol.Detections

    def _make_sample_parser(self):
        return TFObjectDetectionSampleParser()


class TFRecordsDatasetExporter(foud.LabeledImageDatasetExporter):
    """Base class for
    :class:`fiftyone.utils.data.exporters.LabeledImageDatasetExporter`
    instances that export labeled images as TFRecords datasets on disk.

    Args:
        export_dir: the directory to write the export
        num_shards (None): an optional number of shards to split the records
            into (using a round robin strategy)
    """

    def __init__(self, export_dir, num_shards=None):
        super().__init__(export_dir)
        self.num_shards = num_shards
        self._filename_maker = None
        self._example_generator = None
        self._tf_records_writer = None

    @property
    def requires_image_metadata(self):
        return False

    def setup(self):
        tf_records_path = os.path.join(self.export_dir, "tf.records")
        self._filename_maker = fou.UniqueFilenameMaker()
        self._example_generator = self._make_example_generator()
        self._tf_records_writer = TFRecordsWriter(
            tf_records_path, num_shards=self.num_shards
        )
        self._tf_records_writer.__enter__()

    def export_sample(self, image_or_path, label, metadata=None):
        if self._is_image_path(image_or_path):
            filename = self._filename_maker.get_output_path(image_or_path)
        else:
            filename = self._filename_maker.get_output_path()

        tf_example = self._example_generator.make_tf_example(
            image_or_path, label, filename=filename
        )
        self._tf_records_writer.write(tf_example)

    def close(self, *args):
        self._tf_records_writer.__exit__(*args)

    def _make_example_generator(self):
        """Returns a :class:`TFExampleGenerator` instance that will generate
        ``tf.train.Example`` protos for this exporter.
        """
        raise NotImplementedError(
            "subclasses must implement _make_example_generator()"
        )


class TFImageClassificationDatasetExporter(TFRecordsDatasetExporter):
    """Exporter that writes an image classification dataset to disk as
    TFRecords.

    See :class:`fiftyone.types.dataset_types.TFImageClassificationDataset` for
    format details.

    Args:
        export_dir: the directory to write the export
        num_shards (None): an optional number of shards to split the records
            into (using a round robin strategy)
    """

    @property
    def label_cls(self):
        return fol.Classification

    def _make_example_generator(self):
        return TFImageClassificationExampleGenerator()


class TFObjectDetectionDatasetExporter(TFRecordsDatasetExporter):
    """Exporter that writes an object detection dataset to disk as TFRecords
    in the TF Object Detection API format.

    See :class:`fiftyone.types.dataset_types.TFObjectDetectionDataset` for
    format details.

    Args:
        export_dir: the directory to write the export
        classes (None): the list of possible class labels. If omitted, the
            class list is dynamically generated as samples are processed
        num_shards (None): an optional number of shards to split the records
            into (using a round robin strategy)
    """

    def __init__(self, export_dir, classes=None, num_shards=None):
        super().__init__(export_dir, num_shards=num_shards)
        self.classes = classes

    @property
    def label_cls(self):
        return fol.Detections

    def _make_example_generator(self):
        return TFObjectDetectionExampleGenerator(classes=self.classes)


class TFExampleGenerator(object):
    """Base class for sample writers that emit ``tf.train.Example`` protos."""

    def make_tf_example(self, image_or_path, label, *args, **kwargs):
        """Makes a ``tf.train.Example`` for the given data.

        Args:
            image_or_path: an image or the path to the image on disk
            label: a :class:`fiftyone.core.labels.Label`
            *args: subclass-specific positional arguments
            **kwargs: subclass-specific keyword arguments

        Returns:
            a ``tf.train.Example``
        """
        raise NotImplementedError(
            "subclasses must implement make_tf_example()"
        )

    @staticmethod
    def _parse_image_or_path(image_or_path, filename=None):
        if etau.is_str(image_or_path):
            image_path = image_or_path

            if filename is None:
                filename = os.path.basename(image_path)

            img_bytes = tf.io.read_file(image_path)
            img = tf.image.decode_image(img_bytes)
        else:
            img = image_or_path

            if filename is None:
                raise ValueError(
                    "`filename` must be provided when `image_or_path` is an "
                    "image"
                )

            if filename.endswith((".jpg", ".jpeg")):
                img_bytes = tf.image.encode_jpeg(img)
            elif filename.endswith(".png"):
                img_bytes = tf.image.encode_png(img)
            else:
                raise ValueError(
                    "Unsupported image format '%s'"
                    % os.path.splitext(filename)[1]
                )

        img_shape = img.shape

        return img_bytes, img_shape, filename


class TFImageClassificationExampleGenerator(TFExampleGenerator):
    """Class for generating ``tf.train.Example`` protos for samples in TF
    image classification format.

    See :class:`fiftyone.types.dataset_types.TFImageClassificationDataset` for
    format details.
    """

    def make_tf_example(self, image_or_path, classification, filename=None):
        """Makes a ``tf.train.Example`` for the given data.

        Args:
            image_or_path: an image or the path to the image on disk
            classification: a :class:`fiftyone.core.labels.Classification`
                instance, or ``None``
            filename (None): a filename for the image. Required when
                ``image_or_path`` is an image, in which case the extension of
                this filename determines the encoding used. If
                ``image_or_path`` is the path to an image, this is optional; by
                default, the basename of ``image_path`` is used

        Returns:
            a ``tf.train.Example``
        """
        img_bytes, img_shape, filename = self._parse_image_or_path(
            image_or_path, filename=filename
        )
        format = os.path.splitext(filename)[1][1:]  # no leading `.`

        feature = {
            "height": _int64_feature(img_shape[0]),
            "width": _int64_feature(img_shape[1]),
            "depth": _int64_feature(img_shape[2]),
            "filename": _bytes_feature(filename.encode()),
            "format": _bytes_feature(format.encode()),
            "image_bytes": _bytes_feature(img_bytes),
        }

        if classification is not None:
            label = classification.label
            feature["label"] = _bytes_feature(label.encode())

        return tf.train.Example(features=tf.train.Features(feature=feature))


class TFObjectDetectionExampleGenerator(TFExampleGenerator):
    """Class for generating ``tf.train.Example`` protos for samples in TF
    Object Detection API format.

    See :class:`fiftyone.types.dataset_types.TFObjectDetectionDataset` for
    format details.

    Args:
        classes (None): the list of possible class labels. If omitted, the
            class list is dynamically generated as examples are processed
    """

    def __init__(self, classes=None):
        if classes:
            labels_map_rev = _to_labels_map_rev(classes)
            dynamic_classes = False
        else:
            labels_map_rev = {}
            dynamic_classes = True

        self._labels_map_rev = labels_map_rev
        self._dynamic_classes = dynamic_classes

    def make_tf_example(self, image_or_path, detections, filename=None):
        """Makes a ``tf.train.Example`` for the given data.

        Args:
            image_or_path: an image or the path to the image on disk
            detections: a :class:`fiftyone.core.labels.Detections` instance, or
                ``None``
            filename (None): a filename for the image. Required when
                ``image_or_path`` is an image, in which case the extension of
                this filename determines the encoding used. If
                ``image_or_path`` is the path to an image, this is optional; by
                default, the basename of ``image_path`` is used

        Returns:
            a ``tf.train.Example``
        """
        img_bytes, img_shape, filename = self._parse_image_or_path(
            image_or_path, filename=filename
        )
        format = os.path.splitext(filename)[1][1:]  # no leading `.`

        feature = {
            "image/height": _int64_feature(img_shape[0]),
            "image/width": _int64_feature(img_shape[1]),
            "image/filename": _bytes_feature(filename.encode()),
            "image/source_id": _bytes_feature(filename.encode()),
            "image/encoded": _bytes_feature(img_bytes),
            "image/format": _bytes_feature(format.encode()),
        }

        if detections is not None:
            xmins, xmaxs, ymins, ymaxs, texts, labels = [], [], [], [], [], []
            for detection in detections.detections:
                xmin, ymin, w, h = detection.bounding_box
                text = detection.label
                try:
                    label = self._labels_map_rev[text]
                except KeyError:
                    if not self._dynamic_classes:
                        raise

                    label = len(self._labels_map_rev)
                    self._labels_map_rev[text] = label

                xmins.append(xmin)
                xmaxs.append(xmin + w)
                ymins.append(ymin)
                ymaxs.append(ymin + h)
                texts.append(text.encode())
                labels.append(label)

            feature.update(
                {
                    "image/object/bbox/xmin": _float_list_feature(xmins),
                    "image/object/bbox/xmax": _float_list_feature(xmaxs),
                    "image/object/bbox/ymin": _float_list_feature(ymins),
                    "image/object/bbox/ymax": _float_list_feature(ymaxs),
                    "image/object/class/text": _bytes_list_feature(texts),
                    "image/object/class/label": _int64_list_feature(labels),
                }
            )

        return tf.train.Example(features=tf.train.Features(feature=feature))


def _get_classes_for_detections(samples, label_field):
    classes = set()
    for sample in samples:
        for detection in sample[label_field].detections:
            classes.add(detection.label)

    return sorted(classes)


def _to_labels_map_rev(classes):
    return {c: i for i, c in enumerate(classes)}


def _parse_image_tf(image_path):
    img_bytes = tf.io.read_file(image_path)
    return tf.image.decode_image(img_bytes)


def _bytes_feature(value):
    # Extract bytes from EagerTensor, if necessary
    if isinstance(value, type(tf.constant(0))):
        value = value.numpy()

    return tf.train.Feature(bytes_list=tf.train.BytesList(value=[value]))


def _bytes_list_feature(value):
    return tf.train.Feature(bytes_list=tf.train.BytesList(value=value))


def _float_feature(value):
    return tf.train.Feature(float_list=tf.train.FloatList(value=[value]))


def _float_list_feature(value):
    return tf.train.Feature(float_list=tf.train.FloatList(value=value))


def _int64_feature(value):
    return tf.train.Feature(int64_list=tf.train.Int64List(value=[value]))


def _int64_list_feature(value):
    return tf.train.Feature(int64_list=tf.train.Int64List(value=value))
