"""
Plugin management.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import dataclasses
import json
import os
import shutil
import subprocess
import tempfile
from typing import Dict, List, Optional
import zipfile

from fiftyone.management import connection
from fiftyone.management import dataset
from fiftyone.management import users
from fiftyone.management import util


@dataclasses.dataclass
class OperatorPermission(object):
    """Operator permission dataclass."""

    minimum_role: users.UserRole
    minimum_dataset_permission: dataset.DatasetPermission

    def __post_init__(self):
        if isinstance(self.minimum_role, str):
            self.minimum_role = users.UserRole[self.minimum_role]

        if isinstance(self.minimum_dataset_permission, str):
            self.minimum_dataset_permission = dataset.DatasetPermission[
                self.minimum_dataset_permission
            ]


@dataclasses.dataclass
class PluginOperator(object):
    """Plugin operator dataclass."""

    name: str
    enabled: bool
    permission: OperatorPermission


@dataclasses.dataclass
class Plugin(object):
    """Plugin dataclass."""

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
        }) {name}
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


def _dict_to_plugin(plugin_dict: Dict) -> Plugin:
    operators = [
        PluginOperator(
            name=op.get("name"),
            enabled=op.get("enabled"),
            permission=OperatorPermission(
                minimum_role=(op.get("permission", {}) or {}).get(
                    "minimum_role"
                ),
                minimum_dataset_permission=(
                    op.get("permission", {}) or {}
                ).get("minimum_dataset_permission"),
            ),
        )
        for op in plugin_dict.get("operators", [])
    ]
    plugin = Plugin(
        name=plugin_dict.get("name"),
        description=plugin_dict.get("description"),
        version=plugin_dict.get("version"),
        fiftyone_version=plugin_dict.get("fiftyone_version"),
        enabled=plugin_dict.get("enabled"),
        operators=operators,
    )
    return plugin


def list_plugins(include_builtin: bool = False) -> List[Plugin]:
    """Returns a list of all installed plugins in central FiftyOne Teams.

    Examples::

        import fiftyone.management as fom

        fom.list_plugins()

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
    return [
        _dict_to_plugin(plugin)
        for plugin in util.camel_to_snake_container(plugins)
    ]


def get_plugin_info(plugin_name: str) -> Plugin:
    """Gets information about the specified plugin in central FiftyOne Teams.

    Examples::

        import fiftyone.management as fom

        fom.get_plugin_info("my-plugin")

    Args:
        plugin_name: a plugin name

    Returns:
        :class:`Plugin`, or ``None`` if no such plugin is found
    """
    client = connection.APIClientConnection().client

    plugin = client.post_graphql_request(
        query=_GET_PLUGIN_INFO_QUERY, variables={"pluginName": plugin_name}
    )["plugin"]
    return _dict_to_plugin(util.camel_to_snake_container(plugin))


def _make_archive(plugin_path: str, zip_base: str, optimize: bool) -> str:
    if optimize:
        zip_name = f"{zip_base}.zip"

        # First try using git archive if .gitignore exists
        if os.path.exists(os.path.join(plugin_path, ".gitignore")):
            os.chdir(plugin_path)
            git_archive_args = [
                "git",
                "archives",
                "--format=zip",
                "-o",
                zip_name,
                "HEAD",
            ]
            # Run 'git archive' as subprocess so we don't need to have any python
            #   git dependencies
            try:
                process_run = subprocess.run(git_archive_args)
                if process_run.returncode == 0:
                    return zip_name
            except FileNotFoundError:
                pass

        # Second, we'll give best attempt at optimizing it ourselves
        prune_dirs = {
            ".git",
            "__MACOSX",
            "venv",
            "node_modules",
            "__pycache__",
            ".idea",
            ".yarn",
        }
        prune_suffixes = {".DS_Store"}

        with zipfile.ZipFile(zip_name, "w", zipfile.ZIP_BZIP2) as zf:
            for dir_name, sub_dirs, files in os.walk(plugin_path):
                # Prune dirs from os.walk
                to_remove = set(sub_dirs).intersection(prune_dirs)
                for d in to_remove:
                    sub_dirs.remove(d)

                # Prune files with unwanted suffix then write to the zip
                for file in files:
                    if not any(file.endswith(suff) for suff in prune_suffixes):
                        rel_path = os.path.relpath(dir_name, plugin_path)
                        zf.write(
                            os.path.join(dir_name, file),
                            os.path.join(rel_path, file),
                        )
    else:
        zip_name = shutil.make_archive(
            base_name=zip_base, format="zip", root_dir=plugin_path
        )
    return zip_name


