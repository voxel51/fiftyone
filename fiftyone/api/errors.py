"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


class FiftyOneEnterpriseAPIError(Exception):
    """Base error for the FiftyOne Enterprise API."""


# Adding this for backwards compatibility of this module
FiftyOneTeamsAPIError = FiftyOneEnterpriseAPIError


class APIAuthenticationError(FiftyOneEnterpriseAPIError):
    """Authentication error for the FiftyOne Enterprise API."""

    def __init__(self, msg):
        msg = msg or "Failed to authenticate with the FiftyOne Enterprise API."
        super().__init__(msg)


class APIBadRequestError(FiftyOneEnterpriseAPIError):
    """Authentication error for the FiftyOne Enterprise API."""

    def __init__(self, msg):
        msg = msg or "Bad client request for the FiftyOne Enterprise API."
        super().__init__(msg)


class APIForbiddenError(FiftyOneEnterpriseAPIError):
    """Forbidden error for the FiftyOne Enterprise API."""

    def __init__(self, msg):
        msg = msg or "The requested action is forbidden."
        super().__init__(msg)


class APIConnectionError(FiftyOneEnterpriseAPIError):
    """Authentication error for the FiftyOne Enterprise API."""

    def __init__(self, base_url: str):
        super().__init__(f"Unable to connect to {base_url}.")
