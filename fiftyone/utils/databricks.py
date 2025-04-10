"""
Databricks utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone as fo
import fiftyone.core.utils as fou


def with_fiftyone_useragent():
    try:
        useragent = fou.lazy_import("databricks.sdk.useragent")
        useragent.with_partner("voxel51")
        useragent.with_product("fiftyone", fo.__version__)
    except ImportError:
        pass
