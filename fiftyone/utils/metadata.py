"""
Metadata utilities.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import multiprocessing

import fiftyone.core.metadata as fom
import fiftyone.core.media as fomm
import fiftyone.core.utils as fou


def compute_metadata(sample_collection, overwrite=False, num_workers=None):
    """Populates the ``metadata`` field of all samples in the collection.

    Any samples with existing metadata are skipped, unless
    ``overwrite == True``.

    Args:
        overwrite (False): whether to overwrite existing metadata
        num_workers (None): the number of processes to use. By default,
            ``multiprocessing.cpu_count()`` is used
    """
    if num_workers is None:
        num_workers = multiprocessing.cpu_count()

    if num_workers == 1:
        _compute_metadata(sample_collection, overwrite=overwrite)
    else:
        _compute_metadata_multi(
            sample_collection, num_workers, overwrite=overwrite,
        )


def _compute_metadata(sample_collection, overwrite=False):
    if not overwrite:
        _compute_new_metadata(sample_collection)
    else:
        _compute_all_metadata(sample_collection)


def _compute_new_metadata(sample_collection):
    no_metadata = sample_collection.select_fields().exists(
        "metadata", bool=False
    )

    num_samples = len(no_metadata)
    if num_samples == 0:
        return

    with fou.ProgressBar(total=num_samples) as pb:
        for sample in pb(no_metadata):
            sample.compute_metadata()


def _compute_all_metadata(sample_collection):
    num_samples = len(sample_collection)
    if num_samples == 0:
        return

    with fou.ProgressBar(total=num_samples) as pb:
        for sample in pb(sample_collection.select_fields()):
            sample.compute_metadata()


def _compute_metadata_multi(sample_collection, num_workers, overwrite=False):
    if overwrite:
        samples = sample_collection
    else:
        samples = sample_collection.exists("metadata", bool=False)

    inputs = [
        (sample.id, sample.filepath, sample.media_type)
        for sample in samples.select_fields()
    ]

    num_samples = len(inputs)
    if num_samples == 0:
        return

    with fou.ProgressBar(total=num_samples) as pb:
        with multiprocessing.Pool(processes=num_workers) as pool:
            for sample_id, metadata in pb(
                pool.imap_unordered(_do_compute_metadata, inputs)
            ):
                sample = sample_collection[sample_id]
                sample.metadata = metadata
                sample.save()


def _do_compute_metadata(args):
    sample_id, filepath, media_type = args

    if media_type == fomm.IMAGE:
        metadata = fom.ImageMetadata.build_for(filepath)
    elif media_type == fomm.VIDEO:
        metadata = fom.VideoMetadata.build_for(filepath)
    else:
        metadata = fom.Metadata.build_for(filepath)

    return sample_id, metadata
