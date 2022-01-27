"""
Utilities for working with
`YouTube <https://youtube.com>` videos

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import logging
import multiprocessing
import multiprocessing.dummy
import os

import eta.core.utils as etau
import eta.core.video as etav

import fiftyone.core.utils as fou

pytube = fou.lazy_import(
    "pytube", callback=lambda: fou.ensure_import("pytube"),
)


logger = logging.getLogger(__name__)


def download_youtube_videos(
    urls,
    download_dir=None,
    video_paths=None,
    clip_segments=None,
    max_videos=None,
    num_workers=None,
    ext=None,
):
    """Downloads clips from a list of video urls from YouTube.

    The `urls` argument accepts a list of YouTube video urls::

        urls = ["https://www.youtube.com/watch?v=-0URMJE8_PB", ...]


    The corresponding `video_paths`, `clip_segments`, and `ext` argument can
    then contain a list of values matching the order of `urls`. The
    `clip_segments` argument expects tuples of ints or floats used to download
    segment clips of each video. A value of `None` can indicate either
    downloading the entire video, downloading from the start or downloading to
    the end of the video::

        clip_segments = [
            (10, 25),
            (11.1, 20.2),
            None,
            (None, 8.3),
        ]

        video_paths = [
            "/path/to/local/file1.ext",
            ...
        ]

        exts = [
            "mp4",
            ...
        ]

    If `video_paths` are not provided, then a `download_dir` must be given.
    When no `clip_segments` are given and `num_workers` != 1, then threads are
    be used to download videos. When `clips_segments` are specified, then
    processes are used to download the videos and cut them using ffmpeg.

    Args:
        urls: a list of video urls to download
        download_dir (None): the output directory used to store the downloaded
            videos. This is required if `video_paths` is not provided 
        video_paths (None): a list of filepaths to store videos corresponding
            to the list of `urls`. This is required if `download_dir` is not
            provided
        clip_segments (None): a list of int or float tuples indicating start
            and end times in seconds for downloading segments of videos
        max_videos (None): the maximum number of videos to download from the
            given `urls` skipping failures. By default, all `urls` will be
            downloaded
        num_workers (None): the number of workers to use when downloading
            individual video. By default, ``multiprocessing.cpu_count()`` is
            used
        ext (None): the extension to use to store the downloaded videos or a
            list of extensions corresponding to the given `urls`. By default,
            the default extension of each video is used. This is overridden by
            extensions given in `video_paths`

    Returns:
        urls of successfully downloaded video clips
        a dict of download errors and the corresponding video urls
    """
    threading = clip_segments is None
    num_workers = _parse_num_workers(num_workers, threading=threading)

    with etau.TempDir() as tmp_dir:
        tasks = _build_tasks_list(
            urls,
            download_dir,
            video_paths,
            ext,
            tmp_dir,
            clip_segments=clip_segments,
        )
        if max_videos is None:
            max_videos = len(tasks)

        if num_workers == 1:
            downloaded, errors = _single_worker_download(tasks, max_videos)

        else:
            downloaded, errors = _multi_worker_download(
                tasks, max_videos, num_workers, threading=threading
            )

    return downloaded, errors


def _parse_num_workers(num_workers, threading=False):
    if num_workers is None:
        if not threading and os.name == "nt":
            # Default to 1 worker for Windows OS if using multiple processes
            return 1
        return multiprocessing.cpu_count()

    if not isinstance(num_workers, int) or num_workers < 1:
        raise ValueError(
            "The `num_workers` argument must be a positive integer or `None` "
            "found %s" % str(type(num_workers))
        )
    return num_workers


def _build_tasks_list(
    urls, download_dir, video_paths, ext, tmp_dir, clip_segments=None
):
    if isinstance(urls, str):
        urls = [urls]
    if isinstance(clip_segments, tuple):
        clip_segments = [clip_segments]

    if isinstance(urls, list):
        if not video_paths:
            if download_dir is None:
                raise ValueError(
                    "Either `download_dir` or `video_paths` are required."
                )

    num_videos = len(urls)

    if clip_segments is None:
        clip_segments = [None] * num_videos
    else:
        for ind, clip_segment in enumerate(clip_segments):
            if (
                clip_segment
                and len(clip_segment) == 2
                and clip_segment[1] is None
                and clip_segment[0] in [0, None]
            ):
                clip_segments[ind] = None

    if len(clip_segments) != num_videos:
        raise ValueError(
            "Found %d `clip_segments` and %d `urls`, but the lengths of these "
            "iterables must match" % (len(clip_segments), num_videos)
        )

    if isinstance(ext, list) and len(ext) != num_videos:
        raise ValueError(
            "Found %d `ext` and %d `urls`, but the lengths of these "
            "iterables must match" % (len(ext), num_videos)
        )

    urls_list = _parse_list_arg(urls, num_videos)
    paths_list = _parse_list_arg(video_paths, num_videos)
    ext_list = _parse_list_arg(ext, num_videos)
    download_dir_list = [download_dir] * num_videos
    tmp_dir_list = [tmp_dir] * num_videos

    return list(
        zip(
            urls_list,
            paths_list,
            download_dir_list,
            ext_list,
            tmp_dir_list,
            clip_segments,
        )
    )


def _parse_list_arg(arg, list_len):
    if isinstance(arg, list):
        if len(arg) != list_len:
            # If arg list is not the right length, ignore it and set all arg to
            # `None`
            arg_list = [None] * list_len
        else:
            arg_list = arg
    else:
        # If a non-list arg is given, repeat it for the length of the list
        arg_list = [arg] * list_len

    return arg_list


def _single_worker_download(tasks, max_videos):
    downloaded = []
    errors = defaultdict(list)
    with fou.ProgressBar(total=max_videos, iters_str="videos") as pb:
        for task in tasks:
            is_success, url, error_type = _do_download(task)
            if is_success:
                downloaded.append(url)
                pb.update()
                if len(downloaded) >= max_videos:
                    return downloaded, errors
            else:
                errors[error_type].append(url)

    return downloaded, errors


def _multi_worker_download(tasks, max_videos, num_workers, threading=False):
    downloaded = []
    errors = defaultdict(list)
    with fou.ProgressBar(total=max_videos, iters_str="videos") as pb:
        if threading:
            mp_fcn = multiprocessing.dummy.Pool
        else:
            mp_fcn = multiprocessing.Pool
        with mp_fcn(num_workers) as pool:
            for is_success, url, error_type in pool.imap_unordered(
                _do_download, tasks
            ):
                if is_success:
                    pb.update()
                    if len(downloaded) < max_videos:
                        downloaded.append(url)
                    else:
                        return downloaded, errors
                else:
                    errors[error_type].append(url)

    return downloaded, errors


def _do_download(args):
    url, video_path, download_dir, ext, tmp_dir, clip_segment = args

    try:
        pytube_video = pytube.YouTube(url)
        status, messages = pytube.extract.playability_status(
            pytube_video.watch_html
        )
        if status is not None:
            if isinstance(messages, list):
                if messages:
                    messages = messages[0]
                else:
                    messages = status

            return False, url, messages

        if video_path:
            ext = os.path.splitext(video_path)[1].lstrip(".")

        streams = pytube_video.streams
        if ext is not None:
            ext = ext.lstrip(".")
            streams = streams.filter(file_extension=ext, progressive=True)
        else:
            streams = streams.filter(progressive=True)

        stream = streams.order_by("resolution").desc().first()
        if stream is None:
            return False, url, "No stream found"

        if not video_path:
            video_path = os.path.join(download_dir, stream.default_filename)

        etau.ensure_dir(os.path.dirname(video_path))
        tmp_path = os.path.join(tmp_dir, os.path.basename(video_path))

        if clip_segment is None:
            stream.download(
                output_path=tmp_dir, filename=os.path.basename(video_path)
            )
        else:
            _url = stream.url
            _extract_clip(_url, tmp_path, clip_segment)

        os.rename(tmp_path, video_path)

        return True, url, None

    except Exception as e:
        if isinstance(e, pytube.exceptions.PytubeError):
            return False, url, type(e)
        else:
            return False, url, str(e)


def _extract_clip(url, vid_path, clip_segment):
    if clip_segment is None:
        start_time, end_time = None, None
    else:
        start_time, end_time = clip_segment

    if start_time is None:
        start_time = 0

    duration = end_time - start_time if end_time else None

    etav.extract_clip(url, vid_path, start_time=start_time, duration=duration)
