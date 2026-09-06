"""
Error taxonomy for the cloud client engine.

The split mirrors the server's: a refusal (the cloud understood and said no)
is terminal for the current attempt, while unavailability is retryable. The
two must never blur — a client that retries refusals hammers the API, and one
that gives up on blips fails large pushes needlessly.
"""


class CloudError(Exception):
    """Base for every error this engine raises."""


class CloudUnavailableError(CloudError):
    """The cloud could not be reached, or answered with a server fault."""


class NotPairedError(CloudError):
    """No stored credentials; the user must run the login flow first."""


class KeyRefusedError(CloudError):
    """The stored API key was refused; re-pairing is required."""


class RefusedError(CloudError):
    """The request was understood and refused (limits, collisions, state)."""


class SessionExpiredError(CloudError):
    """The upload session outlived its TTL; a fresh session is required."""


class PairingDeniedError(CloudError):
    """The user declined the pairing on the approval page."""


class PairingExpiredError(CloudError):
    """The pairing codes expired before approval."""


class CredentialExpiredError(CloudError):
    """The vended store credential lapsed mid-upload; renew and retry."""
