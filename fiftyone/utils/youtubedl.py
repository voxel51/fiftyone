"""
Utilities for working with
`youtube-dl <https://github.com/ytdl-org/youtube-dl>`

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import logging
import multiprocessing
import multiprocessing.dummy
import os

import eta.core.utils as etau

import fiftyone.core.utils as fou

youtube_dl = fou.lazy_import(
    "youtube_dl",
    callback=lambda: fou.ensure_import(
        "youtube_dl",
        error_msg="youtube_dl not found, run `pip install youtube-dl`",
    ),
)


logger = logging.getLogger(__name__)


def download_from_youtube(
    urls, download_dir=None, max_videos=None, num_workers=None, ext=None,
):
    """
    Attempts to download a list of video urls from YouTube.
    The `urls` argument either accepts:

        * A list of YouTube video urls::

            urls = ["https://www.youtube.com/watch?v=-0URMJE8_PA", ...]

          When `urls` is a list, then the `download_dir` argument is required
          and all videos will be downloaded into that directory

        * A dictionary mapping the video urls to files on disk in which to store that video::

            urls = {
                "https://www.youtube.com/watch?v=-0URMJE8_PA": "/path/to/local/file1.ext",
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
        ids or names or successfully downloaded videos
        a dict of the videos unsuccessfully downloaded and the corresponding
            errors
    """
    num_workers = _parse_num_workers(num_workers)
    tasks = _build_tasks_list(urls, download_dir, ext)

    if max_videos is None:
        max_videos = len(tasks)

    if num_workers == 1:
        downloaded, errors = _single_thread_download(tasks, max_videos)

    else:
        downloaded, errors = _multi_thread_download(
            tasks, max_videos, num_workers
        )

    return downloaded, errors


def _parse_num_workers(num_workers):
    if num_workers is None:
        if os.name == "nt":
            # Default to 1 worker for Windows OS
            return 1
        return multiprocessing.cpu_count()

    if not isinstance(num_workers, int) or num_workers < 1:
        raise ValueError(
            "The `num_workers` argument must be a positive integer or `None` "
            "found %s" % str(type(num_workers))
        )
    return num_workers


def _build_tasks_list(urls, download_dir, ext):
    if isinstance(urls, list):
        if download_dir is None:
            raise ValueError(
                "When `urls` is a list, `download_dir` is required but was found to be `None`."
            )
        urls = {url: None for url in urls}

        etau.ensure_dir(download_dir)

    num_videos = len(urls)
    ext_list = _parse_list_arg(ext, num_videos)
    urls_list = _parse_list_arg(list(urls.keys()), num_videos)
    paths_list = _parse_list_arg(list(urls.values()), num_videos)
    download_dir_list = [download_dir] * num_videos

    return zip(urls_list, paths_list, download_dir_list, ext_list)


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


def _single_thread_download(tasks, max_videos):
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


def _multi_thread_download(tasks, max_videos, num_workers):
    downloaded = []
    errors = defaultdict(list)
    with fou.ProgressBar(total=max_videos, iters_str="videos") as pb:
        with multiprocessing.dummy.Pool(num_workers) as pool:
            for is_success, url, error_type in pool.imap_unordered(
                _do_download, tasks
            ):
                if is_success:
                    if len(downloaded) < max_videos:
                        downloaded.append(url)
                        pb.update()
                    else:
                        return downloaded, errors
                else:
                    errors[error_type].append(url)
    return downloaded, errors


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
        ydl_opts["format"] = "bestvideo[ext=%s]" % _ext

    ydl_opts["outtmpl"] = output_path

    return ydl_opts


def _do_download(args):
    url, video_path, download_dir, ext = args
    ydl_opts = _build_ydl_opts(ext, video_path, download_dir)

    try:
        with youtube_dl.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        return True, url, None

    except Exception as e:
        if isinstance(e, youtube_dl.utils.DownloadError):
            # pylint: disable=no-member
            return False, url, str(e.exc_info[1])
        return False, url, "other"
