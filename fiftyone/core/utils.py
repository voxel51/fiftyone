"""
Core utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import abc
import atexit
from bson import json_util
from base64 import b64encode, b64decode
from collections import defaultdict
from contextlib import contextmanager
from copy import deepcopy
from datetime import date, datetime
import glob
import hashlib
import importlib
import inspect
import io
import itertools
import logging
import multiprocessing
import numbers
import os
import platform
import re
import signal
import string
import struct
import subprocess
import sys
import timeit
import types
from xml.parsers.expat import ExpatError
import zlib

from bson import ObjectId
from bson.errors import InvalidId
from matplotlib import colors as mcolors
from concurrent.futures import ThreadPoolExecutor

import asyncio


try:
    import pprintpp as _pprint
    from mongoengine.base.datastructures import BaseDict, BaseList

    # Monkey patch to prevent sorting keys
    # https://stackoverflow.com/a/25688431
    _pprint._sorted = lambda x: x

    try:
        # Monkey patch to render `BaseList` as `list` and `BaseDict` as `dict`
        _d = _pprint.PrettyPrinter._open_close_empty
        _d[BaseList] = (BaseList, "list", "[", "]", "[]")
        _d[BaseDict] = (BaseDict, "dict", "{", "}", "{}")
    except:
        pass
except:
    import pprint as _pprint

import numpy as np
import pytz
import xmltodict

import eta
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.context as foc


logger = logging.getLogger(__name__)


_REQUIREMENT_ERROR_SUFFIX = (
    "If you think this error is inaccurate, you can set "
    "`fiftyone.config.requirement_error_level` to 1 (warning) or 2 (ignore).\n"
    "See https://docs.voxel51.com/user_guide/config.html for details."
)


def extract_kwargs_for_class(cls, kwargs):
    """Extracts keyword arguments for the given class's constructor from the
    given kwargs.

    Args:
        cls: a class
        kwargs: a dictionary of keyword arguments

    Returns:
        a tuple of

        -   **class_kwargs**: a dictionary of keyword arguments for ``cls``
        -   **other_kwargs**: a dictionary containing the remaining ``kwargs``
    """
    return _extract_kwargs(cls, kwargs)


def extract_kwargs_for_function(fcn, kwargs):
    """Extracts keyword arguments for the given function from the given kwargs.

    Args:
        fcn: a function
        kwargs: a dictionary of keyword arguments

    Returns:
        a tuple of

        -   **fcn_kwargs**: a dictionary of keyword arguments for ``fcn``
        -   **other_kwargs**: a dictionary containing the remaining ``kwargs``
    """
    return _extract_kwargs(fcn, kwargs)


def _extract_kwargs(cls_or_fcn, kwargs):
    this_kwargs = {}
    other_kwargs = {}
    spec = inspect.getfullargspec(cls_or_fcn)
    for k, v in kwargs.items():
        if k in spec.args:
            this_kwargs[k] = v
        else:
            other_kwargs[k] = v

    return this_kwargs, other_kwargs


def pprint(obj, stream=None, indent=4, width=80, depth=None):
    """Pretty-prints the Python object.

    Args:
        obj: the Python object
        stream (None): the stream to write to. The default is ``sys.stdout``
        indent (4): the number of spaces to use when indenting
        width (80): the max width of each line in the pretty representation
        depth (None): the maximum depth at which to pretty render nested dicts
    """
    return _pprint.pprint(
        obj, stream=stream, indent=indent, width=width, depth=depth
    )


def pformat(obj, indent=4, width=80, depth=None):
    """Returns a pretty string representation of the Python object.

    Args:
        obj: the Python object
        indent (4): the number of spaces to use when indenting
        width (80): the max width of each line in the pretty representation
        depth (None): the maximum depth at which to pretty render nested dicts

    Returns:
        the pretty-formatted string
    """
    return _pprint.pformat(obj, indent=indent, width=width, depth=depth)


def split_frame_fields(fields):
    """Splits the given fields into sample and frame fields.

    Frame fields are those prefixed by ``"frames."``, and this prefix is
    removed from the returned frame fields.

    Args:
        fields: a field, iterable of fields, or dict mapping field names to new
            field names

    Returns:
        a tuple of

        -   **sample_fields**: a list or dict of sample fields
        -   **frame_fields**: a list or dict of frame fields
    """
    if isinstance(fields, dict):
        return _split_frame_fields_dict(fields)

    if etau.is_str(fields):
        fields = [fields]

    frames_prefix = "frames."
    n = len(frames_prefix)

    sample_fields = []
    frame_fields = []
    for field in fields:
        if field.startswith(frames_prefix):
            frame_fields.append(field[n:])
        else:
            sample_fields.append(field)

    return sample_fields, frame_fields


def _split_frame_fields_dict(fields):
    frames_prefix = "frames."
    n = len(frames_prefix)

    sample_fields = {}
    frame_fields = {}
    for src_field, dst_field in fields.items():
        if src_field.startswith(frames_prefix):
            frame_fields[src_field[n:]] = dst_field[n:]
        else:
            sample_fields[src_field] = dst_field

    return sample_fields, frame_fields


def stream_objects(objects):
    """Streams the iterable of objects to stdout via ``less``.

    The output can be interactively traversed via scrolling and can be
    terminated via keyboard interrupt.

    Args:
        objects: an iterable of objects that can be printed via ``str(obj)``
    """
    # @todo support Windows and other environments without `less`
    # Look at pydoc.pager() for inspiration?
    p = subprocess.Popen(
        ["less", "-F", "-R", "-S", "-X", "-K"],
        shell=True,
        stdin=subprocess.PIPE,
    )

    try:
        with io.TextIOWrapper(p.stdin, errors="backslashreplace") as pipe:
            for obj in objects:
                pipe.write(str(obj) + "\n")

        p.wait()
    except (KeyboardInterrupt, OSError):
        pass


def indent_lines(s, indent=4, skip=0):
    """Indents the lines in the given string.

    Args:
        s: the string
        indent (4): the number of spaces to indent
        skip (0): the number of lines to skip before indenting

    Returns:
        the indented string
    """
    lines = s.split("\n")

    skipped_lines = lines[:skip]
    if skipped_lines:
        skipped = "\n".join(skipped_lines)
    else:
        skipped = None

    indent_lines = lines[skip:]
    if indent_lines:
        indented = "\n".join((" " * indent) + l for l in indent_lines)
    else:
        indented = None

    if skipped is not None and indented is not None:
        return skipped + "\n" + indented

    if skipped is not None:
        return skipped

    if indented is not None:
        return indented

    return s


def justify_headings(elements, width=None):
    """Justifies the headings in a list of ``(heading, content)`` string tuples
    by appending whitespace as necessary to each ``heading``.

    Args:
        elements: a list of ``(heading, content)`` tuples
        width (None): an optional justification width. By default, the maximum
            heading length is used

    Returns:
        a list of justified ``(heading, content)`` tuples
    """
    if width is None:
        width = max(len(e[0]) for e in elements)

    fmt = "%%-%ds" % width
    return [(fmt % e[0], e[1]) for e in elements]


def available_patterns():
    """Returns the available patterns that can be used by
    :meth:`fill_patterns`.

    Returns:
        a dict mapping patterns to their replacements
    """
    return deepcopy(eta.config.patterns)


def fill_patterns(string):
    """Fills the patterns in in the given string.

    Use :meth:`available_patterns` to see the available patterns that can be
    used.

    Args:
        string: a string

    Returns:
        a copy of string with any patterns replaced
    """
    return etau.fill_patterns(string, available_patterns())


def find_files(root_dir, patt, max_depth=1):
    """Finds all files in the given root directory whose filename matches the
    given glob pattern(s).

    Both ``root_dir`` and ``patt`` may contain glob patterns.

    Exammples::

        import fiftyone.core.utils as fou

        # Find .txt files in `/tmp`
        fou.find_files("/tmp", "*.txt")

        # Find .txt files in subdirectories of `/tmp` that begin with `foo-`
        fou.find_files("/tmp/foo-*", "*.txt")

        # Find .txt files in `/tmp` or its subdirectories
        fou.find_files("/tmp", "*.txt", max_depth=2)

    Args:
        root_dir: the root directory
        patt: a glob pattern or list of patterns
        max_depth (1): a maximum depth to search. 1 means ``root_dir`` only,
            2 means ``root_dir`` and its immediate subdirectories, etc

    Returns:
        a list of matching paths
    """
    if etau.is_str(patt):
        patt = [patt]

    paths = []
    for i in range(max_depth):
        root = os.path.join(root_dir, *list("*" * i))
        for p in patt:
            paths += glob.glob(os.path.join(root, p))

    return paths


def install_package(requirement_str, error_level=None, error_msg=None):
    """Installs the given package via ``pip``.

    Installation is performed via::

        python -m pip install <requirement_str>

    Args:
        requirement_str: a PEP 440 compliant package requirement, like
            "tensorflow", "tensorflow<2", "tensorflow==2.3.0", or
            "tensorflow>=1.13,<1.15"
        error_level (None): the error level to use, defined as:

            -   0: raise error if the install fails
            -   1: log warning if the install fails
            -   2: ignore install fails

        error_msg (None): an optional custom error message to use
    """
    if error_level is None:
        error_level = fo.config.requirement_error_level

    return etau.install_package(
        requirement_str,
        error_level=error_level,
        error_msg=error_msg,
    )


def ensure_package(
    requirement_str, error_level=None, error_msg=None, log_success=False
):
    """Verifies that the given package is installed.

    This function uses ``importlib.metadata`` to locate the package
    by its pip name and does not actually import the module.

    Therefore, unlike :meth:`ensure_import`, ``requirement_str`` should refer
    to the package name (e.g., "tensorflow-gpu"), not the module name
    (e.g., "tensorflow").

    Args:
        requirement_str: a PEP 440 compliant package requirement, like
            "tensorflow", "tensorflow<2", "tensorflow==2.3.0", or
            "tensorflow>=1.13,<1.15". This can also be an iterable of multiple
            requirements, all of which must be installed, or this can be a
            single "|"-delimited string specifying multiple requirements, at
            least one of which must be installed
        error_level (None): the error level to use, defined as:

            -   0: raise error if requirement is not satisfied
            -   1: log warning if requirement is not satisfied
            -   2: ignore unsatisifed requirements

            By default, ``fiftyone.config.requirement_error_level`` is used
        error_msg (None): an optional custom error message to use
        log_success (False): whether to generate a log message if the
            requirement is satisfied

    Returns:
        True/False whether the requirement is satisfied
    """
    if error_level is None:
        error_level = fo.config.requirement_error_level

    return etau.ensure_package(
        requirement_str,
        error_level=error_level,
        error_msg=error_msg,
        error_suffix=_REQUIREMENT_ERROR_SUFFIX,
        log_success=log_success,
    )


def load_requirements(requirements_path):
    """Loads the package requirements from a ``requirements.txt`` file on disk.

    Comments and extra whitespace are automatically stripped.

    Args:
        requirements_path: the path to a requirements file

    Returns:
        a list of requirement strings
    """
    requirements = []
    with open(requirements_path, "rt") as f:
        for line in f:
            line = _strip_comments(line)
            if line:
                requirements.append(line)

    return requirements


def _strip_comments(requirement_str):
    chunks = []
    for chunk in requirement_str.strip().split():
        if chunk.startswith("#"):
            break

        chunks.append(chunk)

    return " ".join(chunks)


def install_requirements(requirements_path, error_level=None):
    """Installs the package requirements from a ``requirements.txt`` file on
    disk.

    Args:
        requirements_path: the path to a requirements file
        error_level (None): the error level to use, defined as:

            -   0: raise error if the install fails
            -   1: log warning if the install fails
            -   2: ignore install fails

            By default, ``fiftyone.config.requirement_error_level`` is used
    """
    for req_str in load_requirements(requirements_path):
        install_package(req_str, error_level=error_level)


def ensure_requirements(
    requirements_path, error_level=None, log_success=False
):
    """Verifies that the package requirements from a ``requirements.txt`` file
    on disk are installed.

    Args:
        requirements_path: the path to a requirements file
        error_level (None): the error level to use, defined as:

            -   0: raise error if requirement is not satisfied
            -   1: log warning if requirement is not satisfied
            -   2: ignore unsatisifed requirements

            By default, ``fiftyone.config.requirement_error_level`` is used
        log_success (False): whether to generate a log message if a requirement
            is satisfied
    """
    for req_str in load_requirements(requirements_path):
        ensure_package(
            req_str, error_level=error_level, log_success=log_success
        )


def ensure_import(
    requirement_str, error_level=None, error_msg=None, log_success=False
):
    """Verifies that the given requirement is installed and importable.

    This function imports the specified module and optionally enforces any
    version requirements included in ``requirement_str``.

    Therefore, unlike :meth:`ensure_package`, ``requirement_str`` should refer
    to the module name (e.g., "tensorflow"), not the package name (e.g.,
    "tensorflow-gpu").

    Args:
        requirement_str: a PEP 440-like module requirement, like "tensorflow",
            "tensorflow<2", "tensorflow==2.3.0", or "tensorflow>=1.13,<1.15".
            This can also be an iterable of multiple requirements, all of which
            must be installed, or this can be a single "|"-delimited string
            specifying multiple requirements, at least one of which must be
            installed
        error_level (None): the error level to use, defined as:

            -   0: raise error if requirement is not satisfied
            -   1: log warning if requirement is not satisfied
            -   2: ignore unsatisifed requirements

            By default, ``fiftyone.config.requirement_error_level`` is used
        error_msg (None): an optional custom error message to use
        log_success (False): whether to generate a log message if the
            requirement is satisfied

    Returns:
        True/False whether the requirement is satisfied
    """
    if error_level is None:
        error_level = fo.config.requirement_error_level

    return etau.ensure_import(
        requirement_str,
        error_level=error_level,
        error_msg=error_msg,
        error_suffix=_REQUIREMENT_ERROR_SUFFIX,
        log_success=log_success,
    )


def ensure_tf(eager=False, error_level=None, error_msg=None):
    """Verifies that ``tensorflow`` is installed and importable.

    Args:
        eager (False): whether to require that TF is executing eagerly. If
            True and TF is not currently executing eagerly, this method will
            attempt to enable it
        error_level (None): the error level to use, defined as:

            -   0: raise error if requirement is not satisfied
            -   1: log warning if requirement is not satisfied
            -   2: ignore unsatisifed requirements

            By default, ``fiftyone.config.requirement_error_level`` is used
        error_msg (None): an optional custom error message to print

    Returns:
        True/False whether the requirement is satisfied
    """
    if error_level is None:
        error_level = fo.config.requirement_error_level

    success = ensure_import(
        "tensorflow", error_level=error_level, error_msg=error_msg
    )

    if not success or not eager:
        return success

    try:
        import tensorflow as tf

        if not tf.executing_eagerly():
            try:
                # pylint: disable=no-member
                tf.compat.v1.enable_eager_execution()
            except AttributeError:
                # pylint: disable=no-member
                tf.enable_eager_execution()
    except Exception as e:
        if error_msg is None:
            error_msg = (
                "The requested operation requires that TensorFlow's eager "
                "execution mode is activated. We tried to enable it but "
                "encountered an error."
            )

        error_msg += "\n\n" + _REQUIREMENT_ERROR_SUFFIX

        handle_error(ValueError(error_msg), error_level, base_error=e)

        return False

    return True


def ensure_tfds(error_level=None, error_msg=None):
    """Verifies that ``tensorflow_datasets`` is installed and importable.

    Args:
        error_level (None): the error level to use, defined as:

            -   0: raise error if requirement is not satisfied
            -   1: log warning if requirement is not satisfied
            -   2: ignore unsatisifed requirements

            By default, ``fiftyone.config.requirement_error_level`` is used
        error_msg (None): an optional custom error message to print

    Returns:
        True/False whether the requirement is satisfied
    """
    if error_level is None:
        error_level = fo.config.requirement_error_level

    success1 = ensure_import(
        "tensorflow>=1.15", error_level=error_level, error_msg=error_msg
    )
    success2 = ensure_import(
        "tensorflow_datasets", error_level=error_level, error_msg=error_msg
    )

    return success1 & success2


def ensure_torch(error_level=None, error_msg=None):
    """Verifies that ``torch`` and ``torchvision`` are installed and
    importable.

    Args:
        error_level (None): the error level to use, defined as:

            -   0: raise error if requirement is not satisfied
            -   1: log warning if requirement is not satisfied
            -   2: ignore unsatisifed requirements

            By default, ``fiftyone.config.requirement_error_level`` is used
        error_msg (None): an optional custom error message to print

    Returns:
        True/False whether the requirement is satisfied
    """
    if error_level is None:
        error_level = fo.config.requirement_error_level

    success1 = ensure_import(
        "torch", error_level=error_level, error_msg=error_msg
    )
    success2 = ensure_import(
        "torchvision", error_level=error_level, error_msg=error_msg
    )

    return success1 & success2


def handle_error(error, error_level, base_error=None):
    """Handles the error at the specified error level.

    Args:
        error: an Exception instance
        error_level: the error level to use, defined as:

        -   0: raise the error
        -   1: log the error as a warning
        -   2: ignore the error

        base_error: (optional) a base Exception from which to raise ``error``
    """
    etau.handle_error(error, error_level, base_error=base_error)


class LoggingLevel(object):
    """Context manager that allows for a temporary change to the level of a
    ``logging.Logger``.

    Example::

        import logging
        import fiftyone.core.utils as fou

        with fou.LoggingLevel(logging.CRITICAL):
            # do things with all logging at CRITICAL

        with fou.LoggingLevel(logging.ERROR, logger="fiftyone"):
            # do things with FiftyOne logging at ERROR

     Args:
        level: the logging level to use, e.g., ``logging.ERROR``
        logger (None): a ``logging.Logger`` or the name of a logger. By
            default, the root logger is used
    """

    def __init__(self, level, logger=None):
        if logger is None or etau.is_str(logger):
            logger = logging.getLogger(logger)

        if level is None:
            level = logging.NOTSET

        self._logger = logger
        self._level = level
        self._level_orig = None

    def __enter__(self):
        self._level_orig = self._logger.level
        self._logger.setLevel(self._level)
        return self

    def __exit__(self, *args):
        self._logger.setLevel(self._level_orig)


def lazy_import(module_name, callback=None):
    """Returns a proxy module object that will lazily import the given module
    the first time it is used.

    Example usage::

        # Lazy version of `import tensorflow as tf`
        tf = lazy_import("tensorflow")

        # Other commands

        # Now the module is loaded
        tf.__version__

    Args:
        module_name: the fully-qualified module name to import
        callback (None): a callback function to call before importing the
            module

    Returns:
        a proxy module object that will be lazily imported when first used
    """
    return LazyModule(module_name, callback=callback)


class LazyModule(types.ModuleType):
    """Proxy module that lazily imports the underlying module the first time it
    is actually used.

    Args:
        module_name: the fully-qualified module name to import
        callback (None): a callback function to call before importing the
            module
    """

    def __init__(self, module_name, callback=None):
        super().__init__(module_name)
        self._module = None
        self._callback = callback

    def __getattr__(self, item):
        if self._module is None:
            self._import_module()

        return getattr(self._module, item)

    def __dir__(self):
        if self._module is None:
            self._import_module()

        return dir(self._module)

    def _import_module(self):
        # Execute callback, if any
        if self._callback is not None:
            self._callback()

        # Actually import the module
        module = importlib.import_module(self.__name__)
        self._module = module

        # Update this object's dict so that attribute references are efficient
        # (__getattr__ is only called on lookups that fail)
        self.__dict__.update(module.__dict__)


def load_xml_as_json_dict(xml_path):
    """Loads the XML file as a JSON dictionary.

    Args:
        xml_path: the path to the XML file

    Returns:
        a JSON dict
    """
    try:
        with open(xml_path, "rb") as f:
            return xmltodict.parse(f.read())
    except ExpatError as ex:
        raise ExpatError(f"Failed to read {xml_path}: {ex}")


def parse_serializable(obj, cls):
    """Parses the given object as an instance of the given
    ``eta.core.serial.Serializable`` class.

    Args:
        obj: an instance of ``cls``, or a serialized string or dictionary
            representation of one
        cls: a ``eta.core.serial.Serializable`` class

    Returns:
        an instance of ``cls``
    """
    if isinstance(obj, cls):
        return obj

    if etau.is_str(obj):
        return cls.from_str(obj)

    if isinstance(obj, dict):
        return cls.from_dict(obj)

    raise ValueError(
        "Unable to load '%s' as an instance of '%s'"
        % (obj, etau.get_class_name(cls))
    )


def set_resource_limit(limit, soft=None, hard=None, warn_on_failure=False):
    """Uses the ``resource`` package to change a resource limit for the current
    process.

    If the ``resource`` package cannot be imported, this command does nothing.

    Args:
        limit: the name of the resource to limit. Must be the name of a
            constant in the ``resource`` module starting with ``RLIMIT``. See
            the documentation of the ``resource`` module for supported values
        soft (None): a new soft limit to apply, which cannot exceed the hard
            limit. If omitted, the current soft limit is maintained
        hard (None): a new hard limit to apply. If omitted, the current hard
            limit is maintained
        warn_on_failure (False): whether to issue a warning rather than an
            error if the resource limit change is not successful
    """
    try:
        import resource
    except ImportError as e:
        if warn_on_failure:
            logger.warning(e)
        else:
            return

    try:
        _limit = getattr(resource, limit)
        soft_orig, hard_orig = resource.getrlimit(_limit)
        soft = soft or soft_orig
        hard = hard or hard_orig
        resource.setrlimit(_limit, (soft, hard))
    except ValueError as e:
        if warn_on_failure:
            logger.warning(e)
        else:
            raise


class ResourceLimit(object):
    """Context manager that allows for a temporary change to a resource limit
    exposed by the ``resource`` package.

    Example::

        import resource
        import fiftyone.core.utils as fou

        with fou.ResourceLimit(resource.RLIMIT_NOFILE, soft=4096):
            # temporarily do things with up to 4096 open files

     Args:
        limit: the name of the resource to limit. Must be the name of a
            constant in the ``resource`` module starting with ``RLIMIT``. See
            the documentation of the ``resource`` module for supported values
        soft (None): a new soft limit to apply, which cannot exceed the hard
            limit. If omitted, the current soft limit is maintained
        hard (None): a new hard limit to apply. If omitted, the current hard
            limit is maintained
        warn_on_failure (False): whether to issue a warning rather than an
            error if the resource limit change is not successful
    """

    def __init__(self, limit, soft=None, hard=None, warn_on_failure=False):
        try:
            import resource  # pylint: disable=unused-import

            self._supported_platform = True
        except ImportError as e:
            self._supported_platform = False
            if warn_on_failure:
                logger.warning(e)

        self._limit = limit
        self._soft = soft
        self._hard = hard
        self._soft_orig = None
        self._hard_orig = None
        self._warn_on_failure = warn_on_failure

    def __enter__(self):
        if not self._supported_platform:
            return

        import resource

        limit = getattr(resource, self._limit)
        self._soft_orig, self._hard_orig = resource.getrlimit(limit)

        set_resource_limit(
            self._limit,
            soft=(self._soft or self._soft_orig),
            hard=(self._hard or self._hard_orig),
            warn_on_failure=self._warn_on_failure,
        )

        return self

    def __exit__(self, *args):
        if not self._supported_platform:
            return

        set_resource_limit(
            self._limit,
            soft=self._soft_orig,
            hard=self._hard_orig,
            warn_on_failure=self._warn_on_failure,
        )


class ProgressBar(etau.ProgressBar):
    """.. autoclass:: eta.core.utils.ProgressBar"""

    def __init__(self, total=None, progress=None, quiet=None, **kwargs):
        if progress is None:
            progress = fo.config.show_progress_bars

        if quiet is not None:
            progress = not quiet

        if callable(progress):
            callback = progress
            progress = False
        else:
            callback = None

        kwargs["total"] = total
        if isinstance(progress, bool):
            kwargs["quiet"] = not progress

        if "iters_str" not in kwargs:
            kwargs["iters_str"] = "samples"

        # For progress bars in notebooks, use a fixed size so that they will
        # read well across browsers, in HTML format, etc
        if foc.is_notebook_context() and "max_width" not in kwargs:
            kwargs["max_width"] = 90

        super().__init__(**kwargs)

        self._progress = progress
        self._callback = callback

    def set_iteration(self, *args, **kwargs):
        super().set_iteration(*args, **kwargs)

        if self._callback is not None:
            self._callback(self)


def report_progress(progress, n=None, dt=None):
    """Wraps the provided progress function such that it will only be called
    at the specified increments or time intervals.

    Example usage::

        import fiftyone as fo
        import fiftyone.zoo as foz

        def print_progress(pb):
            if pb.complete:
                print("COMPLETE")
            else:
                print("PROGRESS: %0.3f" % pb.progress)

        dataset = foz.load_zoo_dataset("cifar10", split="test")

        # Print progress at 10 equally-spaced increments
        progress = fo.report_progress(print_progress, n=10)
        dataset.compute_metadata(progress=progress)

        # Print progress every 0.5 seconds
        progress = fo.report_progress(print_progress, dt=0.5)
        dataset.compute_metadata(progress=progress, overwrite=True)

    Args:
        progress: a function that accepts a :class:`ProgressBar` as input
        n (None): a number of equally-spaced increments to invoke ``progress``
        dt (None): a number of seconds between ``progress`` calls

    Returns:
        a function that accepts a :class:`ProgressBar` as input
    """
    if n is not None:
        return _report_progress_n(progress, n)

    if dt is not None:
        return _report_progress_dt(progress, dt)

    return progress


def _report_progress_n(progress, n):
    def progress_n(pb):
        if not hasattr(pb, "_next_idx"):
            if pb.has_total and n > 0:
                next_iters = [
                    int(np.round(i))
                    for i in np.linspace(0, pb.total, min(n, pb.total) + 1)
                ][1:]

                pb._next_idx = 0
                pb._next_iters = next_iters
            else:
                pb._next_idx = None
                pb._next_iters = None

        if (
            pb._next_idx is not None
            and pb.iteration >= pb._next_iters[pb._next_idx]
        ):
            progress(pb)

            pb._next_idx += 1
            if pb._next_idx >= len(pb._next_iters):
                pb._next_idx = None

    return progress_n


def _report_progress_dt(progress, dt):
    def progress_dt(pb):
        if not hasattr(pb, "_next_dt"):
            pb._next_dt = dt

        if pb._next_dt is not None and (
            pb.elapsed_time >= pb._next_dt or pb.complete
        ):
            progress(pb)

            if not pb.complete:
                pb._next_dt += dt
            else:
                pb._next_dt = None

    return progress_dt


class Batcher(abc.ABC):
    """Base class for iterating over the elements of an iterable in batches."""

    manual_backpressure = False

    def __init__(
        self,
        iterable,
        return_views=False,
        progress=False,
        total=None,
    ):
        import fiftyone.core.collections as foc

        if not isinstance(iterable, foc.SampleCollection):
            return_views = False

        if progress is None:
            progress = fo.config.show_progress_bars

        self.iterable = iterable
        self.return_views = return_views
        self.progress = progress
        self.total = total

        self._iter = None
        self._last_batch_size = None
        self._pb = None
        self._in_context = False
        self._render_progress = bool(progress)  # callback function: True
        self._last_offset = None
        self._num_samples = None
        self._manually_applied_backpressure = True

    def __enter__(self):
        self._in_context = True
        return self

    def __exit__(self, *args):
        self._in_context = False

        if self._render_progress:
            if self._last_batch_size is not None:
                self._pb.update(count=self._last_batch_size)

            self._pb.__exit__(*args)

    def __iter__(self):
        if self.iterable is not None:
            if self.return_views:
                self._last_offset = 0
                self._num_samples = len(self.iterable)
            else:
                self._iter = iter(self.iterable)

        if self._render_progress:
            if self._in_context:
                total = self.total
                if total is None:
                    total = self.iterable

                self._pb = ProgressBar(total=total, progress=self.progress)
                self._pb.__enter__()
            else:
                logger.warning(
                    "Batcher must be invoked as a context manager in order to "
                    "print progress"
                )
                self._render_progress = False

        return self

    def __next__(self):
        if (
            self.manual_backpressure
            and not self._manually_applied_backpressure
        ):
            raise ValueError(
                "Backpressure value not registered for this batcher"
            )

        self._manually_applied_backpressure = False

        if self._render_progress and self._last_batch_size is not None:
            self._pb.update(count=self._last_batch_size)

        batch_size = self._compute_batch_size()
        self._last_batch_size = batch_size

        if self.iterable is None:
            return batch_size

        if self.return_views:
            if self._last_offset >= self._num_samples:
                raise StopIteration

            offset = self._last_offset
            self._last_offset += batch_size

            return self.iterable[offset : (offset + batch_size)]

        batch = []
        idx = 0

        try:
            while idx < batch_size:
                batch.append(next(self._iter))
                idx += 1

        except StopIteration:
            self._last_batch_size = len(batch)

            if not batch:
                raise StopIteration

        return batch

    def apply_backpressure(self, *args, **kwargs):
        """Apply backpressure needed to rightsize the next batch.

        Required to be implemented and called every iteration, if
        ``self.manual_backpressure == True``.

        Subclass defines arguments and behavior of this method.
        """

    @abc.abstractmethod
    def _compute_batch_size(self):
        """Return next batch size. Concrete classes must implement."""


class BaseDynamicBatcher(Batcher):
    """Class for iterating over the elements of an iterable with a dynamic
    batch size to achieve a desired target measurement.

    The batch sizes emitted when iterating over this object are dynamically
    scaled such that the measurement between ``next()`` calls is as close as
    possible to a specified target.

    Concrete base classes define the target measurement and method of
    calculation.
    """

    def __init__(
        self,
        iterable,
        target_measurement,
        init_batch_size=1,
        min_batch_size=1,
        max_batch_size=None,
        max_batch_beta=None,
        return_views=False,
        progress=False,
        total=None,
    ):
        super().__init__(
            iterable, return_views=return_views, progress=progress, total=total
        )

        self.target_measurement = target_measurement
        self.init_batch_size = init_batch_size
        self.min_batch_size = min_batch_size
        self.max_batch_size = max_batch_size
        self.max_batch_beta = max_batch_beta

    def _compute_batch_size(self):
        current_measurement = self._get_measurement()

        if self._last_batch_size is None:
            batch_size = self.init_batch_size
        else:
            # Compute optimal batch size
            try:
                beta = self.target_measurement / current_measurement
            except ZeroDivisionError:
                beta = 1e6

            if self.max_batch_beta is not None:
                if beta >= 1:
                    beta = min(beta, self.max_batch_beta)
                else:
                    beta = max(beta, 1 / self.max_batch_beta)

            batch_size = int(round(beta * self._last_batch_size))

            if self.min_batch_size is not None:
                batch_size = max(batch_size, self.min_batch_size)

            if self.max_batch_size is not None:
                batch_size = min(batch_size, self.max_batch_size)

        self._last_batch_size = batch_size

        return batch_size

    @abc.abstractmethod
    def _get_measurement(self):
        """Get backpressure measurement for current batch."""


class LatencyDynamicBatcher(BaseDynamicBatcher):
    """Class for iterating over the elements of an iterable with a dynamic
    batch size to achieve a desired latency.

    The batch sizes emitted when iterating over this object are dynamically
    scaled such that the latency between ``next()`` calls is as close as
    possible to a specified target latency.

    This class is often used in conjunction with a :class:`ProgressBar` to keep
    the user appraised on the status of a long-running task.

    Example usage::

        import fiftyone.core.utils as fou

        elements = range(int(1e7))

        batcher = fou.LatencyDynamicBatcher(
            elements, target_latency=0.1, max_batch_beta=2.0
        )

        for batch in batcher:
            print("batch size: %d" % len(batch))

        batcher = fou.LatencyDynamicBatcher(
            elements,
            target_latency=0.1,
            max_batch_beta=2.0,
            progress=True,
        )

        with batcher:
            for batch in batcher:
                print("batch size: %d" % len(batch))

    Args:
        iterable: an iterable to batch over. If ``None``, the result of
            ``next()`` will be a batch size instead of a batch, and is an
            infinite iterator.
        target_latency (0.2): the target latency between ``next()``
            calls, in seconds
        init_batch_size (1): the initial batch size to use
        min_batch_size (1): the minimum allowed batch size
        max_batch_size (None): an optional maximum allowed batch size
        max_batch_beta (None): an optional lower/upper bound on the ratio
            between successive batch sizes
        return_views (False): whether to return each batch as a
            :class:`fiftyone.core.view.DatasetView`. Only applicable when the
            iterable is a :class:`fiftyone.core.collections.SampleCollection`
        progress (False): whether to render a progress bar tracking the
            consumption of the batches (True/False), use the default value
            ``fiftyone.config.show_progress_bars`` (None), or a progress
            callback function to invoke instead
        total (None): the length of ``iterable``. Only applicable when
            ``progress=True``. If not provided, it is computed via
            ``len(iterable)``, if possible
    """

    def __init__(
        self,
        iterable,
        target_latency=0.2,
        init_batch_size=1,
        min_batch_size=1,
        max_batch_size=None,
        max_batch_beta=None,
        return_views=False,
        progress=False,
        total=None,
    ):
        super().__init__(
            iterable,
            target_latency,
            init_batch_size=init_batch_size,
            min_batch_size=min_batch_size,
            max_batch_size=max_batch_size,
            max_batch_beta=max_batch_beta,
            return_views=return_views,
            progress=progress,
            total=total,
        )

        self._last_time = None

    def _get_measurement(self):
        current_time = timeit.default_timer()
        time_delta = 0
        if self._last_time is not None:
            time_delta = current_time - self._last_time

        self._last_time = current_time
        return time_delta


# Define this for backwards compatibility in case someone was using this
# batcher directly
DynamicBatcher = LatencyDynamicBatcher


class ContentSizeDynamicBatcher(BaseDynamicBatcher):
    """Class for iterating over the elements of an iterable with a dynamic
    batch size to achieve a desired content size.

    The batch sizes emitted when iterating over this object are dynamically
    scaled such that the total content size of the batch is as close as
    possible to a specified target size.

    This batcher requires that backpressure feedback be provided, either by
    providing a BSON-able batch from which the content size can be computed,
    or by manually providing the content size.

    This class is often used in conjunction with a :class:`ProgressBar` to keep
    the user appraised on the status of a long-running task.

    Example usage::

        import fiftyone.core.utils as fou

        elements = range(int(1e7))

        batcher = fou.ContentSizeDynamicBatcher(
            elements, target_size=2**20, max_batch_beta=2.0
        )

        # Raises ValueError after first batch, we forgot to apply backpressure
        for batch in batcher:
            print("batch size: %d" % len(batch))

        # Now it works
        for batch in batcher:
            print("batch size: %d" % len(batch))
            batcher.apply_backpressure(batch)

        batcher = fou.ContentSizeDynamicBatcher(
            elements,
            target_size=2**20,
            max_batch_beta=2.0,
            progress=True
        )

        with batcher:
            for batch in batcher:
                print("batch size: %d" % len(batch))
                batcher.apply_backpressure(batch)

    Args:
        iterable: an iterable to batch over. If ``None``, the result of
            ``next()`` will be a batch size instead of a batch, and is an
            infinite iterator.
        target_size (1048576): the target batch bson content size, in bytes
        init_batch_size (1): the initial batch size to use
        min_batch_size (1): the minimum allowed batch size
        max_batch_size (None): an optional maximum allowed batch size
        max_batch_beta (None): an optional lower/upper bound on the ratio
            between successive batch sizes
        return_views (False): whether to return each batch as a
            :class:`fiftyone.core.view.DatasetView`. Only applicable when the
            iterable is a :class:`fiftyone.core.collections.SampleCollection`
        progress (False): whether to render a progress bar tracking the
            consumption of the batches (True/False), use the default value
            ``fiftyone.config.show_progress_bars`` (None), or a progress
            callback function to invoke instead
        total (None): the length of ``iterable``. Only applicable when
            ``progress=True``. If not provided, it is computed via
            ``len(iterable)``, if possible
    """

    manual_backpressure = True

    def __init__(
        self,
        iterable,
        target_size=2**20,
        init_batch_size=1,
        min_batch_size=1,
        max_batch_size=None,
        max_batch_beta=None,
        return_views=False,
        progress=False,
        total=None,
    ):
        # If unset or larger, max batch size must be 1 byte per object
        if max_batch_size is None or max_batch_size > target_size:
            max_batch_size = target_size
        super().__init__(
            iterable,
            target_size,
            init_batch_size=init_batch_size,
            min_batch_size=min_batch_size,
            max_batch_size=max_batch_size,
            max_batch_beta=max_batch_beta,
            return_views=return_views,
            progress=progress,
            total=total,
        )
        self._last_batch_content_size = 0

    def apply_backpressure(self, batch_or_size):
        if isinstance(batch_or_size, numbers.Number):
            batch_content_size = batch_or_size
        else:
            batch_content_size = sum(
                len(json_util.dumps(obj)) for obj in batch_or_size
            )

        self._last_batch_content_size = batch_content_size
        self._manually_applied_backpressure = True

    def _get_measurement(self):
        return self._last_batch_content_size


class StaticBatcher(Batcher):
    """Class for iterating over the elements of an iterable with a static
    batch size.

    This class is often used in conjunction with a :class:`ProgressBar` to keep
    the user appraised on the status of a long-running task.

    Example usage::

        import fiftyone.core.utils as fou

        elements = range(int(1e7))

        batcher = fou.StaticBatcher(elements, batch_size=10000)

        for batch in batcher:
            print("batch size: %d" % len(batch))

        batcher = fou.StaticBatcher(elements, batch_size=10000, progress=True)

        with batcher:
            for batch in batcher:
                print("batch size: %d" % len(batch))

    Args:
        iterable: an iterable to batch over. If ``None``, the result of
            ``next()`` will be a batch size instead of a batch, and is an
            infinite iterator.
        batch_size: size of batches to generate
        return_views (False): whether to return each batch as a
            :class:`fiftyone.core.view.DatasetView`. Only applicable when the
            iterable is a :class:`fiftyone.core.collections.SampleCollection`
        progress (False): whether to render a progress bar tracking the
            consumption of the batches (True/False), use the default value
            ``fiftyone.config.show_progress_bars`` (None), or a progress
            callback function to invoke instead
        total (None): the length of ``iterable``. Only applicable when
            ``progress=True``. If not provided, it is computed via
            ``len(iterable)``, if possible
    """

    def __init__(
        self,
        iterable,
        batch_size,
        return_views=False,
        progress=False,
        total=None,
    ):
        super().__init__(
            iterable, return_views=return_views, progress=progress, total=total
        )

        self.batch_size = batch_size

    def _compute_batch_size(self):
        return self.batch_size


def get_default_batcher(iterable, progress=False, total=None):
    """Returns a :class:`Batcher` over ``iterable`` using defaults from your
    FiftyOne config.

    Uses ``fiftyone.config.default_batcher`` to determine the implementation
    to use, and related configuration values as needed for each.

    Args:
        iterable: an iterable to batch over. If ``None``, the result of
            ``next()`` will be a batch size instead of a batch, and is an
            infinite iterator.
        progress (False): whether to render a progress bar tracking the
            consumption of the batches (True/False), use the default value
            ``fiftyone.config.show_progress_bars`` (None), or a progress
            callback function to invoke instead
        total (None): the length of ``iterable``. Only applicable when
            ``progress=True``. If not provided, it is computed via
            ``len(iterable)``, if possible

    Returns:
        a :class:`Batcher`
    """
    default_batcher = fo.config.default_batcher
    if default_batcher == "latency":
        target_latency = fo.config.batcher_target_latency
        return LatencyDynamicBatcher(
            iterable,
            target_latency=target_latency,
            init_batch_size=1,
            max_batch_beta=8.0,
            max_batch_size=100000,
            progress=progress,
            total=total,
        )
    elif default_batcher == "size":
        target_content_size = fo.config.batcher_target_size_bytes
        return ContentSizeDynamicBatcher(
            iterable,
            target_size=target_content_size,
            init_batch_size=1,
            max_batch_beta=8.0,
            max_batch_size=100000,
            progress=progress,
            total=total,
        )
    elif default_batcher == "static":
        batch_size = fo.config.batcher_static_size
        return StaticBatcher(
            iterable, batch_size=batch_size, progress=progress, total=total
        )
    else:
        raise ValueError(
            f"Invalid fo.config.default_batcher: '{default_batcher}'"
        )


def parse_batching_strategy(batch_size=None, batching_strategy=None):
    """Parses the given batching strategy configuration, applying any default
    config settings as necessary.

    Args:
        batch_size (None): the batch size to use. If a ``batching_strategy`` is
            provided, this parameter configures that strategy as described
            below. If no ``batching_strategy`` is provided, this can either be
            an integer specifying the number of samples to save in a batch (in
            which case ``batching_strategy`` is implicitly set to ``"static"``)
            or a float number of seconds between batched saves (in which case
            ``batching_strategy`` is implicitly set to ``"latency"``)
        batching_strategy (None): the batching strategy to use for each save
            operation. Supported values are:

            -   ``"static"``: a fixed sample batch size for each save
            -   ``"size"``: a target batch size, in bytes, for each save
            -   ``"latency"``: a target latency, in seconds, between saves

            By default, ``fo.config.default_batcher`` is used

    Returns:
        a tuple of ``(batch_size, batching_strategy)``
    """
    if batching_strategy is None:
        if batch_size is None:
            batching_strategy = fo.config.default_batcher
        elif isinstance(batch_size, numbers.Integral):
            batching_strategy = "static"
        elif isinstance(batch_size, numbers.Number):
            batching_strategy = "latency"
        else:
            raise ValueError(
                "Unsupported batch size %s; must be an integer or float"
                % batch_size
            )

    supported_batching_strategies = ("static", "size", "latency")
    if batching_strategy not in supported_batching_strategies:
        raise ValueError(
            "Unsupported batching strategy '%s'; supported values are %s"
            % (batching_strategy, supported_batching_strategies)
        )

    if batch_size is None:
        if batching_strategy == "static":
            batch_size = fo.config.batcher_static_size
        elif batching_strategy == "size":
            batch_size = fo.config.batcher_target_size_bytes
        elif batching_strategy == "latency":
            batch_size = fo.config.batcher_target_latency

    return batch_size, batching_strategy


def recommend_batch_size_for_value(value, alpha=0.9, max_size=None):
    """Computes a recommended batch size for the given value type such that a
    request involving a list of values of this size will be less than
    ``alpha * fo.config.batcher_target_size_bytes`` bytes.

    Args:
        value: a value
        alpha (0.9): a safety factor
        max_size (None): an optional max batch size

    Returns:
         a recommended batch size
    """
    # Even if ``fo.config.default_batcher != "size"``, it's still reasonable to
    # use the size threshold to limit the size of individual requests
    target_size = fo.config.batcher_target_size_bytes
    value_bytes = sys.getsizeof(value, 40)  # 40 is size of an ObjectId
    batch_size = int(alpha * target_size / max(value_bytes, 1))
    if max_size is not None:
        batch_size = min(batch_size, max_size)

    return batch_size


@contextmanager
def disable_progress_bars():
    """Context manager that temporarily disables all progress bars.

    Example usage::

        import fiftyone as fo
        import fiftyone.zoo as foz

        with fo.disable_progress_bars():
            dataset = foz.load_zoo_dataset("quickstart")
    """
    prev_show_progress_bars = fo.config.show_progress_bars
    try:
        fo.config.show_progress_bars = False
        yield
    finally:
        fo.config.show_progress_bars = prev_show_progress_bars


class UniqueFilenameMaker(object):
    """A class that generates unique output paths in a directory.

    This class provides a :meth:`get_output_path` method that generates unique
    filenames in the specified output directory.

    If an input path is provided, its filename is maintained, unless a name
    conflict in ``output_dir`` would occur, in which case an index of the form
    ``"-%d" % count`` is appended to the filename.

    If no input filename is provided, an output filename of the form
    ``<output_dir>/<count><default_ext>`` is generated, where ``count`` is the
    number of files in ``output_dir``.

    If no ``output_dir`` is provided, then unique filenames with no base
    directory are generated.

    If a ``rel_dir`` is provided, then this path will be stripped from each
    input path to generate the identifier of each file (rather than just its
    basename). This argument allows for populating nested subdirectories in
    ``output_dir`` that match the shape of the input paths.

    If ``alt_dir`` is provided, you can use :meth:`get_alt_path` to retrieve
    the equivalent path rooted in this directory rather than ``output_dir``.

    Args:
        output_dir (None): a directory in which to generate output paths
        rel_dir (None): an optional relative directory to strip from each path.
            The path is converted to an absolute path (if necessary) via
            :func:`fiftyone.core.storage.normalize_path`
        alt_dir (None): an optional alternate directory in which to generate
            paths when :meth:`get_alt_path` is called
        chunk_size (None): if provided, output paths will be nested in
            subdirectories of ``output_dir`` with at most this many files per
            subdirectory. Has no effect if a ``rel_dir`` is provided
        default_ext (None): the file extension to use when generating default
            output paths
        ignore_exts (False): whether to omit file extensions when checking for
            duplicate filenames
        ignore_existing (False): whether to ignore existing files in
            ``output_dir`` for output filename generation purposes
        idempotent (True): whether to return the same output path when the same
            input path is provided multiple times (True) or to generate new
            output paths (False)
    """

    def __init__(
        self,
        output_dir=None,
        rel_dir=None,
        alt_dir=None,
        chunk_size=None,
        default_ext=None,
        ignore_exts=False,
        ignore_existing=False,
        idempotent=True,
    ):
        if rel_dir is not None:
            rel_dir = fos.normalize_path(rel_dir)
            chunk_size = None

        self.output_dir = output_dir
        self.rel_dir = rel_dir
        self.alt_dir = alt_dir
        self.chunk_size = chunk_size
        self.default_ext = default_ext
        self.ignore_exts = ignore_exts
        self.ignore_existing = ignore_existing
        self.idempotent = idempotent

        self._filepath_map = {}
        self._filename_counts = defaultdict(int)
        self._default_filename_patt = fo.config.default_sequence_idx + (
            default_ext or ""
        )
        self._idx = 0
        self._chunk_root = None
        self._chunk_num = 0
        self._chunk_count = 0

        self._setup()

    def _setup(self):
        if self.chunk_size is not None:
            if self.output_dir:
                chunk_root = os.path.basename(fos.normpath(self.output_dir))
            else:
                chunk_root = "chunk"

            self._chunk_root = chunk_root

        if not self.output_dir:
            return

        etau.ensure_dir(self.output_dir)

        if self.ignore_existing:
            return

        recursive = self.rel_dir is not None
        filenames = etau.list_files(self.output_dir, recursive=recursive)

        self._idx = len(filenames)
        for filename in filenames:
            self._filename_counts[filename] += 1

    def seen_input_path(self, input_path):
        """Checks whether we've already seen the given input path.

        Args:
            input_path: an input path

        Returns:
            True/False
        """
        return fos.normalize_path(input_path) in self._filepath_map

    def get_output_path(self, input_path=None, output_ext=None):
        """Returns a unique output path.

        Args:
            input_path (None): an input path
            output_ext (None): an optional output extension to use

        Returns:
            the output path
        """
        found_input = bool(input_path)

        if found_input:
            input_path = fos.normalize_path(input_path)

            if self.idempotent and input_path in self._filepath_map:
                return self._filepath_map[input_path]

        self._idx += 1

        if not found_input:
            filename = self._default_filename_patt % self._idx
        elif self.rel_dir is not None:
            filename = safe_relpath(input_path, self.rel_dir)
        else:
            filename = os.path.basename(input_path)

        name, ext = os.path.splitext(filename)

        # URL handling
        # @todo improve this, while still maintaining Unix/Windows path support
        name = name.replace("%", "-")
        ext = ext.split("?")[0]

        if output_ext is not None:
            ext = output_ext

        filename = name + ext

        key = name if self.ignore_exts else filename
        self._filename_counts[key] += 1

        count = self._filename_counts[key]
        if count > 1:
            filename = name + ("-%d" % count) + ext

        if self.chunk_size is not None:
            chunk_dir = self._chunk_root + "_" + str(self._chunk_num)
            filename = os.path.join(chunk_dir, filename)

            self._chunk_count += 1
            if self._chunk_count >= self.chunk_size:
                self._chunk_num += 1
                self._chunk_count = 0

        if self.output_dir:
            output_path = os.path.join(self.output_dir, filename)
        else:
            output_path = filename

        if found_input:
            self._filepath_map[input_path] = output_path

        return output_path

    def get_alt_path(self, output_path, alt_dir=None):
        """Returns the alternate path for the given output path generated by
        :meth:`get_output_path`.

        Args:
            output_path: an output path
            alt_dir (None): a directory in which to return the alternate path.
                If not provided, :attr:`alt_dir` is used

        Returns:
            the corresponding alternate path
        """
        root_dir = alt_dir or self.alt_dir or self.output_dir
        rel_path = os.path.relpath(output_path, self.output_dir)
        return os.path.join(root_dir, rel_path)


def safe_relpath(path, start=None, default=None):
    """A safe version of ``os.path.relpath`` that returns a configurable
    default value if the given path if it does not lie within the given
    relative start.

    Args:
        path: a path
        start (None): the relative prefix to strip from ``path``
        default (None): a default value to return if ``path`` does not lie
            within ``start``. By default, the basename of the path is returned

    Returns:
        the relative path
    """
    relpath = os.path.relpath(path, start)
    if relpath.startswith(".."):
        if default is not None:
            return default

        logger.warning(
            "Path '%s' is not in '%s'. Using filename as unique identifier",
            path,
            start,
        )
        relpath = os.path.basename(path)

    return relpath


def compute_filehash(filepath, method=None, chunk_size=None):
    """Computes the hash of the given file.

    Args:
        filepath: the path to the file
        method (None): an optional ``hashlib`` method to use. If not specified,
            the builtin ``str.__hash__`` will be used
        chunk_size (None): an optional chunk size to use to read the file, in
            bytes. Only applicable when a ``method`` is provided. The default
            is 64kB. If negative, the entire file is read at once

    Returns:
        the hash
    """
    if method is None:
        with open(filepath, "rb") as f:
            return hash(f.read())

    if chunk_size is None:
        chunk_size = 65536

    hasher = getattr(hashlib, method)()
    with open(filepath, "rb") as f:
        while True:
            data = f.read(chunk_size)
            if not data:
                break

            hasher.update(data)

    return hasher.hexdigest()


def serialize_numpy_array(array, ascii=False):
    """Serializes a numpy array.

    Args:
        array: a numpy array-like
        ascii (False): whether to return a base64-encoded ASCII string instead
            of raw bytes

    Returns:
        the serialized bytes
    """
    with io.BytesIO() as f:
        np.save(f, np.asarray(array), allow_pickle=False)
        bytes_str = zlib.compress(f.getvalue())

    if ascii:
        bytes_str = b64encode(bytes_str).decode("ascii")

    return bytes_str


def deserialize_numpy_array(numpy_bytes, ascii=False):
    """Loads a serialized numpy array generated by
    :func:`serialize_numpy_array`.

    Args:
        numpy_bytes: the serialized numpy array bytes
        ascii (False): whether the bytes were generated with the
            ``ascii == True`` parameter of :func:`serialize_numpy_array`

    Returns:
        the numpy array
    """
    if ascii:
        numpy_bytes = b64decode(numpy_bytes.encode("ascii"))

    with io.BytesIO(zlib.decompress(numpy_bytes)) as f:
        return np.load(f)


def iter_batches(iterable, batch_size):
    """Iterates over the given iterable in batches.

    Args:
        iterable: an iterable
        batch_size: the desired batch size, or None to return the contents in
            a single batch

    Returns:
        a generator that emits tuples of elements of the requested batch size
        from the input
    """
    it = iter(iterable)
    while True:
        chunk = tuple(itertools.islice(it, batch_size))
        if not chunk:
            return

        yield chunk


def iter_slices(sliceable, batch_size):
    """Iterates over batches of the given object via slicing.

    Args:
        sliceable: an object that supports slicing
        batch_size: the desired batch size, or None to return the contents in
            a single batch

    Returns:
        a generator that emits batches of elements of the requested batch size
        from the input
    """
    if batch_size is None:
        yield sliceable
        return

    try:
        end = len(sliceable)
    except:
        end = None

    start = 0
    while True:
        if end is not None and start >= end:
            return

        chunk = sliceable[start : (start + batch_size)]

        # works for numpy arrays, Torch tensors, etc
        if end is None and len(chunk) == 0:
            return

        start += batch_size
        yield chunk


def call_on_exit(callback):
    """Registers the given callback function so that it will be called when the
    process exits for (almost) any reason

    Note that this should only be used from non-interactive scripts because it
    intercepts ctrl + c.

    Covers the following cases:
    -   normal program termination
    -   a Python exception is raised
    -   a SIGTERM signal is received

    Args:
        callback: the function to execute upon termination
    """
    atexit.register(callback)
    signal.signal(signal.SIGTERM, lambda *args: callback())


class MonkeyPatchFunction(object):
    """Context manager that temporarily monkey patches the given function.

    If a ``namespace`` is provided, all functions with same name as the
    function you are monkey patching that are imported (recursively) by the
    ``module_or_fcn`` module are also monkey patched.

    Args:
        module_or_fcn: a module or function
        monkey_fcn: the function to monkey patch in
        fcn_name (None): the name of the function to monkey patch. Required iff
            ``module_or_fcn`` is a module
        namespace (None): an optional package namespace
    """

    def __init__(
        self, module_or_fcn, monkey_fcn, fcn_name=None, namespace=None
    ):
        if inspect.isfunction(module_or_fcn):
            module = inspect.getmodule(module_or_fcn)
            fcn_name = module_or_fcn.__name__
        else:
            module = module_or_fcn

        self.module = module
        self.fcn_name = fcn_name
        self.monkey_fcn = monkey_fcn
        self.namespace = namespace
        self._orig = None
        self._replace_modules = None

    def __enter__(self):
        self._orig = getattr(self.module, self.fcn_name)
        self._replace_modules = []
        self._find(self.module)
        self._set(self.monkey_fcn)
        return self

    def __exit__(self, *args):
        self._set(self._orig)

    def _set(self, fcn):
        for mod in self._replace_modules:
            setattr(mod, self.fcn_name, fcn)

    def _find(self, module):
        dir_module = dir(module)
        if self.fcn_name in dir_module:
            self._replace_modules.append(module)

        if self.namespace is not None:
            for attr in dir_module:
                mod = getattr(module, attr)
                if inspect.ismodule(mod) and mod.__package__.startswith(
                    self.namespace.__package__
                ):
                    self._find(mod)


class SetAttributes(object):
    """Context manager that temporarily sets the attributes of a class to new
    values.

    Args:
        obj: the object
        **kwargs: the attribute key-values to set while the context is active
    """

    def __init__(self, obj, **kwargs):
        self._obj = obj
        self._kwargs = kwargs
        self._orig_kwargs = None
        self._new_kwargs = None

    def __enter__(self):
        self._orig_kwargs = {}
        self._new_kwargs = set()
        for k, v in self._kwargs.items():
            if hasattr(self._obj, k):
                self._orig_kwargs[k] = getattr(self._obj, k)
            else:
                self._new_kwargs.add(k)

            setattr(self._obj, k, v)

        return self

    def __exit__(self, *args):
        for k, v in self._orig_kwargs.items():
            setattr(self._obj, k, v)

        for k in self._new_kwargs:
            delattr(self._obj, k)


class SuppressLogging(object):
    """Context manager that temporarily disables system-wide logging.

    Args:
        level (logging.CRITICAL): the ``logging`` level at or below which to
            suppress all messages
    """

    def __init__(self, level=logging.CRITICAL):
        self.level = level

    def __enter__(self):
        logging.disable(self.level)
        return self

    def __exit__(self, *args):
        logging.disable(logging.NOTSET)


class add_sys_path(object):
    """Context manager that temporarily inserts a path to ``sys.path``."""

    def __init__(self, path, index=0):
        self.path = path
        self.index = index

    def __enter__(self):
        sys.path.insert(self.index, self.path)

    def __exit__(self, *args):
        try:
            sys.path.remove(self.path)
        except:
            pass


def is_arm_mac():
    """Determines whether the system is an ARM-based Mac (Apple Silicon).

    Returns:
        True/False
    """
    plat = platform.platform()
    return platform.system() == "Darwin" and any(
        proc in plat for proc in {"aarch64", "arm64"}
    )


def is_32_bit():
    """Determines whether the system is 32-bit.

    Returns:
        True/False
    """
    return struct.calcsize("P") * 8 == 32


def is_container():
    """Determines if we're currently running as a container.

    Returns:
        True/False
    """
    return _is_docker() or _is_podman()


def _is_docker():
    path = "/proc/self/cgroup"
    return (
        os.path.exists("/.dockerenv")
        or os.path.isfile(path)
        and any("docker" in line for line in open(path))
    )


def _is_podman():
    return os.path.exists("/run/.containerenv")


def get_multiprocessing_context():
    """Returns the preferred ``multiprocessing`` context for the current OS.

    Returns:
        a ``multiprocessing`` context
    """
    if (
        sys.platform == "darwin"
        and multiprocessing.get_start_method(allow_none=True) is None
    ):
        #
        # If we're running on macOS and the user didn't manually configure the
        # default multiprocessing context, force 'fork' to be used
        #
        # Background: on macOS, multiprocessing's default context was changed
        # from 'fork' to 'spawn' in Python 3.8, but we prefer 'fork' because
        # the startup time is much shorter. Also, this is not fully proven, but
        # @brimoor believes he's seen cases where 'spawn' causes some of our
        # `multiprocessing.Pool.imap_unordered()` calls to run twice...
        #
        return multiprocessing.get_context("fork")

    # Use the default context
    return multiprocessing.get_context()


def recommend_thread_pool_workers(num_workers=None):
    """Recommends a number of workers for a thread pool.

    If a ``fo.config.max_thread_pool_workers`` is set, this limit is applied.

    Args:
        num_workers (None): a suggested number of workers

    Returns:
        a number of workers
    """
    if num_workers is None:
        num_workers = multiprocessing.cpu_count()

    if fo.config.max_thread_pool_workers is not None:
        num_workers = min(num_workers, fo.config.max_thread_pool_workers)

    return num_workers


def recommend_process_pool_workers(num_workers=None):
    """Recommends a number of workers for a process pool.

    If a ``fo.config.max_process_pool_workers`` is set, this limit is applied.

    Args:
        num_workers (None): a suggested number of workers

    Returns:
        a number of workers
    """
    if num_workers is None:
        if sys.platform.startswith("win"):
            # Windows tends to have multiprocessing issues
            num_workers = 1
        else:
            num_workers = multiprocessing.cpu_count()

    if fo.config.max_process_pool_workers is not None:
        num_workers = min(num_workers, fo.config.max_process_pool_workers)

    return num_workers


sync_task_executor = None


def _get_sync_task_executor():
    global sync_task_executor

    max_workers = fo.config.max_thread_pool_workers
    if sync_task_executor is None and max_workers is not None:
        sync_task_executor = ThreadPoolExecutor(max_workers=max_workers)

    return sync_task_executor


async def run_sync_task(func, *args):
    """Run a synchronous function as an async background task.

    Args:
        func: a synchronous callable
        *args: function arguments

    Returns:
        the function's return value(s)
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_get_sync_task_executor(), func, *args)


