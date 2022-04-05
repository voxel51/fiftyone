"""
Video utilities.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import logging
import os

import eta.core.frameutils as etaf
import eta.core.image as etai
import eta.core.numutils as etan
import eta.core.utils as etau
import eta.core.video as etav

import fiftyone as fo
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou
import fiftyone.core.validation as fov


logger = logging.getLogger(__name__)


def extract_clip(
    video_path,
    output_path,
    support=None,
    timestamps=None,
    metadata=None,
    fast=False,
):
    """Extracts the specified clip from the video.

    Provide either ``suppport`` or ``timestamps`` to this method.

    When fast=False, the following ffmpeg command is used::

        # Slower, more accurate option
        ffmpeg -ss <start_time> -i <video_path> -t <duration> <output_path>

    When fast is True, the following two-step ffmpeg process is used::

        # Faster, less accurate option
        ffmpeg -ss <start_time> -i <video_path> -t <duration> -c copy <tmp_path>
        ffmpeg -i <tmp_path> <output_path>

    Args:
        video_path: the path to the video
        output_path: the path to write the extracted clip
        support (None): the ``[first, last]`` frame number range to clip
        timestamps (None): the ``[start, stop]`` timestamps to clip, in seconds
        metadata (None): the :class:`fiftyone.core.metadata.VideoMetadata`
            for the video
        fast (False): whether to use a faster-but-potentially-less-accurate
            strategy to extract the clip
    """
    if timestamps is None and support is None:
        raise ValueError("Either `support` or `timestamps` must be provided")

    if timestamps is None:
        if metadata is None:
            metadata = fom.VideoMetadata.build_for(video_path)

        total_frame_count = metadata.total_frame_count
        duration = metadata.duration
        first, last = support
        timestamps = [
            etaf.frame_number_to_timestamp(first, total_frame_count, duration),
            etaf.frame_number_to_timestamp(last, total_frame_count, duration),
        ]

    start_time = timestamps[0]
    duration = timestamps[1] - start_time

    etav.extract_clip(
        video_path,
        output_path,
        start_time=start_time,
        duration=duration,
        fast=fast,
    )


def reencode_videos(
    sample_collection,
    force_reencode=True,
    delete_originals=False,
    skip_failures=False,
    verbose=False,
    **kwargs
):
    """Re-encodes the videos in the sample collection as H.264 MP4s that can be
    visualized in the FiftyOne App.

    The ``filepath`` of the samples are updated to point to the re-encoded
    videos.

    By default, the re-encoding is performed via the following ``ffmpeg``
    command::

        ffmpeg \\
            -loglevel error -vsync 0 -i $INPUT_PATH \\
            -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -vsync 0 -an \\
            $OUTPUT_PATH

    You can configure parameters of the re-encoding such as codec and
    compression by passing keyword arguments for
    ``eta.core.video.FFmpeg(**kwargs)`` to this function.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        force_reencode (True): whether to re-encode videos that are already
            MP4s
        delete_originals (False): whether to delete the original videos after
            re-encoding
        skip_failures (False): whether to gracefully continue without raising
            an error if a video cannot be re-encoded
        verbose (False): whether to log the ``ffmpeg`` commands that are
            executed
        **kwargs: keyword arguments for ``eta.core.video.FFmpeg(**kwargs)``
    """
    fov.validate_video_collection(sample_collection)

    _transform_videos(
        sample_collection,
        reencode=True,
        force_reencode=force_reencode,
        delete_originals=delete_originals,
        skip_failures=skip_failures,
        verbose=verbose,
        **kwargs
    )


def transform_videos(
    sample_collection,
    fps=None,
    min_fps=None,
    max_fps=None,
    size=None,
    min_size=None,
    max_size=None,
    reencode=False,
    force_reencode=False,
    delete_originals=False,
    skip_failures=False,
    verbose=False,
    **kwargs
):
    """Transforms the videos in the sample collection according to the provided
    parameters using ``ffmpeg``.

    The ``filepath`` of the samples are updated to point to the transformed
    videos.

    In addition to the size and frame rate parameters, if ``reencode == True``,
    the following basic ``ffmpeg`` command structure is used to re-encode the
    videos as H.264 MP4s::

        ffmpeg \\
            -loglevel error -vsync 0 -i $INPUT_PATH \\
            -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -vsync 0 -an \\
            $OUTPUT_PATH

    .. note::

        This method will not update the ``metadata`` field of the collection
        after transforming. You can repopulate the ``metadata` field if needed
        by calling::

            sample_collection.compute_metadata(overwrite=True)

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        fps (None): an optional frame rate at which to resample the videos
        min_fps (None): an optional minimum frame rate. Videos with frame rate
            below this value are upsampled
        max_fps (None): an optional maximum frame rate. Videos with frame rate
            exceeding this value are downsampled
        size (None): an optional ``(width, height)`` for each frame. One
            dimension can be -1, in which case the aspect ratio is preserved
        min_size (None): an optional minimum ``(width, height)`` for each
            frame. A dimension can be -1 if no constraint should be applied.
            The frames are resized (aspect-preserving) if necessary to meet
            this constraint
        max_size (None): an optional maximum ``(width, height)`` for each
            frame. A dimension can be -1 if no constraint should be applied.
            The frames are resized (aspect-preserving) if necessary to meet
            this constraint
        reencode (False): whether to re-encode the videos as H.264 MP4s
        force_reencode (False): whether to re-encode videos whose parameters
            already satisfy the specified values
        delete_originals (False): whether to delete the original videos after
            re-encoding
        skip_failures (False): whether to gracefully continue without raising
            an error if a video cannot be transformed
        verbose (False): whether to log the ``ffmpeg`` commands that are
            executed
        **kwargs: keyword arguments for ``eta.core.video.FFmpeg(**kwargs)``
    """
    fov.validate_video_collection(sample_collection)

    _transform_videos(
        sample_collection,
        fps=fps,
        min_fps=min_fps,
        max_fps=max_fps,
        size=size,
        min_size=min_size,
        max_size=max_size,
        reencode=reencode,
        force_reencode=force_reencode,
        delete_originals=delete_originals,
        skip_failures=skip_failures,
        verbose=verbose,
        **kwargs
    )


def sample_videos(
    sample_collection,
    frames_patt=None,
    frames=None,
    fps=None,
    max_fps=None,
    size=None,
    min_size=None,
    max_size=None,
    original_frame_numbers=True,
    force_sample=False,
    save_filepaths=False,
    delete_originals=False,
    skip_failures=False,
    verbose=False,
    **kwargs
):
    """Samples the videos in the sample collection into directories of
    per-frame images according to the provided parameters using ``ffmpeg``.

    The frames for each sample are stored in a directory with the same basename
    as the input video with frame numbers/format specified by ``frames_patt``.

    For example, if ``frames_patt = "%%06d.jpg"``, then videos with the
    following paths::

        /path/to/video1.mp4
        /path/to/video2.mp4
        ...

    would be sampled as follows::

        /path/to/video1/
            000001.jpg
            000002.jpg
            ...
        /path/to/video2/
            000001.jpg
            000002.jpg
            ...

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        frames_patt (None): a pattern specifying the filename/format to use to
            store the sampled frames, e.g., ``"%%06d.jpg"``. The default value
            is ``fiftyone.config.default_sequence_idx + fiftyone.config.default_image_ext``
        frames (None): an optional list of lists defining specific frames to
            sample from each video. Entries can also be None, in which case all
            frames will be sampled. If provided, ``fps`` and ``max_fps`` are
            ignored
        fps (None): an optional frame rate at which to sample frames
        max_fps (None): an optional maximum frame rate. Videos with frame rate
            exceeding this value are downsampled
        size (None): an optional ``(width, height)`` for each frame. One
            dimension can be -1, in which case the aspect ratio is preserved
        min_size (None): an optional minimum ``(width, height)`` for each
            frame. A dimension can be -1 if no constraint should be applied.
            The frames are resized (aspect-preserving) if necessary to meet
            this constraint
        max_size (None): an optional maximum ``(width, height)`` for each
            frame. A dimension can be -1 if no constraint should be applied.
            The frames are resized (aspect-preserving) if necessary to meet
            this constraint
        original_frame_numbers (True): whether to use the original frame
            numbers when writing the output frames (True) or to instead reindex
            the frames as 1, 2, ... (False)
        force_sample (False): whether to resample videos whose sampled frames
            already exist
        save_filepaths (False): whether to save the sampled frame paths in a
            ``filepath`` field of each frame of the input collection
        delete_originals (False): whether to delete the original videos after
            sampling
        skip_failures (False): whether to gracefully continue without raising
            an error if a video cannot be sampled
        verbose (False): whether to log the ``ffmpeg`` commands that are
            executed
        **kwargs: keyword arguments for ``eta.core.video.FFmpeg(**kwargs)``
    """
    fov.validate_video_collection(sample_collection)

    _transform_videos(
        sample_collection,
        frames=frames,
        fps=fps,
        max_fps=max_fps,
        size=size,
        min_size=min_size,
        max_size=max_size,
        sample_frames=True,
        original_frame_numbers=original_frame_numbers,
        frames_patt=frames_patt,
        force_reencode=force_sample,
        save_filepaths=save_filepaths,
        delete_originals=delete_originals,
        skip_failures=skip_failures,
        verbose=verbose,
        **kwargs
    )


def reencode_video(input_path, output_path, verbose=False, **kwargs):
    """Re-encodes the video using the H.264 codec.

    By default, the re-encoding is performed via the following ``ffmpeg``
    command::

        ffmpeg \\
            -loglevel error -vsync 0 -i $INPUT_PATH \\
            -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -vsync 0 -an \\
            $OUTPUT_PATH

    You can configure parameters of the re-encoding such as codec and
    compression by passing keyword arguments for
    ``eta.core.video.FFmpeg(**kwargs)`` to this function.

    Args:
        input_path: the path to the input video
        output_path: the path to write the output video
        verbose (False): whether to log the ``ffmpeg`` command that is executed
        **kwargs: keyword arguments for ``eta.core.video.FFmpeg(**kwargs)``
    """
    _transform_video(
        input_path,
        output_path,
        reencode=True,
        force_reencode=True,
        verbose=verbose,
        **kwargs
    )


def transform_video(
    input_path,
    output_path,
    fps=None,
    min_fps=None,
    max_fps=None,
    size=None,
    min_size=None,
    max_size=None,
    reencode=False,
    verbose=False,
    **kwargs
):
    """Transforms the video according to the provided parameters using
    ``ffmpeg``.

    In addition to the size and frame rate parameters, if ``reencode == True``,
    the following basic ``ffmpeg`` command structure is used to re-encode the
    video as an H.264 MP4::

        ffmpeg \\
            -loglevel error -vsync 0 -i $INPUT_PATH \\
            -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -vsync 0 -an \\
            $OUTPUT_PATH

    Args:
        input_path: the path to the input video
        output_path: the path to write the output video
        fps (None): an optional frame rate at which to resample the videos
        min_fps (None): an optional minimum frame rate. Videos with frame rate
            below this value are upsampled
        max_fps (None): an optional maximum frame rate. Videos with frame rate
            exceeding this value are downsampled
        size (None): an optional ``(width, height)`` for each frame. One
            dimension can be -1, in which case the aspect ratio is preserved
        min_size (None): an optional minimum ``(width, height)`` for each
            frame. A dimension can be -1 if no constraint should be applied.
            The frames are resized (aspect-preserving) if necessary to meet
            this constraint
        max_size (None): an optional maximum ``(width, height)`` for each
            frame. A dimension can be -1 if no constraint should be applied.
            The frames are resized (aspect-preserving) if necessary to meet
            this constraint
        reencode (False): whether to reencode the video (see main description)
        verbose (False): whether to log the ``ffmpeg`` command that is executed
        **kwargs: keyword arguments for ``eta.core.video.FFmpeg(**kwargs)``
    """
    _transform_video(
        input_path,
        output_path,
        fps=fps,
        min_fps=min_fps,
        max_fps=max_fps,
        size=size,
        min_size=min_size,
        max_size=max_size,
        reencode=reencode,
        verbose=verbose,
        **kwargs
    )


def sample_video(
    input_path,
    output_patt,
    frames=None,
    fps=None,
    max_fps=None,
    size=None,
    min_size=None,
    max_size=None,
    original_frame_numbers=True,
    verbose=False,
    **kwargs
):
    """Samples the video into a directory of per-frame images according to the
    provided parameters using ``ffmpeg``.

    Args:
        input_path: the path to the input video
        output_patt: a pattern like ``/path/to/images/%%06d.jpg`` specifying
            the filename/format to write the sampled frames
        frames (None): an iterable of frame numbers to sample. If provided,
            ``fps`` and ``max_fps`` are ignored
        fps (None): an optional frame rate at which to sample the frames
        max_fps (None): an optional maximum frame rate. Videos with frame rate
            exceeding this value are downsampled
        size (None): an optional ``(width, height)`` for each frame. One
            dimension can be -1, in which case the aspect ratio is preserved
        min_size (None): an optional minimum ``(width, height)`` for each
            frame. A dimension can be -1 if no constraint should be applied.
            The frames are resized (aspect-preserving) if necessary to meet
            this constraint
        max_size (None): an optional maximum ``(width, height)`` for each
            frame. A dimension can be -1 if no constraint should be applied.
            The frames are resized (aspect-preserving) if necessary to meet
            this constraint
        original_frame_numbers (True): whether to use the original frame
            numbers when writing the output frames (True) or to instead reindex
            the frames as 1, 2, ... (False)
        verbose (False): whether to log the ``ffmpeg`` command that is executed
        **kwargs: keyword arguments for ``eta.core.video.FFmpeg(**kwargs)``
    """
    _transform_video(
        input_path,
        output_patt,
        frames=frames,
        fps=fps,
        max_fps=max_fps,
        size=size,
        min_size=min_size,
        max_size=max_size,
        sample_frames=True,
        original_frame_numbers=original_frame_numbers,
        force_reencode=True,
        verbose=verbose,
        **kwargs
    )


def sample_frames_uniform(
    frame_rate,
    total_frame_count=None,
    support=None,
    fps=None,
    max_fps=None,
    always_sample_last=False,
):
    """Returns a list of frame numbers sampled uniformly according to the
    provided parameters.

    Args:
        frame_rate: the video frame rate
        total_frame_count (None): the total number of frames in the video
        support (None): a ``[first, last]`` frame range from which to sample
        fps (None): a frame rate at which to sample frames
        max_fps (None): a maximum frame rate at which to sample frames
        always_sample_last (False): whether to always sample the last frame

    Returns:
        a list of frame numbers, or None if all frames should be sampled
    """
    if support is not None:
        first, last = support
    elif total_frame_count is None:
        return None
    else:
        first = 1
        last = total_frame_count

    if frame_rate is None:
        if support is None:
            return None

        return list(range(first, last + 1))

    if last < first:
        return []

    ifps = frame_rate

    if fps is not None:
        ofps = fps
    else:
        ofps = ifps

    if max_fps is not None:
        ofps = min(ofps, max_fps)

    if ofps >= ifps:
        if support is None:
            return None

        return list(range(first, last + 1))

    x = first
    fn_last = first
    beta = ifps / ofps
    sample_frames = [x]
    while x <= last:
        x += beta
        fn = int(round(x))
        if fn_last < fn <= last:
            sample_frames.append(fn)
            fn_last = fn

    if always_sample_last and fn_last < last:
        sample_frames.append(last)

    return sample_frames


def concat_videos(input_paths, output_path, verbose=False):
    """Concatenates the given list of videos, in order, into a single video.

    Args:
        input_paths: a list of video paths
        output_path: the path to write the output video
        verbose (False): whether to log the ``ffmpeg`` command that is executed
    """
    with etau.TempDir() as tmp_dir:
        input_list_path = os.path.join(tmp_dir, "input_list.txt")
        with open(input_list_path, "w") as f:
            f.write("\n".join(["file '%s'" % path for path in input_paths]))

        in_opts = ["-f", "concat", "-safe", "0"]
        out_opts = ["-c", "copy"]

        with etav.FFmpeg(in_opts=in_opts, out_opts=out_opts) as ffmpeg:
            ffmpeg.run(input_list_path, output_path, verbose=verbose)


def _transform_videos(
    sample_collection,
    frames=None,
    fps=None,
    min_fps=None,
    max_fps=None,
    size=None,
    min_size=None,
    max_size=None,
    sample_frames=False,
    frames_patt=None,
    original_frame_numbers=True,
    reencode=False,
    force_reencode=False,
    save_filepaths=False,
    delete_originals=False,
    skip_failures=False,
    verbose=False,
    **kwargs
):
    if sample_frames:
        reencode = True
        if frames_patt is None:
            frames_patt = (
                fo.config.default_sequence_idx + fo.config.default_image_ext
            )

    view = sample_collection.select_fields()

    if frames is None:
        frames = itertools.repeat(None)

    with fou.ProgressBar(total=len(view)) as pb:
        for sample, _frames in pb(zip(view, frames)):
            inpath = sample.filepath

            if sample_frames:
                outdir = os.path.splitext(inpath)[0]
                outpath = os.path.join(outdir, frames_patt)

                # If sampling was not forced and the first frame exists, assume
                # that all frames exist
                fn = _frames[0] if _frames else 1
                if not force_reencode and os.path.isfile(outpath % fn):
                    continue
            elif reencode:
                root, ext = os.path.splitext(inpath)
                if ext.lower() != ".mp4":
                    outpath = root + ".mp4"
                else:
                    outpath = inpath
            else:
                outpath = inpath

            _transform_video(
                inpath,
                outpath,
                frames=_frames,
                fps=fps,
                min_fps=min_fps,
                max_fps=max_fps,
                size=size,
                min_size=min_size,
                max_size=max_size,
                original_frame_numbers=original_frame_numbers,
                reencode=reencode,
                force_reencode=force_reencode,
                delete_original=delete_originals,
                skip_failures=skip_failures,
                verbose=verbose,
                **kwargs
            )

            if save_filepaths and sample_frames:
                if _frames is None:
                    try:
                        if sample.metadata is None:
                            sample.compute_metadata()

                        _frames = range(
                            1, sample.metadata.total_frame_count + 1
                        )
                    except Exception as e:
                        if not skip_failures:
                            raise

                        _frames = []
                        logger.warning(e)

                for fn in _frames:
                    frame_path = outpath % fn
                    if os.path.isfile(frame_path):
                        sample.frames[fn]["filepath"] = frame_path

                sample.save()

            if outpath != inpath and not sample_frames:
                sample.filepath = outpath
                sample.save()


def _transform_video(
    inpath,
    outpath,
    frames=None,
    fps=None,
    min_fps=None,
    max_fps=None,
    size=None,
    min_size=None,
    max_size=None,
    sample_frames=False,
    original_frame_numbers=True,
    reencode=False,
    force_reencode=False,
    delete_original=False,
    skip_failures=False,
    verbose=False,
    **kwargs
):
    inpath = fou.normalize_path(inpath)
    outpath = fou.normalize_path(outpath)
    in_ext = os.path.splitext(inpath)[1]
    out_ext = os.path.splitext(outpath)[1]

    if frames is not None:
        if not original_frame_numbers:
            raise ValueError(
                "`original_frame_numbers` must be True when `frames` to "
                "sample are explicitly specified"
            )

        fps = None
        min_fps = None
        max_fps = None

    did_transform = False

    try:
        if (
            fps is not None
            or min_fps is not None
            or max_fps is not None
            or size is not None
            or min_size is not None
            or max_size is not None
        ):
            fps, size, _frames = _parse_parameters(
                inpath,
                fps,
                min_fps,
                max_fps,
                size,
                min_size,
                max_size,
                sample_frames,
                original_frame_numbers,
            )

            if frames is None:
                frames = _frames

        if reencode:
            # Use default reencoding parameters from ``eta.core.video.FFmpeg``
            kwargs["in_opts"] = None
            kwargs["out_opts"] = None
        else:
            # No reencoding parameters
            if "in_opts" not in kwargs:
                kwargs["in_opts"] = []

            if "out_opts" not in kwargs:
                kwargs["out_opts"] = []

        should_reencode = (
            force_reencode
            or fps is not None
            or size is not None
            or in_ext.lower() != out_ext.lower()
        )

        if (inpath == outpath) and should_reencode:
            _inpath = inpath
            inpath = etau.make_unique_path(inpath, suffix="-original")
            etau.move_file(_inpath, inpath)

        diff_path = inpath != outpath

        if frames is not None:
            etav.sample_select_frames(
                inpath, frames, output_patt=outpath, size=size, fast=True
            )
            did_transform = True
        elif not etav.is_video_mime_type(outpath):
            with etav.FFmpeg(fps=fps, size=size, **kwargs) as ffmpeg:
                ffmpeg.run(inpath, outpath, verbose=verbose)

            did_transform = True
        elif should_reencode:
            with etav.FFmpeg(fps=fps, size=size, **kwargs) as ffmpeg:
                ffmpeg.run(inpath, outpath, verbose=verbose)

            did_transform = True
        elif diff_path:
            etau.copy_file(inpath, outpath)

        if delete_original and diff_path:
            etau.delete_file(inpath)
    except Exception as e:
        if not skip_failures:
            raise

        logger.warning(e)

    return did_transform


def _parse_parameters(
    video_path,
    fps,
    min_fps,
    max_fps,
    size,
    min_size,
    max_size,
    sample_frames,
    original_frame_numbers,
):
    metadata = fom.VideoMetadata.build_for(video_path)

    ifps = metadata.frame_rate
    isize = (metadata.frame_width, metadata.frame_height)
    iframe_count = metadata.total_frame_count

    ofps = fps or -1
    min_fps = min_fps or -1
    max_fps = max_fps or -1

    if ofps < 0:
        ofps = ifps

    if 0 < ofps < min_fps:
        ofps = min_fps

    if 0 < max_fps < ofps:
        ofps = max_fps

    if size is not None:
        osize = etai.infer_missing_dims(size, isize)
    else:
        osize = isize

    osize = etai.clip_frame_size(osize, min_size=min_size, max_size=max_size)

    same_fps = ifps == ofps
    same_size = osize == isize

    # ffmpeg requires that height/width be even
    osize = [etan.round_to_even(x) for x in osize]

    if same_fps:
        ofps = None

    if same_size:
        osize = None

    if sample_frames and original_frame_numbers and ofps is not None:
        if ofps > ifps:
            # pylint: disable=bad-string-format-type
            raise ValueError(
                "Cannot maintain original frame numbers when requested frame "
                "rate (%f) exceeds native frame rate (%f) of video '%s'"
                % (ofps, ifps, video_path)
            )

        frames = sample_frames_uniform(
            ifps, total_frame_count=iframe_count, fps=ofps
        )
    else:
        frames = None

    return ofps, osize, frames
