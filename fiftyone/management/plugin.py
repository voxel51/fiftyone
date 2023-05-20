"""
Plugin management.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import io
import json
import os
import shutil
import tempfile
import zipfile
from typing import List, Optional, TypedDict

from fiftyone.management import connection
from fiftyone.management import dataset
from fiftyone.management import users
from fiftyone.management import util


class OperatorPermission(TypedDict):
    """Operator permission dict."""

    minimum_role: users.UserRole
    minimum_dataset_permission: dataset.DatasetPermission


class PluginOperator(TypedDict):
    """Plugin operator dict."""

    name: str
    enabled: bool
    permission: OperatorPermission


class Plugin(TypedDict):
    """Plugin dict."""

    name: str
    description: str
    version: str
    fiftyone_version: str
    enabled: bool
    operators: List[PluginOperator]


_OPERATOR_FRAGMENT = """
fragment operatorFrag on PluginOperator {
    name
    enabled
    permission {
        minimumRole
        minimumDatasetPermission
    }
}
"""

_PLUGIN_FRAGMENT = (
    _OPERATOR_FRAGMENT
    + """
fragment pluginFrag on Plugin {
    name
    description
    version
    fiftyoneVersion
    enabled
    operators {
        ...operatorFrag
    }
}
"""
)


_DELETE_PLUGIN_QUERY = """
mutation($name: String!) {
    removePlugin(name: $name)
}
"""

_DOWNLOAD_PLUGIN_QUERY = """
mutation ($name: String!){
    downloadPlugin(name: $name)
}
"""

_GET_PLUGIN_INFO_QUERY = (
    _PLUGIN_FRAGMENT
    + """
    query($pluginName: String!) {
        plugin(name: $pluginName) {
            ...pluginFrag
        }
    }
    """
)

_LIST_PLUGINS_QUERY = (
    _PLUGIN_FRAGMENT
    + """
    query($includeBuiltin: Boolean!) {
        plugins(includeBuiltin: $includeBuiltin) {
            ...pluginFrag
        }
    }
    """
)

_SET_PLUGIN_ENABLED_QUERY = """
    mutation($pluginName: String!, $enabled: Boolean) {
        updatePlugin(name: $pluginName, enabled: $enabled)
        {enabled}
    }
"""

_UPDATE_PLUGIN_OPERATOR_QUERY = """
    mutation(
            $pluginName: String!,
            $operatorName: String!,
            $enabled: Boolean
            $minRole: UserRole,
            $minDatasetPerm: DatasetPermission)
    {
        updatePlugin(name: $pluginName, operatorSettings: {
            name: $operatorName
            enabled: $enabled
            permission: {
                minimumRole: $minRole
                minimumDatasetPermission: $minDatasetPerm
            }
        }) {}
    }
"""


_UPLOAD_PLUGIN_QUERY = (
    _PLUGIN_FRAGMENT
    + """
    mutation($token: String!, $overwrite: Boolean!) {
        uploadPlugin(fileUploadToken: $token, overwrite: $overwrite) {
            ...pluginFrag
        }
    }
