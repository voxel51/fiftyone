"""
Utilities for working with `YouTube <https://youtube.com>`.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import logging
import multiprocessing.dummy
import os
import shutil
import uuid

import eta.core.utils as etau

import fiftyone.core.utils as fou


def _ensure_yt_dlp():
    fou.ensure_package("yt-dlp")


yt_dlp = fou.lazy_import("yt_dlp", callback=_ensure_yt_dlp)


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
    specify a desired video codec and resolution to download, if possible.

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
    use_threads = False
    num_workers = 1
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

    try:
        if video_path is not None and ext is None:
            ext = os.path.splitext(video_path)[1]

        download_tmp_dir = os.path.join(tmp_dir, str(uuid.uuid4()))
        os.makedirs(download_tmp_dir, exist_ok=True)

        ydl_opts = _build_yt_dlp_opts(
            download_tmp_dir, ext, only_progressive, resolution, clip_segment
        )

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)

        requested_downloads = info.get("requested_downloads")
        if requested_downloads:
            downloaded_file = requested_downloads[0]["filepath"]
        else:
            files = [
                f
                for f in os.listdir(download_tmp_dir)
                if not f.endswith(".part")
                and os.path.isfile(os.path.join(download_tmp_dir, f))
            ]
            if not files:
                raise ValueError("No video file was downloaded")
            downloaded_file = os.path.join(download_tmp_dir, files[0])

        if video_path is None:
            filename = os.path.basename(downloaded_file)
            if ext is not None and not filename.endswith(ext):
                filename = os.path.splitext(filename)[0] + ext
            video_path = os.path.join(download_dir, filename)
        else:
            downloaded_ext = os.path.splitext(downloaded_file)[1]
            requested_ext = os.path.splitext(video_path)[1]
            if downloaded_ext != requested_ext and requested_ext:
                warnings.append(
                    "Unable to find a '%s' stream for '%s'; "
                    "downloaded '%s' instead"
                    % (requested_ext, url, downloaded_ext)
                )
                video_path = os.path.splitext(video_path)[0] + downloaded_ext

        if downloaded_file != video_path:
            etau.move_file(downloaded_file, video_path)

        shutil.rmtree(download_tmp_dir, ignore_errors=True)

    except Exception as e:
        video_path = None
        error = str(e)

    return idx, url, video_path, error, warnings


def _build_yt_dlp_opts(
    tmp_dir, ext, only_progressive, resolution, clip_segment
):
    opts = {
        "quiet": True,
        "no_warnings": True,
        "outtmpl": os.path.join(tmp_dir, "%(id)s.%(ext)s"),
        "noplaylist": True,
        "socket_timeout": 30,
        "retries": 3,
    }

    format_selector = _build_format_selector(only_progressive, resolution)
    if format_selector:
        opts["format"] = format_selector

    if clip_segment is not None:
        start_time, end_time = clip_segment
        if start_time is None:
            start_time = 0
        if end_time is None:
            end_time = float("inf")

        opts["download_ranges"] = yt_dlp.utils.download_range_func(
            None, [(start_time, end_time)]
        )
        opts["force_keyframes_at_cuts"] = True

    opts["merge_output_format"] = ext[1:] if ext else "mp4"

    return opts


def _build_format_selector(only_progressive, resolution):
    if only_progressive:
        if etau.is_numeric(resolution):
            return "b[height<=%d][vcodec!=none][acodec!=none]/b" % resolution
        elif resolution == "lowest":
            return "w[vcodec!=none][acodec!=none]/b"
        else:
            return "b[vcodec!=none][acodec!=none]/b"
    else:
        if etau.is_numeric(resolution):
            return "bv[height<=%d]+ba/b" % resolution
        elif resolution == "lowest":
            return "wv+wa/w"
        else:
            return "bv+ba/b"
