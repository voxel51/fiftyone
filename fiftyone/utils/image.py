"""
Image utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os

import eta.core.image as etai
import eta.core.utils as etau

import fiftyone.core.storage as fos
import fiftyone.core.utils as fou
import fiftyone.core.validation as fov


logger = logging.getLogger(__name__)


def read(path_or_url, include_alpha=False, flag=None):
    """Reads the image from the given path as a numpy array.

    Color images are returned as RGB arrays.

    Args:
        path: the filepath or URL of the image
        include_alpha (False): whether to include the alpha channel of the
            image, if present, in the returned array
        flag (None): an optional OpenCV image format flag to use. If provided,
            this flag takes precedence over ``include_alpha``

    Returns:
        a uint8 numpy array containing the image
    """
    return etai.read(path_or_url, include_alpha=include_alpha, flag=flag)


def write(img, path):
    """Writes image to file.

    Args:
        img: a numpy array
        path: the output path
    """
    etai.write(img, path)


def reencode_images(
    sample_collection,
    ext=".png",
    force_reencode=True,
    media_field="filepath",
    output_field=None,
    output_dir=None,
    rel_dir=None,
    update_filepaths=True,
    delete_originals=False,
    num_workers=None,
    skip_failures=False,
    progress=None,
):
    """Re-encodes the images in the sample collection to the given format.

    If no ``output_dir`` is specified and ``delete_originals`` is False, then
    if a transformation would result in overwriting an existing file with the
    same filename, the original file is renamed to ``<name>-original.<ext>``.

    .. note::

        This method will not update the ``metadata`` field of the collection
        after transforming. You can repopulate the ``metadata`` field if needed
        by calling::

            sample_collection.compute_metadata(overwrite=True)

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        ext (".png"): the image format to use (e.g., ".png" or ".jpg")
        force_reencode (True): whether to re-encode images whose extension
            already matches ``ext``
        media_field ("filepath"): the input field containing the image paths to
            transform
        output_field (None): an optional field in which to store the paths to
            the transformed images. By default, ``media_field`` is updated
            in-place
        output_dir (None): an optional output directory in which to write the
            transformed images. If none is provided, the images are updated
            in-place
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier that is joined with
            ``output_dir`` to generate an output path for each image. This
            argument allows for populating nested subdirectories in
            ``output_dir`` that match the shape of the input paths
        update_filepaths (True): whether to store the output paths on the
            sample collection
        delete_originals (False): whether to delete the original images after
            re-encoding
        num_workers (None): a suggested number of worker processes to use
        skip_failures (False): whether to gracefully continue without raising
            an error if an image cannot be re-encoded
        progress (None): whether to render a progress bar (True/False), use the
            default value ``fiftyone.config.show_progress_bars`` (None), or a
            progress callback function to invoke instead
    """
    fov.validate_image_collection(sample_collection)

    _transform_images(
        sample_collection,
        ext=ext,
        force_reencode=force_reencode,
        media_field=media_field,
        output_field=output_field,
        output_dir=output_dir,
        rel_dir=rel_dir,
        update_filepaths=update_filepaths,
        delete_originals=delete_originals,
        num_workers=num_workers,
        skip_failures=skip_failures,
        progress=progress,
    )


def transform_images(
    sample_collection,
    size=None,
    min_size=None,
    max_size=None,
    interpolation=None,
    ext=None,
    force_reencode=False,
    media_field="filepath",
    output_field=None,
    output_dir=None,
    rel_dir=None,
    update_filepaths=True,
    delete_originals=False,
    num_workers=None,
    skip_failures=False,
    progress=None,
):
    """Transforms the images in the sample collection according to the provided
    parameters.

    If no ``output_dir`` is specified and ``delete_originals`` is False, then
    if a transformation would result in overwriting an existing file with the
    same filename, the original file is renamed to ``<name>-original.<ext>``.

    .. note::

        This method will not update the ``metadata`` field of the collection
        after transforming. You can repopulate the ``metadata`` field if needed
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
        interpolation (None): an optional ``interpolation`` argument for
            ``cv2.resize()``
        ext (None): an optional image format to re-encode the source images
            into (e.g., ".png" or ".jpg")
        force_reencode (False): whether to re-encode images whose parameters
            already match the specified values
        media_field ("filepath"): the input field containing the image paths to
            transform
        output_field (None): an optional field in which to store the paths to
            the transformed images. By default, ``media_field`` is updated
            in-place
        output_dir (None): an optional output directory in which to write the
            transformed images. If none is provided, the images are updated
            in-place
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier that is joined with
            ``output_dir`` to generate an output path for each image. This
            argument allows for populating nested subdirectories in
            ``output_dir`` that match the shape of the input paths
        update_filepaths (True): whether to store the output paths on the
            sample collection
        delete_originals (False): whether to delete the original images if any
            transformation was applied
        num_workers (None): a suggested number of worker processes to use
        skip_failures (False): whether to gracefully continue without raising
            an error if an image cannot be transformed
        progress (None): whether to render a progress bar (True/False), use the
            default value ``fiftyone.config.show_progress_bars`` (None), or a
            progress callback function to invoke instead
    """
    fov.validate_image_collection(sample_collection)

    _transform_images(
        sample_collection,
        size=size,
        min_size=min_size,
        max_size=max_size,
        interpolation=interpolation,
        ext=ext,
        force_reencode=force_reencode,
        media_field=media_field,
        output_field=output_field,
        output_dir=output_dir,
        rel_dir=rel_dir,
        update_filepaths=update_filepaths,
        delete_originals=delete_originals,
        num_workers=num_workers,
        skip_failures=skip_failures,
        progress=progress,
    )


def reencode_image(input_path, output_path):
    """Re-encodes the image to the format specified by the given output path.

    Args:
        input_path: the path to the input image
        output_path: the path to write the output image
    """
    _transform_image(input_path, output_path, force_reencode=True)


def transform_image(
    input_path,
    output_path,
    size=None,
    min_size=None,
    max_size=None,
    interpolation=None,
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
        interpolation (None): an optional ``interpolation`` argument for
            ``cv2.resize()``
    """
    _transform_image(
        input_path,
        output_path,
        size=size,
        min_size=min_size,
        max_size=max_size,
        interpolation=interpolation,
    )


