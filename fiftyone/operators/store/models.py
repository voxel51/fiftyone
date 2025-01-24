"""
Execution store models.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from datetime import datetime, timedelta
from dataclasses import dataclass, field, asdict
from typing import Optional, Any

from bson import ObjectId


@dataclass
class KeyDocument:
    """Model representing a key in the store."""

    store_name: str
    key: str
    value: Any
    _id: Optional[Any] = None
    dataset_id: Optional[ObjectId] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

    @staticmethod
    def get_expiration(ttl: Optional[int]) -> Optional[datetime]:
        """Gets the expiration date for a key with the given TTL."""
        if ttl is None:
            return None

        return datetime.utcnow() + timedelta(seconds=ttl)

    def to_mongo_dict(self, exclude_id: bool = True) -> dict[str, Any]:
        """Serializes the document to a MongoDB dictionary."""
        data = asdict(self)
        if exclude_id:
            data.pop("_id", None)

        return data


@dataclass
class StoreDocument(KeyDocument):
    """Model representing a Store."""

    key: str = "__store__"
    value: Optional[dict[str, Any]] = None

    @property
    def metadata(self) -> dict[str, Any]:
        """The metadata associated with the store."""
        return self.value or {}
