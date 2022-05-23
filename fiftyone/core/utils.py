"""
Core utilities.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import atexit
from base64 import b64encode, b64decode
from collections import defaultdict
from contextlib import contextmanager
from copy import deepcopy
from datetime import date, datetime
import hashlib
import importlib
import inspect
import io
import itertools
import logging
import ntpath
import os
import posixpath
import platform
import signal
import struct
import subprocess
import timeit
import types
import zlib

try:
    import pprintpp as _pprint

    # Monkey patch to prevent sorting keys
    # https://stackoverflow.com/a/25688431
    _pprint._sorted = lambda x: x
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
    "See https://voxel51.com/docs/fiftyone/user_guide/config.html for details."
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


def normalize_path(path):
    """Normalizes the given path by converting it to an absolute path and
    expanding the user directory, if necessary.

    Args:
        path: a path

    Returns:
        the normalized path
    """
    return os.path.abspath(os.path.expanduser(path))


def ensure_package(
    requirement_str, error_level=None, error_msg=None, log_success=False
):
    """Verifies that the given package is installed.

    This function uses ``pkg_resources.get_distribution`` to locate the package
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
            -   1: log warning if requirement is not satisifed
            -   2: ignore unsatisifed requirements

            By default, ``fiftyone.config.requirement_error_level`` is used
        error_msg (None): an optional custom error message to use
        log_success (False): whether to generate a log message if the
            requirement is satisifed

    Returns:
        True/False whether the requirement is satisifed
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
            -   1: log warning if requirement is not satisifed
            -   2: ignore unsatisifed requirements

            By default, ``fiftyone.config.requirement_error_level`` is used
        error_msg (None): an optional custom error message to use
        log_success (False): whether to generate a log message if the
            requirement is satisifed

    Returns:
        True/False whether the requirement is satisifed
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
            -   1: log warning if requirement is not satisifed
            -   2: ignore unsatisifed requirements

            By default, ``fiftyone.config.requirement_error_level`` is used
        error_msg (None): an optional custom error message to print

    Returns:
        True/False whether the requirement is satisifed
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
            -   1: log warning if requirement is not satisifed
            -   2: ignore unsatisifed requirements

            By default, ``fiftyone.config.requirement_error_level`` is used
        error_msg (None): an optional custom error message to print

    Returns:
        True/False whether the requirement is satisifed
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
            -   1: log warning if requirement is not satisifed
            -   2: ignore unsatisifed requirements

            By default, ``fiftyone.config.requirement_error_level`` is used
        error_msg (None): an optional custom error message to print

    Returns:
        True/False whether the requirement is satisifed
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
    with open(xml_path, "rb") as f:
        return xmltodict.parse(f.read())


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

    def __init__(self, *args, **kwargs):
        if "quiet" not in kwargs:
            kwargs["quiet"] = not fo.config.show_progress_bars

        if "iters_str" not in kwargs:
            kwargs["iters_str"] = "samples"

        # For progress bars in notebooks, use a fixed size so that they will
        # read well across browsers, in HTML format, etc
        if foc.is_notebook_context() and "max_width" not in kwargs:
            kwargs["max_width"] = 90

        super().__init__(*args, **kwargs)


