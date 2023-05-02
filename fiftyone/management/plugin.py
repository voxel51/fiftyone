"""
Plugin management.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import json
import os
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


def get_plugin_info(plugin_name: str) -> Plugin:
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


def download_plugin(plugin_name: str, download_dir: str) -> str:
    client = connection.APIClientConnection().client
    return_value = client.post_graphql_request(
        query=_DOWNLOAD_PLUGIN_QUERY, variables={"name": plugin_name}
    )

    file_token = return_value["downloadPlugin"]
    resp = client.get(f"file/{file_token}")
    out_path = os.path.join(download_dir, file_token)
    with open(out_path, "wb") as outfile:
        outfile.write(resp.content)

    return out_path


def delete_plugin(plugin_name: str) -> None:
    """Deletes the given plugin.

    .. note::

        Only admins can perform this action.

    Args:
        plugin_name: name of plugin to remove
    """

    client = connection.APIClientConnection().client
    client.post_graphql_request(
        query=_DELETE_PLUGIN_QUERY, variables={"name": plugin_name}
    )


def upload_plugin(plugin_zip_file_path: str, overwrite: bool = False) -> None:
    """Uploads a plugin to Teams system, given local path to plugin zip file.

    .. note:

        Only admins can upload plugins.

    Args:
        plugin_zip_file_path: a path to plugin .zip file
        overwrite (False): overwrites an existing plugin with same name if True
    """
    client = connection.APIClientConnection().client

    with open(plugin_zip_file_path, "rb") as f:
        json_content = json.loads(client.post_file("file", f))
    upload_token = json_content["file_token"]

    client.post_graphql_request(
        query=_UPLOAD_PLUGIN_QUERY,
        variables={"token": upload_token, "overwrite": overwrite},
    )
