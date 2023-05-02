"""
FiftyOne operator permissions.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from enum import Enum
from .registry import OperatorRegistry
from .loader import load_from_dir
import requests

class RequestType(Enum):
  LIST = 1
  EXEC = 2

class PermissionedOperatorRegistry(OperatorRegistry):
  def __init__(self, request_type, managed_operators):
    self.request_type = request_type
    self.managed_operators = managed_operators
    super().__init__()

  def list_operators(self):
    """Lists the available FiftyOne operators.

    Returns:
        a list of operators
    """
    operators = super().list_operators()
    return [o for o in operators if self.managed_operators.has_operator(o.uri)]

  @classmethod
  def from_list_request(cls, request):
    token = get_token_from_request(request)
    raw_operators = get_available_operators(token)
    return PermissionedOperatorRegistry(request_type=RequestType.LIST, managed_operators=ManagedOperators.from_json(raw_operators))

  @classmethod
  def from_exec_request(cls, request):
    token = get_token_from_request(request)
    raw_operators = get_available_operators(token)
    return PermissionedOperatorRegistry(request_type=RequestType.EXEC, managed_operators=ManagedOperators.from_json(raw_operators))

class DatasetPermission(int, Enum):
  NO_ACCESS = 0
  VIEW = 1
  COMMENT = 2
  EDIT = 3
  MANAGE = 4


class ManagedPlugins:
  def __init__(self, plugins):
    self.plugins = plugins
  
  @classmethod
  def from_json(json):
    return RemotePlugins(
      plugins=[RemotePluginDefinition.from_json(p) for p in json['plugins']]
    )
  
  def get_operator_definition(self, uri):
    for plugin in self.plugins:
      for operator in plugin.operators:
        if operator.uri == uri:
          return operator
    return None

  def has_operator(self, uri):
    return self.get_operator_definition(uri) is not None

class RemotePluginDefinition:
    """A remote plugin definition.

    Args:
        name: the name of the plugin
        version: the version of the plugin
        description: the description of the plugin
    """
    def __init__(self, name, version=None, description=None, fiftyoneVersion=None, enabled=None, operators=None):
        self.name = name
        self.version = version
        self.description = description
        self.fiftyoneVersion = fiftyoneVersion
        self.enabled = enabled
        self.operators = operators

    @classmethod
    def from_json(json):
        operators_json = json.get('operators', None)
        name = json['name']
        return RemotePluginDefinition(
            name=name,
            version=json.get('version', None),
            description=json.get('description', None),
            fiftyoneVersion=json.get('fiftyoneVersion', None),
            enabled=json.get('enabled', False),
            operators=[RemoteOperatorDefinition.from_json(o, name) for o in operators_json] if operators_json else None
        )

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

class RemoteOperatorDefinition:
  def __init__(self, plugin_name,name, enabled=None, permission=None):
    self.name = name
    self.enabled = enabled
    self.permission = permission

  @classmethod
  def from_json(json, plugin_name):
    permission_json = json.get('permission', None)
    return RemoteOperatorDefinition(
      plugin_name=plugin_name,
      name=json['name'],
      enabled=json.get('enabled', False),
      permission=RemoteOperatorPermission.from_json(permission_json) if permission_json else None
    )

class RemoteOperatorPermission:
  def __init__(self, name, minimumDatasetPermission=None, minimumRole=None):
    self.plugin_name = plugin_name
    self.name = name
    self.minimumDatasetPermission = minimumDatasetPermission
    self.minimumRole = minimumRole

  @property
  def uri(self):
    return f'{self.plugin_name}/{self.name}'

  @classmethod
  def from_json(json):
    return RemoteOperatorPermission(
      name=json['name'],
      minimumDatasetPermission=json.get('minimumDatasetPermission', None),
      minimumRole=json.get('minimumRole', None)
    )

def get_token_from_request(request):
    header = request.headers.get("Authorization", None)
    cookie = request.cookies.get("fiftyone-token", None)
    if header:
        token = get_header_token(header)
    elif cookie:
        token = cookie
    return token

# an example using the requests module to make an request to a graphql
# server returning the results in a dictionary
def make_request(url, access_token, query, variables=None):
    headers = {'Content-Type': 'application/json', 'Authorization': access_token}
    request = requests.post(url, headers=headers, json={'query': query, 'variables': variables})
    if request.status_code == 200:
        result = request.json()
        if 'errors' in result:
          for error in result['errors']:
            print(error)
          raise Exception(f'Query failed with errors. {query}')
        return result
    else:
        raise Exception(f'Query failed to run by returning code of {request.status_code}. {query}')

_PLUGINS_QUERY = """
query ListAvailableOperators{
    operators($datasetIds: [String], $onlyEnabled: Boolean) {
        name
        enabled
    }
}
"""

def get_available_operators(token, dataset_ids=None, only_enabled=True):
  print('get_available_operators')
  result = make_request('http://localhost:8000/graphql/v1', token, _PLUGINS_QUERY, variables={
    'datasetIds': dataset_ids,
    'onlyEnabled': only_enabled
  })
  print('result')
  print(result)
  return result.get("data", {}).get("operators", [])