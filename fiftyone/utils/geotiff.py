"""
GeoTIFF utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

import eta.core.image as etai
import eta.core.utils as etau

import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou
import fiftyone.utils.data as foud

pyproj = fou.lazy_import("pyproj")
rasterio = fou.lazy_import(
    "rasterio", callback=lambda: fou.ensure_package("rasterio")
)


def get_geolocation(image_path):
    """Retrieves the geolocation information from the given GeoTIFF image.

    The returned :class:`fiftyone.core.labels.GeoLocation` will contain the
    lon/lat coordinates of the center of the image in its ``point`` attribute
    and the coordinates of its corners (clockwise, starting from the top-left)
    in its ``polygon`` attribute.

    Args:
        image_path: the path to the GeoTIFF image

    Returns:
        a :class:`fiftyone.core.labels.GeoLocation`
    """
    with open(image_path, "rb") as f:
        with rasterio.open(f, "r") as image:
            center = image.transform * (0.5 * image.width, 0.5 * image.height)

            proj = pyproj.Proj(image.crs)
            cp = proj(*center, inverse=True)
            tl = proj(image.bounds.left, image.bounds.top, inverse=True)
            tr = proj(image.bounds.right, image.bounds.top, inverse=True)
            br = proj(image.bounds.right, image.bounds.bottom, inverse=True)
            bl = proj(image.bounds.left, image.bounds.bottom, inverse=True)

    return fol.GeoLocation(point=cp, polygon=[[tl, tr, br, bl, tl]])


class GeoTIFFDatasetImporter(
    foud.LabeledImageDatasetImporter, foud.ImportPathsMixin
):
    """Importer for a directory of GeoTIFF images with geolocation data.

    See :ref:`this page <GeoTIFFDataset-import>` for format details.

    Args:
        dataset_dir (None): the dataset directory. If omitted, ``image_path``
            must be provided
        image_path (None): an optional parameter that enables explicit control
            over the location of the GeoTIFF images. Can be any of the
            following:

            -   a list of paths to GeoTIFF images. In this case,
                ``dataset_dir`` has no effect
            -   a glob pattern like ``"*.tif"`` specifying the location of the
                images in ``dataset_dir``
            -   an absolute glob pattern of GeoTIFF images. In this case,
                ``dataset_dir`` has no effect
        recursive (True): whether to recursively traverse subdirectories. Not
            applicable when ``image_path`` is provided
        compute_metadata (False): whether to produce
            :class:`fiftyone.core.metadata.ImageMetadata` instances for each
            image when importing
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir=None,
        image_path=None,
        recursive=True,
        compute_metadata=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        if dataset_dir is None and image_path is None:
            raise ValueError(
                "Either `dataset_dir` or `image_path` must be provided"
            )

        if not etau.is_container(image_path):
            image_path = self._parse_labels_path(
                dataset_dir=dataset_dir, labels_path=image_path
            )

        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.image_path = image_path
        self.recursive = recursive
        self.compute_metadata = compute_metadata

        self._filepaths = None
        self._iter_filepaths = None
        self._num_samples = None

    def __iter__(self):
        self._iter_filepaths = iter(self._filepaths)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        image_path = next(self._iter_filepaths)

        if self.compute_metadata:
            image_metadata = fom.ImageMetadata.build_for(image_path)
        else:
            image_metadata = None

        label = get_geolocation(image_path)

        return image_path, image_metadata, label

    @property
    def has_image_metadata(self):
        return self.compute_metadata

    @property
    def has_dataset_info(self):
        return False

    @property
    def label_cls(self):
        return fol.GeoLocation

    def setup(self):
        if self.image_path is not None:
            path = self.image_path

            if etau.is_str(path):
                if not os.path.isabs(path) and self.dataset_dir:
                    path = os.path.join(self.dataset_dir, path)

                # Glob pattern of images
                filepaths = etau.get_glob_matches(path)
            else:
                # List of images
                filepaths = list(path)
        else:
            # Directory of images
            filepaths = etau.list_files(
                self.dataset_dir, abs_paths=True, recursive=self.recursive
            )
            filepaths = [p for p in filepaths if etai.is_image_mime_type(p)]

        filepaths = self._preprocess_list(filepaths)

        self._filepaths = filepaths
        self._num_samples = len(filepaths)
