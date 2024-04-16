"""
FiftyOne Teams internal cloud credential management.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import re
from collections import defaultdict
import configparser
from datetime import datetime, timedelta
import json
import logging
import os

from cryptography.fernet import Fernet

import eta.core.utils as etau

import fiftyone.core.config as foc
import fiftyone.core.odm as foo
import fiftyone.core.storage as fos
from fiftyone.internal.constants import (
    TTL_CACHE_LIFETIME_SECONDS,
)


PROVIDER_TO_FILE_SYSTEM = {
    "AWS": fos.FileSystem.S3,
    "GCP": fos.FileSystem.GCS,
    "AZURE": fos.FileSystem.AZURE,
    "MINIO": fos.FileSystem.MINIO,
}

logger = logging.getLogger(__name__)


class CloudCredentialsManager(object):
    """Class for managing cloud credentials."""

    def __init__(self, encryption_key):
        self._default_creds = {}
        self._bucket_creds_exact = defaultdict(dict)
        self._bucket_creds_regex = defaultdict(list)
        self._creds_dir = os.path.dirname(foc.locate_config())
        self._expiration_time = None
        self._fernet = None

        if encryption_key is not None:
            self._fernet = Fernet(encryption_key)

        etau.ensure_dir(self._creds_dir)
        self._refresh_credentials()

    @property
    def expiration_time(self):
        """The ``datetime`` at which the cache expires."""
        return self._expiration_time

    @property
    def is_expired(self):
        """Whether the cache is expired."""
        return datetime.utcnow() > self._expiration_time

    def has_default_credentials(self, fs):
        """Determines whether we have default credentials for the given file
        system.

        Args:
            fs: a :class:`fiftyone.core.storage.FileSystem`

        Returns:
            True/False
        """
        return fs in self._default_creds

    def has_bucket_credentials(self, fs, bucket):
        """Determines whether there are bucket-specific credentials for the
        given file system.

        Args:
            fs: a :class:`fiftyone.core.storage.FileSystem`
            bucket: a bucket name

        Returns:
            True/False
        """
        # If exact match or matches any regex
        if bucket in self._bucket_creds_exact[fs]:
            return True
        for bucket_regex, _ in self._bucket_creds_regex[fs]:
            if bucket_regex.fullmatch(bucket):
                return True
        return False

    def get_file_systems_with_credentials(self):
        """Returns the list of file systems with at least one set of
        bucket-specific credentials.

        Returns:
            a list of :class:`fiftyone.core.storage.FileSystem` values
        """
        file_systems = set(self._default_creds.keys())
        for fs, creds_dict in self._bucket_creds_exact.items():
            if creds_dict:
                file_systems.add(fs)

        for fs, creds_list in self._bucket_creds_regex.items():
            if creds_list:
                file_systems.add(fs)

        return list(file_systems)

    def get_buckets_with_credentials(self, fs):
        """Returns the list of buckets with bucket-specific credentials for the
        given file system. Does not include buckets included by regex as the
        possibilities are infinite.

        Args:
            fs: a :class:`fiftyone.core.storage.FileSystem`

        Returns:
            a list of buckets
        """
        return list(self._bucket_creds_exact[fs].keys())

    def get_credentials(self, fs, bucket=None):
        """Retrieves the specified credentials.

        If no bucket-specific credentials are available, default credentials
        for the file system are returned, if available.

        Args:
            fs: a :class:`fiftyone.core.storage.FileSystem`
            bucket (None): an optional bucket name

        Returns:
            the credentials path, or ``None``
        """
        creds_path = None

        if bucket is not None:
            creds_path = self._bucket_creds_exact[fs].get(bucket, None)

            if creds_path is None:
                for bucket_regex, c_path in self._bucket_creds_regex[fs]:
                    if bucket_regex.fullmatch(bucket):
                        creds_path = c_path
                        break

        if creds_path is None:
            creds_path = self._default_creds.get(fs, None)

        return creds_path

    def get_all_credentials_for_file_system(self, fs):
        """Returns all credentials for the given file system.

        Args:
            fs: a :class:`fiftyone.core.storage.FileSystem`

        Returns:
            a list of credential paths
        """
        creds_paths = set()

        creds_path = self._default_creds.get(fs, None)
        if creds_path:
            creds_paths.add(creds_path)

        for creds_path in self._bucket_creds_exact[fs].values():
            creds_paths.add(creds_path)

        for _, creds_path in self._bucket_creds_regex[fs]:
            creds_paths.add(creds_path)

        return list(creds_paths)

    def _refresh_credentials(self):
        self._bucket_creds_exact.clear()
        self._bucket_creds_regex.clear()
        self._default_creds.clear()

        for credentials in foo.get_cloud_credentials():
            provider = credentials.get("provider", "")
            fs = PROVIDER_TO_FILE_SYSTEM.get(provider, None)
            if fs is None:
                logger.warning(
                    "Ignoring credentials for unsupported provider '%s'",
                    provider,
                )
                continue

            try:
                creds_path = self._make_creds_path(credentials)
                raw_creds = self._get_raw_creds(credentials)
                # if raw creds returned None, then the file was already written
                if raw_creds:
                    self._write_creds(provider, raw_creds, creds_path)
            except Exception as e:
                creds_path = None

                logger.warning(
                    (
                        "Failed to parse credentials for provider '%s' with "
                        "prefixes '%s': %s"
                    ),
                    provider,
                    credentials.get("prefixes", ""),
                    e,
                )

            if credentials.get("prefixes"):
                for bucket in credentials["prefixes"]:
                    if bucket.startswith("r'"):
                        try:
                            self._bucket_creds_regex[fs].append(
                                (re.compile(bucket[2:]), creds_path)
                            )
                        except re.error:
                            logger.warning(
                                "Bad regex provided for provider '%s': '%s'",
                                provider,
                                bucket,
                            )
                    else:
                        self._bucket_creds_exact[fs][bucket] = creds_path
            else:
                self._default_creds[fs] = creds_path

        self._expiration_time = datetime.utcnow() + timedelta(
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
        raw_creds = credentials["credentials"]
        if self._fernet is not None:
            raw_creds = self._fernet.decrypt(raw_creds).decode()

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
    return "-".join(
        [
            prefix[prefix.find("//") + 1 :].replace("/", "-")
            for prefix in prefixes
        ]
    )
