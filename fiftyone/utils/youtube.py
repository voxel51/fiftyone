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

youtube_dl = fou.lazy_import(
    "youtube_dl", callback=lambda: fou.ensure_import("youtube-dl"),
)


logger = logging.getLogger(__name__)


def download_youtube_videos(
    urls, download_dir=None, max_videos=None, num_workers=None, ext=None,
):
    """Downloads a list of video urls from YouTube.

    The `urls` argument either accepts:

        * A list of YouTube video urls::

            urls = ["https://www.youtube.com/watch?v=-0URMJE8_PB", ...]

          When `urls` is a list, then the `download_dir` argument is required
          and all videos will be downloaded into that directory

        * A dictionary mapping the video urls to files on disk in which to
          store that video::

            urls = {
                "https://www.youtube.com/watch?v=-0URMJE8_PB": "/path/to/local/file1.ext",
                ...
            }

    Args:
        urls: either a list of video urls, or a dict
            mapping these urls to locations on disk. If `urls` is a list, then
            the `download_dir` argument is required
        download_dir (None): the output directory used to store the downloaded
            videos. This is only used if `urls` is a list
        max_videos (None): the maximum number of videos to download from the
            given ``urls``. By default, all ``urls`` will be downloaded
        num_workers (None): the number of processes to use when downloading
            individual video. By default, ``multiprocessing.cpu_count()`` is
            used
        ext (None): the extension to use to store the downloaded videos or a
            list of extensions corresponding to the given ``urls``. By default,
            the default extension of each video is used

    Returns:
        urls of successfully downloaded videos
        a dict of download errors and the corresponding video urls
    """
    tasks = _build_tasks_list(urls, download_dir, ext)
    download_fcn = _do_download_video
    downloaded, errors = _download(
        tasks, max_videos, num_workers, download_fcn, threading=True
    )

    return downloaded, errors


def download_youtube_clips(
    urls,
    download_dir=None,
    clip_segments=None,
    max_videos=None,
    num_workers=None,
    ext=None,
):
    """Downloads clips from a list of video urls from YouTube.

    The `urls` argument either accepts:

        * A list of YouTube video urls::

            urls = ["https://www.youtube.com/watch?v=-0URMJE8_PB", ...]

          When `urls` is a list, then the `download_dir` argument is required
          and all videos will be downloaded into that directory

        * A dictionary mapping the video urls to files on disk in which to
          store that video::

            urls = {
                "https://www.youtube.com/watch?v=-0URMJE8_PB": "/path/to/local/file1.ext",
                ...
            }

    The corresponding `clip_segments` argument can then contain a list of
    tuples of ints or floats used to download segment clips of each video. A
    value of `None` can indicate either downloading the entire video,
    downloading from the start or downloading to the end of the video::

        clip_segments = [
            (10, 25),
            (11.1, 20.2),
            None,
            (None, 8.3),
        ]

    Args:
        urls: either a list of video urls, or a dict
            mapping these urls to locations on disk. If `urls` is a list, then
            the `download_dir` argument is required
        download_dir (None): the output directory used to store the downloaded
            videos. This is only used if `urls` is a list
        clip_segments (None): a list of int or float tuples indicating start
            and end times in seconds for downloading segments of videos
        max_videos (None): the maximum number of videos to download from the
            given ``urls``. By default, all ``urls`` will be downloaded
        num_workers (None): the number of processes to use when downloading
            individual video. By default, ``multiprocessing.cpu_count()`` is
            used
        ext (None): the extension to use to store the downloaded videos or a
            list of extensions corresponding to the given ``urls``. By default,
            the default extension of each video is used

    Returns:
        urls of successfully downloaded video clips
        a dict of download errors and the corresponding video urls
    """
    tasks = _build_tasks_list(
        urls, download_dir, ext, clip_segments=clip_segments
    )
    download_fcn = _do_download_clip
    downloaded, errors = _download(
        tasks, max_videos, num_workers, download_fcn
    )

    return downloaded, errors


