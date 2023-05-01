"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


class FiftyoneTeamsAPIError(Exception):
    """Base Error for Teams API"""


class APIAuthenticationError(FiftyoneTeamsAPIError):
    """Authentication Error for Teams API"""

    def __init__(self):
        super().__init__("Unable to authenticate against FiftyOne API")


class APIConnectionError(FiftyoneTeamsAPIError):
    """Authentication Error for Teams API"""

    def __init__(self, base_url: str):
        super().__init__(f"Unable to connect to {base_url}")
