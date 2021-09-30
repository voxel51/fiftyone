"""
Utilities for working with
`YouTube-DL <https://github.com/ytdl-org/youtube-dl>`

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import logging
import multiprocessing
import os

import fiftyone.core.utils as fou

youtube_dl = fou.lazy_import("youtube_dl")


logger = logging.getLogger(__name__)


def download_from_youtube(
    videos_dir, urls, max_videos=None, num_workers=None, ext=None,
):
    """
    Attempts to download a list of videos from YouTube.

    Args:
        videos_dir: the output directory used to store the downloaded videos 
        urls: a list containing the urls of the videos to attempt to download
        ids (None): an optional list of ids to use as filenames that matches
            one to one with the list of ``urls``
        max_videos (None): the maximum number of videos to download from the
            given ``urls``. By
            default, all ``urls`` will be downloaded
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
    num_videos = len(urls)

    if max_videos is None:
        max_videos = num_videos

    if ids is None:
        ids = [None] * num_videos

    if isinstance(ext, list):
        ext_list = ext
    else:
        ext_list = [ext] * num_videos

    videos_dir_list = [videos_dir] * num_videos

    tasks = zip(urls, videos_dir_list, ids, ext_list)
    downloaded = []
    tasks = []
    errors = defaultdict(list)

    if num_workers == 1:
        with fou.ProgressBar(total=num_videos, iters_str="videos") as pb:
            for url, output_dir, video_id in tasks:
                is_success, url, error_type = _do_download(
                    (url, output_dir, video_id)
                )
                if is_success:
                    downloaded.append(url)
                    pb.update()
                    if len(downloaded) >= max_videos:
                        return downloaded, errors
                else:
                    errors[error_type].append(url)
    else:
        with fou.ProgressBar(total=num_videos, iters_str="videos") as pb:
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


def _do_download(args):
    url, videos_dir, video_id, ext = args

    ydl_opts = {
        "logtostderr": True,
        "quiet": True,
        "logger": logger,
        "age_limit": 99,
        "ignorerrors": True,
    }

    if ext is not None:
        ext = ext.lstrip(".")
        ydl_opts["format"] = "bestvideo[ext=%s]" % ext
        path_ext = ext
    else:
        path_ext = "%(ext)s"

    if video_id is not None:
        path_name = video_id
    else:
        path_name = "%(title)s"

    output_path = os.path.join(videos_dir, "%s.%s" % (path_name, path_ext))
    ydl_opts["outtmpl"] = output_path

    try:
        with youtube_dl.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        return True, url, None

    except Exception as e:
        if isinstance(e, youtube_dl.utils.DownloadError):
            # pylint: disable=no-member
            return False, url, str(e.exc_info[1])
        return False, url, "other"


def _parse_num_workers(num_workers):
    if num_workers is None:
        if os.name == "nt":
            # Default to 1 worker for Windows
            return 1
        return multiprocessing.cpu_count()

    if not isinstance(num_workers, int) or num_workers < 1:
        raise ValueError(
            "The `num_workers` argument must be a positive integer or `None` "
            "found %s" % str(type(num_workers))
        )
    return num_workers
