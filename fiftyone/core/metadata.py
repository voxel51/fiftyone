"""
Metadata stored in dataset samples.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

import eta.core.image as etai
import eta.core.utils as etau
import eta.core.video as etav

from fiftyone.core.odm.document import DynamicEmbeddedDocument
import fiftyone.core.fields as fof


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
