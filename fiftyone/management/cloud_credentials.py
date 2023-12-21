"""
Cloud credentials  management.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import dataclasses
import datetime
import json
from typing import Dict, List, Literal, Optional, Union

from fiftyone.management import connection
from fiftyone.management import util as fom_util


@dataclasses.dataclass
class CloudCredential(object):
    """Cloud Credentials Info"""

    created_at: datetime.datetime
    prefixes: List[str]
    provider: str
    description: Optional[str] = None

    def __post_init__(self):
        if isinstance(self.created_at, str):
            self.created_at = datetime.datetime.fromisoformat(self.created_at)


_DELETE_CLOUD_CREDENTIAL_QUERY = """
    mutation ($provider: CloudProvider!, $prefixes: [String!]) {
        removeCloudCredentials(provider: $provider, prefixes: $prefixes)
    }
"""


_LIST_CLOUD_CREDENTIALS_QUERY = """
    query {
        cloudCredentials {provider, prefixes, createdAt, description}
    }
"""


_SET_CLOUD_CREDENTIALS_QUERY = """
    mutation (
            $provider: CloudProvider!,
            $creds: String!,
            $description: String,
            $prefixes: [String!]) {
        setCloudCredentials (
            provider: $provider,
            credentials: $creds,
            prefixes: $prefixes,
            description: $description
        ) {provider}
    }
