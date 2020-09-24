"""
Dataset ingestors.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging

import eta.core.image as etai
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.utils as fou

from .importers import (
    UnlabeledImageDatasetImporter,
    LabeledImageDatasetImporter,
)


logger = logging.getLogger(__name__)


class ImageIngestor(object):
    """Mixin for :class:`fiftyone.utils.data.importers.DatasetImporter`
    instances that ingest images into the provided ``dataset_dir`` during
    import.

    Args:
        dataset_dir: the directory where input images will be ingested into
    """

    def __init__(self, dataset_dir, image_format=None):
        if image_format is None:
            image_format = fo.config.default_image_ext

        self.dataset_dir = dataset_dir
        self.image_format = image_format
        self._filename_maker = None

    def _ingest_image(self, sample_parser):
        if sample_parser.has_image_path:
            try:
                return self._ingest_image_from_path(sample_parser)
            except:
                # Allow for SampleParsers that declare `has_image_path == True`
                # but cannot generate paths at runtime, e.g., because they
                # support inputs of the form `image_or_path` and an image, not
                # a path, was provided
                pass

        return self._ingest_in_memory_image(sample_parser)

    def _ingest_image_from_path(self, sample_parser):
        image_path = sample_parser.get_image_path()
        output_image_path = self._filename_maker.get_output_path(image_path)
        etau.copy_file(image_path, output_image_path)
        return output_image_path

    def _ingest_in_memory_image(self, sample_parser):
        img = sample_parser.get_image()
        image_path = self._filename_maker.get_output_path()
        etai.write(img, image_path)
        return image_path

    def _setup(self):
        self._filename_maker = fou.UniqueFilenameMaker(
            output_dir=self.dataset_dir, default_ext=self.image_format
        )


class UnlabeledImageDatasetIngestor(
    UnlabeledImageDatasetImporter, ImageIngestor
):
    """Dataset importer that ingests unlabeled images into the provided
    ``dataset_dir`` during import.

    The source images are parsed from the provided ``samples`` using the
    provided :class:`fiftyone.utils.data.parsers.UnlabeledImageSampleParser`.

    If an image path is available via
    :func:`fiftyone.utils.data.parsers.UnlabeledImageSampleParser.get_image_path`,
    then the image is directly copied from its source location into
    ``dataset_dir``. In this case, the original filename is maintained, unless
    a name conflict would occur, in which case an index of the form
    ``"-%d" % count`` is appended to the base filename.

    If no image path is available, the image is read in-memory via
    :func:`fiftyone.utils.data.parsers.UnlabeledImageSampleParser.get_image`
    and written to ``dataset_dir`` in the following format::

        <dataset_dir>/<image_count><image_format>

    where ``image_count`` is the number of files in ``dataset_dir``.

    Args:
        dataset_dir: the directory where input images will be ingested into
        samples: an iterable of samples
        sample_parser: an
            :class:`fiftyone.utils.data.parsers.UnlabeledImageSampleParser` to
            use to parse the samples
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        samples,
        sample_parser,
        image_format=None,
        max_samples=None,
        **kwargs
    ):
        for arg in kwargs:
            logger.warning("Ignoring unsupported parameter '%s'", arg)

        UnlabeledImageDatasetImporter.__init__(
            self, dataset_dir, max_samples=max_samples
        )
        ImageIngestor.__init__(self, dataset_dir, image_format=image_format)
        self.samples = samples
        self.sample_parser = sample_parser
        self._iter_samples = None
        self._num_samples = None
        self._num_imported = None

    def __iter__(self):
        self._num_imported = 0
        self._iter_samples = iter(self.samples)
        return self

    def __len__(self):
        if self._num_samples is not None:
            return self._num_samples

        return len(self.samples)

    def __next__(self):
        if (
            self.max_samples is not None
            and self._num_imported >= self.max_samples
        ):
            raise StopIteration

        sample = next(self._iter_samples)

        self.sample_parser.with_sample(sample)

        image_path = self._ingest_image(self.sample_parser)

        if self.has_image_metadata:
            image_metadata = self.sample_parser.get_image_metadata()
        else:
            image_metadata = None

        self._num_imported += 1
        return image_path, image_metadata

    @property
    def has_dataset_info(self):
        return False

    @property
    def has_image_metadata(self):
        return self.sample_parser.has_image_metadata

    def setup(self):
        self._setup()

        try:
            self._num_samples = len(self.samples)
            if self.max_samples is not None:
                self._num_samples = min(self._num_samples, self.max_samples)
        except:
            pass


