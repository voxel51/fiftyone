"""
Python decorator utilities.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def route_requires_auth(RouteCls):
    """
    Check if a route requires authentication.

    Args:
        RouteCls (type): The route class to check.

    Returns:
        bool: True if the route requires authentication, False otherwise.
    """
    return (
        hasattr(RouteCls, "requires_authentication")
        and RouteCls.requires_authentication == True
    )
