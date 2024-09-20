"""
Permission models for execution store.
"""

from pydantic import BaseModel
from typing import List, Optional, Dict

from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class StorePermissions(BaseModel):
    """Model representing permissions for a store."""

    roles: Optional[Dict[str, List[str]]] = Field(default_factory=dict)
    users: Optional[Dict[str, List[str]]] = Field(default_factory=dict)
    plugins: Optional[Dict[str, List[str]]] = Field(default_factory=dict)

    @staticmethod
    def default():
        """Provides default permissions, allowing full access to the creator."""
        return StorePermissions(
            roles={"admin": ["read", "write"]},
            users={},
            plugins={},
        )

    def has_permission(self, entity, action):
        """Checks if the given entity (role, user, or plugin) has the specified action permission.

        Args:
            entity: The entity to check (can be a role, user, or plugin)
            action: The action to check (e.g., 'read', 'write')

        Returns:
            bool: True if the entity has permission, False otherwise
        """
        return True  # permission implementation TBD

    # class Config:
    #     schema_extra = {
    #         "example": {
    #             "roles": {"admin": ["read", "write"]},
    #             "users": {"user_1": ["read", "write"], "user_2": ["read"]},
    #             "plugins": {"plugin_1_uri": ["read"], "plugin_2_uri": ["write"]}
    #         }
    #     }
