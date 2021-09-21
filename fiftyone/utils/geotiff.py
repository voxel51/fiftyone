"""
GeoTIFF utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
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
    image = rasterio.open(image_path, "r")

    center = image.transform * (0.5 * image.width, 0.5 * image.height)

    proj = pyproj.Proj(image.crs)
    cp = proj(*center, inverse=True)
    tl = proj(image.bounds.left, image.bounds.top, inverse=True)
    tr = proj(image.bounds.right, image.bounds.top, inverse=True)
    br = proj(image.bounds.right, image.bounds.bottom, inverse=True)
    bl = proj(image.bounds.left, image.bounds.bottom, inverse=True)
    image.close()

    return fol.GeoLocation(point=cp, polygon=[[tl, tr, br, bl, tl]])


class GeoTIFFDatasetImporter(foud.LabeledImageDatasetImporter):
    """Importer for a directory of GeoTIFF images with geolocation data.

    See :ref:`this page <GeoTIFFDataset-import>` for format details.

    Args:
        dataset_dir: the dataset directory
        recursive (True): whether to recursively traverse subdirectories
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
        dataset_dir,
        recursive=True,
        compute_metadata=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )
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
        filepaths = etau.list_files(
            self.dataset_dir, abs_paths=True, recursive=self.recursive
        )
        filepaths = [p for p in filepaths if etai.is_image_mime_type(p)]

        self._filepaths = self._preprocess_list(filepaths)
        self._num_samples = len(self._filepaths)
