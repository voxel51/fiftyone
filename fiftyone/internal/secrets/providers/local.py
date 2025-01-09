"""
FiftyOne env secrets provider

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import re

from ..providers.iprovider import ISecretProvider
from ..secret import UnencryptedSecret, ISecret
import os
from typing import Dict, List, Optional


class EnvSecretProvider(ISecretProvider):
    """
    Exposes secrets from environment variables.
    """

    async def get(self, key, **kwargs) -> Optional[ISecret]:
        if key in os.environ:
            return UnencryptedSecret(key, os.getenv(key))
        return None

    def get_sync(self, key, **kwargs) -> Optional[ISecret]:
        if key in os.environ:
            return UnencryptedSecret(key, os.getenv(key))
        return None

    async def get_multiple(
        self, keys: List[str], **kwargs
    ) -> Dict[str, Optional[ISecret]]:
        secrets = [await self.get(key) for key in keys]
        return {secret.key: secret for secret in secrets if secret}

    async def search(
        self, regex: str, **kwargs
    ) -> Dict[str, Optional[ISecret]]:
        keys = list(filter(lambda x: re.search(regex, x), os.environ.keys()))
        if keys:
            return await self.get_multiple(keys)
        return {}