def _transform_images(
    sample_collection,
    size=None,
    min_size=None,
    max_size=None,
    interpolation=None,
    ext=None,
    force_reencode=False,
    media_field="filepath",
    output_field=None,
    output_dir=None,
    rel_dir=None,
    update_filepaths=True,
    delete_originals=False,
    num_workers=None,
    skip_failures=False,
    progress=None,
):
    ext = _parse_ext(ext)

    num_workers = fou.recommend_process_pool_workers(num_workers)

    if num_workers <= 1:
        _transform_images_single(
            sample_collection,
            size=size,
            min_size=min_size,
            max_size=max_size,
            interpolation=interpolation,
            ext=ext,
            force_reencode=force_reencode,
            media_field=media_field,
            output_field=output_field,
            output_dir=output_dir,
            rel_dir=rel_dir,
            update_filepaths=update_filepaths,
            delete_originals=delete_originals,
            skip_failures=skip_failures,
            progress=progress,
        )
    else:
        _transform_images_multi(
            sample_collection,
            num_workers,
            size=size,
            min_size=min_size,
            max_size=max_size,
            interpolation=interpolation,
            ext=ext,
            force_reencode=force_reencode,
            media_field=media_field,
            output_field=output_field,
            output_dir=output_dir,
            rel_dir=rel_dir,
            update_filepaths=update_filepaths,
            delete_originals=delete_originals,
            skip_failures=skip_failures,
            progress=progress,
        )


