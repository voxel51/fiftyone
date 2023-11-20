"""
FiftyOne Teams internal cloud credential management.

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
from fiftyone.internal.constants import (
    ENCRYPTION_KEY_ENV_VAR,
    TTL_CACHE_LIFETIME_SECONDS,
)

logger = logging.getLogger(__name__)


class CloudCredentialsManager(object):
    """Class for managing cloud credentials.

    Credentials are cached for ``TTL_CACHE_LIFETIME_SECONDS`` and are
    automatically reloaded when necessary.
    """

    def __init__(self):
        self._creds_cache = {}
        self._creds_cache_exp = datetime.utcnow()
        self._encryption_key = os.environ.get(ENCRYPTION_KEY_ENV_VAR)
        self._creds_dir = str(
            pathlib.Path(foc.locate_config()).parent.absolute()
        )
        self._fernet = Fernet(self._encryption_key)
        self._refresh_credentials()

        # make that path if it's not there
        if not os.path.exists(pathlib.Path(self._creds_dir)):
            os.mkdir(pathlib.Path(self._creds_dir))

    @property
    def expiration_time(self):
        """The ``datetime`` at which the cache expires."""
        return self._creds_cache_exp

    @property
    def is_expired(self):
        """Whether the cache is expired."""
        return datetime.utcnow() > self._creds_cache_exp

    def get_all_credentials_for_provider(self, provider):
        if self.is_expired:
            self._refresh_credentials()

        return [
            self._creds_cache[key]
            for key in self._creds_cache
            if key.startswith(provider)
        ]

    def get_stored_credentials_per_bucket(self, provider, bucket):
        """Returns the credentials for the given provider, if any.

        The cache is automatically refreshed, if necessary.

        Args:
            provider: the cloud provider

        Returns:
            the credentials string, or None
        """
        if self.is_expired:
            self._refresh_credentials()

        for key in self._creds_cache:
            if bucket in key and key.startswith(provider):
                return self._creds_cache.get(f"{provider}-{bucket}")
        # if no matching bucket specific creds are found, return default if available
        return self._creds_cache.get(provider, None)

    def _refresh_credentials(self):
        creds_list = foo.get_cloud_credentials()
        for credentials in creds_list:
            try:
                creds_path = self._make_creds_path(credentials)
                raw_creds = self._get_raw_creds(credentials)
                # if raw creds returned None, then the file was already written
                if raw_creds:
                    self._write_creds(
                        credentials["provider"], raw_creds, creds_path
                    )
            except Exception as e:
                creds_path = None
                logger.warning(
                    "Failed to parse credentials for provider '%s' with prefixes '%s': %s",
                    credentials["provider"],
                    credentials.get("prefixes", "No prefixes"),
                    e,
                )

            # make an entry in the creds cache for every bucket name
            # since the requesting URL is only coming in with one
            # bucket name at a time
            if credentials.get("prefixes"):
                for bucket_name in credentials["prefixes"]:
                    self._creds_cache[
                        f'{credentials["provider"]}-{bucket_name}'
                    ] = creds_path
            else:
                # default, no prefix
                self._creds_cache[credentials["provider"]] = creds_path

        self._creds_cache_exp = datetime.utcnow() + timedelta(
            seconds=TTL_CACHE_LIFETIME_SECONDS
        )

    def _make_creds_path(self, credentials):
        provider = credentials["provider"]
        prefixes = credentials.get("prefixes", None)
        filename = None

        # if the prefixes list is empty, we are handling the
        # default credentials
        if not prefixes or prefixes == []:
            if provider == "AWS":
                filename = "aws_creds.ini"
            elif provider == "GCP":
                filename = "gcp_creds.json"
            elif provider == "AZURE":
                filename = "azure_creds.ini"
            elif provider == "MINIO":
                filename = "minio_creds.ini"
            else:
                filename = "creds.ini"

        # if the prefixes list is not empty, make a unique
        # filename for the associated creds
        else:
            if provider == "AWS":
                filename = f"aws_creds-{_serialize_prefixes(prefixes)}.ini"
            elif provider == "GCP":
                filename = f"gcp_creds-{_serialize_prefixes(prefixes)}.json"
            elif provider == "AZURE":
                filename = f"azure_creds-{_serialize_prefixes(prefixes)}.ini"
            elif provider == "MINIO":
                filename = f"minio_creds-{_serialize_prefixes(prefixes)}.ini"
            else:
                filename = f"creds-{_serialize_prefixes(prefixes)}.ini"

        if not filename:
            return None

        return os.path.join(self._creds_dir, filename)

    def _get_raw_creds(self, credentials):
        raw_creds = self._fernet.decrypt(credentials["credentials"]).decode()
        provider = credentials["provider"]
        # special case: if the passed creds are already a file, just write it
        if "ini-file" in raw_creds:
            creds_path = self._make_creds_path(credentials)
            creds_str = json.loads(raw_creds)["ini-file"]
            with open(creds_path, "w") as f:
                f.write(creds_str)

            return None

        if provider in ("AWS", "AZURE", "MINIO"):
            return json.loads(raw_creds)
        elif provider == "GCP":
            raw_creds_json = json.loads(raw_creds)
            if isinstance(raw_creds_json["service-account-file"], str):
                return json.loads(raw_creds_json["service-account-file"])
            else:
                return raw_creds_json["service-account-file"]
        else:
            raise ValueError(
                f'Provider {credentials["provider"]} not supported'
            )

    def _write_creds(self, provider, raw_creds, creds_path):
        if provider == "AWS":
            _write_default_aws_ini_file(raw_creds, creds_path)
        elif provider == "AZURE":
            _write_default_azure_ini_file(raw_creds, creds_path)
        elif provider == "MINIO":
            _write_default_minio_ini_file(raw_creds, creds_path)
        elif provider == "GCP":
            _write_default_gcp_json_file(raw_creds, creds_path)
        else:
            ...


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

    client_id = creds_dict.get("client_id", None)
    if client_id is not None:
        config["default"]["client_id"] = client_id

    secret = creds_dict.get("secret", None)
    if secret is not None:
        config["default"]["secret"] = secret

    tenant = creds_dict.get("tenant", None)
    if tenant is not None:
        config["default"]["tenant"] = tenant

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


def _write_default_gcp_json_file(raw_creds_dict, creds_path):
    with open(creds_path, "w") as f:
        json.dump(raw_creds_dict, f)


def _serialize_prefixes(prefixes):
    return "-".join([prefix[prefix.find("//") + 2 :] for prefix in prefixes])
