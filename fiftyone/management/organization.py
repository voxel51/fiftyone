"""
Organization settings management.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import dataclasses
from typing import Optional

from fiftyone.management import connection
from fiftyone.management import dataset
from fiftyone.management import users
from fiftyone.management import util as fom_util


@dataclasses.dataclass
class OrganizationSettings(object):
    default_user_role: users.UserRole
    default_dataset_permission: dataset.DatasetPermission
    default_operator_minimum_role: users.UserRole
    default_operator_minimum_dataset_permission: dataset.DatasetPermission

    def __post_init__(self):
        if isinstance(self.default_user_role, str):
            self.default_user_role = users.UserRole[self.default_user_role]
        if isinstance(self.default_dataset_permission, str):
            self.default_dataset_permission = dataset.DatasetPermission[
                self.default_dataset_permission
            ]
        if isinstance(self.default_operator_minimum_role, str):
            self.default_operator_minimum_role = users.UserRole[
                self.default_operator_minimum_role
            ]
        if isinstance(self.default_operator_minimum_dataset_permission, str):
            self.default_operator_minimum_dataset_permission = (
                dataset.DatasetPermission[
                    self.default_operator_minimum_dataset_permission
                ]
            )


_GET_ORGANIZATION_SETTINGS_QUERY = """
query {
    organizationSettings {
        defaultUserRole
        defaultDatasetPermission
        defaultOperatorMinimumRole
        defaultOperatorMinimumDatasetPermission
    }
}
"""

_SET_ORGANIZATION_SETTINGS_QUERY = """
mutation (
    $defaultUserRole: UserRole,
    $defaultDatasetPermission: DatasetPermission,
    $defaultOperatorMinimumRole: UserRole,
    $defaultOperatorMinimumDatasetPermission: DatasetPermission
) {
    setOrganizationSettings (
        defaultUserRole: $defaultUserRole,
        defaultDatasetPermission: $defaultDatasetPermission,
        defaultOperatorMinimumRole: $defaultOperatorMinimumRole,
        defaultOperatorMinimumDatasetPermission: $defaultOperatorMinimumDatasetPermission
    ){
        defaultUserRole
        defaultDatasetPermission
        defaultOperatorMinimumRole
        defaultOperatorMinimumDatasetPermission
    }
}
"""


def get_organization_settings() -> OrganizationSettings:
    """Gets organization-wide settings for the Teams deployment.

    .. note::

        Only admins can retrieve this information

    Examples::

        import fiftyone.management as fom

        fom.get_organization_settings()

    Returns:
        :class:`OrganizationSettings`
    """
    client = connection.APIClientConnection().client
    org_settings = client.post_graphql_request(
        query=_GET_ORGANIZATION_SETTINGS_QUERY
    )["organizationSettings"]
    return OrganizationSettings(
        **fom_util.camel_to_snake_container(org_settings)
    )


def set_organization_settings(
    *,
    default_user_role: Optional[users.UserRole] = None,
    default_dataset_permission: Optional[dataset.DatasetPermission] = None,
    default_operator_minimum_role: Optional[users.UserRole] = None,
    default_operator_minimum_dataset_permission: Optional[
        dataset.DatasetPermission
    ] = None,
) -> OrganizationSettings:
    """Sets organization-wide settings for the Teams deployment

    .. note::

        Only admins can perform this action.

    Examples::

        import fiftyone.management as fom

        user_role = fom.MEMBER
        dataset_perm = fom.EDIT

        # Set only default user role
        fom.set_organization_settings(default_user_role=user_role)

        # Set only default dataset permission
        fom.set_organization_settings(default_dataset_permission=dataset_perm)

        # Set multiple settings at once
        fom.set_organization_settings(
            default_user_role=user_role,
            default_dataset_permission=dataset_perm,
            default_operator_minimum_role=user_role,
            default_operator_minimum_dataset_permission=dataset_perm,
        )

    Args:
        default_user_role (None): an optional :class:`~fiftyone.management.users.UserRole` to set.
        default_dataset_permission (None): an optional
            :class:`~fiftyone.management.dataset.DatasetPermission` to set,
        default_operator_minimum_role (None): an optional :class:`~fiftyone.management.users.UserRole`
            to set
        default_operator_minimum_dataset_permission (None): an optional
            :class:`~fiftyone.management.dataset.DatasetPermission` to set

    Returns:
        :class:`OrganizationSettings`
    """
    if not any(
        (
            default_user_role,
            default_dataset_permission,
            default_operator_minimum_role,
            default_operator_minimum_dataset_permission,
        )
    ):
        raise ValueError(
            "Must specify at least one organization setting to set"
        )

    def_user_role_str = users._validate_user_role(
        default_user_role, nullable=True
    )
    def_ds_perm_str = dataset._validate_dataset_permission(
        default_dataset_permission, nullable=True
    )
    def_op_role_str = users._validate_user_role(
        default_operator_minimum_role, nullable=True
    )
    def_op_ds_perm_str = dataset._validate_dataset_permission(
        default_operator_minimum_dataset_permission, nullable=True
    )

    variables = {
        "defaultUserRole": def_user_role_str,
        "defaultDatasetPermission": def_ds_perm_str,
        "defaultOperatorMinimumRole": def_op_role_str,
        "defaultOperatorMinimumDatasetPermission": def_op_ds_perm_str,
    }

    client = connection.APIClientConnection().client
    org_settings = client.post_graphql_request(
        query=_SET_ORGANIZATION_SETTINGS_QUERY,
        variables=variables,
    )["setOrganizationSettings"]
    return OrganizationSettings(
        **fom_util.camel_to_snake_container(org_settings)
    )
