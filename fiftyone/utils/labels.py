"""
Label utilities.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone.core.labels as fol
import fiftyone.core.validation as fov


def objects_to_segmentations(
    sample_collection,
    in_field,
    out_field,
    mask_size=None,
    mask_targets=None,
    thickness=1,
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
        mask_targets (None): a dict mapping integer pixel values in
            ``[0, 255]`` to label strings defining which object classes to
            render and which pixel values to use for each class. If omitted,
            all objects are rendered with pixel value 255
        thickness (1): the thickness, in pixels, at which to render
            (non-filled) polylines
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

    for sample in samples.iter_samples(progress=True):
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

            image[out_field] = segmentation

        sample.save()

    if mask_targets is not None:
        if not sample_collection.default_mask_targets:
            sample_collection.default_mask_targets = mask_targets
        else:
            sample_collection.mask_targets[out_field] = mask_targets


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
        mask_targets (None): a dict mapping integer pixel values in
            ``[0, 255]`` to label strings defining which object classes to
            label and which pixel values to use for each class. If
            omitted, all labels are assigned to the integer pixel values
        mask_types ("stuff"): whether the classes are ``"stuff"`` (amorphous
            regions of pixels) or ``"thing"`` (connected regions, each
            representing an instance of the thing). Can be any of the
            following:

            -   ``"stuff"`` if all classes are stuff classes
            -   ``"thing"`` if all classes are thing classes
            -   a dict mapping pixel values to ``"stuff"`` or ``"thing"``
                for each class
    """
    fov.validate_collection_label_fields(
        sample_collection,
        in_field,
        fol.Segmentation,
    )

    if mask_targets is None:
        if out_field in sample_collection.mask_targets:
            mask_targets = sample_collection.mask_targets[out_field]
        elif sample_collection.default_mask_targets:
            mask_targets = sample_collection.default_mask_targets

    samples = sample_collection.select_fields(in_field)
    in_field, processing_frames = samples._handle_frame_field(in_field)
    out_field, _ = samples._handle_frame_field(out_field)

    for sample in samples.iter_samples(progress=True):
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

        sample.save()


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

    for sample in samples.iter_samples(progress=True):
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

        sample.save()


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
        mask_targets (None): a dict mapping integer pixel values in
            ``[0, 255]`` to label strings defining which object classes to
            label and which pixel values to use for each class. If
            omitted, all labels are assigned to the integer pixel values
        mask_types ("stuff"): whether the classes are ``"stuff"`` (amorphous
            regions of pixels) or ``"thing"`` (connected regions, each
            representing an instance of the thing). Can be any of the
            following:

            -   ``"stuff"`` if all classes are stuff classes
            -   ``"thing"`` if all classes are thing classes
            -   a dict mapping pixel values to ``"stuff"`` or ``"thing"``
                for each class
        tolerance (2): a tolerance, in pixels, when generating approximate
                polylines for each region. Typical values are 1-3 pixels
    """
    fov.validate_collection_label_fields(
        sample_collection,
        in_field,
        fol.Segmentation,
    )

    if mask_targets is None:
        if out_field in sample_collection.mask_targets:
            mask_targets = sample_collection.mask_targets[out_field]
        elif sample_collection.default_mask_targets:
            mask_targets = sample_collection.default_mask_targets

    samples = sample_collection.select_fields(in_field)
    in_field, processing_frames = samples._handle_frame_field(in_field)
    out_field, _ = samples._handle_frame_field(out_field)

    for sample in samples.iter_samples(progress=True):
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

        sample.save()


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

    for sample in samples.iter_samples(progress=True):
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

        sample.save()
