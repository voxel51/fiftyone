"""
FiftyOne operator utilities.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging

from typing import Optional

from fiftyone.internal.util import get_api_url, has_api_key
from fiftyone.internal.requests import make_request
from fiftyone.utils.decorators import async_ttl_cache
from fiftyone.internal.constants import TTL_CACHE_LIFETIME_SECONDS

_API_URL = get_api_url()

_USER_QUERY = """
query DatasetUserQuery($userId: String!) {
  user(id: $userId) {
    email
    id
    name
    role
  }
}
"""
_DATASET_USER_QUERY = """
query DatasetUserQuery($dataset: String!, $userId: String!) {
  dataset(identifier: $dataset) {
    user(id: $userId) {
      dataset_permission: activePermission
      email
      id
      name
      role
    }
  }
}
"""
_VIEWER_QUERY = """
query ViewerQuery {
  viewer {
    email
    id
    name
    role
  }
}
"""
_DATASET_VIEWER_QUERY = """
query ViewerQuery($dataset: String!) {
  dataset(identifier: $dataset) {
    viewer {
      dataset_permission: activePermission
      email
      id
      name
      role
    }
  }
}
"""


class ProgressHandler(logging.Handler):
    """A logging handler that reports all logging messages issued while the
    handler's context manager is active to the provided execution context's
    :meth:`set_progress() <fiftyone.operators.executor.ExecutionContext.set_progress>`
    method.

    Args:
        ctx: an :class:`fiftyone.operators.executor.ExecutionContext`
        logger (None): a specific ``logging.Logger`` for which to report
            records. By default, the root logger is used
        level (None): an optional logging level above which to report records.
            By default, the logger's effective level is used
    """

    def __init__(self, ctx, logger=None, level=None):
        super().__init__()
        self.ctx = ctx
        self.logger = logger
        self.level = level

    def __enter__(self):
        if self.logger is None:
            self.logger = logging.getLogger()

        if self.level is None:
            self.level = self.logger.getEffectiveLevel()

        self.setLevel(self.level)
        self.logger.addHandler(self)

    def __exit__(self, *args):
        try:
            self.logger.removeHandler(self)
        except:
            pass

    def emit(self, record):
        msg = self.format(record)
        self.ctx.set_progress(label=msg)


def is_method_overridden(base_class, sub_class_instance, method_name):
    """Returns whether a method is overridden in a subclass.

    Args:
        base_class: the base class
        sub_class_instance: an instance of the subclass
        method_name: the name of the method

    Returns:
        True/False
    """

    base_method = getattr(base_class, method_name, None)
    sub_method = getattr(type(sub_class_instance), method_name, None)
    return base_method != sub_method


@async_ttl_cache(ttl=TTL_CACHE_LIFETIME_SECONDS)
async def resolve_user(
    id: Optional[str] = None,
    dataset: Optional[str] = None,
    token: Optional[str] = None,
) -> Optional[dict]:
    """
    Resolve a user synchronously using the teams API.

    Args:
        id: the user ID
        dataset: the dataset ID
        token: the request token

    Returns:
        the user
    """
    variables = {}
    if id is not None:
        variables["userId"] = id
    if dataset is not None:
        variables["dataset"] = dataset
    if id is None:
        query = _DATASET_VIEWER_QUERY if dataset else _VIEWER_QUERY
    else:
        query = _DATASET_USER_QUERY if dataset else _USER_QUERY
    result = await make_request(
        f"{_API_URL}/graphql/v1",
        token,  # FIFTYONE_API_KEY will be used if token is None
        query,
        variables=variables,
    )
    if id is None:
        user = (
            result.get("data", {}).get("dataset", {}).get("viewer", None)
            if dataset
            else result.get("data", {}).get("viewer", None)
        )
    else:
        user = (
            result.get("data", {}).get("dataset", {}).get("user", None)
            if dataset
            else result.get("data", {}).get("user", None)
        )
    return user


async def resolve_operation_user(
    id: Optional[str] = None,
    dataset: Optional[str] = None,
    token: Optional[str] = None,
) -> Optional[dict]:
    """
    Resolve a user asynchronously using the teams API. Raise an exception if the user cannot be
    resolved when it is expected to be resolvable. Return None if the user cannot be resolved when
    it is not expected to be resolvable.
    """
    try:
        return await resolve_user(id=id, dataset=dataset, token=token)
    except Exception:
        if (token is not None) or has_api_key():
            raise Exception("Failed to resolve user for the operation")
        return None
