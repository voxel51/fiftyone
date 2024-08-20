"""
| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


class FiftyOneTeamsAPIError(Exception):
    """Base error for the FiftyOne Teams API."""


class APIAuthenticationError(FiftyOneTeamsAPIError):
    """Authentication error for the FiftyOne Teams API."""

    def __init__(self, msg):
        msg = msg or "Failed to authenticate with the FiftyOne Teams API."
        super().__init__(msg)


class APIBadRequestError(FiftyOneTeamsAPIError):
    """Authentication error for the FiftyOne Teams API."""

    def __init__(self, msg):
        msg = msg or "Bad client request for the FiftyOne Teams API."
        super().__init__(msg)


class APIForbiddenError(FiftyOneTeamsAPIError):
    """Forbidden error for the FiftyOne Teams API."""

    def __init__(self, msg):
        msg = msg or "The requested action is forbidden."
        super().__init__(msg)


class APIConnectionError(FiftyOneTeamsAPIError):
    """Authentication error for the FiftyOne Teams API."""

    def __init__(self, base_url: str):
        super().__init__(f"Unable to connect to {base_url}.")
