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


def reencode_videos(sample_collection, delete_originals=False, **kwargs):
    """Re-encodes the videos in the given sample collection as MP4s that can be
    visualized in the FiftyOne App.

    The ``filepath`` of the samples are updated to point to the re-encoded
    videos.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        delete_originals (False): whether to delete the original videos after
            re-encoding
        **kwargs: keyword arguments for ``eta.core.video.FFmpeg(**kwargs)``
    """
    with fou.ProgressBar() as pb:
        with etav.FFmpeg(**kwargs) as ffmpeg:
            for sample in pb(sample_collection.select_fields()):
                inpath = sample.filepath
                outpath = os.path.splitext(inpath)[0] + ".mp4"

                # Must move original to avoid overwriting
                if outpath == inpath:
                    _inpath = inpath
                    inpath = etau.make_unique_path(inpath, suffix="-original")
                    etau.move_file(_inpath, inpath)

                # Re-encode video
                ffmpeg.run(inpath, outpath)

                sample.filepath = outpath
                sample.save()

                if delete_originals:
                    etau.delete_file(inpath)
