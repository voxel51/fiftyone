"""
HDF5 utilities.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os

import cv2
import numpy as np

import eta.core.utils as etau

import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou
import fiftyone.utils.data as foud

fou.ensure_h5py()
import h5py


logger = logging.getLogger(__name__)


def from_hdf5(hdf5_path, images_key="images", labels_key=None):
    """Creates a generator that emits samples from the given HDF5 file.

    Each emitted sample is a tuple of ``(image_array, label)`` where
    ``image_array`` is a numpy array (either raw pixel data or encoded bytes)
    and ``label`` is the corresponding label string, or ``None`` if no labels
    key is provided.

    Args:
        hdf5_path: the path to the ``.h5`` or ``.hdf5`` file
        images_key ("images"): the key in the HDF5 file containing the image
            data. The dataset should be an array of shape
            ``(N, H, W, C)`` or ``(N, H, W)`` for pixel arrays, or ``(N,)``
            for variable-length encoded image bytes
        labels_key (None): an optional key in the HDF5 file containing labels.
            The dataset should be an array of shape ``(N,)`` containing
            strings or integers. If None, no labels are returned

    Yields:
        tuples of ``(image_data, label)``
    """
    with h5py.File(hdf5_path, "r") as f:
        if images_key not in f:
            raise ValueError(
                "HDF5 file '%s' does not contain key '%s'. "
                "Available keys: %s" % (hdf5_path, images_key, list(f.keys()))
            )

        images = f[images_key]
        num_images = len(images)

        labels = None
        if labels_key is not None:
            if labels_key not in f:
                raise ValueError(
                    "HDF5 file '%s' does not contain key '%s'. "
                    "Available keys: %s"
                    % (hdf5_path, labels_key, list(f.keys()))
                )

            labels = f[labels_key]
            if len(labels) != num_images:
                raise ValueError(
                    "Number of labels (%d) does not match number of images "
                    "(%d) in HDF5 file '%s'"
                    % (len(labels), num_images, hdf5_path)
                )

        for i in range(num_images):
            img_data = images[i]
            label = None

            if labels is not None:
                raw_label = labels[i]
                if isinstance(raw_label, bytes):
                    label = raw_label.decode("utf-8")
                elif isinstance(raw_label, np.bytes_):
                    label = raw_label.decode("utf-8")
                elif isinstance(raw_label, (np.integer, int)):
                    label = str(int(raw_label))
                else:
                    label = str(raw_label)

            yield img_data, label


class HDF5LabeledImageSampleParser(foud.LabeledImageSampleParser):
    """Parser for labeled image samples stored in
    `HDF5 <https://www.hdfgroup.org/solutions/hdf5/>`_ format.

    Each sample is expected to be a tuple of ``(image_data, label)`` where
    ``image_data`` is a numpy array containing image pixels or encoded image
    bytes, and ``label`` is a string label or ``None``.

    Args:
        force_rgb (False): whether to force convert all images to RGB
    """

    def __init__(self, force_rgb=False):
        super().__init__()
        self.force_rgb = force_rgb

    @property
    def label_cls(self):
        return fol.Classification

    @property
    def has_image_path(self):
        return False

    @property
    def has_image_metadata(self):
        return False

    def get_image(self):
        img_data, _ = self.current_sample
        img = _parse_image(img_data, force_rgb=self.force_rgb)
        return img

    def get_label(self):
        _, label = self.current_sample
        if label is None or label == "":
            return None

        return fol.Classification(label=label)


class HDF5UnlabeledImageSampleParser(foud.UnlabeledImageSampleParser):
    """Parser for unlabeled image samples stored in
    `HDF5 <https://www.hdfgroup.org/solutions/hdf5/>`_ format.

    Each sample is expected to be a tuple of ``(image_data, label)`` where
    ``image_data`` is a numpy array containing image pixels or encoded image
    bytes. The ``label`` value is ignored.

    Args:
        force_rgb (False): whether to force convert all images to RGB
    """

    def __init__(self, force_rgb=False):
        super().__init__()
        self.force_rgb = force_rgb

    @property
    def has_image_path(self):
        return False

    @property
    def has_image_metadata(self):
        return False

    def get_image(self):
        img_data, _ = self.current_sample
        img = _parse_image(img_data, force_rgb=self.force_rgb)
        return img


class HDF5ImageDatasetImporter(
    foud.LabeledImageDatasetImporter, foud.ImportPathsMixin
):
    """Importer for labeled image datasets stored in
    `HDF5 <https://www.hdfgroup.org/solutions/hdf5/>`_ format.

    This class reads image data and classification labels from an HDF5 file
    and writes the images as individual files to the provided ``images_dir``
    during import. This is analogous to how
    :class:`fiftyone.utils.tf.TFImageClassificationDatasetImporter` handles
    TFRecords.

    The HDF5 file should contain at least one dataset keyed by ``images_key``
    containing images as either:

    -   pixel arrays of shape ``(N, H, W, C)`` or ``(N, H, W)``
    -   encoded image bytes (e.g., PNG/JPEG) of shape ``(N,)``

    and optionally a dataset keyed by ``labels_key`` containing string or
    integer labels of shape ``(N,)``.

    Args:
        dataset_dir (None): the dataset directory. If omitted, ``hdf5_path``
            must be provided
        hdf5_path (None): an optional parameter that enables explicit control
            over the location of the HDF5 file. Can be any of the following:

            -   a filename like ``"data.h5"`` or glob pattern like ``"*.h5"``
                specifying the location of the file in ``dataset_dir``
            -   an absolute filepath for the HDF5 file. In this case,
                ``dataset_dir`` has no effect on the location of the file

            If None, the parameter will default to ``*.h5``
        images_dir (None): the directory in which the images will be written.
            If not provided, the images will be unpacked into ``dataset_dir``
        images_key ("images"): the key in the HDF5 file containing image data
        labels_key ("labels"): the key in the HDF5 file containing labels. Set
            to None to import images without labels
        image_format (None): the image format to use to write the images to
            disk. By default, ``fiftyone.config.default_image_ext`` is used
        force_rgb (False): whether to force convert all images to RGB
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir=None,
        hdf5_path=None,
        images_dir=None,
        images_key="images",
        labels_key="labels",
        image_format=None,
        force_rgb=False,
        max_samples=None,
    ):
        if dataset_dir is None and hdf5_path is None:
            raise ValueError(
                "Either `dataset_dir` or `hdf5_path` must be provided"
            )

        hdf5_path = self._parse_labels_path(
            dataset_dir=dataset_dir,
            labels_path=hdf5_path,
            default="*.h5",
        )

        if images_dir is None:
            images_dir = os.path.dirname(hdf5_path)
            logger.warning(
                "No `images_dir` provided. Images will be unpacked to '%s'",
                images_dir,
            )

        super().__init__(dataset_dir=dataset_dir, max_samples=max_samples)

        self.hdf5_path = hdf5_path
        self.images_dir = images_dir
        self.images_key = images_key
        self.labels_key = labels_key
        self.image_format = image_format
        self.force_rgb = force_rgb

        self._sample_parser = HDF5LabeledImageSampleParser(
            force_rgb=self.force_rgb,
        )
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

    @property
    def label_cls(self):
        return fol.Classification

    def setup(self):
        samples = from_hdf5(
            self.hdf5_path,
            images_key=self.images_key,
            labels_key=self.labels_key,
        )
        self._dataset_ingestor = foud.LabeledImageDatasetIngestor(
            self.images_dir,
            samples,
            self._sample_parser,
            image_format=self.image_format,
            max_samples=self.max_samples,
        )
        self._dataset_ingestor.setup()

    def close(self, *args):
        self._dataset_ingestor.close(*args)