def datetime_to_timestamp(dt):
    """Converts a `datetime.date` or `datetime.datetime` to milliseconds since
    epoch.

    Args:
        dt: a `datetime.date` or `datetime.datetime`

    Returns:
        the float number of milliseconds since epoch
    """
    if type(dt) is date:
        dt = datetime(dt.year, dt.month, dt.day)

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=pytz.utc)

    return 1000.0 * dt.timestamp()


def timestamp_to_datetime(ts):
    """Converts a timestamp (number of milliseconds since epoch) to a
    `datetime.datetime`.

    Args:
        ts: a number of milliseconds since epoch

    Returns:
        a `datetime.datetime`
    """
    dt = datetime.utcfromtimestamp(ts / 1000.0)

    if fo.config.timezone is None:
        return dt

    timezone = pytz.timezone(fo.config.timezone)
    return dt.replace(tzinfo=pytz.utc).astimezone(timezone)


def timedelta_to_ms(td):
    """Converts a `datetime.timedelta` to milliseconds.

    Args:
        td: a `datetime.timedelta`

    Returns:
        the float number of milliseconds
    """
    return (
        86400000.0 * td.days + 1000.0 * td.seconds + td.microseconds / 1000.0
    )


class ResponseStream(object):
    """Wrapper around a ``requests.Response`` that provides a file-like object
    interface with ``read()``, ``seek()``, and ``tell()`` methods.

    Source:
        https://gist.github.com/obskyr/b9d4b4223e7eaf4eedcd9defabb34f13

    Args:
        response: a ``requests.Response``
        chunk_size (64): the chunk size to use to read the response's content
    """

    def __init__(self, response, chunk_size=64):
        self._response = response
        self._iterator = response.iter_content(chunk_size)
        self._bytes = io.BytesIO()

    def read(self, size=None):
        left_off_at = self._bytes.tell()
        if size is None:
            self._load_all()
        else:
            goal_position = left_off_at + size
            self._load_until(goal_position)

        self._bytes.seek(left_off_at)
        return self._bytes.read(size)

    def seek(self, position, whence=io.SEEK_SET):
        if whence == io.SEEK_END:
            self._load_all()
        else:
            self._bytes.seek(position, whence)

    def tell(self):
        return self._bytes.tell()

    def _load_all(self):
        self._bytes.seek(0, io.SEEK_END)
        for chunk in self._iterator:
            self._bytes.write(chunk)

    def _load_until(self, goal_position):
        current_position = self._bytes.seek(0, io.SEEK_END)
        while current_position < goal_position:
            try:
                current_position += self._bytes.write(next(self._iterator))
            except StopIteration:
                break


