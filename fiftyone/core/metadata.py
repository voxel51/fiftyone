"""
Metadata stored in dataset samples.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import logging
import multiprocessing
import os

import eta.core.image as etai
import eta.core.utils as etau
import eta.core.video as etav

from fiftyone.core.odm.document import DynamicEmbeddedDocument
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

    meta = {"allow_inheritance": True}

    size_bytes = fof.IntField()
    mime_type = fof.StringField()

    @classmethod
    def build_for(cls, filepath):
        """Builds a :class:`Metadata` object for the given filepath.

        Args:
            filepath: the path to the data on disk

        Returns:
            a :class:`Metadata`
        """
        return cls(
            size_bytes=os.path.getsize(filepath),
            mime_type=etau.guess_mime_type(filepath),
        )


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
    def build_for(cls, image_or_path):
        """Builds an :class:`ImageMetadata` object for the given image.

        Args:
            image_or_path: an image or the path to the image on disk

        Returns:
            an :class:`ImageMetadata`
        """
        if etau.is_str(image_or_path):
            # From image on disk
            m = etai.ImageMetadata.build_for(image_or_path)
            return cls(
                size_bytes=m.size_bytes,
                mime_type=m.mime_type,
                width=m.frame_size[0],
                height=m.frame_size[1],
                num_channels=m.num_channels,
            )

        # From in-memory image
        height, width = image_or_path.shape[:2]
        try:
            num_channels = image_or_path.shape[2]
        except IndexError:
            num_channels = 1

        return cls(width=width, height=height, num_channels=num_channels)


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
    def build_for(cls, video_path):
        """Builds an :class:`VideoMetadata` object for the given video.

        Args:
            video_path: the path to a video on disk

        Returns:
            a :class:`VideoMetadata`
        """
        m = etav.VideoMetadata.build_for(video_path)
        return cls(
            size_bytes=m.size_bytes,
            mime_type=m.mime_type,
            frame_width=m.frame_size[0],
            frame_height=m.frame_size[1],
            frame_rate=m.frame_rate,
            total_frame_count=m.total_frame_count,
            duration=m.duration,
            encoding_str=m.encoding_str,
        )


def compute_sample_metadata(sample, skip_failures=False):
    """Populates the ``metadata`` field of the sample.

    Args:
        sample: a :class:`fiftyone.core.sample.Sample`
        skip_failures (False): whether to gracefully continue without raising
            an error if metadata cannot be computed
    """
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

    if num_workers == 1:
        _compute_metadata(sample_collection, overwrite=overwrite)
    else:
        _compute_metadata_multi(
            sample_collection, num_workers, overwrite=overwrite,
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


def _compute_metadata(sample_collection, overwrite=False):
    if not overwrite:
        sample_collection = sample_collection.exists("metadata", False)

    num_samples = len(sample_collection)
    if num_samples == 0:
        return

    logger.info("Computing %s metadata...", sample_collection.media_type)
    with fou.ProgressBar(total=num_samples) as pb:
        for sample in pb(sample_collection.select_fields()):
            compute_sample_metadata(sample, skip_failures=True)


def _compute_metadata_multi(sample_collection, num_workers, overwrite=False):
    if not overwrite:
        sample_collection = sample_collection.exists("metadata", False)

    ids, filepaths = sample_collection.values(["id", "filepath"])
    media_types = itertools.repeat(sample_collection.media_type)

    inputs = list(zip(ids, filepaths, media_types))
    num_samples = len(inputs)

    if num_samples == 0:
        return

    logger.info("Computing %s metadata...", sample_collection.media_type)
    with fou.ProgressBar(total=num_samples) as pb:
        with multiprocessing.Pool(processes=num_workers) as pool:
            for sample_id, metadata in pb(
                pool.imap_unordered(_do_compute_metadata, inputs)
            ):
                sample = sample_collection[sample_id]
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