class HDF5UnlabeledImageDatasetImporter(
    foud.UnlabeledImageDatasetImporter, foud.ImportPathsMixin
):
    """Importer for unlabeled image datasets stored in
    `HDF5 <https://www.hdfgroup.org/solutions/hdf5/>`_ format.

    This class reads image data from an HDF5 file and writes the images as
    individual files to the provided ``images_dir`` during import. This is
    analogous to how TFRecords-based importers unpack images to disk.

    The HDF5 file should contain a dataset keyed by ``images_key`` containing
    images as either:

    -   pixel arrays of shape ``(N, H, W, C)`` or ``(N, H, W)``
    -   encoded image bytes (e.g., PNG/JPEG) of shape ``(N,)``

    Args:
        dataset_dir (None): the dataset directory. If omitted, ``hdf5_path``
            must be provided
        hdf5_path (None): an optional parameter that enables explicit control
            over the location of the HDF5 file. Can be any of the following:

            -   a filename like ``"data.h5"`` or glob pattern like ``"*.h5"``
                specifying the location of the file in ``dataset_dir``
            -   an absolute filepath for the HDF5 file. In this case,
                ``dataset_dir`` has no effect on the location of the file

            If None, the parameter will default to ``*.h5``
        images_dir (None): the directory in which the images will be written.
            If not provided, the images will be unpacked into ``dataset_dir``
        images_key ("images"): the key in the HDF5 file containing image data
        image_format (None): the image format to use to write the images to
            disk. By default, ``fiftyone.config.default_image_ext`` is used
        force_rgb (False): whether to force convert all images to RGB
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir=None,
        hdf5_path=None,
        images_dir=None,
        images_key="images",
        image_format=None,
        force_rgb=False,
        max_samples=None,
    ):
        if dataset_dir is None and hdf5_path is None:
            raise ValueError(
                "Either `dataset_dir` or `hdf5_path` must be provided"
            )

        hdf5_path = self._parse_labels_path(
            dataset_dir=dataset_dir,
            labels_path=hdf5_path,
            default="*.h5",
        )

        if images_dir is None:
            images_dir = os.path.dirname(hdf5_path)
            logger.warning(
                "No `images_dir` provided. Images will be unpacked to '%s'",
                images_dir,
            )

        super().__init__(dataset_dir=dataset_dir, max_samples=max_samples)

        self.hdf5_path = hdf5_path
        self.images_dir = images_dir
        self.images_key = images_key
        self.image_format = image_format
        self.force_rgb = force_rgb

        self._sample_parser = HDF5UnlabeledImageSampleParser(
            force_rgb=self.force_rgb,
        )
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
        samples = from_hdf5(
            self.hdf5_path,
            images_key=self.images_key,
            labels_key=None,
        )
        self._dataset_ingestor = foud.UnlabeledImageDatasetIngestor(
            self.images_dir,
            samples,
            self._sample_parser,
            image_format=self.image_format,
            max_samples=self.max_samples,
        )
        self._dataset_ingestor.setup()

    def close(self, *args):
        self._dataset_ingestor.close(*args)


def _parse_image(img_data, force_rgb=False):
    """Parses image data from an HDF5 dataset into a numpy array.

    Supports both raw pixel arrays (2D/3D) and encoded image bytes (1D byte
    arrays or bytes objects).

    Args:
        img_data: the image data from the HDF5 dataset. Can be:

            -   a numpy array of shape ``(H, W, C)`` or ``(H, W)`` (pixels)
            -   a numpy array of shape ``(N,)`` with dtype ``uint8``
                (encoded bytes)
            -   a ``bytes`` object (encoded bytes)

        force_rgb (False): whether to force convert the image to RGB

    Returns:
        a numpy image array
    """
    if isinstance(img_data, bytes):
        # Encoded image bytes (e.g., PNG, JPEG)
        img_array = np.frombuffer(img_data, dtype=np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Failed to decode image bytes from HDF5 dataset")
    elif isinstance(img_data, np.ndarray):
        if img_data.ndim == 1:
            # 1D array of encoded bytes
            img = cv2.imdecode(img_data.astype(np.uint8), cv2.IMREAD_COLOR)
            if img is None:
                raise ValueError(
                    "Failed to decode image bytes from HDF5 dataset"
                )
        elif img_data.ndim in (2, 3):
            # Raw pixel array (H, W) or (H, W, C)
            img = img_data.astype(np.uint8)
        else:
            raise ValueError(
                "Unsupported image data shape %s from HDF5 dataset"
                % (img_data.shape,)
            )
    elif isinstance(img_data, np.void):
        # Variable-length bytes stored as np.void
        img_array = np.frombuffer(bytes(img_data), dtype=np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Failed to decode image bytes from HDF5 dataset")
    else:
        raise TypeError(
            "Unsupported image data type %s from HDF5 dataset" % type(img_data)
        )

    if force_rgb:
        if img.ndim == 2:
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2RGB)
        elif img.ndim == 3 and img.shape[2] == 4:
            img = cv2.cvtColor(img, cv2.COLOR_BGRA2RGB)
        elif img.ndim == 3 and img.shape[2] == 3:
            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    return img
