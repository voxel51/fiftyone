"""
FiftyOne Server dataset utility unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import pytest
from bson import ObjectId
from starlette.exceptions import HTTPException

import fiftyone as fo
import fiftyone.core.labels as fol

from fiftyone.server.utils.datasets import (
    get_dataset,
    get_sample_from_dataset,
    sync_to_generated_dataset,
)


@pytest.fixture(name="dataset")
def fixture_dataset():
    """Creates a persistent dataset for testing."""
    dataset = fo.Dataset()
    dataset.persistent = True

    try:
        yield dataset
    finally:
        if fo.dataset_exists(dataset.name):
            fo.delete_dataset(dataset.name)


class TestGetDataset:
    """Tests for get_dataset utility function."""

    @pytest.mark.asyncio
    async def test_get_dataset_by_name(self, dataset):
        """Tests loading a dataset by name."""
        result = await get_dataset(dataset.name)
        assert result.name == dataset.name

    @pytest.mark.asyncio
    async def test_get_dataset_not_found(self):
        """Tests that HTTPException is raised for non-existent dataset."""
        with pytest.raises(HTTPException) as exc_info:
            await get_dataset("non_existent_dataset_12345")

        assert exc_info.value.status_code == 404
        assert "not found" in exc_info.value.detail


class TestGetSampleFromDataset:
    """Tests for get_sample_from_dataset utility function."""

    @pytest.mark.asyncio
    async def test_get_sample_success(self, dataset):
        """Tests successfully retrieving a sample."""
        sample = fo.Sample(filepath="/tmp/test.jpg")
        dataset.add_sample(sample)

        result = await get_sample_from_dataset(dataset, str(sample.id))
        assert result.id == sample.id

    @pytest.mark.asyncio
    async def test_get_sample_not_found(self, dataset):
        """Tests that HTTPException is raised for non-existent sample."""
        bad_id = str(ObjectId())

        with pytest.raises(HTTPException) as exc_info:
            await get_sample_from_dataset(dataset, bad_id)

        assert exc_info.value.status_code == 404
        assert bad_id in exc_info.value.detail


class TestSyncToGeneratedDataset:
    """Tests for sync_to_generated_dataset function."""

    DETECTION_ID = ObjectId()

    @pytest.fixture(name="sample_with_detection")
    def fixture_sample_with_detection(self, dataset):
        """Creates a sample with a detection."""
        sample = fo.Sample(filepath="/tmp/test_sync.jpg")
        sample["ground_truth"] = fol.Detections(
            detections=[
                fol.Detection(
                    id=self.DETECTION_ID,
                    label="cat",
                    bounding_box=[0.1, 0.1, 0.2, 0.2],
                    confidence=0.9,
                ),
            ]
        )
        dataset.add_sample(sample)
        sample.reload()
        return sample

    @pytest.fixture(name="patches_view")
    def fixture_patches_view(self, dataset, sample_with_detection):
        """Creates a patches view from the dataset."""
        return dataset.to_patches("ground_truth")

    @pytest.mark.asyncio
    async def test_update_label_in_patches_view(
        self, dataset, sample_with_detection, patches_view
    ):
        """Tests that updating a label syncs correctly to patches view."""
        patches_dataset = patches_view._patches_dataset
        patches_sample = patches_view.first()

        patch_operations = [
            {"op": "replace", "path": "/label", "value": "dog"}
        ]

        result = await sync_to_generated_dataset(
            patches_dataset.name,
            str(patches_sample.id),
            "ground_truth.detections",
            str(self.DETECTION_ID),
            patch_operations,
            delete=False,
        )

        # Verify the returned sample was updated
        assert result is not None
        assert result.ground_truth.label == "dog"

    @pytest.mark.asyncio
    async def test_delete_label_deletes_patches_sample(
        self, dataset, sample_with_detection, patches_view
    ):
        """Tests that deleting a label removes the patches sample."""
        patches_dataset = patches_view._patches_dataset
        patches_sample = patches_view.first()
        patches_sample_id = str(patches_sample.id)

        patch_operations = [{"op": "remove", "path": "/"}]

        result = await sync_to_generated_dataset(
            patches_dataset.name,
            patches_sample_id,
            "ground_truth.detections",
            str(self.DETECTION_ID),
            patch_operations,
            delete=True,
        )

        # Verify the result is None (deleted)
        assert result is None

        # Verify the specific sample was deleted from the dataset
        with pytest.raises(KeyError):
            patches_dataset[patches_sample_id]

    @pytest.mark.asyncio
    async def test_delete_flag_takes_precedence(
        self, dataset, sample_with_detection, patches_view
    ):
        """Tests that delete=True flag works even with non-delete operations."""
        patches_dataset = patches_view._patches_dataset
        patches_sample = patches_view.first()
        patches_sample_id = str(patches_sample.id)

        # Pass non-delete operations but with delete=True
        patch_operations = [
            {"op": "replace", "path": "/label", "value": "dog"}
        ]

        result = await sync_to_generated_dataset(
            patches_dataset.name,
            patches_sample_id,
            "ground_truth.detections",
            str(self.DETECTION_ID),
            patch_operations,
            delete=True,  # This should cause deletion
        )

        # Verify the result is None (deleted)
        assert result is None

        # Verify the specific sample was deleted from the dataset
        with pytest.raises(KeyError):
            patches_dataset[patches_sample_id]


class TestSyncToGeneratedDatasetEvaluationPatches:
    """Tests for sync_to_generated_dataset with EvaluationPatchesView."""

    GT_DETECTION_ID = ObjectId()
    PRED_DETECTION_ID = ObjectId()

    @pytest.fixture(name="evaluation_dataset")
    def fixture_evaluation_dataset(self):
        """Creates a persistent dataset with ground truth and predictions."""
        dataset = fo.Dataset()
        dataset.persistent = True

        sample = fo.Sample(filepath="/tmp/test_eval.jpg")
        sample["ground_truth"] = fol.Detections(
            detections=[
                fol.Detection(
                    id=self.GT_DETECTION_ID,
                    label="cat",
                    bounding_box=[0.1, 0.1, 0.2, 0.2],
                ),
            ]
        )
        sample["predictions"] = fol.Detections(
            detections=[
                fol.Detection(
                    id=self.PRED_DETECTION_ID,
                    label="cat",
                    bounding_box=[0.1, 0.1, 0.2, 0.2],
                    confidence=0.9,
                ),
            ]
        )
        dataset.add_sample(sample)
        sample.reload()

        # Run evaluation to create eval key
        dataset.evaluate_detections(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
        )

        try:
            yield dataset
        finally:
            if fo.dataset_exists(dataset.name):
                fo.delete_dataset(dataset.name)

    @pytest.fixture(name="eval_patches_view")
    def fixture_eval_patches_view(self, evaluation_dataset):
        """Creates an evaluation patches view from the dataset."""
        return evaluation_dataset.to_evaluation_patches("eval")

    @pytest.mark.asyncio
    async def test_update_gt_label_in_eval_patches_view(
        self, evaluation_dataset, eval_patches_view
    ):
        """Tests updating a ground truth label in evaluation patches view."""
        patches_dataset = eval_patches_view._patches_dataset
        patches_sample = eval_patches_view.first()

        patch_operations = [
            {"op": "replace", "path": "/label", "value": "dog"}
        ]

        result = await sync_to_generated_dataset(
            patches_dataset.name,
            str(patches_sample.id),
            "ground_truth.detections",
            str(self.GT_DETECTION_ID),
            patch_operations,
            delete=False,
        )

        # Verify the returned sample was updated
        # Note: EvaluationPatches uses Detections lists, not single Detection
        assert result is not None
        assert result.ground_truth.detections[0].label == "dog"

        # Verify prediction field is unchanged
        assert result.predictions.detections[0].label == "cat"

    @pytest.mark.asyncio
    async def test_update_pred_label_in_eval_patches_view(
        self, evaluation_dataset, eval_patches_view
    ):
        """Tests updating a prediction label in evaluation patches view."""
        patches_dataset = eval_patches_view._patches_dataset
        patches_sample = eval_patches_view.first()

        patch_operations = [
            {"op": "replace", "path": "/confidence", "value": 0.5}
        ]

        result = await sync_to_generated_dataset(
            patches_dataset.name,
            str(patches_sample.id),
            "predictions.detections",
            str(self.PRED_DETECTION_ID),
            patch_operations,
            delete=False,
        )

        # Verify the returned sample was updated
        # Note: EvaluationPatches uses Detections lists, not single Detection
        assert result is not None
        assert result.predictions.detections[0].confidence == 0.5

        # Verify ground truth field is unchanged
        assert result.ground_truth.detections[0].label == "cat"

    @pytest.mark.asyncio
    async def test_delete_gt_label_deletes_eval_patches_sample(
        self, evaluation_dataset, eval_patches_view
    ):
        """Tests that deleting a ground truth label removes the patches sample."""
        patches_dataset = eval_patches_view._patches_dataset
        patches_sample = eval_patches_view.first()
        patches_sample_id = str(patches_sample.id)

        patch_operations = [{"op": "remove", "path": "/"}]

        result = await sync_to_generated_dataset(
            patches_dataset.name,
            patches_sample_id,
            "ground_truth.detections",
            str(self.GT_DETECTION_ID),
            patch_operations,
            delete=True,
        )

        # Verify the result is None (deleted)
        assert result is None

        # Verify the specific sample was deleted from the dataset
        with pytest.raises(KeyError):
            patches_dataset[patches_sample_id]

    @pytest.mark.asyncio
    async def test_delete_pred_label_deletes_eval_patches_sample(
        self, evaluation_dataset, eval_patches_view
    ):
        """Tests that deleting a prediction label removes the patches sample."""
        patches_dataset = eval_patches_view._patches_dataset
        patches_sample = eval_patches_view.first()
        patches_sample_id = str(patches_sample.id)

        patch_operations = [{"op": "remove", "path": "/"}]

        result = await sync_to_generated_dataset(
            patches_dataset.name,
            patches_sample_id,
            "predictions.detections",
            str(self.PRED_DETECTION_ID),
            patch_operations,
            delete=True,
        )

        # Verify the result is None (deleted)
        assert result is None

        # Verify the specific sample was deleted from the dataset
        with pytest.raises(KeyError):
            patches_dataset[patches_sample_id]
