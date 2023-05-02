"""
Plugin management.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import json
from typing import List, TypedDict

from fiftyone.management import connection
from fiftyone.management import dataset
from fiftyone.management import users


class OperatorPermission(TypedDict):
    minimum_role: users.UserRole
    minimum_dataset_permission: dataset.DatasetPermission


class PluginOperator(TypedDict):
    """dict with information about a plugin operator"""

    name: str
    enabled: bool
    permission: OperatorPermission


class Plugin(TypedDict):
    """dict with information about a plugin"""

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

_CREATE_PLUGIN_QUERY = (
    _PLUGIN_FRAGMENT
    + """
    mutation($token: String!) {
        createPlugin(fileUploadToken: $token) {
            ...pluginFrag
        }
    }
"""
)

_GET_PLUGIN_QUERY = (
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
    query {
        plugins {
            ...pluginFrag
        }
    }
    """
)

_REMOVE_PLUGIN_QUERY = """
mutation {
    removePlugin(pluginName: "myPlugin")
}
"""

_UPGRADE_PLUGIN_QUERY = (
    _PLUGIN_FRAGMENT
    + """
    mutation($name: String, $token: String) {
        upgradePlugin(pluginName: $name, fileUploadToken: $token) {
            ...pluginFrag
        }
    }
"""
)


def create_plugin(plugin_zip_file_path: str) -> None:
    """Creates a plugin given path to plugin zip file.

    .. note:

        Only admins can create plugins.

    Args:
        plugin_zip_file_path: a path to plugin .zip file
    """
    client = connection.APIClientConnection().client

    with open(plugin_zip_file_path, "rb") as f:
        json_content = json.loads(client.post_file("file", f))
    upload_token = json_content["file_token"]

    client.post_graphql_request(
        query=_CREATE_PLUGIN_QUERY, variables={"token": upload_token}
    )


def get_plugin(plugin_name: str) -> Plugin:
    """Gets information about the specified plugin (if any).

    Args:
        plugin_name: plugin name string

    Returns:
        :class:`Plugin`, or ``None`` if no such plugin is found
    """
    client = connection.APIClientConnection().client

    return client.post_graphql_request(
        query=_GET_PLUGIN_QUERY, variables={"pluginName": plugin_name}
    )


def list_plugins() -> List[Plugin]:
    """Returns a list of all installed plugins

    Returns:
        a list of :class:`Plugin` instances
    """
    client = connection.APIClientConnection().client

    return client.post_graphql_request(query=_LIST_PLUGINS_QUERY)


def remove_plugin(plugin_name: str) -> None:
    """Deletes the given plugin.

    .. note::

        Only admins can perform this action.

    Args:
        plugin_name: name of plugin to remove
    """

    client = connection.APIClientConnection().client
    client.post_graphql_request(
        query=_REMOVE_PLUGIN_QUERY, variables={"pluginName": plugin_name}
    )


def upgrade_plugin(plugin_name: str, plugin_zip_file_path: str) -> None:
    """Upgrades a given plugin given a path to plugin zip file.

    If the name declared in `fiftyone.yml` inside the zip file doesn't
    match `plugin_name`, the plugin will be renamed.

    .. note:

        Only admins can upgrade plugins.

    Args:
        plugin_name: name of plugin to upgrade
        plugin_zip_file_path: a path to plugin .zip file
    """
    client = connection.APIClientConnection().client

    with open(plugin_zip_file_path, "rb") as f:
        json_content = json.loads(client.post_file("file", f))
    upload_token = json_content["file_token"]

    client.post_graphql_request(
        query=_UPGRADE_PLUGIN_QUERY,
        variables={"name": plugin_name, "token": upload_token},
    )
