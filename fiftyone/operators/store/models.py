"""
Store and key models for the execution store.
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
import datetime


class KeyDocument(BaseModel):
    """Model representing a key in the store."""

    key: str
    value: Any
    ttl: Optional[int] = None  # Time To Live in milliseconds
    created_at: datetime.datetime = Field(
        default_factory=datetime.datetime.utcnow
    )
    updated_at: Optional[datetime.datetime] = None

    class Config:
        schema_extra = {
            "example": {
                "key": "widgets_key",
                "value": {"widget_1": "foo", "widget_2": "bar"},
                "ttl": 600000,  # 10 minutes
            }
        }


class StoreDocument(BaseModel):
    """Model representing a store in the execution store."""

    store_name: str
    keys: Dict[str, KeyDocument] = Field(default_factory=dict)
    permissions: Optional[
        Dict[str, Any]
    ] = None  # Permissions can be a role/user/plugin map
    created_at: datetime.datetime = Field(
        default_factory=datetime.datetime.utcnow
    )

    class Config:
        schema_extra = {
            "example": {
                "store_name": "widget_store",
                "keys": {
                    "widgets_key": {
                        "key": "widgets_key",
                        "value": {"widget_1": "foo", "widget_2": "bar"},
                        "ttl": 600000,
                    }
                },
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
