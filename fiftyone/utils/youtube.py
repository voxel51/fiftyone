"""
Utilities for working with `YouTube <https://youtube.com>`.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import importlib
from importlib import metadata
import itertools
import logging
import multiprocessing.dummy
import os
import subprocess
import json

import numpy as np

import eta.core.utils as etau
import eta.core.video as etav

import fiftyone.core.utils as fou


def _ensure_ytdlp():
    fou.ensure_package("yt-dlp>=2023.0")


ytdlp = fou.lazy_import("yt_dlp", callback=_ensure_ytdlp)


logger = logging.getLogger(__name__)


def download_youtube_videos(
    urls,
    download_dir=None,
    video_paths=None,
    clip_segments=None,
    ext=".mp4",
    only_progressive=True,
    resolution="highest",
    max_videos=None,
    num_workers=None,
    skip_failures=True,
    quiet=False,
):
    """Downloads a list of YouTube videos.

    The ``urls`` argument accepts a list of YouTube "watch" URLs::

        urls = [
            "https://www.youtube.com/watch?v=-0URMJE8_PB",
            ...,
        ]

    Use either the ``download_dir`` or ``video_paths`` argument to specify
    where to download each video.

    You can use the optional ``clip_segments`` argument to specify a specific
    segment, in seconds, of each video to download::

        clip_segments = [
            (10, 25),
            (11.1, 20.2),
            None,               # entire video
            (None, 8.0),        # through beginning of video
            (8.0, None),        # through end of video
            ...
        ]

    You can also use the optional ``ext`` and ``resolution`` arguments to
    specify a deisred video codec and resolution to download, if possible.

    YouTube videos are regularly taken down. Therefore, this method provides an
    optional ``max_videos`` argument that you can use in conjunction with
    ``skip_failures=True`` and a large list of possibly non-existent videos in
    ``urls`` in cases where you need a certain number of videos to be
    successfully downloaded but are willing to tolerate failures.

    Args:
        urls: a list of YouTube URLs to download
        download_dir (None): a directory in which to store the downloaded
            videos
        video_paths (None): a list of paths to which to download the videos.
            When downloading entire videos, a stream matching the video format
            implied by each file's extension is downloaded, if available, or
            else the extension of the video path is **changed** to match the
            available stream's format
        clip_segments (None): a list of ``(first, last)`` tuples defining a
            specific segment of each video to download
        ext (".mp4"): a video format to download for each video, if possible.
            Only applicable when a ``download_dir`` is used. This format will
            be respected if such a stream exists, otherwise the format of the
            best available stream is used. Set this value to ``None`` if you
            want to download the stream with the best match for ``resolution``
            and ``progressive`` regardless of format
        only_progressive (True): whether to only download progressive streams,
            if possible. Progressive streams contain both audio and video
            tracks and are typically only available at <= 720p resolution
        resolution ("highest"): a desired stream resolution to download. This
            filter is applied after respecting the desired video format and
            ``only_progressive`` restriction, if applicable. The supported
            values are:

            -   ``"highest"`` (default): download the highest resolution stream
            -   ``"lowest"``:  download the lowest resolution stream
            -   A target resolution like ``"1080p"``. In this case, the stream
                whose resolution is closest to this target value is downloaded
        max_videos (None): the maximum number of videos to successfully
            download. By default, all videos are downloaded
        num_workers (None): a suggested number of threads/processes to use when
            downloading videos
        skip_failures (True): whether to gracefully continue without raising
            an error if a video cannot be downloaded
        quiet (False): whether to suppress logging, except for a progress bar

    Returns:
        a tuple of

        -   **downloaded**: a dict mapping integer indexes into ``urls`` to
            paths of successfully downloaded videos
        -   **errors**: a dict mapping integer indexes into ``urls`` to error
            messages for videos that were attempted to be downloaded, but
            failed
    """
    use_threads = clip_segments is None
    num_workers = _parse_num_workers(num_workers, use_threads=use_threads)

    if max_videos is None:
        max_videos = len(urls)

    with etau.TempDir() as tmp_dir:
        tasks = _build_tasks_list(
            urls,
            download_dir,
            video_paths,
            clip_segments,
            tmp_dir,
            ext,
            only_progressive,
            resolution,
        )

        if num_workers <= 1:
            downloaded, errors = _download(
                tasks, max_videos, skip_failures, quiet
            )
        else:
            downloaded, errors = _download_multi(
                tasks,
                max_videos,
                skip_failures,
                quiet,
                num_workers,
                use_threads,
            )

    return downloaded, errors


def _parse_num_workers(num_workers, use_threads=False):
    if use_threads:
        return fou.recommend_thread_pool_workers(num_workers)

    return fou.recommend_process_pool_workers(num_workers)


def _build_tasks_list(
    urls,
    download_dir,
    video_paths,
    clip_segments,
    tmp_dir,
    ext,
    only_progressive,
    resolution,
):
    if video_paths is None and download_dir is None:
        raise ValueError("Either `download_dir` or `video_paths` are required")

    if video_paths is not None and download_dir is not None:
        raise ValueError(
            "Only one of `download_dir` or `video_paths` can be provided"
        )

    if download_dir is None:
        ext = None

    if not etau.is_str(resolution) or (
        resolution not in ("highest", "lowest")
        and not resolution.endswith("p")
    ):
        raise ValueError(
            "Invalid resolution=%s. The supported values are 'highest', "
            "'lowest', and strings like '1080p', '720p', ..." % resolution
        )

    if resolution.endswith("p"):
        resolution = int(resolution[:-1])

    if video_paths is None:
        video_paths = itertools.repeat(None)

    if clip_segments is None:
        clip_segments = itertools.repeat(clip_segments)
    else:
        clip_segments = list(clip_segments)

        # Replace all variations of full video downloads with `None` so that
        # the most optimized download logic is used
        for idx, clip_segment in enumerate(clip_segments):
            if (
                clip_segment is not None
                and (clip_segment[0] is None or clip_segment[0] <= 0)
                and clip_segment[1] is None
            ):
                clip_segments[idx] = None

    return list(
        zip(
            range(len(urls)),
            urls,
            itertools.repeat(download_dir),
            video_paths,
            clip_segments,
            itertools.repeat(tmp_dir),
            itertools.repeat(ext),
            itertools.repeat(only_progressive),
            itertools.repeat(resolution),
        )
    )


def _download(tasks, max_videos, skip_failures, quiet):
    downloaded = {}
    errors = {}

    with fou.ProgressBar(total=max_videos, iters_str="videos") as pb:
        for task in tasks:
            idx, url, video_path, error, warnings = _do_download(task)

            if warnings and not quiet:
                for msg in warnings:
                    logger.warning(msg)

            if error:
                msg = "Failed to download video '%s': %s" % (url, error)
                if skip_failures:
                    if not quiet:
                        logger.warning(msg)
                else:
                    raise ValueError(msg)

                errors[idx] = error
                pb.draw()
            else:
                pb.update()
                downloaded[idx] = video_path
                if len(downloaded) >= max_videos:
                    return downloaded, errors

    return downloaded, errors


def _download_multi(
    tasks, max_videos, skip_failures, quiet, num_workers, use_threads
):
    downloaded = {}
    errors = {}

    with fou.ProgressBar(total=max_videos, iters_str="videos") as pb:
        if use_threads:
            ctx = multiprocessing.dummy
        else:
            ctx = fou.get_multiprocessing_context()

        with ctx.Pool(num_workers) as pool:
            for idx, url, video_path, error, warnings in pool.imap_unordered(
                _do_download, tasks
            ):
                if warnings and not quiet:
                    for msg in warnings:
                        logger.warning(msg)

                if error:
                    msg = "Failed to download video '%s': %s" % (url, error)
                    if skip_failures:
                        if not quiet:
                            logger.warning(msg)
                    else:
                        raise ValueError(msg)

                    errors[idx] = error
                    pb.draw()
                else:
                    pb.update()
                    downloaded[idx] = video_path
                    if len(downloaded) >= max_videos:
                        return downloaded, errors

    return downloaded, errors


def _do_download(task):
    (
        idx,
        url,
        download_dir,
        video_path,
        clip_segment,
        tmp_dir,
        ext,
        only_progressive,
        resolution,
    ) = task

    error = None
    warnings = []
    tmp_path = None  # Initialize tmp_path at the beginning

    try:
        # Get video info first
        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "extract_flat": True,
        }

        with ytdlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(url, download=False)
            except Exception as e:
                raise ValueError(str(e))

        if video_path is not None and ext is None:
            ext = os.path.splitext(video_path)[1]

        # Configure format selection
        format_spec = _get_format_spec(ext, only_progressive, resolution)

        if video_path is None:
            filename = f"{info['id']}{ext or '.mp4'}"
            video_path = os.path.join(download_dir, filename)

        # Download to temporary location first
        tmp_path = os.path.join(tmp_dir, os.path.basename(video_path))

        ydl_opts = {
            "format": format_spec,
            "outtmpl": tmp_path,
            "quiet": True,
            "no_warnings": True,
            "merge_output_format": "mp4",  # Force MP4 output
            "postprocessors": [
                {
                    "key": "FFmpegVideoConvertor",
                    "preferedformat": "mp4",
                }
            ],
        }

        if clip_segment is not None:
            start_time, end_time = clip_segment
            if start_time is not None:
                ydl_opts["download_ranges"] = lambda info: [
                    [start_time, end_time]
                ]
                ydl_opts["force_keyframes_at_cuts"] = True

        # Ensure the temporary directory exists
        etau.ensure_dir(os.path.dirname(tmp_path))

        # Download the video
        with ytdlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        # Verify the file exists and move it
        if os.path.exists(tmp_path):
            etau.move_file(tmp_path, video_path)
        else:
            raise ValueError("Download completed but file not found")

    except Exception as e:
        video_path = None
        error = str(e)
        # Clean up any partial downloads
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except:
                pass

    return idx, url, video_path, error, warnings


def _get_format_spec(ext, only_progressive, resolution):
    """Builds a format specification string for yt-dlp based on the desired parameters."""
    format_spec = []

    # Handle extension
    if ext:
        format_spec.append(f"ext={ext[1:]}")  # Remove leading dot

    # Handle resolution
    if resolution == "highest":
        format_spec.append(
            "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
        )
    elif resolution == "lowest":
        format_spec.append(
            "worstvideo[ext=mp4]+worstaudio[ext=m4a]/worst[ext=mp4]/worst"
        )
    elif etau.is_numeric(resolution):
        format_spec.append(
            f"bestvideo[height<={resolution}][ext=mp4]+bestaudio[ext=m4a]/best[height<={resolution}][ext=mp4]/best[height<={resolution}]"
        )

    # Handle progressive vs non-progressive
    if only_progressive:
        format_spec.append("vcodec!*=none")
        format_spec.append("acodec!*=none")

    return "+".join(format_spec)


def _find_nearest(array, target):
    return np.argmin(np.abs(np.asarray(array) - target))
