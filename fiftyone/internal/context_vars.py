"""
FiftyOne Teams ContextVar objects.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import contextvars

no_singleton_cache = contextvars.ContextVar(
    "no_singleton_cache", default=False
)
running_user_id = contextvars.ContextVar("running_user_id", default=None)
running_user_request_token = contextvars.ContextVar(
    "running_user_request_token", default=None
)
running_user_api_key = contextvars.ContextVar(
    "running_user_api_key", default=None
)
