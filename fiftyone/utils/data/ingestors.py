"""
Dataset ingestors.

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

import os

import eta.core.image as etai
import eta.core.utils as etau

import fiftyone as fo

from .importers import (
    UnlabeledImageDatasetImporter,
    LabeledImageDatasetImporter,
)


class UnlabeledImageDatasetIngestor(UnlabeledImageDatasetImporter):
    """Dataset importer that ingests unlabled images into the provided
    ``dataset_dir`` during import.

    The source images are parsed from the provided ``samples`` using the
    provided :class:`fiftyone.utils.data.UnlabeledImageSampleParser` and
    written to ``dataset_dir`` in the following format::

        <dataset_dir>/<image_count><image_ext>

    where ``<image_count>`` is the number of ingested images, starting from the
    given ``offset``.

    When parsing a sample, if an image path is available via
    :func:`fiftyone.utils.data.UnlabeledImageSampleParser.get_image_path`, then
    the image is directly copied from its source location into ``dataset_dir``.
    Otherwise, the image is read in-memory via
    :func:`fiftyone.utils.data.UnlabeledImageSampleParser.get_image` and
    written to ``dataset_dir`` in the specified ``image_format``.

    Args:
        dataset_dir: the directory where input images will be ingested into
        samples: an iterable of samples
        sample_parser: an
            :class:`fiftyone.utils.data.UnlabeledImageSampleParser` to use to
            parse the samples
        offset (0): an offset to use when generating the numeric count in the
            paths of the ingested images
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
    """

    def __init__(
        self, dataset_dir, samples, sample_parser, offset=0, image_format=None
    ):
        if image_format is None:
            image_format = fo.config.default_image_ext

        super().__init__(dataset_dir)
        self.samples = samples
        self.sample_parser = sample_parser
        self.offset = offset
        self.image_format = image_format
        self._iter_samples = None
        self._image_patt = self._image_patt = os.path.join(
            dataset_dir, fo.config.default_sequence_idx + "%s"
        )

    def __iter__(self):
        self._iter_samples = enumerate(self.samples, self.offset)
        return self

    def __len__(self):
        return len(self.samples)

    def __next__(self):
        idx, sample = next(self._iter_samples)

        self.sample_parser.with_sample(sample)

        image_path = _ingest_image(
            self.sample_parser, self._image_patt, idx, self.image_format
        )

        if self.has_image_metadata:
            image_metadata = self.sample_parser.get_image_metadata()
        else:
            image_metadata = None

        return image_path, image_metadata

    @property
    def has_image_metadata(self):
        return self.sample_parser.has_image_metadata


class LabeledImageDatasetIngestor(LabeledImageDatasetImporter):
    """Dataset importer that ingests labled images into the provided
    ``dataset_dir`` during import.

    The source images and labels parsed from the provided ``samples`` using the
    provided :class:`fiftyone.utils.data.LabeledImageSampleParser`. The images
    are written to ``dataset_dir`` in the following format::

        <dataset_dir>/<image_count><image_ext>

    where ``<image_count>`` is the number of ingested images, starting from the
    given ``offset``.

    When parsing a sample, if an image path is available via
    :func:`fiftyone.utils.data.LabeledImageSampleParser.get_image_path`, then
    the image is directly copied from its source location into ``dataset_dir``.
    Otherwise, the image is read in-memory via
    :func:`fiftyone.utils.data.LabeledImageSampleParser.get_image` and
    written to ``dataset_dir`` in the specified ``image_format``.

    Args:
        dataset_dir: the directory where input images will be ingested into
        samples: an iterable of samples
        sample_parser: an
            :class:`fiftyone.utils.data.LabeledImageSampleParser` to use to
            parse the samples
        offset (0): an offset to use when generating the numeric count in the
            paths of the ingested images
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
    """

    def __init__(
        self, dataset_dir, samples, sample_parser, offset=0, image_format=None
    ):
        if image_format is None:
            image_format = fo.config.default_image_ext

        super().__init__(dataset_dir)
        self.samples = samples
        self.sample_parser = sample_parser
        self.offset = offset
        self.image_format = image_format
        self._iter_samples = None
        self._image_patt = os.path.join(
            dataset_dir, fo.config.default_sequence_idx + "%s"
        )

    def __iter__(self):
        self._iter_samples = enumerate(self.samples, self.offset)
        return self

    def __len__(self):
        return len(self.samples)

    def __next__(self):
        idx, sample = next(self._iter_samples)

        self.sample_parser.with_sample(sample)

        image_path = _ingest_image(
            self.sample_parser, self._image_patt, idx, self.image_format
        )

        if self.has_image_metadata:
            image_metadata = self.sample_parser.get_image_metadata()
        else:
            image_metadata = None

        label = self.sample_parser.get_label()

        return image_path, image_metadata, label

    @property
    def has_image_metadata(self):
        return self.sample_parser.has_image_metadata

    @property
    def label_cls(self):
        return self.sample_parser.label_cls


def _ingest_image(sample_parser, image_patt, idx, default_ext):
    if sample_parser.has_image_path:
        try:
            # Copy image directly to `dataset_dir`
            inpath = sample_parser.get_image_path()
            image_path = image_patt % (idx, os.path.splitext(inpath)[1])
            etau.copy_file(inpath, image_path)
            return image_path
        except:
            # Allow for SampleParsers that declare `has_image_path == True`
            # but cannot generate paths at runtime, e.g., because they support
            # inputs of the form `image_or_path` and an image, not a path, was
            # provided
            pass

    # Read image in-memory and write to `dataset_dir`
    img = sample_parser.get_image()
    image_path = image_patt % (idx, default_ext)
    etai.write(img, image_path)

    return image_path
