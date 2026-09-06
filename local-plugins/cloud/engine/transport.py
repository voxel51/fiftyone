"""
The one HTTP seam. Every client in this engine speaks through `Http`, so
tests substitute a fake at exactly one boundary and network faults normalize
to `CloudUnavailableError` in exactly one place.
"""

from dataclasses import dataclass
from typing import Any, BinaryIO, Dict, Optional

from .errors import CloudUnavailableError

DEFAULT_TIMEOUT_SECONDS = 30.0


@dataclass(frozen=True)
class HttpReply:
    """A normalized HTTP response: status plus the parsed JSON body, if any."""

    status: int
    payload: Optional[Dict[str, Any]]
    text: str = ""

    def field(self, key: str) -> Any:
        if not isinstance(self.payload, dict):
            return None
        return self.payload.get(key)

    def error_message(self) -> str:
        message = self.field("error")
        if isinstance(message, dict):
            message = message.get("message") or message.get("code")
        if isinstance(message, str) and message:
            return message
        return f"HTTP {self.status}"


class Http:
    """A thin JSON-aware wrapper over a `requests.Session`-shaped object."""

    def __init__(self, session=None, timeout: float = DEFAULT_TIMEOUT_SECONDS):
        self.__session = session
        self.__timeout = timeout

    @property
    def _session(self):
        if self.__session is None:
            # Deferred so the engine imports without requests installed.
            import requests

            self.__session = requests.Session()
        return self.__session

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: Optional[Dict[str, str]] = None,
        json_body: Optional[Dict[str, Any]] = None,
        data: Optional[BinaryIO] = None,
        params: Optional[Dict[str, str]] = None,
        timeout: Optional[float] = None,
    ) -> HttpReply:
        import requests

        try:
            response = self._session.request(
                method,
                url,
                headers=headers,
                json=json_body,
                data=data,
                params=params,
                timeout=timeout or self.__timeout,
            )
        except requests.RequestException as err:
            raise CloudUnavailableError(
                f"could not reach {url}: {err}"
            ) from err

        try:
            payload = response.json()
        except ValueError:
            payload = None
        if not isinstance(payload, dict):
            payload = None

        return HttpReply(
            status=response.status_code, payload=payload, text=response.text
        )
