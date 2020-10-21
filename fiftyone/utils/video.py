"""
Video utilities.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import random
import string

import eta.core.utils as etau
import eta.core.video as etav

import fiftyone.core.utils as fou


def reencode_videos(
    sample_collection,
    delete_originals=False,
    ext=".mp4",
    verbose=False,
    **kwargs
):
    """Re-encodes the videos in the sample collection as MP4s that can be
    visualized in the FiftyOne App.

    The ``filepath`` of the samples are updated to point to the re-encoded
    videos.

    You can configure parameters of the re-encoding such as codec, compression,
    resolution, and frame rate by passing keyword arguments for
    ``eta.core.video.FFmpeg(**kwargs)`` to this function.

    By default, the re-encoding is performed via the following ``ffmpeg``
    command::

        ffmpeg \\
            -loglevel error -vsync 0 -i $INPUT_PATH \\
            -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -vsync 0 -an \\
            $OUTPUT_PATH

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        delete_originals (False): whether to delete the original videos after
            re-encoding
        ext (".mp4"): the video container format to use
        verbose (False): whether to log the ``ffmpeg`` commands that are
            executed
        **kwargs: keyword arguments for ``eta.core.video.FFmpeg(**kwargs)``
    """
    with fou.ProgressBar() as pb:
        with etav.FFmpeg(**kwargs) as ffmpeg:
            for sample in pb(sample_collection.select_fields()):
                inpath = sample.filepath
                outpath = os.path.splitext(inpath)[0] + ext

                # Must move original to avoid overwriting
                if outpath == inpath:
                    _inpath = inpath
                    inpath = etau.make_unique_path(inpath, suffix="-original")
                    etau.move_file(_inpath, inpath)

                # Re-encode video
                ffmpeg.run(inpath, outpath, verbose=verbose)

                sample.filepath = outpath
                sample.save()

                if delete_originals:
                    etau.delete_file(inpath)
