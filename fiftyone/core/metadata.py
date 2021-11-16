"""
Metadata stored in dataset samples.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import logging
import multiprocessing
import multiprocessing.dummy
import os
import requests
import struct

import eta.core.utils as etau
import eta.core.video as etav

import fiftyone.core.cache as foc
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
            width, height = get_image_dimensions(f)

        return cls(
            size_bytes=size_bytes,
            mime_type=mime_type,
            width=width,
            height=height,
            num_channels=None,  # @todo can we get this w/o reading full image?
        )

    @classmethod
    def _build_for_url(cls, url, mime_type=None):
        if mime_type is None:
            mime_type = etau.guess_mime_type(url)

        with requests.get(url, stream=True) as r:
            size_bytes = int(r.headers["Content-Length"])
            width, height = get_image_dimensions(fou.ResponseStream(r))

        return cls(
            size_bytes=size_bytes,
            mime_type=mime_type,
            width=width,
            height=height,
            num_channels=None,  # @todo can we get this w/o reading full image?
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


def get_image_dimensions(f):
    """Retrieves the dimensions of the given image from a file-like object that
    is streaming its contents.

    Args:
        f: a file-like object that supports ``read()`` and ``seek()``

    Returns:
        the ``(width, height)``
    """
    width = -1
    height = -1

    data = f.read(26)
    size = len(data)

    if (size >= 10) and data[:6] in (b"GIF87a", b"GIF89a"):
        # GIFs
        w, h = struct.unpack("<HH", data[6:10])
        width = int(w)
        height = int(h)
    elif (
        (size >= 24)
        and data.startswith(b"\211PNG\r\n\032\n")
        and (data[12:16] == b"IHDR")
    ):
        # PNGs
        w, h = struct.unpack(">LL", data[16:24])
        width = int(w)
        height = int(h)
    elif (size >= 16) and data.startswith(b"\211PNG\r\n\032\n"):
        # older PNGs
        w, h = struct.unpack(">LL", data[8:16])
        width = int(w)
        height = int(h)
    elif (size >= 2) and data.startswith(b"\377\330"):
        f.seek(2)
        b = f.read(1)
        while b and ord(b) != 0xDA:
            while ord(b) != 0xFF:
                b = f.read(1)
            while ord(b) == 0xFF:
                b = f.read(1)
            if ord(b) >= 0xC0 and ord(b) <= 0xC3:
                f.read(3)
                tmp = f.read(4)
                h, w = struct.unpack(">HH", tmp)
                break
            else:
                tmp = f.read(2)
                f.read(int(struct.unpack(">H", tmp)[0]) - 2)
            b = f.read(1)
        width = int(w)
        height = int(h)
    elif (size >= 26) and data.startswith(b"BM"):
        # BMP
        headersize = struct.unpack("<I", data[14:18])[0]
        if headersize == 12:
            w, h = struct.unpack("<HH", data[18:22])
            width = int(w)
            height = int(h)
        elif headersize >= 40:
            w, h = struct.unpack("<ii", data[18:26])
            width = int(w)
            # as h is negative when stored upside down
            height = abs(int(h))
        else:
            raise MetadataException(
                "Unkown DIB header size: %s" % str(headersize)
            )
    elif (size >= 8) and data[:4] in (b"II\052\000", b"MM\000\052"):
        # Standard TIFF, big- or little-endian
        # BigTIFF and other different but TIFF-like formats are not
        # supported currently
        byteOrder = data[:2]
        boChar = ">" if byteOrder == "MM" else "<"
        # maps TIFF type id to size (in bytes)
        # and python format char for struct
        tiffTypes = {
            1: (1, boChar + "B"),  # BYTE
            2: (1, boChar + "c"),  # ASCII
            3: (2, boChar + "H"),  # SHORT
            4: (4, boChar + "L"),  # LONG
            5: (8, boChar + "LL"),  # RATIONAL
            6: (1, boChar + "b"),  # SBYTE
            7: (1, boChar + "c"),  # UNDEFINED
            8: (2, boChar + "h"),  # SSHORT
            9: (4, boChar + "l"),  # SLONG
            10: (8, boChar + "ll"),  # SRATIONAL
            11: (4, boChar + "f"),  # FLOAT
            12: (8, boChar + "d"),  # DOUBLE
        }
        ifdOffset = struct.unpack(boChar + "L", data[4:8])[0]

        countSize = 2
        f.seek(ifdOffset)
        ec = f.read(countSize)
        ifdEntryCount = struct.unpack(boChar + "H", ec)[0]
        # 2 bytes: TagId + 2 bytes: type + 4 bytes: count of values + 4
        # bytes: value offset
        ifdEntrySize = 12
        for i in range(ifdEntryCount):
            entryOffset = ifdOffset + countSize + i * ifdEntrySize
            f.seek(entryOffset)
            tag = f.read(2)
            tag = struct.unpack(boChar + "H", tag)[0]
            if tag == 256 or tag == 257:
                # if type indicates that value fits into 4 bytes, value
                # offset is not an offset but value itself
                type = f.read(2)
                type = struct.unpack(boChar + "H", type)[0]
                if type not in tiffTypes:
                    raise MetadataException("Unable to read metadata")
                typeSize = tiffTypes[type][0]
                typeChar = tiffTypes[type][1]
                f.seek(entryOffset + 8)
                value = f.read(typeSize)
                value = int(struct.unpack(typeChar, value)[0])
                if tag == 256:
                    width = value
                else:
                    height = value
            if width > -1 and height > -1:
                break

    elif size >= 2:
        f.seek(0)
        reserved = f.read(2)
        if 0 != struct.unpack("<H", reserved)[0]:
            raise MetadataException("Unable to read metadata")
        format = f.read(2)
        if 1 != struct.unpack("<H", format)[0]:
            raise MetadataException("Unable to read metadata")
        num = f.read(2)
        num = struct.unpack("<H", num)[0]

        # http://msdn.microsoft.com/en-us/library/ms997538.aspx
        w = f.read(1)
        h = f.read(1)
        width = ord(w)
        height = ord(h)

    return width, height


class MetadataException(Exception):
    """"Exception raised when metadata for a media file cannot be computed."""

    pass


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

    media_type = sample_collection.media_type
    ids, filepaths = sample_collection.values(["id", "filepath"])
    media_types = itertools.repeat(media_type)

    inputs = list(zip(ids, filepaths, media_types))
    num_samples = len(inputs)

    if num_samples == 0:
        return

    logger.info("Computing %s metadata...", media_type)

    view = sample_collection.select_fields()
    with fou.ProgressBar(total=num_samples) as pb:
        with multiprocessing.Pool(processes=num_workers) as pool:
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
    use_local = foc.media_cache.is_local_or_cached(filepath)

    if media_type == fom.IMAGE and not foc.media_cache.config.stream_images:
        # Force image to be downloaded to compute its metadata
        use_local = True

    if not use_local:
        # Compute metadata for uncached remote media w/o downloading
        return foc.media_cache.get_remote_metadata(
            filepath, skip_failures=False
        )

    # This will download any uncached remote files
    local_path = foc.media_cache.get_local_path(
        filepath, download=True, skip_failures=False
    )

    if media_type == fom.IMAGE:
        return ImageMetadata.build_for(local_path)

    if media_type == fom.VIDEO:
        return VideoMetadata.build_for(local_path)

    return Metadata.build_for(local_path)
