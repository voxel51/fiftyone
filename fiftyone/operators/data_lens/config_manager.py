"""
FiftyOne Data Lens configuration manager.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import uuid
from dataclasses import asdict
from typing import Optional, Any

from fiftyone.operators.data_lens.models import LensConfig
from fiftyone.operators.data_lens.utils import filter_fields_for_type


class MockExecutionStore:
    """Placeholder implementation until ExecutionStore is available for use.

    This implementation adheres to the current ExecutionStore interface and allows for ConfigManager
    to function properly, but provides no actual persistence capabilities.
    """
    _configs = []

    @staticmethod
    def create(name: str):
        return MockExecutionStore(name)

    def __init__(self, name: str):
        self.name = name

    def list_all_stores(self):
        pass

    def get(self, key: str) -> Optional[Any]:
        matching = [
            cfg
            for cfg in self._configs
            if cfg.get("id", None) == key
        ]
        return matching[0] if len(matching) > 0 else None

    def set(self, key: str, value: Any, ttl: Optional[int] = None):
        pass

    def delete(self, key: str) -> bool:
        return True

    def has(self, key: str) -> bool:
        pass

    def clear(self):
        pass

    def update_ttl(self, key: str, ttl: int):
        pass

    def get_ttl(self, key: str) -> Optional[int]:
        pass

    def list_keys(self) -> list[str]:
        return [
            cfg["id"]
            for cfg in self._configs
        ]


class ConfigManager:
    """Manager class responsible for persisting and retrieving configs."""
    _STORE_NAME = 'data_lens_config_store'

    def __init__(self):
        self._store = MockExecutionStore.create(self._STORE_NAME)

    def list_configs(self) -> list[LensConfig]:
        """List all available configs.

        Returns:
            list: A list of configs.
        """
        configs = []

        for key in self._store.list_keys():
            data = self._store.get(key)
            if data is not None:
                configs.append(
                    self._deserialize_config(data)
                )

        return configs

    def upsert_config(self, config: LensConfig) -> LensConfig:
        """Upsert a configuration.

        Args:
            config (LensConfig): A config to upsert. If the provided config does not have an ID,
                a suitable ID will be generated.

        Returns:
            LensConfig: The updated config.
        """
        if config.id is None:
            config.id = str(uuid.uuid4())

        self._store.set(config.id, self._serialize_config(config))

        return config

    def delete_config(self, config_id: str) -> bool:
        """Delete a configuration.

        Args:
            config_id (str): The ID of the config to delete.

        Returns:
            bool: True if the config was deleted, False otherwise.
        """
        return self._store.delete(config_id)

    @staticmethod
    def _serialize_config(config: LensConfig) -> dict:
        return asdict(config)

    @staticmethod
    def _deserialize_config(config: dict) -> LensConfig:
        return LensConfig(
            **filter_fields_for_type(config, LensConfig)
        )