def _transform_images_single(
    sample_collection,
    size=None,
    min_size=None,
    max_size=None,
    interpolation=None,
    ext=None,
    force_reencode=False,
    media_field="filepath",
    output_field=None,
    output_dir=None,
    rel_dir=None,
    update_filepaths=True,
    delete_originals=False,
    skip_failures=False,
    progress=None,
):
    if output_field is None:
        output_field = media_field

    diff_field = output_field != media_field
    save = update_filepaths

    view = sample_collection.select_fields(media_field)
    with fou.ProgressBar(total=view, progress=progress) as pb:
        for sample in pb(view.iter_samples(autosave=save)):
            inpath = sample[media_field]

            outpath = _get_outpath(
                inpath, output_dir=output_dir, rel_dir=rel_dir
            )

            if ext is not None:
                outpath = os.path.splitext(outpath)[0] + ext

            _transform_image(
                inpath,
                outpath,
                size=size,
                min_size=min_size,
                max_size=max_size,
                interpolation=interpolation,
                force_reencode=force_reencode,
                delete_original=delete_originals,
                skip_failures=skip_failures,
            )

            if update_filepaths and (diff_field or outpath != inpath):
                sample[output_field] = outpath


def _transform_images_multi(
    sample_collection,
    num_workers,
    size=None,
    min_size=None,
    max_size=None,
    interpolation=None,
    ext=None,
    force_reencode=False,
    media_field="filepath",
    output_field=None,
    output_dir=None,
    rel_dir=None,
    update_filepaths=True,
    delete_originals=False,
    skip_failures=False,
    progress=None,
):
    if output_field is None:
        output_field = media_field

    diff_field = output_field != media_field

    sample_ids, inpaths = sample_collection.values(["id", media_field])

    inputs = []
    for sample_id, inpath in zip(sample_ids, inpaths):
        outpath = _get_outpath(inpath, output_dir=output_dir, rel_dir=rel_dir)

        if ext is not None:
            outpath = os.path.splitext(outpath)[0] + ext

        inputs.append(
            (
                sample_id,
                inpath,
                outpath,
                size,
                min_size,
                max_size,
                interpolation,
                force_reencode,
                delete_originals,
                skip_failures,
            )
        )

    outpaths = {}

    try:
        with fou.ProgressBar(inputs, progress=progress) as pb:
            with fou.get_multiprocessing_context().Pool(
                processes=num_workers
            ) as pool:
                for sample_id, inpath, outpath, _ in pb(
                    pool.imap_unordered(_do_transform, inputs)
                ):
                    if update_filepaths and (diff_field or outpath != inpath):
                        outpaths[sample_id] = outpath
    finally:
        if outpaths:
            sample_collection.set_values(
                output_field, outpaths, key_field="id"
            )


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
    interpolation=None,
    force_reencode=False,
    delete_original=False,
    skip_failures=False,
):
    inpath = fos.normalize_path(inpath)
    outpath = fos.normalize_path(outpath)
    in_ext = os.path.splitext(inpath)[1]
    out_ext = os.path.splitext(outpath)[1]

    did_transform = False
    moves = []

    try:
        should_reencode = (
            force_reencode
            or size is not None
            or min_size is not None
            or max_size is not None
            or in_ext.lower() != out_ext.lower()
        )

        if should_reencode:
            img = read(inpath)
            size = _parse_parameters(img, size, min_size, max_size)

        if should_reencode and inpath == outpath and not delete_original:
            orig_path = etau.make_unique_path(inpath, suffix="-original")
            etau.move_file(inpath, orig_path)
            moves.append((inpath, orig_path))
            inpath = orig_path

        if size is not None:
            if interpolation is not None:
                kwargs = dict(interpolation=interpolation)
            else:
                kwargs = {}

            img = etai.resize(img, width=size[0], height=size[1], **kwargs)
            write(img, outpath)
            did_transform = True
        elif should_reencode:
            write(img, outpath)
            did_transform = True
        elif inpath != outpath:
            etau.copy_file(inpath, outpath)

        if delete_original and inpath != outpath:
            etau.delete_file(inpath)
    except BaseException as e:
        try:
            # Undo any moves
            for from_path, to_path in moves:
                etau.move_file(to_path, from_path)
        except:
            pass

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


def _get_outpath(inpath, output_dir=None, rel_dir=None):
    if output_dir is None:
        return inpath

    if rel_dir is not None:
        rel_dir = fos.normalize_path(rel_dir)
        filename = os.path.relpath(inpath, rel_dir)
    else:
        filename = os.path.basename(inpath)

    return os.path.join(output_dir, filename)
