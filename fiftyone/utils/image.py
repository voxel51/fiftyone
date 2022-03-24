"""
Image utilities.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import multiprocessing
import os

import eta.core.image as etai
import eta.core.utils as etau

import fiftyone.core.utils as fou
import fiftyone.core.validation as fov


logger = logging.getLogger(__name__)


def reencode_images(
    sample_collection,
    ext=".png",
    force_reencode=True,
    delete_originals=False,
    num_workers=None,
    skip_failures=False,
):
    """Re-encodes the images in the sample collection to the given format.

    The ``filepath`` of the samples are updated to point to the re-encoded
    images.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        ext (".png"): the image format to use (e.g., ".png" or ".jpg")
        force_reencode (True): whether to re-encode images whose extension
            already matches ``ext``
        delete_originals (False): whether to delete the original images after
            re-encoding
        num_workers (None): the number of worker processes to use. By default,
            ``multiprocessing.cpu_count()`` is used
        skip_failures (False): whether to gracefully continue without raising
            an error if an image cannot be re-encoded
    """
    fov.validate_image_collection(sample_collection)

    _transform_images(
        sample_collection,
        ext=ext,
        force_reencode=force_reencode,
        delete_originals=delete_originals,
        num_workers=num_workers,
        skip_failures=skip_failures,
    )


def transform_images(
    sample_collection,
    size=None,
    min_size=None,
    max_size=None,
    ext=None,
    force_reencode=False,
    delete_originals=False,
    num_workers=None,
    skip_failures=False,
):
    """Transforms the images in the sample collection according to the provided
    parameters.

    The ``filepath`` of the samples are updated to point to the transformed
    images.

    .. note::

        This method will not update the ``metadata`` field of the collection
        after transforming. You can repopulate the ``metadata` field if needed
        by calling::

            sample_collection.compute_metadata(overwrite=True)

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        size (None): an optional ``(width, height)`` for each image. One
            dimension can be -1, in which case the aspect ratio is preserved
        min_size (None): an optional minimum ``(width, height)`` for each
            image. A dimension can be -1 if no constraint should be applied.
            The images are resized (aspect-preserving) if necessary to meet
            this constraint
        max_size (None): an optional maximum ``(width, height)`` for each
            image. A dimension can be -1 if no constraint should be applied.
            The images are resized (aspect-preserving) if necessary to meet
            this constraint
        ext (None): an optional image format to re-encode the source images
            into (e.g., ".png" or ".jpg")
        force_reencode (False): whether to re-encode images whose parameters
            already match the specified values
        delete_originals (False): whether to delete the original images if any
            transformation was applied
        num_workers (None): the number of worker processes to use. By default,
            ``multiprocessing.cpu_count()`` is used
        skip_failures (False): whether to gracefully continue without raising
            an error if an image cannot be transformed
    """
    fov.validate_image_collection(sample_collection)

    _transform_images(
        sample_collection,
        size=size,
        min_size=min_size,
        max_size=max_size,
        ext=ext,
        force_reencode=force_reencode,
        delete_originals=delete_originals,
        num_workers=num_workers,
        skip_failures=skip_failures,
    )


def reencode_image(input_path, output_path):
    """Re-encodes the image to the format specified by the given output path.

    Args:
        input_path: the path to the input image
        output_path: the path to write the output image
    """
    _transform_image(input_path, output_path, force_reencode=True)


def transform_image(
    input_path, output_path, size=None, min_size=None, max_size=None
):
    """Transforms the image according to the provided parameters.

    Args:
        input_path: the path to the input image
        output_path: the path to write the output image
        size (None): an optional ``(width, height)`` for the image. One
            dimension can be -1, in which case the aspect ratio is preserved
        min_size (None): an optional minimum ``(width, height)`` for the image.
            A dimension can be -1 if no constraint should be applied. The image
            is resized (aspect-preserving) if necessary to meet this constraint
        max_size (None): an optional maximum ``(width, height)`` for the image.
            A dimension can be -1 if no constraint should be applied. The image
            is resized (aspect-preserving) if necessary to meet this constraint
    """
    _transform_image(
        input_path,
        output_path,
        size=size,
        min_size=min_size,
        max_size=max_size,
    )


def _transform_images(
    sample_collection,
    size=None,
    min_size=None,
    max_size=None,
    ext=None,
    force_reencode=False,
    delete_originals=False,
    num_workers=None,
    skip_failures=False,
):
    ext = _parse_ext(ext)

    if num_workers is None:
        num_workers = multiprocessing.cpu_count()

    if num_workers <= 1:
        _transform_images_single(
            sample_collection,
            size=size,
            min_size=min_size,
            max_size=max_size,
            ext=ext,
            force_reencode=force_reencode,
            delete_originals=delete_originals,
            skip_failures=skip_failures,
        )
    else:
        _transform_images_multi(
            sample_collection,
            num_workers,
            size=size,
            min_size=min_size,
            max_size=max_size,
            ext=ext,
            force_reencode=force_reencode,
            delete_originals=delete_originals,
            skip_failures=skip_failures,
        )


def _transform_images_single(
    sample_collection,
    size=None,
    min_size=None,
    max_size=None,
    ext=None,
    force_reencode=False,
    delete_originals=False,
    skip_failures=False,
):
    view = sample_collection.select_fields()

    with fou.ProgressBar() as pb:
        for sample in pb(view):
            inpath = sample.filepath

            if ext is not None:
                outpath = os.path.splitext(inpath)[0] + ext
            else:
                outpath = inpath

            _transform_image(
                inpath,
                outpath,
                size=size,
                min_size=min_size,
                max_size=max_size,
                force_reencode=force_reencode,
                delete_original=delete_originals,
                skip_failures=skip_failures,
            )

            if outpath != inpath:
                sample.filepath = outpath
                sample.save()


def _transform_images_multi(
    sample_collection,
    num_workers,
    size=None,
    min_size=None,
    max_size=None,
    ext=None,
    force_reencode=False,
    delete_originals=False,
    skip_failures=False,
):
    sample_ids, filepaths = sample_collection.values(["id", "filepath"])

    inputs = []
    for sample_id, inpath in zip(sample_ids, filepaths):
        if ext is not None:
            outpath = os.path.splitext(inpath)[0] + ext
        else:
            outpath = inpath

        inputs.append(
            (
                sample_id,
                inpath,
                outpath,
                size,
                min_size,
                max_size,
                force_reencode,
                delete_originals,
                skip_failures,
            )
        )

    view = sample_collection.select_fields()

    with fou.ProgressBar(inputs) as pb:
        with multiprocessing.Pool(processes=num_workers) as pool:
            for sample_id, inpath, outpath, _ in pb(
                pool.imap_unordered(_do_transform, inputs)
            ):
                if outpath != inpath:
                    sample = view[sample_id]
                    sample.filepath = outpath
                    sample.save()


def _do_transform(args):
    sample_id, inpath, outpath = args[:3]
    did_transform = _transform_image(inpath, outpath, *args[3:])
    return sample_id, inpath, outpath, did_transform


def _transform_image(
    inpath,
    outpath,
    size=None,
    min_size=None,
    max_size=None,
    force_reencode=False,
    delete_original=False,
    skip_failures=False,
):
    inpath = fou.normalize_path(inpath)
    outpath = fou.normalize_path(outpath)
    in_ext = os.path.splitext(inpath)[1]
    out_ext = os.path.splitext(outpath)[1]

    did_transform = False

    try:
        if (
            size is not None
            or min_size is not None
            or max_size is not None
            or in_ext != out_ext
            or force_reencode
        ):
            img = etai.read(inpath)
            size = _parse_parameters(img, size, min_size, max_size)

        diff_params = size is not None
        should_reencode = diff_params or force_reencode

        if (inpath == outpath) and should_reencode and not delete_original:
            _inpath = inpath
            inpath = etau.make_unique_path(inpath, suffix="-original")
            etau.move_file(_inpath, inpath)

        diff_path = inpath != outpath

        if diff_params:
            img = etai.resize(img, width=size[0], height=size[1])
            etai.write(img, outpath)
            did_transform = True
        elif force_reencode or (in_ext != out_ext):
            etai.write(img, outpath)
            did_transform = True
        elif diff_path:
            etau.copy_file(inpath, outpath)

        if delete_original and diff_path:
            etau.delete_file(inpath)
    except Exception as e:
        if not skip_failures:
            raise

        logger.warning(e)

    return did_transform


def _parse_parameters(img, size, min_size, max_size):
    isize = (img.shape[1], img.shape[0])

    if size is not None:
        osize = etai.infer_missing_dims(size, isize)
    else:
        osize = isize

    osize = etai.clip_frame_size(osize, min_size=min_size, max_size=max_size)

    return osize if osize != isize else None


def _parse_ext(ext):
    if ext is None:
        return None

    if not ext.startswith("."):
        ext = "." + ext

    return ext.lower()
