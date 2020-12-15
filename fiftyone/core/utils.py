"""
Core utilities.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import atexit
from base64 import b64encode, b64decode
from collections import defaultdict
from contextlib import contextmanager
from copy import deepcopy
import importlib
import inspect
import io
import itertools
import logging
import os
import signal
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
import packaging.version
import xmltodict

import eta
import eta.core.utils as etau

import fiftyone as fo


logger = logging.getLogger(__name__)


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


def ensure_tf(error_msg=None):
    """Verifies that TensorFlow is installed and importable.

    Args:
        error_msg (None): an optional custom error message to print

    Raises:
        ImportError: if ``tensorflow`` could not be imported
    """
    _ensure_import("tensorflow", error_msg=error_msg)


def ensure_tfds(error_msg=None):
    """Verifies that the ``tensorflow_datasets`` package is installed and
    importable.

    Args:
        error_msg (None): an optional custom error message to print

    Raises:
        ImportError: if ``tensorflow_datasets`` could not be imported
    """
    _ensure_import("tensorflow", min_version="1.15", error_msg=error_msg)
    _ensure_import("tensorflow_datasets", error_msg=error_msg)


def ensure_torch(error_msg=None):
    """Verifies that PyTorch is installed and importable.

    Args:
        error_msg (None): an optional custom error message to print

    Raises:
        ImportError: if ``torch`` or ``torchvision`` could not be imported
    """
    _ensure_import("torch", error_msg=error_msg)
    _ensure_import("torchvision", error_msg=error_msg)


def ensure_pycocotools(error_msg=None):
    """Verifies that pycocotools is installed and importable.

    Args:
        error_msg (None): an optional custom error message to print

    Raises:
        ImportError: if ``pycocotools`` could not be imported
    """
    _ensure_import("pycocotools", error_msg=error_msg)


def _ensure_import(module_name, min_version=None, error_msg=None):
    has_min_ver = min_version is not None

    if has_min_ver:
        min_version = packaging.version.parse(min_version)

    try:
        mod = importlib.import_module(module_name)
    except ImportError as e:
        if has_min_ver:
            module_str = "%s>=%s" % (module_name, min_version)
        else:
            module_str = module_name

        if error_msg is not None:
            raise ImportError(error_msg) from e

        raise ImportError(
            "The requested operation requires that '%s' is installed on your "
            "machine" % module_str,
            name=module_name,
        ) from e

    if has_min_ver:
        # @todo not all modules have `__version__`
        mod_version = packaging.version.parse(mod.__version__)
        if mod_version < min_version:
            raise ImportError(
                "The requested operation requires that '%s>=%s' is installed "
                "on your machine; found '%s==%s'"
                % (module_name, min_version, module_name, mod_version),
                name=module_name,
            )


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

        with ResourceLimit(resource.RLIMIT_NOFILE, soft=4096):
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
            import resource

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
    def __init__(self, *args, **kwargs):
        quiet = not fo.config.show_progress_bars
        super().__init__(*args, iters_str="samples", quiet=quiet, **kwargs)


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

    If an input filename is provided, the filename is maintained, unless a
    name conflict in ``output_dir`` would occur, in which case an index of the
    form ``"-%d" % count`` is appended to the base filename.

    If no input filename is provided, an output filename of the form
    ``<output_dir>/<count><default_ext>`` is generated, where ``count`` is the
    number of files in ``output_dir``.

    If no ``output_dir`` is provided, then unique filenames with no base
    directory are generated.

    Args:
        output_dir (""): the directory in which to generate output paths
        default_ext (""): the file extension to use when generating default
            output paths
        ignore_exts (False): whether to omit file extensions when checking for
            duplicate filenames
    """

    def __init__(self, output_dir="", default_ext="", ignore_exts=False):
        self.output_dir = output_dir
        self.default_ext = default_ext
        self.ignore_exts = ignore_exts

        self._filename_counts = defaultdict(int)
        self._default_filename_patt = (
            fo.config.default_sequence_idx + default_ext
        )
        self._idx = 0

        if output_dir:
            etau.ensure_dir(output_dir)
            filenames = etau.list_files(output_dir)
            self._idx = len(filenames)
            for filename in filenames:
                self._filename_counts[filename] += 1

    def get_output_path(self, input_path=None, output_ext=None):
        """Returns a unique output path.

        Args:
            input_path (None): an input path from which to derive the output
                path
            output_ext (None): an optional output extension to use

        Returns:
            the output path
        """
        self._idx += 1

        if not input_path:
            input_path = self._default_filename_patt % self._idx

        filename = os.path.basename(input_path)
        name, ext = os.path.splitext(filename)

        if output_ext is not None:
            ext = output_ext
            filename = name + ext

        key = name if self.ignore_exts else filename
        self._filename_counts[key] += 1

        count = self._filename_counts[key]
        if count > 1:
            filename = name + ("-%d" % count) + ext

        return os.path.join(self.output_dir, filename)


def compute_filehash(filepath):
    """Computes the file hash of the given file.

    Args:
        filepath: the path to the file

    Returns:
        the file hash
    """
    with open(filepath, "rb") as f:
        return hash(f.read())


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
