from dataclasses import dataclass, field, asdict
from typing import Optional, Dict, Any
import datetime


@dataclass
class KeyDocument:
    """Model representing a key in the store."""

    store_name: str
    key: str
    value: Any
    created_at: datetime.datetime = field(
        default_factory=datetime.datetime.now
    )
    _id: Optional[Any] = None
    updated_at: Optional[datetime.datetime] = None
    expires_at: Optional[datetime.datetime] = None

    @staticmethod
    def get_expiration(ttl: Optional[int]) -> Optional[datetime.datetime]:
        """Gets the expiration date for a key with the given TTL."""
        if ttl is None:
            return None
        return datetime.datetime.now() + datetime.timedelta(seconds=ttl)

    def to_mongo_dict(self, exclude_id: bool = True) -> Dict[str, Any]:
        """Serializes the document to a MongoDB dictionary."""
        data = asdict(self)
        if exclude_id:
            data.pop("_id", None)
        return data


@dataclass
class StoreDocument(KeyDocument):
    """Model representing a Store."""

    key: str = "__store__"
    value: Optional[Dict[str, Any]] = None
