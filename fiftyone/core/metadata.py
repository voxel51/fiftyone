"""
Metadata stored in dataset samples.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import queue
import threading
from collections import defaultdict
import itertools
import logging
import multiprocessing.dummy
import os

from tqdm import tqdm

import fiftyone.core.odm as foo
import requests
from PIL import Image

import eta.core.utils as etau
import eta.core.video as etav
from pymongo import UpdateOne

import fiftyone.core.fields as fof
import fiftyone.core.map as focm
import fiftyone.core.media as fom
from fiftyone.core.odm import DynamicEmbeddedDocument
import fiftyone.core.storage as fos
import fiftyone.core.threed as fo3d
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
            r.raise_for_status()
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
            r.raise_for_status()
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


class SceneMetadata(Metadata):
    """Class for storing metadata about 3D scene samples.

    Args:
        size_bytes (None): the size of scene definition and all children
            assets on disk, in bytes
        mime_type (None): the MIME type of the scene
        asset_counts (None): dict of child asset file type to count
    """

    asset_counts = fof.DictField()

    @classmethod
    def build_for(cls, scene_path, mime_type=None, _cache=None):
        """Builds a :class:`SceneMetadata` object for the given 3D scene.

        Args:
            scene_path: a scene path
            mime_type (None): the MIME type of the scene. If not provided,
                defaults to ``application/octet-stream``

        Returns:
            a :class:`SceneMetadata`
        """
        if scene_path.startswith("http"):
            return cls._build_for_url(
                scene_path, mime_type=mime_type, cache=_cache
            )

        return cls._build_for_local(
            scene_path, mime_type=mime_type, cache=_cache
        )

    @classmethod
    def _build_for_local(cls, scene_path, mime_type=None, cache=None):
        if mime_type is None:
            mime_type = "application/octet-stream"

        scene_size = os.path.getsize(scene_path)
        scene = fo3d.Scene.from_fo3d(scene_path)

        asset_counts, asset_size = _parse_assets(
            scene, scene_path, cache=cache
        )
        size_bytes = scene_size + asset_size

        return cls(
            size_bytes=size_bytes,
            mime_type=mime_type,
            asset_counts=asset_counts,
        )

    @classmethod
    def _build_for_url(cls, scene_path, mime_type=None, cache=None):
        # Unclear how asset paths should be handled; the rest of the library is
        # not equipped to handle URL asset paths
        raise ValueError("Scene URLs are not currently supported")


def _parse_assets(scene, scene_path, cache=None):
    asset_paths = scene.get_asset_paths()

    asset_counts = defaultdict(int)
    scene_dir = os.path.dirname(scene_path)
    for i, asset_path in enumerate(asset_paths):
        if not fos.isabs(asset_path):
            asset_path = fos.abspath(fos.join(scene_dir, asset_path))
            asset_paths[i] = asset_path

        file_type = os.path.splitext(asset_path)[1][1:]
        asset_counts[file_type] += 1

    asset_size = 0

    tasks = []
    for asset_path in asset_paths:
        if cache is not None:
            metadata = cache.get(asset_path, None)
            if metadata is not None:
                asset_size += metadata.size_bytes
                continue

        tasks.append((None, asset_path, fom.MIXED, cache))

    results = []
    if len(tasks) <= 1:
        for task in tasks:
            results.append(_do_compute_metadata(task))
    else:
        num_workers = fou.recommend_thread_pool_workers(min(len(tasks), 8))
        with multiprocessing.dummy.Pool(processes=num_workers) as pool:
            results.extend(pool.imap(_do_compute_metadata, tasks))

    for task, result in zip(tasks, results):
        metadata = result[1]
        asset_size += metadata.size_bytes

        if cache is not None:
            scene_path = task[1]
            cache[scene_path] = metadata

    return dict(asset_counts), asset_size


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


def get_metadata_cls(media_type):
    """Get the ``metadata`` class for a media_type

    Args:
        media_type (str): a media type value

    Returns:
        a :class:`Metadata` class
    """
    if media_type == fom.IMAGE:
        return ImageMetadata
    elif media_type == fom.VIDEO:
        return VideoMetadata
    elif media_type == fom.THREE_D:
        return SceneMetadata

    return Metadata


def compute_metadata(
    sample_collection,
    overwrite=False,
    num_workers=None,
    skip_failures=True,
    warn_failures=False,
    progress=None,
):
    """Populates the ``metadata`` field of all samples in the collection.

    Any samples with existing metadata are skipped, unless
    ``overwrite == True``.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        overwrite (False): whether to overwrite existing metadata
        num_workers (None): a suggested number of threads to use
        skip_failures (True): whether to gracefully continue without raising an
            error if metadata cannot be computed for a sample
        warn_failures (False): whether to log a warning if metadata cannot
            be computed for a sample
        progress (None): whether to render a progress bar (True/False), use the
            default value ``fiftyone.config.show_progress_bars`` (None), or a
            progress callback function to invoke instead
    """
    logger.info("Computing metadata...")

    if sample_collection.media_type == fom.GROUP:
        sample_collection = sample_collection.select_group_slices(
            _allow_mixed=True
        )

    if not overwrite:
        sample_collection = sample_collection.exists("metadata", False)

    if (sample_count := len(sample_collection)) == 0:
        logger.info("No samples to compute metadata for")
        return

    if num_workers == 1:
        return _compute_metadata_opt(
            sample_collection,
            overwrite=overwrite,
            progress=sample_count if progress else None,
        )

    mapper = focm.MapperFactory.create(
        "process",
        num_workers=num_workers,
    )
    metadata_iter = mapper.map_samples(
        sample_collection,
        _compute_metadata_map_fcn,
        iter_fcn=_compute_metadata_iter_fcn,
        skip_failures=skip_failures,
        progress=progress,
    )

    if not num_workers:
        num_workers = fou.recommend_thread_pool_workers(num_workers)

    collection = sample_collection._root_dataset._sample_collection

    # Collect update operations
    update_queue = queue.Queue()
    stop_signal = object()

    # Start worker threads
    threads = []
    for _ in range(num_workers):
        t = threading.Thread(
            target=_bulk_metadata_writer,
            args=(collection, update_queue, stop_signal),
        )
        t.start()
        threads.append(t)

    # Process metadata with map function
    for _, update_op in metadata_iter:
        # Rather than calling bulk_write here and waiting for it to finish,
        # we just queue the update operations and let the worker threads
        # handle them. This allows us to process the metadata in parallel
        # with the bulk writes.
        if update_op:
            update_queue.put(update_op)

    # Stop worker threads
    for _ in range(num_workers):
        update_queue.put(stop_signal)
    for t in threads:
        t.join()

    if skip_failures and not warn_failures:
        return

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


def _bulk_metadata_writer(
    collection, update_queue, stop_signal, batch_size=1000
):
    ops = []
    while True:
        item = update_queue.get()
        if item is stop_signal:
            break

        ops.append(item)
        if len(ops) >= batch_size:
            collection.bulk_write(ops)
            ops.clear()

    # Flush any leftovers
    if ops:
        collection.bulk_write(ops)
        ops.clear()


def _compute_metadata(
    sample_collection, overwrite=False, batch_size=1000, progress=None
):
    if not overwrite:
        sample_collection = sample_collection.exists("metadata", False)

    ids, filepaths, media_types = sample_collection.values(
        ["id", "filepath", "_media_type"],
        _allow_missing=True,
    )

    num_samples = len(ids)
    if num_samples == 0:
        return

    logger.info("Computing metadata...")

    cache = {}
    values = {}
    inputs = zip(ids, filepaths, media_types, itertools.repeat(cache))

    try:
        with fou.ProgressBar(total=num_samples, progress=progress) as pb:
            for args in pb(inputs):
                sample_id, metadata = _do_compute_metadata(args)
                values[sample_id] = metadata
                if len(values) >= batch_size:
                    sample_collection.set_values(
                        "metadata", values, key_field="id"
                    )
                    values.clear()
    finally:
        sample_collection.set_values("metadata", values, key_field="id")


def _compute_metadata_map_fcn(args):
    oid, filepath, media_type, cache = args
    metadata = _compute_sample_metadata(
        filepath, media_type, skip_failures=True, cache=cache
    )
    if metadata:
        return UpdateOne(
            {"_id": oid}, {"$set": {"metadata": metadata.to_mongo()}}
        )


def _compute_metadata_iter_fcn(sample_collection):
    cache = {}

    for sid, filepath, media_type in sample_collection._iter_values(
        ["_id", "filepath", "_media_type"], _allow_missing=True
    ):
        yield sid, tuple([sid, filepath, media_type, cache])


def _compute_metadata_opt(
    sample_collection,
    overwrite=False,
    batch_size=1000,
    progress=None,
):
    logger.info("Computing metadata...")

    if not overwrite:
        sample_collection = sample_collection.exists("metadata", False)
    cache = {}
    update_ops = []

    for oid, filepath, media_type in tqdm(
        sample_collection._iter_values(
            ["_id", "filepath", "_media_type"],
            _allow_missing=True,
        ),
        total=progress,
    ):
        metadata = _compute_sample_metadata(
            filepath, media_type, skip_failures=True, cache=cache
        )
        if metadata:
            update_ops.append(
                UpdateOne(
                    {"_id": oid}, {"$set": {"metadata": metadata.to_mongo()}}
                )
            )
        if len(update_ops) >= batch_size:
            foo.bulk_write(
                update_ops, sample_collection._root_dataset._sample_collection
            )
            update_ops.clear()
    if len(update_ops) > 0:
        foo.bulk_write(
            update_ops, sample_collection._root_dataset._sample_collection
        )


def _image_has_flipped_dimensions(img):
    """Returns True if image has flipped width/height dimensions

    EXIF Orientation metadata can specify that an image be rotated or otherwise
    transposed. ``PIL.Image`` does not handle this by default so we have to
    inspect the EXIF info. See ``PIL.ImageOps.exif_transpose()`` for the basis
    of this function, except we don't actually want to transpose the image
    when we only need the dimensions.

    Tag name reference: https://exiftool.org/TagNames/EXIF.html
    PIL.ImageOps reference: https://github.com/python-pillow/Pillow/blob/main/src/PIL/ImageOps.py

    Args:
        img: a ``PIL.Image``

    Returns:
        True if image width/height should be flipped
    """
    # Value from PIL.ExifTags.Base.Orientation == 274
    #   We hard-code the value directly here so we can support older Pillow
    #   versions that don't have ExifTags.Base.
    #   It's ok because this value will never change.
    orientation_tag = 0x0112
    exif_orientation = img.getexif().get(orientation_tag)
    # 5, 6, 7, 8 --> TRANSPOSE, ROTATE_270, TRANSVERSE, ROTATE_90
    is_rotated = exif_orientation in {5, 6, 7, 8}
    return is_rotated


def get_image_info(f):
    """Retrieves the dimensions and number of channels of the given image from
    a file-like object that is streaming its contents.

    Args:
        f: a file-like object that supports ``read()``, ``seek()``, ``tell()``

    Returns:
        ``(width, height, num_channels)``
    """
    img = Image.open(f)

    # Flip the dimensions if image metadata requires us to. PIL.Image doesn't
    #   handle by default. Image flipping only efficiently supported on JPEG.
    if img.format == "JPEG" and _image_has_flipped_dimensions(img):
        width, height = img.height, img.width
    else:
        width, height = img.width, img.height

    return width, height, len(img.getbands())


def _do_compute_metadata(args):
    sample_id, filepath, media_type, cache = args
    metadata = _compute_sample_metadata(
        filepath, media_type, skip_failures=True, cache=cache
    )
    return sample_id, metadata


def _compute_sample_metadata(
    filepath, media_type, skip_failures=False, cache=None
):
    try:
        return _get_metadata(filepath, media_type, cache=cache)
    except:
        if skip_failures:
            return None
        raise


def _get_metadata(filepath, media_type, cache=None):
    if cache is not None:
        metadata = cache.get(filepath, None)
        if metadata is not None:
            return metadata

    if media_type == fom.IMAGE:
        metadata = ImageMetadata.build_for(filepath)
    elif media_type == fom.VIDEO:
        metadata = VideoMetadata.build_for(filepath)
    elif media_type == fom.THREE_D:
        metadata = SceneMetadata.build_for(filepath, _cache=cache)
    else:
        metadata = Metadata.build_for(filepath)

    return metadata
