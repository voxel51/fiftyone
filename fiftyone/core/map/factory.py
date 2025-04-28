"""
Factory for mapping backends
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import multiprocessing
from typing import Dict, List, Optional, Type


import fiftyone.core.config as focc
import fiftyone.core.map.batcher as fomb
import fiftyone.core.map.mapper as fomm
import fiftyone.core.map.process as fomp
import fiftyone.core.map.threading as fomt


class MapperFactory:
    """Manage mapper implementations"""

    _MAPPER_CLASSES: Dict[str, Type[fomm.Mapper]] = {
        "process": fomp.ProcessMapper,
        "thread": fomt.ThreadMapper,
    }

    _BATCH_CLASSES: Dict[str, Type[fomb.SampleBatch]] = {
        "id": fomb.SampleIdBatch,
        "slice": fomb.SampleSliceBatch,
    }

    @classmethod
    def batch_methods(cls) -> List[str]:
        """Get available batch methods"""
        return sorted(cls._BATCH_CLASSES.keys())

    @classmethod
    def mapper_keys(cls) -> List[str]:
        """Get available mapper class keys"""
        return sorted(cls._MAPPER_CLASSES.keys())

    @classmethod
    def create(
        cls,
        mapper_key: Optional[str] = None,
        num_workers: Optional[int] = None,
        batch_method: Optional[str] = None,
        batch_size: Optional[int] = None,
        **mapper_extra_kwargs,
    ) -> fomm.Mapper:
        """Create a mapper instance"""

        # Loading config dynamically here as it causes actual unit tests to fail
        # without importing the world and using globals.
        config = focc.load_config()

        if batch_method is None:
            batch_method = "id"

        if batch_method not in cls._BATCH_CLASSES:
            raise ValueError(
                f"Invalid `batch_method`: {batch_method}. Choose from: "
                f"{', '.join(cls._BATCH_CLASSES.keys())}"
            )

        batch_cls = cls._BATCH_CLASSES[batch_method]

        # If the parallelization method is explicitly provided, use it no
        # matter what.
        if mapper_key is None:
            # If the default parallelization method is set in the config, use
            # it no matter what.
            mapper_key = config.default_parallelization_method

            # If a parallelization method is not explicitly provided and
            # no default was set, try to use multiprocessing as default, if it
            # looks like multiprocessing won’t work, then use threading.
            if mapper_key is None:
                mapper_key = (
                    "process"
                    if not multiprocessing.current_process().daemon
                    else "thread"
                )

        if mapper_key not in cls._MAPPER_CLASSES:
            raise ValueError(
                f"Invalid `mapper_key`: {mapper_key}. Choose from: "
                f"{', '.join(cls._MAPPER_CLASSES.keys())}"
            )

        return cls._MAPPER_CLASSES[mapper_key].create(
            config=config,
            batch_cls=batch_cls,
            num_workers=num_workers,
            batch_size=batch_size,
            **mapper_extra_kwargs,
        )
