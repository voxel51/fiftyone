"""
FiftyOne builtin plugins.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def get_subsets_from_custom_code(ctx, custom_code):
    try:
        local_vars = {}
        exec(custom_code, {"ctx": ctx}, local_vars)
        data = local_vars.get("subsets", {})
        return data, None
    except Exception as e:
        return None, str(e)