class LabeledImageDatasetIngestor(LabeledImageDatasetImporter, ImageIngestor):
    """Dataset importer that ingests labeled images into the provided
    ``dataset_dir`` during import.

    The source images and labels are parsed from the provided ``samples`` using
    the provided :class:`fiftyone.utils.data.parsers.LabeledImageSampleParser`.

    If an image path is available via
    :func:`fiftyone.utils.data.parsers.LabeledImageSampleParser.get_image_path`,
    then the image is directly copied from its source location into
    ``dataset_dir``. In this case, the original filename is maintained, unless
    a name conflict would occur, in which case an index of the form
    ``"-%d" % count`` is appended to the base filename.

    If no image path is available, the image is read in-memory via
    :func:`fiftyone.utils.data.parsers.LabeledImageSampleParser.get_image` and
    written to ``dataset_dir`` in the following format::

        <dataset_dir>/<image_count><image_format>

    where ``image_count`` is the number of files in ``dataset_dir``.

    Args:
        dataset_dir: the directory where input images will be ingested into
        samples: an iterable of samples
        sample_parser: an
            :class:`fiftyone.utils.data.parsers.LabeledImageSampleParser` to
            use to parse the samples
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
        skip_unlabeled (False): whether to skip unlabeled images when importing
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        samples,
        sample_parser,
        image_format=None,
        skip_unlabeled=False,
        max_samples=None,
        **kwargs
    ):
        for arg in kwargs:
            logger.warning("Ignoring unsupported parameter '%s'", arg)

        LabeledImageDatasetImporter.__init__(
            self,
            dataset_dir,
            skip_unlabeled=skip_unlabeled,
            max_samples=max_samples,
        )
        ImageIngestor.__init__(self, dataset_dir, image_format=image_format)
        self.samples = samples
        self.sample_parser = sample_parser
        self._iter_samples = None
        self._num_samples = None
        self._num_imported = None

    def __iter__(self):
        self._num_imported = 0
        self._iter_samples = iter(self.samples)
        return self

    def __len__(self):
        if self._num_samples is not None:
            return self._num_samples

        return len(self.samples)

    def __next__(self):
        if (
            self.max_samples is not None
            and self._num_imported >= self.max_samples
        ):
            raise StopIteration

        image_path, image_metadata, label = self._parse_next_sample()

        if self.skip_unlabeled:
            while label is None:
                image_path, image_metadata, label = self._parse_next_sample()

        self._num_imported += 1
        return image_path, image_metadata, label

    def _parse_next_sample(self):
        sample = next(self._iter_samples)

        self.sample_parser.with_sample(sample)

        image_path = self._ingest_image(self.sample_parser)

        if self.has_image_metadata:
            image_metadata = self.sample_parser.get_image_metadata()
        else:
            image_metadata = None

        label = self.sample_parser.get_label()

        return image_path, image_metadata, label

    @property
    def has_dataset_info(self):
        return False

    @property
    def has_image_metadata(self):
        return self.sample_parser.has_image_metadata

    @property
    def label_cls(self):
        return self.sample_parser.label_cls

    def setup(self):
        self._setup()

        try:
            self._num_samples = len(self.samples)
            if self.max_samples is not None:
                self._num_samples = min(self._num_samples, self.max_samples)
        except:
            pass
