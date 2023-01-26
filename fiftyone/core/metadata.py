"""
Metadata stored in dataset samples.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import logging
import multiprocessing
import os
import requests

from PIL import Image

import eta.core.utils as etau
import eta.core.video as etav

from fiftyone.core.odm import DynamicEmbeddedDocument
import fiftyone.core.fields as fof
import fiftyone.core.media as fom
import fiftyone.core.utils as fou


logger = logging.getLogger(__name__)


class Metadata(DynamicEmbeddedDocument):
    """Base class for storing metadata about generic samples.

    Args:
        size_bytes (None): the size of the media, in bytes
        mime_type (None): the MIME type of the media
    """

    size_bytes = fof.IntField()
    mime_type = fof.StringField()

    @classmethod
    def build_for(cls, path_or_url, mime_type=None):
        """Builds a :class:`Metadata` object for the given file.

        Args:
            path_or_url: the path to the data on disk or a URL
            mime_type (None): the MIME type of the file. If not provided, it
                will be guessed

        Returns:
            a :class:`Metadata`
        """
        if path_or_url.startswith("http"):
            return cls._build_for_url(path_or_url, mime_type=mime_type)

        return cls._build_for_local(path_or_url, mime_type=mime_type)

    @classmethod
    def _build_for_local(cls, filepath, mime_type=None):
        if mime_type is None:
            mime_type = etau.guess_mime_type(filepath)

        size_bytes = os.path.getsize(filepath)

        return cls(size_bytes=size_bytes, mime_type=mime_type)

    @classmethod
    def _build_for_url(cls, url, mime_type=None):
        if mime_type is None:
            mime_type = etau.guess_mime_type(url)

        with requests.get(url, stream=True) as r:
            size_bytes = int(r.headers["Content-Length"])

        return cls(size_bytes=size_bytes, mime_type=mime_type)


class ImageMetadata(Metadata):
    """Class for storing metadata about image samples.

    Args:
        size_bytes (None): the size of the image on disk, in bytes
        mime_type (None): the MIME type of the image
        width (None): the width of the image, in pixels
        height (None): the height of the image, in pixels
        num_channels (None): the number of channels in the image
    """

    width = fof.IntField()
    height = fof.IntField()
    num_channels = fof.IntField()

    @classmethod
    def build_for(cls, img_or_path_or_url, mime_type=None):
        """Builds an :class:`ImageMetadata` object for the given image.

        Args:
            img_or_path_or_url: an image, an image path on disk, or a URL
            mime_type (None): the MIME type of the image. If not provided, it
                will be guessed

        Returns:
            an :class:`ImageMetadata`
        """
        if not etau.is_str(img_or_path_or_url):
            return cls._build_for_img(img_or_path_or_url, mime_type=mime_type)

        if img_or_path_or_url.startswith("http"):
            return cls._build_for_url(img_or_path_or_url, mime_type=mime_type)

        return cls._build_for_local(img_or_path_or_url, mime_type=mime_type)

    @classmethod
    def _build_for_local(cls, path, mime_type=None):
        size_bytes = os.path.getsize(path)

        if mime_type is None:
            mime_type = etau.guess_mime_type(path)

        with open(path, "rb") as f:
            width, height, num_channels = get_image_info(f)

        return cls(
            size_bytes=size_bytes,
            mime_type=mime_type,
            width=width,
            height=height,
            num_channels=num_channels,
        )

    @classmethod
    def _build_for_url(cls, url, mime_type=None):
        if mime_type is None:
            mime_type = etau.guess_mime_type(url)

        with requests.get(url, stream=True) as r:
            size_bytes = int(r.headers["Content-Length"])
            width, height, num_channels = get_image_info(fou.ResponseStream(r))

        return cls(
            size_bytes=size_bytes,
            mime_type=mime_type,
            width=width,
            height=height,
            num_channels=num_channels,
        )

    @classmethod
    def _build_for_img(cls, img, mime_type=None):
        size_bytes = img.nbytes
        height, width = img.shape[:2]
        try:
            num_channels = img.shape[2]
        except IndexError:
            num_channels = 1

        return cls(
            size_bytes=size_bytes,
            mime_type=mime_type,
            width=width,
            height=height,
            num_channels=num_channels,
        )


class VideoMetadata(Metadata):
    """Class for storing metadata about video samples.

    Args:
        size_bytes (None): the size of the video on disk, in bytes
        mime_type (None): the MIME type of the video
        frame_width (None): the width of the video frames, in pixels
        frame_height (None): the height of the video frames, in pixels
        frame_rate (None): the frame rate of the video
        total_frame_count (None): the total number of frames in the video
        duration (None): the duration of the video, in seconds
        encoding_str (None): the encoding string for the video
    """

    frame_width = fof.IntField()
    frame_height = fof.IntField()
    frame_rate = fof.FloatField()
    total_frame_count = fof.IntField()
    duration = fof.FloatField()
    encoding_str = fof.StringField()

    @classmethod
    def build_for(cls, video_path_or_url, mime_type=None):
        """Builds an :class:`VideoMetadata` object for the given video.

        Args:
            video_path_or_url: the path to a video on disk or a URL
            mime_type (None): the MIME type of the image. If not provided, it
                will be guessed

        Returns:
            a :class:`VideoMetadata`
        """
        stream_info = etav.VideoStreamInfo.build_for(
            video_path_or_url, mime_type=mime_type
        )
        return cls(
            size_bytes=stream_info.size_bytes,
            mime_type=stream_info.mime_type,
            frame_width=stream_info.frame_size[0],
            frame_height=stream_info.frame_size[1],
            frame_rate=stream_info.frame_rate,
            total_frame_count=stream_info.total_frame_count,
            duration=stream_info.duration,
            encoding_str=stream_info.encoding_str,
        )


def compute_sample_metadata(sample, overwrite=False, skip_failures=False):
    """Populates the ``metadata`` field of the sample.

    Args:
        sample: a :class:`fiftyone.core.sample.Sample`
        overwrite (False): whether to overwrite existing metadata
        skip_failures (False): whether to gracefully continue without raising
            an error if metadata cannot be computed
    """
    if not overwrite and sample.metadata is not None:
        return

    sample.metadata = _compute_sample_metadata(
        sample.filepath, sample.media_type, skip_failures=skip_failures
    )
    if sample._in_db:
        sample.save()


def compute_metadata(
    sample_collection, overwrite=False, num_workers=None, skip_failures=True
):
    """Populates the ``metadata`` field of all samples in the collection.

    Any samples with existing metadata are skipped, unless
    ``overwrite == True``.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        overwrite (False): whether to overwrite existing metadata
        num_workers (None): the number of processes to use. By default,
            ``multiprocessing.cpu_count()`` is used
        skip_failures (True): whether to gracefully continue without raising an
            error if metadata cannot be computed for a sample
    """
    if num_workers is None:
        num_workers = multiprocessing.cpu_count()

    if sample_collection.media_type == fom.GROUP:
        sample_collection = sample_collection.select_group_slices(
            _allow_mixed=True
        )

    if num_workers <= 1:
        _compute_metadata(sample_collection, overwrite=overwrite)
    else:
        _compute_metadata_multi(
            sample_collection,
            num_workers,
            overwrite=overwrite,
        )

    num_missing = len(sample_collection.exists("metadata", False))
    if num_missing > 0:
        msg = (
            "Failed to populate metadata on %d samples. "
            + 'Use `dataset.exists("metadata", False)` to retrieve them'
        ) % num_missing

        if skip_failures:
            logger.warning(msg)
        else:
            raise ValueError(msg)


def get_image_info(f):
    """Retrieves the dimensions and number of channels of the given image from
    a file-like object that is streaming its contents.

    Args:
        f: a file-like object that supports ``read()``, ``seek()``, ``tell()``

    Returns:
        ``(width, height, num_channels)``
    """
    img = Image.open(f)
    return (img.width, img.height, len(img.getbands()))


def _compute_metadata(sample_collection, overwrite=False):
    if not overwrite:
        sample_collection = sample_collection.exists("metadata", False)

    num_samples = len(sample_collection)
    if num_samples == 0:
        return

    logger.info("Computing metadata...")
    with fou.ProgressBar(total=num_samples) as pb:
        for sample in pb(sample_collection.select_fields()):
            compute_sample_metadata(sample, skip_failures=True)


def _compute_metadata_multi(sample_collection, num_workers, overwrite=False):
    if not overwrite:
        sample_collection = sample_collection.exists("metadata", False)

    ids, filepaths, media_types = sample_collection.values(
        ["id", "filepath", "_media_type"],
        _allow_missing=True,
    )

    inputs = list(zip(ids, filepaths, media_types))
    num_samples = len(inputs)

    if num_samples == 0:
        return

    logger.info("Computing metadata...")

    view = sample_collection.select_fields()
    with fou.ProgressBar(total=num_samples) as pb:
        with fou.get_multiprocessing_context().Pool(
            processes=num_workers
        ) as pool:
            for sample_id, metadata in pb(
                pool.imap_unordered(_do_compute_metadata, inputs)
            ):
                sample = view[sample_id]
                sample.metadata = metadata
                sample.save()


def _do_compute_metadata(args):
    sample_id, filepath, media_type = args
    metadata = _compute_sample_metadata(
        filepath, media_type, skip_failures=True
    )
    return sample_id, metadata


def _compute_sample_metadata(filepath, media_type, skip_failures=False):
    if not skip_failures:
        return _get_metadata(filepath, media_type)

    try:
        return _get_metadata(filepath, media_type)
    except:
        return None


def _get_metadata(filepath, media_type):
    if media_type == fom.IMAGE:
        metadata = ImageMetadata.build_for(filepath)
    elif media_type == fom.VIDEO:
        metadata = VideoMetadata.build_for(filepath)
    else:
        metadata = Metadata.build_for(filepath)

    return metadata
