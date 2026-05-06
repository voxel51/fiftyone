from enum import Enum


class SceneFormat(str, Enum):
    """Enum of supported scene formats."""

    UNKNOWN = "unknown"
    MCAP = "mcap"