def _download(tasks, max_videos, num_workers, download_fcn, threading=False):
    num_workers = _parse_num_workers(num_workers, threading=threading)
    if max_videos is None:
        max_videos = len(tasks)

    if num_workers == 1:
        downloaded, errors = _single_worker_download(
            tasks, max_videos, download_fcn
        )

    else:
        downloaded, errors = _multi_worker_download(
            tasks, max_videos, num_workers, download_fcn
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


def _build_tasks_list(urls, download_dir, ext, clip_segments=None):
    if isinstance(urls, str):
        urls = [urls]
    if isinstance(clip_segments, tuple):
        clip_segments = [clip_segments]

    if isinstance(urls, list):
        if download_dir is None:
            raise ValueError(
                "When `urls` is a list, `download_dir` is required but was "
                "found to be `None`."
            )
        urls = {url: None for url in urls}

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

    ext_list = _parse_list_arg(ext, num_videos)
    urls_list = _parse_list_arg(list(urls.keys()), num_videos)
    paths_list = _parse_list_arg(list(urls.values()), num_videos)
    download_dir_list = [download_dir] * num_videos

    return list(
        zip(urls_list, paths_list, download_dir_list, ext_list, clip_segments)
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


def _single_worker_download(tasks, max_videos, download_fcn):
    downloaded = []
    errors = defaultdict(list)
    with fou.ProgressBar(total=max_videos, iters_str="videos") as pb:
        for task in tasks:
            is_success, url, error_type = download_fcn(task)
            if is_success:
                downloaded.append(url)
                pb.update()
                if len(downloaded) >= max_videos:
                    return downloaded, errors
            else:
                errors[error_type].append(url)
    return downloaded, errors


def _multi_worker_download(
    tasks, max_videos, num_workers, download_fcn, threading=False
):
    downloaded = []
    errors = defaultdict(list)
    with fou.ProgressBar(total=max_videos, iters_str="videos") as pb:
        if threading:
            mp_fcn = multiprocessing.dummy.Pool
        else:
            mp_fcn = multiprocessing.Pool
        with mp_fcn(num_workers) as pool:
            for is_success, url, error_type in pool.imap_unordered(
                download_fcn, tasks
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


def _do_download_video(args):
    url, video_path, download_dir, ext, _ = args
    ydl_opts, _ = _build_ydl_opts(ext, video_path, download_dir)

    try:
        with youtube_dl.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        return True, url, None

    except Exception as e:
        if isinstance(e, youtube_dl.utils.DownloadError):
            # pylint: disable=no-member
            return False, url, str(e.exc_info[1])
        return False, url, str(e)


def _do_download_clip(args):
    url, video_path, download_dir, ext, clip_segment = args
    ydl_opts, output_path = _build_ydl_opts(ext, video_path, download_dir)

    try:
        with youtube_dl.YoutubeDL(ydl_opts) as ydl:
            info_dict = ydl.extract_info(url, download=False)
            _url = info_dict.get("url", None)
            if _url is None:
                _url = info_dict["requested_formats"][0]["url"]

            _id = info_dict.get("id", None)
            _title = info_dict.get("title", _id)
            _ext = info_dict.get("ext", ext)

            output_path = output_path.replace(
                "%(title)s", _title.replace("/", "")
            )
            output_path = output_path.replace("%(ext)s", _ext)

            _extract_clip(_url, output_path, clip_segment)

        return True, url, None

    except Exception as e:
        if isinstance(e, youtube_dl.utils.DownloadError):
            # pylint: disable=no-member
            return False, url, str(e.exc_info[1])
        return False, url, str(e)


def _extract_clip(url, output_path, clip_segment):
    if clip_segment is None:
        start_time, end_time = None, None
    else:
        start_time, end_time = clip_segment

    if start_time is None:
        start_time = 0

    duration = end_time - start_time if end_time else None

    tmp_output = output_path + ".part"
    etav.extract_clip(
        url, tmp_output, start_time=start_time, duration=duration
    )
    os.rename(tmp_output, output_path)


def _build_ydl_opts(ext, video_path, download_dir):
    ytdl_logger = logging.getLogger("ytdl-ignore")
    ytdl_logger.disabled = True
    ydl_opts = {
        "age_limit": 99,
        "logger": ytdl_logger,
    }

    if video_path:
        output_path = video_path
        _ext = os.path.splitext(os.path.basename(video_path))[1]
        _ext = _ext.lstrip(".")

    else:
        if ext is not None:
            _ext = ext.lstrip(".")
            path_ext = _ext
        else:
            _ext = None
            path_ext = "%(ext)s"
        path_name = "%(title)s"
        output_path = os.path.join(
            download_dir, "%s.%s" % (path_name, path_ext)
        )

    if _ext:
        ydl_opts["format"] = _ext

    etau.ensure_dir(os.path.dirname(output_path))

    ydl_opts["outtmpl"] = output_path

    return ydl_opts, output_path
