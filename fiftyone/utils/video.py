"""
Video utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os

import eta.core.image as etai
import eta.core.numutils as etan
import eta.core.utils as etau
import eta.core.video as etav

import fiftyone as fo
import fiftyone.core.aggregations as foa
import fiftyone.core.dataset as fod
import fiftyone.core.fields as fof
import fiftyone.core.media as fom
import fiftyone.core.utils as fou


logger = logging.getLogger(__name__)


def make_frames_dataset(
    sample_collection,
    sample_frames=True,
    frames_patt=None,
    size=None,
    min_size=None,
    max_size=None,
    force_sample=False,
    name=None,
):
    """Creates a dataset that contains one sample per video frame in the
    collection.

    The returned dataset will contain all frame-level fields and the ``tags``
    of each video as sample-level fields, as well as a ``frame_id`` field that
    records the ID of the corresponding frame in the input collection.

    When ``sample_frames`` is True (the default), this method samples each
    video in the collection into a directory of per-frame images with the same
    basename as the input video with frame numbers/format specified by
    ``frames_patt``.

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

    .. note::

        The returned dataset is independent from the source collection;
        modifying it will not affect the source collection.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        sample_frames (True): whether to sample the video frames. If False,
            the dataset cannot currently be viewed in the App
        frames_patt (None): a pattern specifying the filename/format to use to
            store the sampled frames, e.g., ``"%%06d.jpg"``. The default value
            is ``fiftyone.config.default_sequence_idx + fiftyone.config.default_image_ext``
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
        force_sample (False): whether to resample videos whose sampled frames
            already exist
        name (None): a name for the returned dataset

    Returns:
        a :class:`fiftyone.core.dataset.Dataset`
    """
    if sample_collection.media_type != fom.VIDEO:
        raise ValueError(
            "'%s' is not a video collection" % sample_collection.name
        )

    # We need frame counts
    sample_collection.compute_metadata()

    if sample_frames:
        if frames_patt is None:
            frames_patt = (
                fo.config.default_sequence_idx + fo.config.default_image_ext
            )

        images_patts, frame_counts, ids_to_sample = _parse_frames_collection(
            sample_collection, frames_patt, force_sample
        )

    #
    # Create dataset with proper schema
    #

    dataset = fod.Dataset(name=name)
    dataset.media_type = fom.IMAGE
    dataset.add_sample_field("_sample_id", fof.ObjectIdField)
    dataset.add_sample_field("frame_id", fof.StringField)

    frame_schema = sample_collection.get_frame_field_schema()
    dataset._sample_doc_cls.merge_field_schema(frame_schema)

    #
    # Convert videos to per-frame images, if requested and necessary
    #

    if sample_frames and ids_to_sample:
        logger.info("Sampling video frames...")
        sample_videos(
            sample_collection.select(ids_to_sample),
            frames_patt=frames_patt,
            size=size,
            min_size=min_size,
            max_size=max_size,
            force_sample=force_sample,
        )

    #
    # Populate samples
    #

    # This is necessary as some frames may not have `Frame` docs
    _initialize_frames(dataset, sample_collection, sample_frames)

    _merge_frame_labels(dataset, sample_collection)

    _finalize_frames(dataset)

    if sample_frames:
        _finalize_filepaths(dataset, images_patts, frame_counts)

    return dataset


def _parse_frames_collection(sample_collection, frames_patt, force_sample):
    sample_ids, video_paths, frame_counts = sample_collection.aggregate(
        [
            foa.Values("id"),
            foa.Values("filepath"),
            foa.Values("metadata.total_frame_count"),
        ]
    )

    images_patts = []
    ids_to_sample = []
    for sample_id, video_path in zip(sample_ids, video_paths):
        images_patt, found = _prep_for_sampling(video_path, frames_patt)
        images_patts.append(images_patt)
        if not found or force_sample:
            ids_to_sample.append(sample_id)

    return images_patts, frame_counts, ids_to_sample


def _initialize_frames(dataset, src_collection, sample_frames):
    project_fields = ["_sample_id", "frame_number", "tags"]
    if not sample_frames:
        project_fields.append("filepath")

    pipeline = src_collection._pipeline(detach_frames=True)
    pipeline.extend(
        [
            {
                "$set": {
                    "_sample_id": "$_id",
                    "frame_number": {
                        "$range": [
                            1,
                            {"$add": ["$metadata.total_frame_count", 1]},
                        ]
                    },
                }
            },
            {"$project": {f: True for f in project_fields}},
            {"$unset": "_id"},
            {"$unwind": "$frame_number"},
            {"$out": dataset._sample_collection_name},
        ]
    )

    src_collection._dataset._aggregate(pipeline=pipeline, attach_frames=False)


def _merge_frame_labels(dataset, src_collection):
    # We'll use this index to merge both now and in the opposite direction
    # when syncing the source collection
    index_spec = [("_sample_id", 1), ("frame_number", 1)]
    dataset._sample_collection.create_index(index_spec, unique=True)

    pipeline = src_collection._pipeline(frames_only=True)
    pipeline.extend(
        [
            {"$set": {"frame_id": {"$toString": "$_id"}}},
            {"$unset": "_id"},
            {
                "$merge": {
                    "into": dataset._sample_collection_name,
                    "on": ["_sample_id", "frame_number"],
                    "whenMatched": "merge",
                    "whenNotMatched": "insert",
                }
            },
        ]
    )

    src_collection._dataset._aggregate(pipeline=pipeline, attach_frames=False)


def _finalize_frames(dataset):
    dataset._sample_collection.update_many(
        {}, [{"$set": {"_media_type": "image", "_rand": {"$rand": {}}}}]
    )


def _finalize_filepaths(dataset, images_patts, frame_counts):
    filepaths = []
    for images_patt, frame_count in zip(images_patts, frame_counts):
        filepaths.extend(images_patt % fn for fn in range(1, frame_count + 1))

    dataset.set_values("filepath", filepaths)


def reencode_videos(
    sample_collection,
    force_reencode=True,
    delete_originals=False,
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
        verbose (False): whether to log the ``ffmpeg`` commands that are
            executed
        **kwargs: keyword arguments for ``eta.core.video.FFmpeg(**kwargs)``
    """
    if sample_collection.media_type != fom.VIDEO:
        raise ValueError(
            "Sample collection '%s' does not contain videos (media_type = "
            "'%s')" % (sample_collection.name, sample_collection.media_type)
        )

    _transform_videos(
        sample_collection,
        reencode=True,
        force_reencode=force_reencode,
        delete_originals=delete_originals,
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
        verbose (False): whether to log the ``ffmpeg`` commands that are
            executed
        **kwargs: keyword arguments for ``eta.core.video.FFmpeg(**kwargs)``
    """
    if sample_collection.media_type != fom.VIDEO:
        raise ValueError(
            "Sample collection '%s' does not contain videos (media_type = "
            "'%s')" % (sample_collection.name, sample_collection.media_type)
        )

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
        verbose=verbose,
        **kwargs
    )


def sample_videos(
    sample_collection,
    frames_patt=None,
    fps=None,
    min_fps=None,
    max_fps=None,
    size=None,
    min_size=None,
    max_size=None,
    force_sample=False,
    delete_originals=False,
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
        fps (None): an optional frame rate at which to sample frames
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
        force_sample (False): whether to resample videos whose sampled frames
            already exist
        delete_originals (False): whether to delete the original videos after
            sampling
        verbose (False): whether to log the ``ffmpeg`` commands that are
            executed
        **kwargs: keyword arguments for ``eta.core.video.FFmpeg(**kwargs)``
    """
    if sample_collection.media_type != fom.VIDEO:
        raise ValueError(
            "Sample collection '%s' does not contain videos (media_type = "
            "'%s')" % (sample_collection.name, sample_collection.media_type)
        )

    _transform_videos(
        sample_collection,
        fps=fps,
        min_fps=min_fps,
        max_fps=max_fps,
        size=size,
        min_size=min_size,
        max_size=max_size,
        sample_frames=True,
        frames_patt=frames_patt,
        force_reencode=force_sample,
        delete_originals=delete_originals,
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
    fps=None,
    min_fps=None,
    max_fps=None,
    size=None,
    min_size=None,
    max_size=None,
    verbose=False,
    **kwargs
):
    """Samples the video into a directory of per-frame images according to the
    provided parameters using ``ffmpeg``.

    Args:
        input_path: the path to the input video
        output_patt: a pattern like ``/path/to/images/%%06d.jpg`` specifying
            the filename/format to write the sampled frames
        fps (None): an optional frame rate at which to sample the frames
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
        verbose (False): whether to log the ``ffmpeg`` command that is executed
        **kwargs: keyword arguments for ``eta.core.video.FFmpeg(**kwargs)``
    """
    _transform_video(
        input_path,
        output_patt,
        fps=fps,
        min_fps=min_fps,
        max_fps=max_fps,
        size=size,
        min_size=min_size,
        max_size=max_size,
        reencode=True,
        force_reencode=True,
        verbose=verbose,
        **kwargs
    )


def _transform_videos(
    sample_collection,
    fps=None,
    min_fps=None,
    max_fps=None,
    size=None,
    min_size=None,
    max_size=None,
    sample_frames=False,
    frames_patt=None,
    reencode=False,
    force_reencode=False,
    delete_originals=False,
    verbose=False,
    **kwargs
):
    if sample_frames:
        reencode = True
        if frames_patt is None:
            frames_patt = (
                fo.config.default_sequence_idx + fo.config.default_image_ext
            )

    with fou.ProgressBar() as pb:
        for sample in pb(sample_collection.select_fields()):
            inpath = sample.filepath

            if sample_frames:
                outpath, found = _prep_for_sampling(inpath, frames_patt)
                if found and not force_reencode:
                    continue

            elif reencode:
                outpath = os.path.splitext(inpath)[0] + ".mp4"
            else:
                outpath = inpath

            _transform_video(
                inpath,
                outpath,
                fps=fps,
                min_fps=min_fps,
                max_fps=max_fps,
                size=size,
                min_size=min_size,
                max_size=max_size,
                reencode=reencode,
                force_reencode=force_reencode,
                delete_original=delete_originals,
                verbose=verbose,
                **kwargs
            )

            if not sample_frames:
                sample.filepath = outpath
                sample.save()


def _prep_for_sampling(inpath, frames_patt):
    outdir = os.path.splitext(inpath)[0]
    outpatt = os.path.join(outdir, frames_patt)

    # If the first frame exists, assume the video has already been sampled
    found = os.path.exists(outpatt % 1)

    return outpatt, found


def _transform_video(
    inpath,
    outpath,
    fps=None,
    min_fps=None,
    max_fps=None,
    size=None,
    min_size=None,
    max_size=None,
    reencode=False,
    force_reencode=False,
    delete_original=False,
    verbose=False,
    **kwargs
):
    inpath = os.path.abspath(os.path.expanduser(inpath))
    outpath = os.path.abspath(os.path.expanduser(outpath))
    in_ext = os.path.splitext(inpath)[1]
    out_ext = os.path.splitext(outpath)[1]

    if (
        fps is not None
        or min_fps is not None
        or max_fps is not None
        or size is not None
        or min_size is not None
        or max_size is not None
    ):
        fps, size = _parse_parameters(
            inpath, fps, min_fps, max_fps, size, min_size, max_size
        )

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
        fps is not None
        or size is not None
        or reencode
        or in_ext != out_ext
        or force_reencode
    )

    if (inpath == outpath) and should_reencode:
        _inpath = inpath
        inpath = etau.make_unique_path(inpath, suffix="-original")
        etau.move_file(_inpath, inpath)

    diff_path = inpath != outpath

    if should_reencode:
        with etav.FFmpeg(fps=fps, size=size, **kwargs) as ffmpeg:
            ffmpeg.run(inpath, outpath, verbose=verbose)

    elif diff_path:
        etau.copy_file(inpath, outpath)

    if delete_original and diff_path:
        etau.delete_file(inpath)


def _parse_parameters(
    video_path, fps, min_fps, max_fps, size, min_size, max_size
):
    video_metadata = etav.VideoMetadata.build_for(video_path)

    ifps = video_metadata.frame_rate
    isize = video_metadata.frame_size

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

    return ofps, osize
