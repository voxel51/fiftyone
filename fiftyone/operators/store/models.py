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
    created_at: datetime.datetime = Field(
        default_factory=datetime.datetime.utcnow
    )
    updated_at: Optional[datetime.datetime] = None
    expires_at: Optional[datetime.datetime] = None
    permissions: Optional[
        Dict[str, Any]
    ] = None  # Permissions can be a role/user/plugin map

    @staticmethod
    def get_expiration(ttl: Optional[int]) -> Optional[datetime.datetime]:
        """Gets the expiration date for a key with the given TTL."""
        if ttl is None:
            return None

        return datetime.datetime.now() + datetime.timedelta(milliseconds=ttl)


class StoreDocument(KeyDocument):
    """Model representing a store in the execution store."""

    key: str = "__store__"
    value: Optional[Dict[str, Any]] = None