_SAFE_CHARS = set(string.ascii_letters) | set(string.digits)
_HYPHEN_CHARS = set(string.whitespace) | set("+_.-")
_NAME_LENGTH_RANGE = (1, 100)


def _sanitize_char(c):
    if c in _SAFE_CHARS:
        return c

    if c in _HYPHEN_CHARS:
        return "-"

    return ""


def to_slug(name):
    """Returns the URL-friendly slug for the given string.

    The following strategy is used to generate slugs:

        -   The characters ``A-Za-z0-9`` are converted to lowercase
        -   Whitespace and ``+_.-`` are converted to ``-``
        -   All other characters are omitted
        -   All consecutive ``-`` characters are reduced to a single ``-``
        -   All leading and trailing ``-`` are stripped
        -   Both the input name and the resulting string must be ``[1, 100]``
            characters in length

    Examples::

        name                             | slug
        ---------------------------------+-----------------------
        coco_2017                        | coco-2017
        c+o+c+o 2-0-1-7                  | c-o-c-o-2-0-1-7
        cat.DOG                          | cat-dog
        ---name----                      | name
        Brian's #$&@ (Awesome?) Dataset! | brians-awesome-dataset
        sPaM     aNd  EgGs               | spam-and-eggs

    Args:
        name: a string

    Returns:
        the slug string

    Raises:
        ValueError: if the name is invalid
    """
    if not etau.is_str(name):
        raise ValueError("Expected string; found %s: %s" % (type(name), name))

    if len(name) > _NAME_LENGTH_RANGE[1]:
        raise ValueError(
            "'%s' is too long; length %d > %d"
            % (name, len(name), _NAME_LENGTH_RANGE[1])
        )

    safe = []
    last = ""
    for c in name:
        s = _sanitize_char(c)
        if s and (s != "-" or last != "-"):
            safe.append(s)
            last = s

    slug = "".join(safe).strip("-").lower()

    if len(slug) < _NAME_LENGTH_RANGE[0]:
        raise ValueError(
            "'%s' has invalid slug-friendly name '%s'; length %d < %d"
            % (name, slug, len(slug), _NAME_LENGTH_RANGE[0])
        )

    if len(slug) > _NAME_LENGTH_RANGE[1]:
        raise ValueError(
            "'%s' has invalid slug-friendly name '%s'; length %d > %d"
            % (name, slug, len(slug), _NAME_LENGTH_RANGE[1])
        )

    return slug


def validate_color(value):
    """Validates that the given value is a valid css color name.

    Args:
        value: a value

    Raises:
        ValueError: if ``value`` is not a valid css color name.
    """

    if not etau.is_str(value) or not (
        value in mcolors.CSS4_COLORS
        or re.search(r"^#(?:[0-9a-fA-F]{3}){1,2}$", value)
    ):
        raise ValueError(
            """%s is neither a valid CSS color name in all lowercase \n"""
            """(eg: 'yellowgreen') nor a hex color(eg. '#00ff00')""" % value
        )


def validate_hex_color(value):
    """Validates that the given value is a hex color string or css name.

    Args:
        value: a value

    Raises:
        ValueError: if ``value`` is not a hex color string
    """
    if not etau.is_str(value) or not re.search(
        r"^#(?:[0-9a-fA-F]{3}){1,2}$", value
    ):
        raise ValueError(
            "%s is not a valid hex color string (eg: '#FF6D04')" % value
        )


fos = lazy_import("fiftyone.core.storage")
