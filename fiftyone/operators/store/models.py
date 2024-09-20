"""
Store and key models for the execution store.
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
import datetime


class KeyDocument(BaseModel):
    """Model representing a key in the store."""

    store_name: str
    key: str
    value: Any
    ttl: Optional[int] = None  # Time To Live in milliseconds
    created_at: datetime.datetime = Field(
        default_factory=datetime.datetime.utcnow
    )
    updated_at: Optional[datetime.datetime] = None
    permissions: Optional[
        Dict[str, Any]
    ] = None  # Permissions can be a role/user/plugin map

    class Config:
        schema_extra = {
            "example": {
                "store_name": "widget_store",
                "key": "widgets_key",
                "value": {"widget_1": "foo", "widget_2": "bar"},
                "ttl": 600000,  # 10 minutes
            }
        }


class StoreDocument(KeyDocument):
    """Model representing a store in the execution store."""

    key: str = "__store__"
    value: Optional[Dict[str, Any]] = None

    class Config:
        schema_extra = {
            "example": {
                "key": "__store__",
                "store_name": "widget_store",
                "permissions": {
                    "roles": {"admin": ["read", "write"]},
                    "users": {"user_1": ["read", "write"], "user_2": ["read"]},
                    "groups": {"group_1": ["read", "write"]},
                    "plugins": {
                        "plugin_1_uri": ["read"],
                        "plugin_2_uri": ["write"],
                    },
                },
            }
        }
