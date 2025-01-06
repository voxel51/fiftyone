"""
File storage utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from contextlib import contextmanager
from datetime import datetime
import enum
import json
import logging
import multiprocessing.dummy
import ntpath
import os
import posixpath
import re
import shutil
import tempfile

import jsonlines
import yaml

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.utils as fou


logger = logging.getLogger(__name__)


class FileSystem(enum.Enum):
    """Enumeration of the available file systems."""

    LOCAL = "local"


def get_file_system(path):
    """Returns the file system enum for the given path.

    Args:
        path: a path

    Returns:
        a :class:`FileSystem` value
    """
    return FileSystem.LOCAL


def split_prefix(path):
    """Splits the file system prefix from the given path.

    The prefix for local paths is ``""``.

    Example usages::

        import fiftyone.core.storage as fos

        fos.split_prefix("/path/to/file")       # ('', '/path/to/file')
        fos.split_prefix("a/file")              # ('', 'a/file')

    Args:
        path: a path

    Returns:
        a ``(prefix, path)`` tuple
    """
    return "", path


def get_bucket_name(path):
    """Gets the bucket name from the given path.

    The bucket name for local paths is ``""``.

    Example usages::

        import fiftyone.core.storage as fos

        fos.get_bucket_name("/path/to/file")       # ''
        fos.get_bucket_name("a/file")              # ''

    Args:
        path: a path

    Returns:
        the bucket name string
    """
    return ""


def is_local(path):
    """Determines whether the given path is local.

    Args:
        path: a path

    Returns:
        True/False
    """
    return get_file_system(path) == FileSystem.LOCAL


def ensure_local(path):
    """Ensures that the given path is local.

    Args:
        path: a path
    """
    if not is_local(path):
        raise ValueError(
            "The requested operation requires a local path, but found '%s'"
            % path
        )


def normalize_path(path):
    """Normalizes the given path by converting it to an absolute path and
    expanding the user directory, if necessary.

    Args:
        path: a path

    Returns:
        the normalized path
    """
    return os.path.abspath(os.path.expanduser(path))


def make_temp_dir(basedir=None):
    """Makes a temporary directory.

    Args:
        basedir (None): an optional directory in which to create the new
            directory. The default is
            ``fiftyone.config.default_dataset_dir``

    Returns:
        the temporary directory path
    """
    if basedir is None:
        basedir = fo.config.default_dataset_dir

    ensure_dir(basedir)
    return tempfile.mkdtemp(dir=basedir)


class TempDir(object):
    """Context manager that creates and destroys a temporary directory.

    Args:
        basedir (None): an optional directory in which to create the new
            directory. The default is ``fiftyone.config.default_dataset_dir``
    """

    def __init__(self, basedir=None):
        self._basedir = basedir
        self._name = None

    def __enter__(self):
        self._name = make_temp_dir(basedir=self._basedir)
        return self._name

    def __exit__(self, *args):
        delete_dir(self._name)


def open_file(path, mode="r"):
    """Opens the given file for reading or writing.

    Example usage::

        import fiftyone.core.storage as fos

        with fos.open_file("/tmp/file.txt", "w") as f:
            f.write("Hello, world!")

        with fos.open_file("/tmp/file.txt", "r") as f:
            print(f.read())

    Args:
        path: the path
        mode ("r"): the mode. Supported values are ``("r", "rb", "w", "wb")``

    Returns:
        an open file-like object
    """
    return _open_file(path, mode)


def open_files(paths, mode="r", skip_failures=False, progress=None):
    """Opens the given files for reading or writing.

    Args:
        paths: a list of paths
        mode ("r"): the mode. Supported values are ``("r", "rb", "w", "wb")``
        skip_failures (False): whether to gracefully continue without raising
            an error if an operation fails
        progress (None): whether to render a progress bar (True/False), use the
            default value ``fiftyone.config.show_progress_bars`` (None), or a
            progress callback function to invoke instead

    Returns:
        a list of open file-like objects
    """
    tasks = [(p, mode, skip_failures) for p in paths]
    return _run(_do_open_file, tasks, return_results=True, progress=progress)


def read_file(path, binary=False):
    """Reads the file.

    Args:
        path: the filepath
        binary (False): whether to read the file in binary mode

    Returns:
        the file contents
    """
    return _read_file(path, binary=binary)


def read_files(paths, binary=False, skip_failures=False, progress=None):
    """Reads the specified files into memory.

    Args:
        paths: a list of filepaths
        binary (False): whether to read the files in binary mode
        skip_failures (False): whether to gracefully continue without raising
            an error if an operation fails
        progress (None): whether to render a progress bar (True/False), use the
            default value ``fiftyone.config.show_progress_bars`` (None), or a
            progress callback function to invoke instead

    Returns:
        a list of file contents
    """
    tasks = [(p, binary, skip_failures) for p in paths]
    return _run(_do_read_file, tasks, return_results=True, progress=progress)


def write_file(str_or_bytes, path):
    """Writes the given string/bytes to a file.

    If a string is provided, it is encoded via ``.encode()``.

    Args:
        str_or_bytes: the string or bytes
        path: the filepath
    """
    ensure_basedir(path)
    with open(path, "wb") as f:
        f.write(_to_bytes(str_or_bytes))


def sep(path):
    """Returns the path separator for the given path.

    Args:
        path: the filepath

    Returns:
        the path separator
    """
    return os.path.sep


def join(a, *p):
    """Joins the given path components into a single path.

    Args:
        a: the root
        *p: additional path components

    Returns:
        the joined path
    """
    return os.path.join(a, *p)


def realpath(path):
    """Converts the given path to absolute, resolving symlinks and relative
    path indicators such as ``.`` and ``..``.

    Args:
        path: the filepath

    Returns:
        the resolved path
    """
    return os.path.realpath(path)


def isabs(path):
    """Determines whether the given path is absolute.

    Args:
        path: the filepath

    Returns:
        True/False
    """
    return os.path.isabs(path)


def abspath(path):
    """Converts the given path to an absolute path, resolving relative path
    indicators such as ``.`` and ``..``.

    Args:
        path: the filepath

    Returns:
        the absolute path
    """
    return os.path.abspath(path)


def normpath(path):
    """Normalizes the given path by converting all slashes to forward slashes
    on Unix and backslashes on Windows and removing duplicate slashes.

    Use this function when you need a version of ``os.path.normpath`` that
    converts ``\\`` to ``/`` on Unix.

    Args:
        path: a path

    Returns:
        the normalized path
    """
    if os.name == "nt":
        return ntpath.normpath(path)

    return posixpath.normpath(path.replace("\\", "/"))


def exists(path):
    """Determines whether the given file or directory exists.

    Args:
        path: the file or directory path

    Returns:
        True/False
    """
    return os.path.exists(path)


def isfile(path):
    """Determines whether the given file exists.

    Args:
        path: the filepath

    Returns:
        True/False
    """
    return os.path.isfile(path)


def isdir(dirpath):
    """Determines whether the given directory exists.

    Cloud "folders" are deemed to exist only if they are non-empty.

    Args:
        dirpath: the directory path

    Returns:
        True/False
    """
    return os.path.isdir(dirpath)


def make_archive(dirpath, archive_path, cleanup=False):
    """Makes an archive containing the given directory.

    Supported formats include ``.zip``, ``.tar``, ``.tar.gz``, ``.tgz``,
    ``.tar.bz`` and ``.tbz``.

    Args:
        dirpath: the directory to archive
        archive_path: the archive path to write
        cleanup (False): whether to delete the directory after archiving it
    """
    etau.make_archive(dirpath, archive_path)

    if cleanup:
        delete_dir(dirpath)


def extract_archive(archive_path, outdir=None, cleanup=False):
    """Extracts the contents of an archive.

    The following formats are guaranteed to work:
    ``.zip``, ``.tar``, ``.tar.gz``, ``.tgz``, ``.tar.bz``, ``.tbz``.

    If an archive *not* in the above list is found, extraction will be
    attempted via the ``patool`` package, which supports many formats but may
    require that additional system packages be installed.

    Args:
        archive_path: the archive path
        outdir (None): the directory into which to extract the archive. By
            default, the directory containing the archive is used
        cleanup (False): whether to delete the archive after extraction
    """
    if outdir is None:
        outdir = os.path.dirname(archive_path) or "."

    etau.extract_archive(archive_path, outdir=outdir)

    if cleanup:
        delete_file(archive_path)


def ensure_empty_dir(dirpath, cleanup=False):
    """Ensures that the given directory exists and is empty.

    Args:
        dirpath: the directory path
        cleanup (False): whether to delete any existing directory contents

    Raises:
        ValueError: if the directory is not empty and ``cleanup`` is False
    """
    etau.ensure_empty_dir(dirpath, cleanup=cleanup)


def ensure_basedir(path):
    """Makes the base directory of the given path, if necessary.

    Args:
        path: the filepath
    """
    etau.ensure_basedir(path)


def ensure_dir(dirpath):
    """Makes the given directory, if necessary.

    Args:
        dirpath: the directory path
    """
    etau.ensure_dir(dirpath)


def load_json(path_or_str):
    """Loads JSON from the input argument.

    Args:
        path_or_str: the filepath or JSON string

    Returns:
        the loaded JSON
    """
    try:
        return json.loads(path_or_str)
    except ValueError:
        pass

    if os.path.isfile(path_or_str):
        return read_json(path_or_str)

    raise ValueError("Unable to load JSON from '%s'" % path_or_str)


def read_json(path):
    """Reads a JSON file.

    Args:
        path: the filepath

    Returns:
        the JSON data
    """
    try:
        with open(path, "r") as f:
            return json.load(f)
    except ValueError:
        raise ValueError("Unable to parse JSON file '%s'" % path)


def write_json(d, path, pretty_print=False):
    """Writes JSON object to file.

    Args:
        d: JSON data
        path: the filepath
        pretty_print (False): whether to render the JSON in human readable
            format with newlines and indentations
    """
    s = etas.json_to_str(d, pretty_print=pretty_print)
    write_file(s, path)


def load_ndjson(path_or_str):
    """Loads NDJSON from the input argument.

    Args:
        path_or_str: the filepath or NDJSON string

    Returns:
        a list of JSON dicts
    """
    try:
        return etas.load_ndjson(path_or_str)
    except ValueError:
        pass

    if os.path.isfile(path_or_str):
        return read_ndjson(path_or_str)

    raise ValueError("Unable to load NDJSON from '%s'" % path_or_str)


def read_ndjson(path):
    """Reads an NDJSON file.

    Args:
        path: the filepath

    Returns:
        a list of JSON dicts
    """
    with open(path, "r") as f:
        with jsonlines.Reader(f) as r:
            return list(r.iter(skip_empty=True))


def write_ndjson(obj, path):
    """Writes the list of JSON dicts in NDJSON format.

    Args:
        obj: a list of JSON dicts
        path: the filepath
    """
    with open(path, "w") as f:
        with jsonlines.Writer(f) as w:
            w.write_all(obj)


def read_yaml(path):
    """Reads a YAML file.

    Args:
        path: the filepath

    Returns:
        a list of JSON dicts
    """
    with open(path, "r") as f:
        return yaml.safe_load(f)


def write_yaml(obj, path, **kwargs):
    """Writes the object to a YAML file.

    Args:
        obj: a Python object
        path: the filepath
        **kwargs: optional arguments for ``yaml.dump(..., **kwargs)``
    """
    with open(path, "w") as f:
        return yaml.dump(obj, stream=f, **kwargs)


def list_files(
    dirpath,
    abs_paths=False,
    recursive=False,
    include_hidden_files=False,
    return_metadata=False,
    sort=True,
):
    """Lists the files in the given directory.

    If the directory does not exist, an empty list is returned.

    Args:
        dirpath: the path to the directory to list
        abs_paths (False): whether to return the absolute paths to the files
        recursive (False): whether to recursively traverse subdirectories
        include_hidden_files (False): whether to include dot files
        return_metadata (False): whether to return metadata dicts for each file
            instead of filepaths
        sort (True): whether to sort the list of files

    Returns:
        a list of filepaths or metadata dicts
    """
    if not os.path.isdir(dirpath):
        return []

    filepaths = etau.list_files(
        dirpath,
        abs_paths=abs_paths,
        recursive=recursive,
        include_hidden_files=include_hidden_files,
        sort=sort,
    )

    if not return_metadata:
        return filepaths

    metadata = []
    for filepath in filepaths:
        if abs_paths:
            fp = filepath
        else:
            fp = os.path.join(dirpath, filepath)

        m = _get_local_metadata(fp)
        m["filepath"] = filepath
        metadata.append(m)

    return metadata


def _get_local_metadata(filepath):
    s = os.stat(filepath)
    return {
        "name": os.path.basename(filepath),
        "size": s.st_size,
        "last_modified": datetime.fromtimestamp(s.st_mtime),
    }


def list_subdirs(dirpath, abs_paths=False, recursive=False):
    """Lists the subdirectories in the given directory, sorted alphabetically
    and excluding hidden directories.

    Args:
        dirpath: the path to the directory to list
        abs_paths (False): whether to return absolute paths
        recursive (False): whether to recursively traverse subdirectories

    Returns:
        a list of subdirectories
    """
    return etau.list_subdirs(dirpath, abs_paths=abs_paths, recursive=recursive)


def list_buckets(fs, abs_paths=False):
    """Lists the available buckets in the given file system.

    This method returns subdirectories of ``/`` (or the current drive on
    Windows).

    Args:
        fs: a :class:`FileSystem` value
        abs_paths (False): whether to return absolute paths

    Returns:
        a list of buckets
    """
    root = os.path.abspath(os.sep)
    return etau.list_subdirs(root, abs_paths=abs_paths, recursive=False)


def list_available_file_systems():
    """Lists the file systems that are currently available for use with methods
    like :func:`list_files` and :func:`list_buckets`.

    Returns:
        a list of :class:`FileSystem` values
    """
    return [FileSystem.LOCAL]


def get_glob_matches(glob_patt):
    """Returns a list of file paths matching the given glob pattern.

    The matches are returned in sorted order.

    Args:
        glob_patt: a glob pattern like ``/path/to/files-*.jpg``

    Returns:
        a list of file paths
    """
    return etau.get_glob_matches(glob_patt)


def get_glob_root(glob_patt):
    """Finds the root directory of the given glob pattern, i.e., the deepest
    subdirectory that contains no glob characters.

    Args:
        glob_patt: a glob pattern like ``/path/to/files-*.jpg``

    Returns:
        a tuple of:

        -   the root
        -   True/False whether the pattern contains any special characters
    """
    special_chars = "*?[]"

    # Remove escapes around special characters
    replacers = [("[%s]" % s, s) for s in special_chars]
    glob_patt = etau.replace_strings(glob_patt, replacers)

    # @todo optimization: don't split on specials that were previously escaped,
    # as this could cause much more recursive listing than necessary
    split_patt = "|".join(map(re.escape, special_chars))
    root = re.split(split_patt, glob_patt, 1)[0]

    found_special = root != glob_patt
    root = os.path.dirname(root)

    return root, found_special


def copy_file(inpath, outpath):
    """Copies the input file to the output location.

    Args:
        inpath: the input path
        outpath: the output path
    """
    _copy_file(inpath, outpath, cleanup=False)


def copy_files(inpaths, outpaths, skip_failures=False, progress=None):
    """Copies the files to the given locations.

    Args:
        inpaths: a list of input paths
        outpaths: a list of output paths
        skip_failures (False): whether to gracefully continue without raising
            an error if an operation fails
        progress (None): whether to render a progress bar (True/False), use the
            default value ``fiftyone.config.show_progress_bars`` (None), or a
            progress callback function to invoke instead
    """
    _copy_files(inpaths, outpaths, skip_failures, progress)


def copy_dir(
    indir, outdir, overwrite=True, skip_failures=False, progress=None
):
    """Copies the input directory to the output directory.

    Args:
        indir: the input directory
        outdir: the output directory
        overwrite (True): whether to delete an existing output directory (True)
            or merge its contents (False)
        skip_failures (False): whether to gracefully continue without raising
            an error if an operation fails
        progress (None): whether to render a progress bar (True/False), use the
            default value ``fiftyone.config.show_progress_bars`` (None), or a
            progress callback function to invoke instead
    """
    if overwrite and os.path.isdir(outdir):
        delete_dir(outdir)

    files = list_files(
        indir, include_hidden_files=True, recursive=True, sort=False
    )
    inpaths = [os.path.join(indir, f) for f in files]
    outpaths = [os.path.join(outdir, f) for f in files]
    copy_files(
        inpaths, outpaths, skip_failures=skip_failures, progress=progress
    )


def move_file(inpath, outpath):
    """Moves the given file to a new location.

    Args:
        inpath: the input path
        outpath: the output path
    """
    _copy_file(inpath, outpath, cleanup=True)


def move_files(inpaths, outpaths, skip_failures=False, progress=None):
    """Moves the files to the given locations.

    Args:
        inpaths: a list of input paths
        outpaths: a list of output paths
        skip_failures (False): whether to gracefully continue without raising
            an error if an operation fails
        progress (None): whether to render a progress bar (True/False), use the
            default value ``fiftyone.config.show_progress_bars`` (None), or a
            progress callback function to invoke instead
    """
    tasks = [(i, o, skip_failures) for i, o in zip(inpaths, outpaths)]
    _run(_do_move_file, tasks, return_results=False, progress=progress)


def move_dir(
    indir, outdir, overwrite=True, skip_failures=False, progress=None
):
    """Moves the contents of the given directory into the given output
    directory.

    Args:
        indir: the input directory
        outdir: the output directory
        overwrite (True): whether to delete an existing output directory (True)
            or merge its contents (False)
        skip_failures (False): whether to gracefully continue without raising
            an error if an operation fails
        progress (None): whether to render a progress bar (True/False), use the
            default value ``fiftyone.config.show_progress_bars`` (None), or a
            progress callback function to invoke instead
    """
    if overwrite and os.path.isdir(outdir):
        delete_dir(outdir)

    if overwrite:
        etau.ensure_basedir(outdir)
        shutil.move(indir, outdir)


def delete_file(path):
    """Deletes the file at the given path.

    Any empty directories are also recursively deleted from the resulting
    directory tree.

    Args:
        path: the filepath
    """
    _delete_file(path)


def delete_files(paths, skip_failures=False, progress=None):
    """Deletes the files from the given locations.

    Any empty directories are also recursively deleted from the resulting
    directory tree.

    Args:
        paths: a list of paths
        skip_failures (False): whether to gracefully continue without raising
            an error if an operation fails
        progress (None): whether to render a progress bar (True/False), use the
            default value ``fiftyone.config.show_progress_bars`` (None), or a
            progress callback function to invoke instead
    """
    tasks = [(p, skip_failures) for p in paths]
    _run(_do_delete_file, tasks, return_results=False, progress=progress)


def delete_dir(dirpath):
    """Deletes the given directory and recursively deletes any empty
    directories from the resulting directory tree.

    Args:
        dirpath: the directory path
    """
    etau.delete_dir(dirpath)


def run(fcn, tasks, return_results=True, num_workers=None, progress=None):
    """Applies the given function to each element of the given tasks.

    Args:
        fcn: a function that accepts a single argument
        tasks: an iterable of function arguments
        return_results (True): whether to return the function results
        num_workers (None): a suggested number of threads to use
        progress (None): whether to render a progress bar (True/False), use the
            default value ``fiftyone.config.show_progress_bars`` (None), or a
            progress callback function to invoke instead

    Returns:
        the list of function outputs, or None if ``return_results == False``
    """
    return _run(
        fcn,
        tasks,
        return_results=return_results,
        num_workers=num_workers,
        progress=progress,
    )


def _copy_files(inpaths, outpaths, skip_failures, progress):
    tasks = [(i, o, skip_failures) for i, o in zip(inpaths, outpaths)]
    _run(_do_copy_file, tasks, return_results=False, progress=progress)


def _run(fcn, tasks, return_results=True, num_workers=None, progress=None):
    try:
        num_tasks = len(tasks)
    except:
        num_tasks = None

    if num_tasks == 0:
        return [] if return_results else None

    num_workers = fou.recommend_thread_pool_workers(num_workers)
    kwargs = dict(total=num_tasks, iters_str="files", progress=progress)

    if num_workers <= 1:
        with fou.ProgressBar(**kwargs) as pb:
            if return_results:
                results = [fcn(task) for task in pb(tasks)]
            else:
                for task in pb(tasks):
                    fcn(task)
    else:
        with multiprocessing.dummy.Pool(processes=num_workers) as pool:
            with fou.ProgressBar(**kwargs) as pb:
                if return_results:
                    results = list(pb(pool.imap(fcn, tasks)))
                else:
                    for _ in pb(pool.imap_unordered(fcn, tasks)):
                        pass

    if return_results:
        return results


def _do_copy_file(arg):
    inpath, outpath, skip_failures = arg

    try:
        _copy_file(inpath, outpath, cleanup=False)
    except Exception as e:
        if not skip_failures:
            raise

        if skip_failures != "ignore":
            logger.warning(e)


def _do_move_file(arg):
    inpath, outpath, skip_failures = arg

    try:
        _copy_file(inpath, outpath, cleanup=True)
    except Exception as e:
        if not skip_failures:
            raise

        if skip_failures != "ignore":
            logger.warning(e)


def _do_delete_file(arg):
    filepath, skip_failures = arg

    try:
        _delete_file(filepath)
    except Exception as e:
        if not skip_failures:
            raise

        if skip_failures != "ignore":
            logger.warning(e)


def _do_open_file(arg):
    filepath, mode, skip_failures = arg

    try:
        return _open_file(filepath, mode)
    except Exception as e:
        if not skip_failures:
            raise

        if skip_failures != "ignore":
            logger.warning(e)


def _open_file(path, mode):
    return open(path, mode)


def _do_read_file(arg):
    filepath, binary, skip_failures = arg

    try:
        return _read_file(filepath, binary=binary)
    except Exception as e:
        if not skip_failures:
            raise

        if skip_failures != "ignore":
            logger.warning(e)


def _read_file(filepath, binary=False):
    mode = "rb" if binary else "r"
    with open(filepath, mode) as f:
        return f.read()


def _copy_file(inpath, outpath, cleanup=False):
    etau.ensure_basedir(outpath)
    if cleanup:
        shutil.move(inpath, outpath)
    else:
        shutil.copy(inpath, outpath)


def _delete_file(filepath):
    etau.delete_file(filepath)


def _to_bytes(val, encoding="utf-8"):
    b = val.encode(encoding) if isinstance(val, str) else val
    if not isinstance(b, bytes):
        raise TypeError("Failed to convert %s to bytes" % type(b))

    return b
