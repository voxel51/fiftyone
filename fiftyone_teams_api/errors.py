"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


class FiftyOneTeamsAPIError(Exception):
    """Base error for Teams API."""


class APIAuthenticationError(FiftyOneTeamsAPIError):
    """Authentication error for Teams API."""

    def __init__(self):
        super().__init__("Unable to authenticate against FiftyOne API")


class APIConnectionError(FiftyOneTeamsAPIError):
    """Authentication error for Teams API."""

    def __init__(self, base_url: str):
        super().__init__(f"Unable to connect to {base_url}")