class DynamicBatcher(object):
    """Class for iterating over the elements of an iterable with a dynamic
    batch size to achieve a desired latency.

    The batch sizes emitted when iterating over this object are dynamically
    scaled such that the latency between ``next()`` calls is as close as
    possible to a specified target latency.

    This class is often used in conjunction with a :class:`ProgressBar` to keep
    the user appraised on the status of a long-running task.

    Example usage::

        import fiftyone.core.utils as fou

        total = int(1e7)
        elements = range(total)

        batches = fou.DynamicBatcher(
            elements, target_latency=0.1, max_batch_beta=2.0
        )

        with fou.ProgressBar(total) as pb:
            for batch in batches:
                batch_size = len(batch)
                print("batch size: %d" % batch_size)
                pb.update(count=batch_size)

    Args:
        iterable: an iterable
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
    ):
        import fiftyone.core.collections as foc

        if not isinstance(iterable, foc.SampleCollection):
            return_views = False

        self.iterable = iterable
        self.target_latency = target_latency
        self.init_batch_size = init_batch_size
        self.min_batch_size = min_batch_size
        self.max_batch_size = max_batch_size
        self.max_batch_beta = max_batch_beta
        self.return_views = return_views

        self._iter = None
        self._last_time = None
        self._last_batch_size = None

        self._last_offset = None
        self._num_samples = None

    def __iter__(self):
        if self.return_views:
            self._last_offset = 0
            self._num_samples = len(self.iterable)
        else:
            self._iter = iter(self.iterable)

        self._last_batch_size = None

        return self

    def __next__(self):
        batch_size = self._compute_batch_size()

        if self.return_views:
            if self._last_offset >= self._num_samples:
                raise StopIteration

            offset = self._last_offset
            self._last_offset += batch_size

            return self.iterable[offset : (offset + batch_size)]

        batch = []

        try:
            idx = 0
            while idx < batch_size:
                batch.append(next(self._iter))
                idx += 1

        except StopIteration:
            if not batch:
                raise StopIteration

        return batch

    def _compute_batch_size(self):
        current_time = timeit.default_timer()

        if self._last_batch_size is None:
            batch_size = self.init_batch_size
        else:
            # Compute optimal batch size
            try:
                beta = self.target_latency / (current_time - self._last_time)
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
        self._last_time = current_time

        return batch_size


@contextmanager
def disable_progress_bars():
    """Context manager that temporarily disables all progress bars."""
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

    Args:
        output_dir (None): a directory in which to generate output paths
        rel_dir (None): an optional relative directory to strip from each path
        default_ext (None): the file extension to use when generating default
            output paths
        ignore_exts (False): whether to omit file extensions when checking for
            duplicate filenames
    """

    def __init__(
        self,
        output_dir=None,
        rel_dir=None,
        default_ext=None,
        ignore_exts=False,
    ):
        self.output_dir = output_dir
        self.rel_dir = rel_dir
        self.default_ext = default_ext
        self.ignore_exts = ignore_exts

        self._filepath_map = {}
        self._filename_counts = defaultdict(int)
        self._default_filename_patt = fo.config.default_sequence_idx + (
            default_ext or ""
        )
        self._idx = 0

        self._setup()

    def _setup(self):
        if not self.output_dir:
            return

        etau.ensure_dir(self.output_dir)
        filenames = etau.list_files(self.output_dir)

        self._idx = len(filenames)
        for filename in filenames:
            self._filename_counts[filename] += 1

    def get_output_path(self, input_path=None, output_ext=None):
        """Returns a unique output path.

        Args:
            input_path (None): an input path
            output_ext (None): an optional output extension to use

        Returns:
            the output path
        """
        found_input = bool(input_path)

        if found_input and input_path in self._filepath_map:
            return self._filepath_map[input_path]

        self._idx += 1

        if not found_input:
            filename = self._default_filename_patt % self._idx
        elif self.rel_dir:
            filename = os.path.relpath(input_path, self.rel_dir)
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

        if self.output_dir:
            output_path = os.path.join(self.output_dir, filename)
        else:
            output_path = filename

        if found_input:
            self._filepath_map[input_path] = output_path

        return output_path


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

    start = 0
    while True:
        chunk = sliceable[start : (start + batch_size)]
        if len(chunk) == 0:  # works for numpy arrays, Torch tensors, etc
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
        fcn_name (None): the name of the funciton to monkey patch. Required iff
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

    def __enter__(self):
        self._orig_kwargs = {}
        for k, v in self._kwargs.items():
            self._orig_kwargs[k] = getattr(self._obj, k)
            setattr(self._obj, k, v)

        return self

    def __exit__(self, *args):
        for k, v in self._orig_kwargs.items():
            setattr(self._obj, k, v)


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
