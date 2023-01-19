"""
Label utilities.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import eta.core.utils as etau

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.core.validation as fov


def objects_to_segmentations(
    sample_collection,
    in_field,
    out_field,
    mask_size=None,
    mask_targets=None,
    thickness=1,
    output_dir=None,
    rel_dir=None,
    overwrite=False,
    save_mask_targets=False,
):
    """Converts the instance segmentations or polylines in the specified field
    of the collection into semantic segmentation masks.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        in_field: the name of the objects field for which to render
            segmentation masks. Supported types are
            :class:`fiftyone.core.labels.Detection`,
            :class:`fiftyone.core.labels.Detections`,
            :class:`fiftyone.core.labels.Polyline`, and
            :class:`fiftyone.core.labels.Polylines`
        out_field: the name of the :class:`fiftyone.core.labels.Segmentation`
            field to populate
        mask_size (None): the ``(width, height)`` at which to render the
            segmentation masks. If not provided, masks will be rendered to
            match the resolution of each input image
        mask_targets (None): a dict mapping pixel values (2D masks) or RGB hex
            strings (3D masks) to label strings defining which object classes
            to render and which pixel values to use for each class. If omitted,
            all objects are rendered with pixel value 255
        thickness (1): the thickness, in pixels, at which to render
            (non-filled) polylines
        output_dir (None): an optional output directory in which to write the
            segmentation images. If none is provided, the segmentations are
            stored in the database
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier that is joined with
            ``output_dir`` to generate an output path for each segmentation
            image. This argument allows for populating nested subdirectories in
            ``output_dir`` that match the shape of the input paths. The path is
            converted to an absolute path (if necessary) via
            :func:`fiftyone.core.utils.normalize_path`
        overwrite (False): whether to delete ``output_dir`` prior to exporting
            if it exists
        save_mask_targets (False): whether to store the ``mask_targets`` on the
            dataset
    """
    fov.validate_collection_label_fields(
        sample_collection,
        in_field,
        (fol.Detection, fol.Detections, fol.Polyline, fol.Polylines),
    )

    if mask_size is None:
        sample_collection.compute_metadata()

    samples = sample_collection.select_fields(in_field)
    in_field, processing_frames = samples._handle_frame_field(in_field)
    out_field, _ = samples._handle_frame_field(out_field)

    if overwrite and output_dir is not None:
        etau.delete_dir(output_dir)

    if output_dir is not None:
        filename_maker = fou.UniqueFilenameMaker(
            output_dir=output_dir, rel_dir=rel_dir, idempotent=False
        )

    for sample in samples.iter_samples(autosave=True, progress=True):
        if processing_frames:
            images = sample.frames.values()
        else:
            images = [sample]

        if mask_size is not None:
            frame_size = mask_size
        elif processing_frames:
            frame_size = (
                sample.metadata.frame_width,
                sample.metadata.frame_height,
            )
        else:
            frame_size = (sample.metadata.width, sample.metadata.height)

        for image in images:
            label = image[in_field]
            if label is None:
                continue

            segmentation = None

            if isinstance(label, fol.Polyline):
                label = fol.Polylines(polylines=[label])

            if isinstance(label, fol.Detection):
                label = fol.Detections(detections=[label])

            if isinstance(label, fol.Polylines):
                segmentation = label.to_segmentation(
                    frame_size=frame_size,
                    mask_targets=mask_targets,
                    thickness=thickness,
                )

            if isinstance(label, fol.Detections):
                segmentation = label.to_segmentation(
                    frame_size=frame_size,
                    mask_targets=mask_targets,
                )

            if output_dir is not None:
                mask_path = filename_maker.get_output_path(
                    image.filepath, output_ext=".png"
                )
                segmentation.export_mask(mask_path, update=True)

            image[out_field] = segmentation

    if save_mask_targets and mask_targets is not None:
        if not sample_collection.default_mask_targets:
            sample_collection.default_mask_targets = mask_targets
        else:
            sample_collection.mask_targets[out_field] = mask_targets


def export_segmentations(
    sample_collection,
    in_field,
    output_dir,
    rel_dir=None,
    update=True,
    overwrite=False,
):
    """Exports the segmentations (or heatmaps) stored as in-database arrays in
    the specified field to images on disk.

    Any labels without in-memory arrays are skipped.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        in_field: the name of the
            :class:`fiftyone.core.labels.Segmentation` or
            :class:`fiftyone.core.labels.Heatmap` field
        output_dir: the directory in which to write the images
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier that is joined with
            ``output_dir`` to generate an output path for each image. This
            argument allows for populating nested subdirectories in
            ``output_dir`` that match the shape of the input paths. The path is
            converted to an absolute path (if necessary) via
            :func:`fiftyone.core.utils.normalize_path`
        update (True): whether to delete the arrays from the database
        overwrite (False): whether to delete ``output_dir`` prior to exporting
            if it exists
    """
    fov.validate_collection_label_fields(
        sample_collection, in_field, (fol.Segmentation, fol.Heatmap)
    )

    samples = sample_collection.select_fields(in_field)
    in_field, processing_frames = samples._handle_frame_field(in_field)

    if overwrite:
        etau.delete_dir(output_dir)

    filename_maker = fou.UniqueFilenameMaker(
        output_dir=output_dir, rel_dir=rel_dir, idempotent=False
    )

    for sample in samples.iter_samples(autosave=True, progress=True):
        if processing_frames:
            images = sample.frames.values()
        else:
            images = [sample]

        for image in images:
            label = image[in_field]
            if label is None:
                continue

            outpath = filename_maker.get_output_path(
                image.filepath, output_ext=".png"
            )

            if isinstance(label, fol.Heatmap):
                if label.map is not None:
                    label.export_map(outpath, update=update)
            else:
                if label.mask is not None:
                    label.export_mask(outpath, update=update)


def import_segmentations(
    sample_collection, in_field, update=True, delete_images=False
):
    """Imports the segmentations (or heatmaps) stored on disk in the specified
    field to in-database arrays.

    Any labels without images on disk are skipped.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        in_field: the name of the
            :class:`fiftyone.core.labels.Segmentation` or
            :class:`fiftyone.core.labels.Heatmap` field
        update (True): whether to delete the image paths from the labels
        delete_images (False): whether to delete any imported images from disk
    """
    fov.validate_collection_label_fields(
        sample_collection, in_field, (fol.Segmentation, fol.Heatmap)
    )

    samples = sample_collection.select_fields(in_field)
    in_field, processing_frames = samples._handle_frame_field(in_field)

    for sample in samples.iter_samples(autosave=True, progress=True):
        if processing_frames:
            images = sample.frames.values()
        else:
            images = [sample]

        for image in images:
            label = image[in_field]
            if label is None:
                continue

            if isinstance(label, fol.Heatmap):
                if label.map_path is not None:
                    del_path = label.map_path if delete_images else None
                    label.import_map(update=update)
                    if del_path:
                        etau.delete_file(del_path)
            else:
                if label.mask_path is not None:
                    del_path = label.mask_path if delete_images else None
                    label.import_mask(update=update)
                    if del_path:
                        etau.delete_file(del_path)


def transform_segmentations(
    sample_collection,
    in_field,
    targets_map,
    output_dir=None,
    rel_dir=None,
    update=True,
    update_mask_targets=False,
    overwrite=False,
):
    """Transforms the segmentations in the given field according to the
    provided targets map.

    This method can be used to transform between grayscale and RGB masks, or it
    can be used to edit the pixel values or colors of masks without changing
    the number of channels.

    Note that any pixel values not in ``targets_map`` will be zero in the
    transformed masks.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        in_field: the name of the :class:`fiftyone.core.labels.Segmentation`
            field
        targets_map: a dict mapping existing pixel values (2D masks) or RGB hex
            strings (3D masks) to new pixel values or RGB hex strings to use.
            You may convert between grayscale and RGB using this argument
        output_dir (None): an optional directory in which to write the
            transformed images
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier that is joined with
            ``output_dir`` to generate an output path for each image. This
            argument allows for populating nested subdirectories in
            ``output_dir`` that match the shape of the input paths. The path is
            converted to an absolute path (if necessary) via
            :func:`fiftyone.core.utils.normalize_path`
        update (True): whether to update the mask paths on the instances
        update_mask_targets (False): whether to update the mask targets on the
            dataset to reflect the transformed targets
        overwrite (False): whether to delete ``output_dir`` prior to exporting
            if it exists
    """
    fov.validate_collection_label_fields(
        sample_collection, in_field, fol.Segmentation
    )

    samples = sample_collection.select_fields(in_field)
    in_field, processing_frames = samples._handle_frame_field(in_field)

    if output_dir is not None:
        if overwrite:
            etau.delete_dir(output_dir)

        filename_maker = fou.UniqueFilenameMaker(
            output_dir=output_dir, rel_dir=rel_dir, idempotent=False
        )

    for sample in samples.iter_samples(autosave=True, progress=True):
        if processing_frames:
            images = sample.frames.values()
        else:
            images = [sample]

        for image in images:
            label = image[in_field]
            if label is None:
                continue

            if output_dir is not None:
                outpath = filename_maker.get_output_path(
                    image.filepath, output_ext=".png"
                )
            else:
                outpath = None

            label.transform_mask(targets_map, outpath=outpath, update=update)

    if update_mask_targets:
        mask_targets = sample_collection.mask_targets.get(in_field, None)
        if mask_targets is not None:
            sample_collection.mask_targets[in_field] = _transform_mask_targets(
                mask_targets, targets_map
            )
        else:
            mask_targets = sample_collection.default_mask_targets
            if mask_targets:
                sample_collection.default_mask_targets = (
                    _transform_mask_targets(mask_targets, targets_map)
                )


def _transform_mask_targets(mask_targets, targets_map):
    _mask_targets = {}
    for k, v in targets_map.items():
        label = mask_targets.get(k, None)
        if label is not None:
            _mask_targets[v] = label

    return _mask_targets


def segmentations_to_detections(
    sample_collection,
    in_field,
    out_field,
    mask_targets=None,
    mask_types="stuff",
):
    """Converts the semantic segmentations masks in the specified field of the
    collection into :class:`fiftyone.core.labels.Detections` with instance
    masks populated.

    Each ``"stuff"`` class will be converted to a single
    :class:`fiftyone.core.labels.Detection` whose instance mask spans all
    region(s) of the class.

    Each ``"thing"`` class will result in one
    :class:`fiftyone.core.labels.Detection` instance per connected region of
    that class in the segmentation.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        in_field: the name of the :class:`fiftyone.core.labels.Segmentation`
            field to convert
        out_field: the name of the
            :class:`fiftyone.core.labels.Detections` field to populate
        mask_targets (None): a dict mapping pixel values (2D masks) or RGB hex
            strings (3D masks) to label strings defining which object classes
            to label and which pixel values to use for each class. If omitted,
            all labels are assigned to the pixel values
        mask_types ("stuff"): whether the classes are ``"stuff"`` (amorphous
            regions of pixels) or ``"thing"`` (connected regions, each
            representing an instance of the thing). Can be any of the
            following:

            -   ``"stuff"`` if all classes are stuff classes
            -   ``"thing"`` if all classes are thing classes
            -   a dict mapping pixel values (2D masks) or RGB hex strings (3D
                masks) to ``"stuff"`` or ``"thing"`` for each class
    """
    fov.validate_collection_label_fields(
        sample_collection,
        in_field,
        fol.Segmentation,
    )

    samples = sample_collection.select_fields(in_field)
    in_field, processing_frames = samples._handle_frame_field(in_field)
    out_field, _ = samples._handle_frame_field(out_field)

    for sample in samples.iter_samples(autosave=True, progress=True):
        if processing_frames:
            images = sample.frames.values()
        else:
            images = [sample]

        for image in images:
            label = image[in_field]
            if label is None:
                continue

            image[out_field] = label.to_detections(
                mask_targets=mask_targets, mask_types=mask_types
            )


def instances_to_polylines(
    sample_collection, in_field, out_field, tolerance=2, filled=True
):
    """Converts the instance segmentations in the specified field of the
    collection into :class:`fiftyone.core.labels.Polylines` instances.

    For detections with masks, the returned polylines will trace the boundaries
    of the masks; otherwise, the polylines will trace the bounding boxes
    themselves.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        in_field: the name of the :class:`fiftyone.core.labels.Detections`
            field to convert
        out_field: the name of the :class:`fiftyone.core.labels.Polylines`
            field to populate
        tolerance (2): a tolerance, in pixels, when generating approximate
            polylines for each region. Typical values are 1-3 pixels
        filled (True): whether the polylines should be filled
    """
    fov.validate_collection_label_fields(
        sample_collection,
        in_field,
        fol.Detections,
    )

    samples = sample_collection.select_fields(in_field)
    in_field, processing_frames = samples._handle_frame_field(in_field)
    out_field, _ = samples._handle_frame_field(out_field)

    for sample in samples.iter_samples(autosave=True, progress=True):
        if processing_frames:
            images = sample.frames.values()
        else:
            images = [sample]

        for image in images:
            label = image[in_field]
            if label is None:
                continue

            image[out_field] = label.to_polylines(
                tolerance=tolerance, filled=filled
            )


def segmentations_to_polylines(
    sample_collection,
    in_field,
    out_field,
    mask_targets=None,
    mask_types="stuff",
    tolerance=2,
):
    """Converts the semantic segmentations masks in the specified field of the
    collection into :class:`fiftyone.core.labels.Polylines` instances.

    Each ``"stuff"`` class will be converted to a single
    :class:`fiftyone.core.labels.Polylines` that may contain multiple disjoint
    shapes capturing the class.

    Each ``"thing"`` class will result in one
    :class:`fiftyone.core.labels.Polylines` instance per connected region of
    that class.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        in_field: the name of the :class:`fiftyone.core.labels.Segmentation`
            field to convert
        out_field: the name of the
            :class:`fiftyone.core.labels.Polylines` field to populate
        mask_targets (None): a dict mapping pixel values (2D masks) or RGB hex
            strings (3D masks) to label strings defining which object classes
            to label and which pixel values to use for each class. If omitted,
            all labels are assigned to the pixel values
        mask_types ("stuff"): whether the classes are ``"stuff"`` (amorphous
            regions of pixels) or ``"thing"`` (connected regions, each
            representing an instance of the thing). Can be any of the
            following:

            -   ``"stuff"`` if all classes are stuff classes
            -   ``"thing"`` if all classes are thing classes
            -   a dict mapping pixel values (2D masks) or RGB hex strings (3D
                masks) to ``"stuff"`` or ``"thing"`` for each class
        tolerance (2): a tolerance, in pixels, when generating approximate
                polylines for each region. Typical values are 1-3 pixels
    """
    fov.validate_collection_label_fields(
        sample_collection,
        in_field,
        fol.Segmentation,
    )

    samples = sample_collection.select_fields(in_field)
    in_field, processing_frames = samples._handle_frame_field(in_field)
    out_field, _ = samples._handle_frame_field(out_field)

    for sample in samples.iter_samples(autosave=True, progress=True):
        if processing_frames:
            images = sample.frames.values()
        else:
            images = [sample]

        for image in images:
            label = image[in_field]
            if label is None:
                continue

            image[out_field] = label.to_polylines(
                mask_targets=mask_targets,
                mask_types=mask_types,
                tolerance=tolerance,
            )


def classification_to_detections(sample_collection, in_field, out_field):
    """Converts the :class:`fiftyone.core.labels.Classification` field of the
    collection into a :class:`fiftyone.core.labels.Detections` field containing
    a single detection whose bounding box spans the entire image.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        in_field: the name of the :class:`fiftyone.core.labels.Classification`
            field
        out_field: the name of the :class:`fiftyone.core.labels.Detections`
            field to populate
    """
    fov.validate_collection_label_fields(
        sample_collection, in_field, fol.Classification
    )

    samples = sample_collection.select_fields(in_field)
    in_field, processing_frames = samples._handle_frame_field(in_field)
    out_field, _ = samples._handle_frame_field(out_field)

    for sample in samples.iter_samples(autosave=True, progress=True):
        if processing_frames:
            images = sample.frames.values()
        else:
            images = [sample]

        for image in images:
            label = image[in_field]
            if label is None:
                continue

            detection = fol.Detection(
                label=label.label,
                bounding_box=[0, 0, 1, 1],  # entire image
                confidence=label.confidence,
            )
            image[out_field] = fol.Detections(detections=[detection])


def classifications_to_detections(sample_collection, in_field, out_field):
    """Converts the :class:`fiftyone.core.labels.Classifications` field of the
    collection into a :class:`fiftyone.core.labels.Detections` field containing
    detections whose bounding boxes span the entire image with one detection
    for each classification.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        in_field: the name of the :class:`fiftyone.core.labels.Classifications`
            field
        out_field: the name of the :class:`fiftyone.core.labels.Detections`
            field to populate
    """
    fov.validate_collection_label_fields(
        sample_collection, in_field, fol.Classifications
    )

    samples = sample_collection.select_fields(in_field)
    in_field, processing_frames = samples._handle_frame_field(in_field)
    out_field, _ = samples._handle_frame_field(out_field)

    for sample in samples.iter_samples(autosave=True, progress=True):
        if processing_frames:
            images = sample.frames.values()
        else:
            images = [sample]

        for image in images:
            detections = []
            classifications = image[in_field]
            if classifications is None:
                continue

            for label in classifications.classifications:
                if label is None:
                    continue

                detection = fol.Detection(
                    label=label.label,
                    bounding_box=[0, 0, 1, 1],  # entire image
                    confidence=label.confidence,
                )
                detections.append(detection)

            image[out_field] = fol.Detections(detections=detections)
