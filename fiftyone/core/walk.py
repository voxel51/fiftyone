"""
Filesystem walk utilities.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os


def walk_safe(top, topdown=True, onerror=None, follow_symlinks=False):
    """Walk a directory tree like :func:`os.walk`, with safe symlink handling.

    Visited directories are tracked by :func:`os.path.realpath`, so each real
    directory is entered at most once. With ``follow_symlinks=True``, symbolic
    links to directories are followed, but cycles (including a link back to an
    ancestor) do not cause infinite recursion.

    Args:
        top: root directory to walk
        topdown (True): if ``True``, yield a directory before its subdirectories;
            if ``False``, yield after subdirectories (same as :func:`os.walk`)
        onerror (None): optional callable, ``onerror(OSError)``, invoked when
            :func:`os.listdir` fails
        follow_symlinks (False): if ``False``, symlinks to directories appear in
            ``dirnames`` but are not descended into (same as
            ``os.walk(..., followlinks=False)``). If ``True``, follow directory
            symlinks unless their resolved path was already visited.

    Yields:
        ``(dirpath, dirnames, filenames)`` triples like :func:`os.walk`. The
        ``dirnames`` list may be modified in place between the ``yield`` and
        recursion when ``topdown`` is ``True``, pruning subsequent descent.
    """
    visited = set()

    try:
        abs_top = os.path.abspath(top)
        real_top = os.path.realpath(abs_top)
    except (TypeError, OSError):
        return

    visited.add(real_top)

    def walk(dirpath):
        try:
            names = os.listdir(dirpath)
        except OSError as err:
            if onerror is not None:
                onerror(err)
            return

        dirnames = []
        filenames = []
        for name in names:
            path = os.path.join(dirpath, name)
            try:
                if os.path.isdir(path):
                    dirnames.append(name)
                else:
                    filenames.append(name)
            except OSError:
                filenames.append(name)

        if topdown:
            yield dirpath, dirnames, filenames

        for name in dirnames:
            path = os.path.join(dirpath, name)
            try:
                if not os.path.isdir(path):
                    continue
                if os.path.islink(path) and not follow_symlinks:
                    continue
                real = os.path.realpath(path)
                if real in visited:
                    continue
                visited.add(real)
                yield from walk(path)
            except OSError:
                continue

        if not topdown:
            yield dirpath, dirnames, filenames

    yield from walk(abs_top)