"""
)


def list_plugins(include_builtin: bool = False) -> List[Plugin]:
    """Returns a list of all installed plugins in central FiftyOne Teams.

    Args:
        include_builtin (False): whether to include builtin plugins

    Returns:
        a list of :class:`Plugin` instances
    """
    client = connection.APIClientConnection().client

    plugins = client.post_graphql_request(
        query=_LIST_PLUGINS_QUERY,
        variables={"includeBuiltin": include_builtin},
    )["plugins"]
    return util.camel_to_snake_container(plugins)


def get_plugin_info(plugin_name: str) -> Plugin:
    """Gets information about the specified plugin in central FiftyOne Teams.

    Args:
        plugin_name: a plugin name

    Returns:
        :class:`Plugin`, or ``None`` if no such plugin is found
    """
    client = connection.APIClientConnection().client

    plugin = client.post_graphql_request(
        query=_GET_PLUGIN_INFO_QUERY, variables={"pluginName": plugin_name}
    )["plugin"]
    return util.camel_to_snake_container(plugin)


def upload_plugin(plugin_path: str, overwrite: bool = False) -> Plugin:
    """Uploads a plugin to central FiftyOne Teams.

    The local plugin must be a zip file that contains a single directory with
    a ``fiftyone.yml`` or ``fiftyone.yaml`` file. For example::

        my_plugin/
            fiftyone.yml
            __init__.py
            data.txt

    .. note:

        Only admins can upload plugins.

    Args:
        plugin_path: the path to a plugin zip or directory
        overwrite (False): whether to overwrite an existing plugin with same
            name
    """
    client = connection.APIClientConnection().client

    if os.path.isdir(plugin_path):
        with tempfile.TemporaryDirectory() as temp_dir:
            zip_name = os.path.join(temp_dir, "plugin")
            zip_name = shutil.make_archive(
                base_name=zip_name, format="zip", root_dir=plugin_path
            )

            with open(zip_name, "rb") as f:
                upload_token = json.loads(client.post_file("file", f))[
                    "file_token"
                ]
    else:
        with open(plugin_path, "rb") as f:
            upload_token = json.loads(client.post_file("file", f))[
                "file_token"
            ]

    return client.post_graphql_request(
        query=_UPLOAD_PLUGIN_QUERY,
        variables={"token": upload_token, "overwrite": overwrite},
    )["uploadPlugin"]


def download_plugin(plugin_name: str, download_dir: str) -> str:
    """Downloads a plugin from central FiftyOne Teams.

    Args:
        plugin_name: a plugin name
        download_dir: a directory into which to download the plugin

    Returns:
        the path to the downloaded plugin
    """
    client = connection.APIClientConnection().client
    return_value = client.post_graphql_request(
        query=_DOWNLOAD_PLUGIN_QUERY, variables={"name": plugin_name}
    )

    file_token = return_value["downloadPlugin"]
    resp = client.get(f"file/{file_token}")
    outpath = os.path.join(download_dir, file_token)
    with open(outpath, "wb") as f:
        f.write(resp.content)

    return outpath


def delete_plugin(plugin_name: str) -> None:
    """Deletes the given plugin from central FiftyOne Teams.

    .. note::

        Only admins can perform this action.

    Args:
        plugin_name: a plugin name
    """
    client = connection.APIClientConnection().client
    client.post_graphql_request(
        query=_DELETE_PLUGIN_QUERY, variables={"name": plugin_name}
    )


def set_plugin_enabled(plugin_name: str, enabled: bool) -> None:
    """Sets the enabled status of the given plugin in central FiftyOne Teams.

    .. note::

        Only admins can perform this action.

    Args:
        plugin_name: a plugin name
        enabled: a bool specifying what to set enabled status to
    """
    client = connection.APIClientConnection().client
    client.post_graphql_request(
        query=_SET_PLUGIN_ENABLED_QUERY,
        variables={"pluginName": plugin_name, "enabled": enabled},
    )


def set_plugin_operator_enabled(
    plugin_name: str, operator_name: str, enabled: bool
) -> None:
    """Sets the enabled status of the given plugin operator in central FiftyOne
    Teams.

    .. note::

        Only admins can perform this action.

    Args:
        plugin_name: a plugin name
        operator_name: an operator name within the given plugin
        enabled: a bool specifying what to set operator enabled status to
    """
    client = connection.APIClientConnection().client
    client.post_graphql_request(
        query=_UPDATE_PLUGIN_OPERATOR_QUERY,
        variables={
            "pluginName": plugin_name,
            "operatorName": operator_name,
            "enabled": enabled,
        },
    )


def set_plugin_operator_permissions(
    plugin_name: str,
    operator_name: str,
    minimum_role: Optional[users.UserRole] = None,
    minimum_dataset_permission: Optional[dataset.DatasetPermission] = None,
):
    """Sets permission levels of the given plugin operator in central FiftyOne
    Teams.

    At least one of ``minimum_role`` and ``minimum_dataset_permission``
    must be set.

    .. note::

        Only admins can perform this action.

    Args:
        plugin_name: a plugin name
        operator_name: an operator name within the given plugin
        minimum_role (None): an optional
            :class:`fiftyone.management.DatasetPermission` to set
        minimum_dataset_permission (None): an optional
            :class:`fiftyone.management.DatasetPermission` to set
    """
    if not any((minimum_role, minimum_dataset_permission)):
        raise ValueError(
            "Must specify minimum_role and/or minimum_dataset_permission"
        )

    minimum_role_str = users._validate_user_role(minimum_role, nullable=True)
    minimum_dataset_permission_str = dataset._validate_dataset_permission(
        minimum_dataset_permission, nullable=True
    )

    client = connection.APIClientConnection().client
    client.post_graphql_request(
        query=_UPDATE_PLUGIN_OPERATOR_QUERY,
        variables={
            "pluginName": plugin_name,
            "operatorName": operator_name,
            "minRole": minimum_role_str,
            "minDatasetPerm": minimum_dataset_permission_str,
        },
    )
