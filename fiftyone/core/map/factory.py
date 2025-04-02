"""
Factory for mapping backends
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Dict, List, Optional, Type


import fiftyone.core.config as focc
import fiftyone.core.map.batcher as fomb
import fiftyone.core.map.mapper as fomm
import fiftyone.core.map.process as fomp
import fiftyone.core.map.threading as fomt


class MapImplementation:
    PROCESS = "process"
    THREAD = "thread"


class MapperFactory:
    """Manage mapper implementations"""

    _MAPPERS: Dict[str, Type[fomm.Mapper]] = {
        MapImplementation.PROCESS: fomp.ProcessMapper,
        MapImplementation.THREAD: fomt.ThreadMapper,
    }

    _BATCHERS: Dict[str, fomb.SampleBatcher] = {
        "id": fomb.SampleIdBatch,
        "slice": fomb.SampleSliceBatch,
    }

    @classmethod
    def batch_methods(cls) -> List[str]:
        """Get available batcher keys"""
        return sorted(cls._BATCHERS.keys())

    @classmethod
    def mapper_keys(cls) -> List[str]:
        """Get available mapper class keys"""
        return sorted(cls._MAPPERS.keys())

    @classmethod
    def create(
        cls,
        mapper_key: Optional[str],
        workers: Optional[int],
        batch_method: Optional[str] = None,
        **mapper_extra_kwargs,
    ) -> fomm.Mapper:
        """Create a mapper instance"""
        config = focc.load_config()

        if workers is None:
            workers = config.default_map_workers

        if batch_method is None:
            batch_method = "id"

        if batch_method not in cls._BATCHERS:
            raise ValueError(
                f"Invalid `batch_method`: {batch_method}. Choose from: "
                f"{', '.join(cls._BATCHERS.keys())}"
            )

        batcher = cls._BATCHERS[batch_method]

        # If the parallelization method is explicitly provided, use it no
        # matter what, else read from config
        if mapper_key is None:
            mapper_key = config.default_parallelization_method

            # If no  parallelization method is not explicitly provided and
            # no default was set, try to use multiprocessing as default, if it
            # looks like multiprocessing won’t work,  then use threading.
            if mapper_key is None:
                mapper_key = (
                    MapImplementation.PROCESS
                    if fomp.check_multiprocessing_support()
                    else MapImplementation.THREAD
                )

        if mapper_key not in cls._MAPPERS:
            raise ValueError(
                f"Invalid `mapper_key`: {mapper_key}. Choose from: "
                f"{', '.join(cls._MAPPERS.keys())}"
            )

        return cls._MAPPERS[mapper_key].create(
            config=config,
            batcher=batcher,
            workers=workers,
            **mapper_extra_kwargs,
        )
