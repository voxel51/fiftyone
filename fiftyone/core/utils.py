"""
Core utilities.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import atexit
from base64 import b64encode, b64decode
from collections import defaultdict
import importlib
import io
import itertools
import logging
import os
import signal
import types
import zlib

import numpy as np
import packaging.version
import xmltodict

import eta.core.utils as etau

import fiftyone as fo


logger = logging.getLogger(__name__)


def ensure_tf():
    """Verifies that TensorFlow is installed on the host machine.

    Raises:
        ImportError: if ``tensorflow`` could not be imported
    """
    _ensure_package("tensorflow")


def ensure_tfds():
    """Verifies that the ``tensorflow_datasets`` package is installed on the
    host machine.

    Raises:
        ImportError: if ``tensorflow_datasets`` could not be imported
    """
    _ensure_package("tensorflow", min_version="1.15")
    _ensure_package("tensorflow_datasets")


def ensure_torch():
    """Verifies that PyTorch is installed on the host machine.

    Raises:
        ImportError: if ``torch`` or ``torchvision`` could not be imported
    """
    _ensure_package("torch")
    _ensure_package("torchvision")


def ensure_pycocotools():
    """Verifies that pycocotools is installed on the host machine.

    Raises:
        ImportError: if ``pycocotools`` could not be imported
    """
    _ensure_package("pycocotools")


def _ensure_package(package_name, min_version=None):
    has_min_ver = min_version is not None

    if has_min_ver:
        min_version = packaging.version.parse(min_version)

    try:
        pkg = importlib.import_module(package_name)
    except ImportError as e:
        if has_min_ver:
            pkg_str = "%s>=%s" % (package_name, min_version)
        else:
            pkg_str = package_name

        raise ImportError(
            "The requested operation requires that '%s' is installed on your "
            "machine" % pkg_str
        ) from e

    if has_min_ver:
        pkg_version = packaging.version.parse(pkg.__version__)
        if pkg_version < min_version:
            raise ImportError(
                "The requested operation requires that '%s>=%s' is installed "
                "on your machine; found '%s==%s'"
                % (package_name, min_version, package_name, pkg_version)
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
        super(LazyModule, self).__init__(module_name)
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


class ResourceLimit(object):
    """Context manager that allows for a temporary change to a resource limit
    exposed by the `resource` package.

    Example::

        import resource

        with ResourceLimit(resource.RLIMIT_NOFILE, soft=4096):
            # temporarily do things with up to 4096 open files

    Args:
        limit: the name of the resource to limit. Must be the name of a
            constant in the `resource` module starting with `RLIMIT`. See the
            documentation of the `resource` module for supported values
        soft: a new soft limit to apply, which cannot exceed the hard limit
        hard: a new hard limit to apply, which cannot exceed the current
            hard limit
        warn_on_failure: whether to issue a warning rather than an error
            if the resource limit change is not successful
    """

    def __init__(
        self, limit_name, soft=None, hard=None, warn_on_failure=False
    ):
        if not limit_name.startswith("RLIMIT_"):
            raise ValueError("Invalid limit name: %r")

        self._supported_platform = False
        try:
            import resource

            self._supported_platform = True
        except ImportError:
            return

        self._limit = getattr(resource, limit_name)
        self._soft = soft
        self._hard = hard
        self._soft_orig = None
        self._hard_orig = None
        self._warn_on_failure = warn_on_failure

    def __enter__(self):
        if not self._supported_platform:
            return

        import resource

        self._soft_orig, self._hard_orig = resource.getrlimit(self._limit)
        soft = self._soft or self._soft_orig
        hard = self._hard or self._hard_orig
        self._set_resource_limit(soft, hard)
        return self

    def __exit__(self, *args):
        if not self._supported_platform:
            return

        self._set_resource_limit(self._soft_orig, self._hard_orig)

    def _set_resource_limit(self, soft, hard):
        if not self._supported_platform:
            return

        import resource

        try:
            resource.setrlimit(self._limit, (soft, hard))
        except ValueError as e:
            if self._warn_on_failure:
                logger.warning(e)
            else:
                raise


class ProgressBar(etau.ProgressBar):
    def __init__(self, *args, **kwargs):
        quiet = not fo.config.show_progress_bars
        super(ProgressBar, self).__init__(
            *args, iters_str="samples", quiet=quiet, **kwargs
        )


class UniqueFilenameMaker(object):
    """A class that generates unique output paths in a directory.

    The filenames of the input files are maintained, unless a name conflict
    in ``output_dir`` would occur, in which case an index of the form
    ``"-%d" % count`` is appended to the base filename.

    If no ``output_dir`` is provided, then unique filenames are generated.

    Args:
        output_dir (None): the directory in which to generate output paths
        ignore_exts (False): whether to omit file extensions when checking for
            duplicate filenames
    """

    def __init__(self, output_dir=None, ignore_exts=False):
        self.output_dir = output_dir
        self.ignore_exts = ignore_exts
        self._filename_counts = defaultdict(int)

        if output_dir:
            etau.ensure_dir(output_dir)
            for filename in etau.list_files(output_dir):
                self._filename_counts[filename] += 1

    def get_output_path(self, input_path):
        """Returns the output path for the given input path.

        Args:
            input_path: the input path

        Returns:
            the output path
        """
        filename = os.path.basename(input_path)
        name, ext = os.path.splitext(filename)

        key = name if self.ignore_exts else filename
        self._filename_counts[key] += 1

        count = self._filename_counts[key]
        if count > 1:
            filename = name + ("-%d" % count) + ext

        if self.output_dir:
            return os.path.join(self.output_dir, filename)

        return filename


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
        array: a numpy array
        ascii (False): whether to return a base64-encoded ASCII string instead
            of raw bytes

    Returns:
        the serialized bytes
    """
    with io.BytesIO() as f:
        np.save(f, array, allow_pickle=False)
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
        from the input iterable
    """
    it = iter(iterable)
    while True:
        chunk = tuple(itertools.islice(it, batch_size))
        if not chunk:
            return

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