def upload_plugin(
    plugin_path: str, overwrite: bool = False, optimize=False
) -> Plugin:
    """Uploads a plugin to central FiftyOne Teams.

    The local plugin must be a zip file that contains a single directory with
    a ``fiftyone.yml`` or ``fiftyone.yaml`` file. For example::

        my_plugin/
            fiftyone.yml
            __init__.py
            data.txt

    .. note::

        Only admins can upload plugins.

    Examples::

        import fiftyone.management as fom

        # Upload a raw plugin directory
        fom.upload_plugin("/path/to/plugin_dir", overwrite=True)

        # Upload a plugin, optimizing the directory before the upload
        fom.upload_plugin("/path/to/plugin_dir", overwrite=True, optimize=True)

        # Upload a plugin as ZIP file
        fom.upload_plugin("/path/to/plugin.zip", overwrite=True)

    Args:
        plugin_path: the path to a plugin zip or directory
        overwrite (False): whether to overwrite an existing plugin with same
            name
        optimize (False): whether to optimize the created zip file before
            uploading. If a ``.gitignore`` file exists, an attempt will first
            be made to use ``git archive`` to create the zip. If not or this
            doesn't work, a zip will be created by pruning various known
            system-generated files and directories such as ``.git/`` and
            ``__pycache__/``. This argument has no effect if ``plugin_path``
            does not point to a directory
    """
    client = connection.APIClientConnection().client

    if os.path.isdir(plugin_path):
        # Found a dir; make an archive from it then upload
        with tempfile.TemporaryDirectory() as temp_dir:
            zip_base = os.path.join(temp_dir, "plugin")
            zip_name = _make_archive(plugin_path, zip_base, optimize)

            with open(zip_name, "rb") as f:
                upload_token = json.loads(client.post_file("file", f))[
                    "file_token"
                ]
    else:
        # Assume its a zip and try to upload as such
        with open(plugin_path, "rb") as f:
            upload_token = json.loads(client.post_file("file", f))[
                "file_token"
            ]

    return client.post_graphql_request(
        query=_UPLOAD_PLUGIN_QUERY,
        variables={"token": upload_token, "overwrite": overwrite},
    )["uploadPlugin"]


def delete_plugin(plugin_name: str) -> None:
    """Deletes the given plugin from central FiftyOne Teams.

    Examples::

        import fiftyone.management as fom

        plugin_name = "special-plugin"
        fom.delete_plugin(plugin_name)

        plugins = fom.list_plugins()
        assert not any(plugin.name == plugin_name for plugin in plugins)

    .. note::

        Only admins can perform this action.

    Args:
        plugin_name: a plugin name
    """
    client = connection.APIClientConnection().client
    client.post_graphql_request(
        query=_DELETE_PLUGIN_QUERY, variables={"name": plugin_name}
    )


def download_plugin(plugin_name: str, download_dir: str) -> str:
    """Downloads a plugin from central FiftyOne Teams.

    Examples::

        import fiftyone.management as fom

        fom.download_plugin("special-plugin", "/path/to/local/plugins/")

    Args:
        plugin_name: a plugin name
        download_dir: a directory into which to download the plugin

    Returns:
        the path to the downloaded plugin
    """
    os.makedirs(download_dir, exist_ok=True)

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


def set_plugin_enabled(plugin_name: str, enabled: bool) -> None:
    """Sets the enabled status of the given plugin in central FiftyOne Teams.

    .. note::

        Only admins can perform this action.

    Examples::

        import fiftyone.management as fom

        # Disable whole plugin
        fom.set_plugin_enabled("special-plugin", False)

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

    Examples::

        import fiftyone.management as fom

        # Disable a particular operator
        fom.set_plugin_operator_enabled("special-plugin", "special-operator", False)

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

    Examples::

        import fiftyone.management as fom

        plugin_name = "special-plugin"
        operator_name = "special-operator"

        # Set minimum role permission only
        fom.set_plugin_operator_enabled(
            plugin_name,
            operator_name,
            minimum_role=fom.MEMBER
            )

        # Set minimum dataset permission only
        fom.set_plugin_operator_enabled(
            plugin_name,
            operator_name,
            minimum_dataset_permission=fom.EDIT
        )

        # Set both minimum role and minimum dataset permissions
        fom.set_plugin_operator_enabled(
            plugin_name,
            operator_name,
            minimum_role=fom.EDIT,
            minimum_dataset_permission=fom.EDIT
        )

    Args:
        plugin_name: a plugin name
        operator_name: an operator name within the given plugin
        minimum_role (None): an optional
            :class:`~fiftyone.management.users.UserRole` to set
        minimum_dataset_permission (None): an optional
            :class:`~fiftyone.management.dataset.DatasetPermission` to set
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
