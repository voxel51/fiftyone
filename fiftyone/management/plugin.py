"""
Plugin management.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import json
import os
from typing import List, Optional, TypedDict

from fiftyone.management import connection
from fiftyone.management import dataset
from fiftyone.management import users
from fiftyone.management import util


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


def download_plugin(plugin_name: str, download_dir: str) -> str:
    client = connection.APIClientConnection().client
    return_value = client.post_graphql_request(
        query=_DOWNLOAD_PLUGIN_QUERY, variables={"name": plugin_name}
    )

    file_token = return_value["downloadPlugin"]
    resp = client.get(f"file/{file_token}")
    out_path = os.path.join(download_dir.rstrip("/"), file_token)
    with open(out_path, "wb") as outfile:
        outfile.write(resp.content)

    return out_path


def get_plugin_info(plugin_name: str) -> Plugin:
    """Gets information about the specified plugin (if any).

    Args:
        plugin_name: plugin name string

    Returns:
        :class:`Plugin`, or ``None`` if no such plugin is found
    """
    client = connection.APIClientConnection().client

    plugin = client.post_graphql_request(
        query=_GET_PLUGIN_INFO_QUERY, variables={"pluginName": plugin_name}
    )["plugin"]
    return util.camel_to_snake_container(plugin)


def list_plugins(include_builtin: bool = False) -> List[Plugin]:
    """Returns a list of all installed plugins

    Args:
        include_builtin (False): a bool specifying to include
            builtin plugin/operators

    Returns:
        a list of :class:`Plugin` instances
    """
    client = connection.APIClientConnection().client

    plugins = client.post_graphql_request(
        query=_LIST_PLUGINS_QUERY,
        variables={"includeBuiltin": include_builtin},
    )["plugins"]
    return util.camel_to_snake_container(plugins)


def set_plugin_enabled(plugin_name: str, enabled: bool) -> None:
    """Sets enabled status of the given plugin.

    .. note::

        Only admins can perform this action.

    Args:
        plugin_name: a plugin name string
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
    """Sets enabled status of the given plugin operator.

    .. note::

        Only admins can perform this action.

    Args:
        plugin_name: a plugin name string
        operator_name: a string specifying name of operator within given plugin
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
    """Sets permission levels of the given plugin operator.
    At least one of ``minimum_role`` and ``minimum_dataset_permission``
    must be set.

    .. note::

        Only admins can perform this action.

    Args:
        plugin_name: a plugin name string
        operator_name: a string specifying name of operator within given plugin
        minimum_role (None): an optional :class:`fiftyone.management.DatasetPermission`
            instance. Defaults to None which means don't update the field.
        minimum_dataset_permission (None): an optional
            :class:`fiftyone.management.DatasetPermission`
            instance. Defaults to None which means don't update the field.
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


def upload_plugin(
    plugin_zip_file_path: str, overwrite: bool = False
) -> Plugin:
    """Uploads a local path plugin to the FiftyOne Teams shared plugin system.

    Local path plugin must be in zip format with valid `fiftyone.yml` at the
    root or within a single common root folder.

    E.g.,
        my_plugin/
        my_plugin/fiftyone.yml
        my_plugin/__init__.py
        my_plugin/data.txt

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

    return client.post_graphql_request(
        query=_UPLOAD_PLUGIN_QUERY,
        variables={"token": upload_token, "overwrite": overwrite},
    )["uploadPlugin"]
