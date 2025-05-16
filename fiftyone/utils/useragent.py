"""
User agent utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone.constants as foc


def with_fiftyone_useragent():
    try:
        from databricks.sdk import useragent

        useragent.with_partner("voxel51")
        useragent.with_product("fiftyone", foc.VERSION)
    except:
        pass
