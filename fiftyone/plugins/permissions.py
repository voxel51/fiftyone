"""
FiftyOne operator permissions.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from fiftyone.internal.requests import make_request
from fiftyone.internal.util import get_api_url, get_token_from_request


class ManagedPlugins:
    def __init__(self, plugins):
        self.plugins = plugins

    def get_plugin_definition(self, name):
        for plugin in self.plugins:
            if plugin.name == name:
                return plugin
        return None

    def has_plugin(self, name):
        return self.get_plugin_definition(name) is not None

    def has_enabled_plugin(self, name):
        plugin = self.get_plugin_definition(name)
        if plugin:
            return plugin.enabled
        return False

    @classmethod
    def from_json(cls, json):
        return ManagedPlugins(
            plugins=[RemotePluginDefinition.from_json(p) for p in json]
        )

    @classmethod
    async def for_request(cls, request):
        token = get_token_from_request(request)
        raw_plugins = await get_available_plugins(token)
        return ManagedPlugins.from_json(raw_plugins)


class ManagedOperators:
    def __init__(self, operators):
        self.operators = operators

    def get_operator_definition(self, uri):
        for operator in self.operators:
            if operator.uri == uri:
                return operator
        return None

    def has_operator(self, uri):
        return self.get_operator_definition(uri) is not None

    @classmethod
    def from_json(cls, json):
        return ManagedOperators(
            operators=[RemoteOperatorDefinition.from_json(o) for o in json]
        )

    @classmethod
    async def for_request(cls, request, dataset_ids=None):
        token = get_token_from_request(request)
        raw_operators = await get_available_operators(
            token, dataset_ids=dataset_ids
        )
        return ManagedOperators.from_json(raw_operators)


class RemotePluginDefinition:
    def __init__(self, name, enabled=False):
        self.name = name
        self.enabled = enabled

    @classmethod
    def from_json(cls, json):
        return RemotePluginDefinition(
            name=json["name"],
            enabled=json.get("enabled", False),
        )


class RemoteOperatorDefinition:
    def __init__(self, plugin_name, name, uri, enabled=None, permission=None):
        self.plugin_name = plugin_name
        self.name = name
        self.uri = uri
        self.enabled = enabled
        self.permission = permission

    @classmethod
    def from_json(cls, json):
        return RemoteOperatorDefinition(
            plugin_name=json.get("pluginName", None),
            name=json["name"],
            uri=json["uri"],
            enabled=json.get("enabled", False),
        )


# an example using the requests module to make a request to a graphql
# server returning the results in a dictionary


_AVAIL_OPERATORS_QUERY = """
query ListAvailableOperators($datasetIds: [String!], $onlyEnabled: Boolean) {
    operators(datasetIds: $datasetIds, onlyEnabled: $onlyEnabled) {
        name
        enabled
        pluginName
        uri
    }
}
"""
_AVAIL_PLUGINS_QUERY = """
query ListAvailablePlugins {
  plugins {
    enabled
    name
  }
}
"""

_API_URL = get_api_url()


async def get_available_operators(token, dataset_ids=None, only_enabled=True):
    result = await make_request(
        f"{_API_URL}/graphql/v1",
        token,
        _AVAIL_OPERATORS_QUERY,
        variables={"datasetIds": dataset_ids, "onlyEnabled": only_enabled},
    )
    return result.get("data", {}).get("operators", [])


async def get_available_plugins(token):
    result = await make_request(
        f"{_API_URL}/graphql/v1", token, _AVAIL_PLUGINS_QUERY
    )
    return result.get("data", {}).get("plugins", [])
