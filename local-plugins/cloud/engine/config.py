"""
The stored cloud profile: where the cloud lives and the onboarding-scoped
key obtained by pairing. Lives at ``~/.fiftyone/cloud.json`` (override with
``FIFTYONE_CLOUD_CONFIG``), mode 0600 — it holds a credential.
"""

import datetime
import json
import os
from dataclasses import asdict, dataclass, replace
from typing import Optional

from .errors import NotPairedError

CONFIG_PATH_ENV_VAR = "FIFTYONE_CLOUD_CONFIG"
DEFAULT_CONFIG_PATH = os.path.join("~", ".fiftyone", "cloud.json")


@dataclass(frozen=True)
class CloudProfile:
    """A cloud deployment plus the credential this machine holds for it.

    ``api_url`` is the data-plane base (the edge), e.g.
    ``https://api.fiftyone.ai``. ``auth_url`` is the CAS API base and
    includes its path prefix, e.g. ``https://auth.fiftyone.ai/cas/api`` —
    the same convention as the server-side ``CAS_BASE_URL``.
    """

    api_url: str
    auth_url: str
    api_key: Optional[str] = None
    key_scope: Optional[str] = None
    key_expires_at: Optional[datetime.datetime] = None

    def with_key(
        self,
        api_key: str,
        scope: Optional[str],
        expires_at: Optional[datetime.datetime],
    ) -> "CloudProfile":
        return replace(
            self, api_key=api_key, key_scope=scope, key_expires_at=expires_at
        )

    def without_key(self) -> "CloudProfile":
        return replace(self, api_key=None, key_scope=None, key_expires_at=None)


class ProfileStore:
    """Loads and persists the profile file."""

    def __init__(self, path: Optional[str] = None):
        self.__path = os.path.expanduser(
            path or os.environ.get(CONFIG_PATH_ENV_VAR) or DEFAULT_CONFIG_PATH
        )

    @property
    def path(self) -> str:
        return self.__path

    def load(self) -> Optional[CloudProfile]:
        if not os.path.isfile(self.__path):
            return None
        with open(self.__path, "r", encoding="utf-8") as handle:
            data = json.load(handle)

        expires_at = data.get("key_expires_at")
        return CloudProfile(
            api_url=data["api_url"].rstrip("/"),
            auth_url=data["auth_url"].rstrip("/"),
            api_key=data.get("api_key"),
            key_scope=data.get("key_scope"),
            key_expires_at=(
                datetime.datetime.fromisoformat(expires_at)
                if expires_at
                else None
            ),
        )

    def require_paired(self) -> CloudProfile:
        profile = self.load()
        if profile is None or not profile.api_key:
            raise NotPairedError(
                "No cloud credentials found — run the login flow first."
            )
        return profile

    def save(self, profile: CloudProfile) -> None:
        data = asdict(profile)
        if profile.key_expires_at is not None:
            data["key_expires_at"] = profile.key_expires_at.isoformat()

        os.makedirs(os.path.dirname(self.__path), exist_ok=True)
        descriptor = os.open(
            self.__path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600
        )
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2)

    def clear(self) -> None:
        if os.path.isfile(self.__path):
            os.remove(self.__path)
