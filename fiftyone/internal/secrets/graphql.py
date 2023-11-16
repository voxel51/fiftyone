"""
FiftyOne Teams secret graphQL API.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from typing import List, Optional, Tuple, Union

from fiftyone.internal.secrets.secret import EncryptedSecret
from fiftyone.internal.secrets.util import normalize_secret_key
from fiftyone.internal.util import (
    get_api_url,
)
from fiftyone.internal.requests import make_request

_API_URL = get_api_url()
_QUERY_SECRET = """
query ResolveSecret($key: String!) {
  secret(key: $key) {
    key
    value
  }
}
"""

_QUERY_SECRETS = """
query ResolveSecrets($filter: SecretFilter, $order: SecretOrderFieldsOrder) {
  secrets(filter: $filter, order: $order) {
    key
    value
  }
}
"""


async def resolve_secret(
    key: str, request_token: Optional[str] = None
) -> Optional[EncryptedSecret]:
    """
    Resolve a secret through the API. Values are encrypted and must be
    decrypted by the
    caller (FiftyoneDatabaseSecretProvider).
    Args:
        key: the secret key
        request_token:

    Returns:

    """
    result = await make_request(
        f"{_API_URL}/graphql/v1",
        request_token,
        _QUERY_SECRET,
        variables={"key": normalize_secret_key(key)},
    )
    secret = result.get("data", {}).get("secret")
    return (
        EncryptedSecret(key=secret.get("key"), value=secret.get("value"))
        if secret
        else None
    )


async def resolve_secrets(
    keys: List[str],
    order_by: Optional[Union[str, Tuple[str, int]]] = None,
    request_token: Optional[str] = None,
) -> List[Optional[EncryptedSecret]]:
    """
    Resolve multiple secrets through the API. Values are encrypted and must be
    decrypted by the
    caller (FiftyoneDatabaseSecretProvider).
    """
    _keys = [normalize_secret_key(key) for key in keys]
    _filter = {"key": {"in": [_keys]}}
    _order = None
    if order_by:
        if isinstance(order_by, str):
            _order = {"field": order_by, "direction": "ASC"}
        else:
            _order = {"field": order_by[0], "direction": order_by[1]}

    result = await make_request(
        f"{_API_URL}/graphql/v1",
        request_token,
        _QUERY_SECRETS,
        variables={"filter": _filter, "order": _order},
    )
    secrets = result.get("data", {}).get("secrets", None)
    if secrets:
        return [
            EncryptedSecret(key=secret.get("key"), value=secret.get("value"))
            for secret in secrets
            if secret
        ]
    return []
