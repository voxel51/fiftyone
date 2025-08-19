import pytest
import fiftyone as fo
import fiftyone.brain as fob
import fiftyone.zoo as foz

@pytest.fixture
def dataset():
    dataset = foz.load_zoo_dataset("quickstart")
    yield dataset
    dataset.delete()

def test_image_similarity_backend(dataset):
    backend = "chroma"
    prompt = "kites high in the air"
    brain_key = "clip_" + backend

    index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        metric="euclidean",
        embeddings=False,
        backend=backend,
        brain_key=brain_key,
    )

    embeddings, sample_ids, _ = index.compute_embeddings(dataset)

    index.add_to_index(embeddings, sample_ids)
    assert index.total_index_size == 200
    assert index.index_size == 200
    assert index.missing_size is None

    sim_view = dataset.sort_by_similarity(prompt, k=10, brain_key=brain_key)
    assert len(sim_view) == 10

    del index
    dataset.clear_cache()

    assert dataset.get_brain_info(brain_key) is not None

    index = dataset.load_brain_results(brain_key)
    assert index.total_index_size == 200

    embeddings2, sample_ids2, _ = index.get_embeddings()
    assert embeddings2.shape == (200, 512)
    assert sample_ids2.shape == (200,)

    ids = sample_ids2[:100]
    embeddings2, sample_ids2, _ = index.get_embeddings(sample_ids=ids)
    assert embeddings2.shape == (100, 512)
    assert sample_ids2.shape == (100,)

    index.remove_from_index(sample_ids=ids)

    assert index.total_index_size == 100

    index.cleanup()
    dataset.delete_brain_run(brain_key)

def test_patch_similarity_backend(dataset):
    backend = "chroma"
    view = dataset.to_patches("ground_truth")

    prompt = "cute puppies"
    brain_key = "gt_clip_" + backend

    index = fob.compute_similarity(
        dataset,
        patches_field="ground_truth",
        model="clip-vit-base32-torch",
        metric="euclidean",
        embeddings=False,
        backend=backend,
        brain_key=brain_key,
    )

    embeddings, sample_ids, label_ids = index.compute_embeddings(dataset)

    index.add_to_index(embeddings, sample_ids, label_ids=label_ids)
    assert index.total_index_size == 1232
    assert index.index_size == 1232
    assert index.missing_size is None

    sim_view = view.sort_by_similarity(prompt, k=10, brain_key=brain_key)
    assert len(sim_view) == 10

    del index
    dataset.clear_cache()

    assert dataset.get_brain_info(brain_key) is not None

    index = dataset.load_brain_results(brain_key)
    assert index.total_index_size == 1232

    embeddings2, sample_ids2, label_ids2 = index.get_embeddings()
    assert embeddings2.shape == (1232, 512)
    assert sample_ids2.shape == (1232,)
    assert label_ids2.shape == (1232,)

    ids = label_ids2[:100]
    embeddings2, sample_ids2, label_ids2 = index.get_embeddings(label_ids=ids)
    assert embeddings2.shape == (100, 512)
    assert sample_ids2.shape == (100,)
    assert label_ids2.shape == (100,)

    index.remove_from_index(label_ids=ids)

    assert index.total_index_size == 1132

    index.cleanup()
    dataset.delete_brain_run(brain_key)
