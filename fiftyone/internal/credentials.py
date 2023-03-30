"""
Internal cloud credential utilities.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import configparser
from datetime import datetime, timedelta
import json
import logging
import os
import pathlib

from cryptography.fernet import Fernet

import fiftyone.core.config as foc
import fiftyone.core.odm as foo
import fiftyone.internal as foi


ENCRYPTION_KEY_ENV_VAR = "FIFTYONE_ENCRYPTION_KEY"
TTL_CACHE_LIFETIME_SECONDS = 120  # 2 minutes


logger = logging.getLogger(__name__)


def has_encryption_key():
    """Whether the current environment has an encryption key.

    Returns:
        True/False
    """
    return foi.is_internal_service() and ENCRYPTION_KEY_ENV_VAR in os.environ


class CloudCredentialsManager(object):
    """Class for managing cloud credentials.

    Credentials are cached for ``TTL_CACHE_LIFETIME_SECONDS`` and are
    automatically reloaded when necessary.
    """

    def __init__(self):
        self._creds_cache = {}
        self._creds_cache_exp = datetime.utcnow()
        self._encryption_key = os.environ.get(ENCRYPTION_KEY_ENV_VAR)

    @property
    def expiration_time(self):
        """The ``datetime`` at which the cache expires."""
        return self._creds_cache_exp

    @property
    def is_expired(self):
        """Whether the cache is expired."""
        return datetime.utcnow() > self._creds_cache_exp

    def get_stored_credentials(self, provider):
        """Returns the credentials for the given provider, if any.

        The cache is automatically refreshed, if necessary.

        Args:
            provider: the cloud provider

        Returns:
            the credentials string, or None
        """
        if self.is_expired:
            self._refresh_credentials()

        return self._creds_cache.get(provider, None)

    def _refresh_credentials(self):
        creds_list = foo.get_cloud_credentials()
        creds_dir = str(pathlib.Path(foc.locate_config()).parent.absolute())
        fernet = Fernet(self._encryption_key)

        for provider in ("AWS", "GCP", "AZURE", "MINIO"):
            try:
                creds = _parse_credentials(
                    creds_list, creds_dir, fernet, provider
                )
            except Exception as e:
                creds = None
                logger.warning(
                    "Failed to parse credentials for provider '%s': %s",
                    provider,
                    e,
                )

            self._creds_cache[provider] = creds

        self._creds_cache_exp = datetime.utcnow() + timedelta(
            seconds=TTL_CACHE_LIFETIME_SECONDS
        )


def _parse_credentials(creds_list, creds_dir, fernet, provider):
    creds = next((c for c in creds_list if c["provider"] == provider), None)
    if not creds:
        return None

    if provider == "AWS":
        filename = "aws_creds.ini"
    elif provider == "GCP":
        filename = "gcp_creds.json"
    elif provider == "AZURE":
        filename = "azure_creds.json"
    elif provider == "MINIO":
        filename = "minio_creds.ini"
    else:
        filename = "creds.ini"

    raw_creds = fernet.decrypt(creds["credentials"]).decode()

    if "ini-file" in raw_creds:
        creds_path = os.path.join(creds_dir, filename)
        creds_str = json.loads(raw_creds)["ini-file"]
        with open(creds_path, "w") as f:
            f.write(creds_str)

        return creds_path

    if provider == "AWS":
        raw_creds_dict = json.loads(raw_creds)
        creds_path = os.path.join(creds_dir, filename)
        _write_default_aws_ini_file(raw_creds_dict, creds_path)
        return creds_path

    if provider == "AZURE":
        raw_creds_dict = json.loads(raw_creds)
        creds_path = os.path.join(creds_dir, filename)
        _write_default_azure_ini_file(raw_creds_dict, creds_path)
        return creds_path

    if provider == "MINIO":
        raw_creds_dict = json.loads(raw_creds)
        creds_path = os.path.join(creds_dir, filename)
        _write_default_minio_ini_file(raw_creds_dict, creds_path)
        return creds_path

    if "service-account-file" in raw_creds:
        raw_creds_json = json.loads(raw_creds)
        creds_dict = json.loads(raw_creds_json["service-account-file"])
        creds_path = os.path.join(creds_dir, filename)
        with open(creds_path, "w") as f:
            json.dump(creds_dict, f)

        return creds_path

    return None


def _write_default_aws_ini_file(creds_dict, creds_path):
    config = configparser.ConfigParser()
    config["default"] = {
        "aws_access_key_id": creds_dict["access-key-id"],
        "aws_secret_access_key": creds_dict["secret-access-key"],
    }

    region = creds_dict.get("default-region", None)
    if region is not None:
        config["default"]["region"] = region

    with open(creds_path, "w") as f:
        config.write(f)


def _write_default_azure_ini_file(creds_dict, creds_path):
    config = configparser.ConfigParser()
    config["default"] = {}

    account_name = creds_dict.get("account_name", None)
    if account_name is not None:
        config["default"]["account_name"] = account_name

    account_key = creds_dict.get("account_key", None)
    if account_key is not None:
        config["default"]["account_key"] = account_key

    conn_str = creds_dict.get("conn_str", None)
    if conn_str is not None:
        config["default"]["conn_str"] = conn_str

    alias = creds_dict.get("alias", None)
    if alias is not None:
        config["default"]["alias"] = alias

    with open(creds_path, "w") as f:
        config.write(f)


def _write_default_minio_ini_file(creds_dict, creds_path):
    config = configparser.ConfigParser()
    config["default"] = {
        "access_key": creds_dict["access-key-id"],
        "secret_access_key": creds_dict["secret-access-key"],
        "endpoint_url": creds_dict["endpoint-url"],
    }

    alias = creds_dict.get("alias", None)
    if alias is not None:
        config["default"]["alias"] = alias

    region = creds_dict.get("default-region", None)
    if region is not None:
        config["default"]["region"] = region

    with open(creds_path, "w") as f:
        config.write(f)