"""


def _validate_provider(
    provider: Literal["GCP", "AWS", "AZURE", "MINIO"]
) -> None:
    allowed_providers = {"GCP", "AWS", "AZURE", "MINIO"}
    if provider not in allowed_providers:
        raise ValueError(
            f"Provider '{provider}' not in supported providers: {allowed_providers}"
        )


def _prepare_credentials(credential_type, credentials):
    if credential_type == "ini":
        with open(credentials) as f:
            ini_contents = f.read()
            return {"ini-file": ini_contents}
    elif credential_type == "json":
        with open(credentials) as f:
            # Load and dump just to make sure it's valid JSON
            parsed = json.load(f)
            return {"service-account-file": parsed}
    elif credential_type == "factory":
        return credentials
    else:
        raise ValueError("Invalid credential type specified:", credential_type)


def add_cloud_credentials(
    provider: Literal["GCP", "AWS", "AZURE", "MINIO"],
    credential_type: Literal["ini", "json", "factory"],
    credentials: Union[str, Dict],
    description: Optional[str] = None,
    prefixes: Optional[List[str]] = None,
) -> None:
    """Adds cloud credentials to the system.

    .. note::

        Only admins can add cloud credentials.

    .. warning::

        This will overwrite any previously existing credentials with the same
        provider/prefixes combination.

    .. warning::

        Cloud credentials are made available for use for all app users (no
        access to the credentials themselves). This is for media only and
        doesn't affect FiftyOne dataset permissions.

    Examples::

        import os
        import fiftyone.management as fom

        # Add default GCP credentials from service account json file
        fom.add_cloud_credentials(
            "GCP",
            "json",
            "/path/to/gcp-svc-acct.json",
            description="Default GCP credentials"
        )

        # Add bucket-specific AWS credentials from .ini file
        fom.add_cloud_credentials(
            "AWS",
            "ini",
            "/path/to/aws-creds.ini",
            description="Readonly credentials for bucket1,bucket2",
            prefixes=["bucket1", "bucket2"]
        )

        # Add default AWS credentials from
        formatted_credentials = fom.AwsCredentialsFactory.from_access_keys(
            access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
            secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
            default_region="us-west-2
        )

        fom.add_cloud_credentials(
            "AWS",
            "factory",
            formatted_credentials,
            description="Default AWS credentials from access keys"
        )


    Args:
        provider: the shorthand cloud provider string. One of ["GCP", "AWS",
            "AZURE", "MINIO"]
        credential_type: Type of credentials passed into ``credentials`` param.
            One of ``["ini", "json", "factory"]``.
            ``ini``: Path to an .ini file containing the credentials, such as
                ``/Users/voxel51/.aws/credentials``
            ``json``: Path to a JSON file containing credentials, such as
                ``/Users/voxel51/.config/gcloud/service-account-creds.json``
            ``factory``: A ``dict`` returned by a class method in one of the
                provider-specific credentials factories:
                ``AwsCredentialsFactory``, ``AzureCredentialsFactory``,
                ``MinIoCredentialsFactory``
        credentials: Dict of factory-built credentials or string path to
            credentials file, based on ``credential_type`` parameter.
        description (``None``): Optional description for this credential set.
        prefixes (``None``): The list of bucket names the credentials apply to,
            if applicable. Defaults to ``None`` meaning the default credentials
            for the provider.

    Raises:
        ValueError: if invalid provider is supplied
    """

    _validate_provider(provider)

    credentials_dict = _prepare_credentials(credential_type, credentials)
    credentials_str = json.dumps(credentials_dict)

    client = connection.APIClientConnection().client
    client.post_graphql_request(
        query=_SET_CLOUD_CREDENTIALS_QUERY,
        variables={
            "provider": provider,
            "creds": credentials_str,
            "description": description,
            "prefixes": prefixes,
        },
    )


def delete_cloud_credentials(
    provider: Literal["GCP", "AWS", "AZURE", "MINIO"],
    prefixes: Optional[List[str]] = None,
) -> None:
    """Deletes the installed cloud credentials.

    .. note::

        Only admins can delete cloud credentials.

    .. warning::

        This will delete credentials for all app users in the system. Ensure
        there is another cloud media storage access method in place to avoid
        system outage.

    Examples::

        import fiftyone.management as fom

        # Delete all credentials for a provider
        provider = "AWS"
        for credentials in fom.list_cloud_credentials():
            if credentials.provider == provider:
                fom.delete_cloud_credentials(provider, credentials.prefixes)

    Args:
        provider: the shorthand cloud provider string. One of ["GCP", "AWS",
            "AZURE", "MINIO"]
        prefixes (None): The list of bucket names the credentials apply to,
            if applicable. Defaults to ``None`` meaning the default credentials
            for the provider.

    Raises:
        ValueError: if invalid provider is supplied
    """

    _validate_provider(provider)

    client = connection.APIClientConnection().client

    client.post_graphql_request(
        query=_DELETE_CLOUD_CREDENTIAL_QUERY,
        variables={"provider": provider, "prefixes": prefixes},
    )


def list_cloud_credentials() -> List[CloudCredential]:
    """Lists all cloud credentials installed in the system.

    The returned credentials objects only have their provider, prefixes,
    description, and creation time set. You cannot view the plaintext
    or encrypted credentials.

    .. note::

        Only admins can list cloud credentials

    Examples::

        import fiftyone.management as fom

        fom.list_cloud_credentials()

    Returns:
        a list of :class:`CloudCredential` instances
    """

    client = connection.APIClientConnection().client

    data = client.post_graphql_request(query=_LIST_CLOUD_CREDENTIALS_QUERY)
    return [
        CloudCredential(**fom_util.camel_to_snake_container(credential))
        for credential in data["cloudCredentials"]
    ]


class AwsCredentialsFactory:
    """Credential factory methods for Amazon AWS provider"""

    @classmethod
    def from_access_keys(
        cls,
        access_key_id: str,
        secret_access_key: str,
        default_region: Optional[str] = None,
    ) -> Dict[str, str]:
        """Get formatted AWS credentials from access keys.

        For use in ``fom.add_cloud_credentials()`` only.

        Args:
            access_key_id: AWS access key ID
            secret_access_key: AWS secret access key
            default_region (``None``): default AWS region to set

        Returns:
            Formatted credentials
        """
        return {
            "access-key-id": access_key_id,
            "secret-access-key": secret_access_key,
            "default-region": default_region,
        }


class AzureCredentialsFactory:
    """Credential factory methods for Microsoft Azure provider"""

    @classmethod
    def from_account_key(
        cls, account_name, account_key, alias: Optional[str] = None
    ) -> Dict[str, str]:
        """Get formatted AZURE credentials from access keys

        For use in ``fom.add_cloud_credentials()`` only.

        Args:
            account_name: Azure account name
            account_key: Azure account key
            alias (``None``): alias to use for storage blobs

        Returns:
            Formatted credentials
        """
        return {
            "account_name": account_name,
            "account_key": account_key,
            "alias": alias,
        }

    @classmethod
    def from_connection_string(
        cls, connection_string, alias: Optional[str] = None
    ) -> Dict[str, str]:
        """Get formatted AZURE credentials from connection string

        For use in ``fom.add_cloud_credentials()`` only.

        Args:
            connection_string: Azure connection string
            alias (``None``): alias to use for storage blobs

        Returns:
            Formatted credentials
        """
        return {
            "conn_str": connection_string,
            "alias": alias,
        }

    @classmethod
    def from_client_secret(
        cls,
        account_name,
        client_id,
        client_secret,
        tenant_id,
        alias: Optional[str] = None,
    ) -> Dict[str, str]:
        """Get formatted AZURE credentials from client secret

        For use in ``fom.add_cloud_credentials()`` only.

        Args:
            account_name: Azure account name
            client_id: Azure client ID
            client_secret: Azure client secret
            tenant_id: Azure tenant ID
            alias (``None``): alias to use for storage blobs

        Returns:
            Formatted credentials
        """
        return {
            "account_name": account_name,
            "client_id": client_id,
            "secret": client_secret,
            "tenant": tenant_id,
            "alias": alias,
        }


class MinIoCredentialsFactory:
    """Credential factory methods for MINIO provider"""

    @classmethod
    def from_access_keys(
        cls,
        access_key_id: str,
        secret_access_key: str,
        endpoint_url: str,
        alias: Optional[str] = None,
        default_region: Optional[str] = None,
    ) -> Dict[str, str]:
        """Get formatted MINIO credentials from access keys

        For use in ``fom.add_cloud_credentials()`` only.

        Args:
            access_key_id: MinIO access key ID
            secret_access_key: MinIO secret access key
            endpoint_url: MinIO endpoint URL
            alias (``None``): alias to use for storage blobs
            default_region (``None``): default MinIO region to set

        Returns:
            Formatted credentials
        """
        return {
            "access-key-id": access_key_id,
            "secret-access-key": secret_access_key,
            "endpoint-url": endpoint_url,
            "alias": alias,
            "default-region": default_region,
        }
