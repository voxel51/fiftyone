"""
Tests for the fiftyone/utils/twelvelabs.py TwelveLabs integration.

The unit tests use a mocked TwelveLabs client. The live tests run only when the
``TWELVELABS_API_KEY`` environment variable is set.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
import os
from types import SimpleNamespace
from unittest import mock

import numpy as np
import pytest

import fiftyone as fo  # pylint: disable=unused-import
import fiftyone.core.labels as fol
import fiftyone.core.metadata as fome
import fiftyone.utils.twelvelabs as fout

pytest.importorskip("twelvelabs")

_LIVE_VIDEO_URL = "https://download.samplelib.com/mp4/sample-5s.mp4"


def _config(**kwargs):
    return fout.TwelveLabsModelConfig(kwargs)


def _segment(embedding, option, scope):
    return SimpleNamespace(
        embedding=embedding, embedding_option=option, embedding_scope=scope
    )


def _ready(**kwargs):
    return SimpleNamespace(status="ready", error=None, **kwargs)


@pytest.fixture
def client():
    client = mock.MagicMock()
    client.assets.create.return_value = SimpleNamespace(id="asset-1")
    client.assets.retrieve.side_effect = [
        SimpleNamespace(status="processing"),
        SimpleNamespace(status="ready"),
    ]
    client.indexes.create.return_value = SimpleNamespace(id="index-1")
    client.indexes.indexed_assets.create.return_value = SimpleNamespace(
        id="indexed-1"
    )
    client.embed.v_2.tasks.create.return_value = SimpleNamespace(id="task-1")
    client.analyze_async.tasks.create.return_value = SimpleNamespace(
        task_id="task-2"
    )
    return client


def _model(client, **kwargs):
    kwargs.setdefault("api_key", "test-key")
    kwargs.setdefault("poll_interval", 0)
    model = fout.TwelveLabsModel(_config(**kwargs))
    model._client = client
    return model


@pytest.fixture
def video_path(tmp_path):
    path = tmp_path / "video.mp4"
    path.write_bytes(b"not really a video")
    return str(path)


class TestTwelveLabsModelConfig:
    def test_defaults(self):
        config = _config()

        assert config.operation == "embed"
        assert config.mode == "on_the_fly"
        assert config.embedding_model == "marengo3.5"
        assert config.analysis_model == "pegasus1.6"
        assert config.max_tokens is None
        assert config.embedding_dimension is None
        assert config.index_id is None

    def test_caption_default_max_tokens(self):
        assert _config(operation="caption").max_tokens == 512

    def test_index_mode_defaults_to_marengo_3_0(self):
        assert _config(mode="index").embedding_model == "marengo3.0"

    def test_index_mode_rejects_marengo_3_5(self):
        with pytest.raises(ValueError, match="does not support indexing"):
            _config(mode="index", embedding_model="marengo3.5")

    @pytest.mark.parametrize(
        "kwargs,match",
        [
            ({"operation": "detect"}, "Unsupported operation"),
            ({"mode": "stream"}, "Unsupported mode"),
            ({"embedding_dimension": 300}, "embedding_dimension must be"),
            (
                {"embedding_model": "marengo3.0", "embedding_dimension": 256},
                "not supported",
            ),
            ({"operation": "caption", "max_tokens": 100}, "max_tokens"),
            ({"operation": "segment", "max_tokens": 1024}, "max_tokens"),
            ({"operation": "caption", "max_tokens": "unlimited"}, "only"),
            ({"operation": "caption", "max_tokens": "lots"}, "integer"),
        ],
    )
    def test_invalid_values_raise(self, kwargs, match):
        with pytest.raises(ValueError, match=match):
            _config(**kwargs)

    def test_segment_max_tokens(self):
        assert _config(operation="segment").max_tokens is None
        assert (
            _config(operation="segment", max_tokens="unlimited").max_tokens
            == "unlimited"
        )
        assert _config(operation="segment", max_tokens=4096).max_tokens == 4096


class TestTwelveLabsModel:
    def test_missing_api_key_raises(self, monkeypatch):
        monkeypatch.delenv("TWELVELABS_API_KEY", raising=False)
        with pytest.raises(ValueError, match="No TwelveLabs API key"):
            fout.TwelveLabsModel(_config())

    def test_embed_url_on_the_fly(self, client):
        client.embed.v_2.tasks.retrieve.return_value = _ready(
            data=[
                _segment([0.0, 1.0], "fused", "clip"),
                _segment([1.0, 2.0], "fused", "asset"),
            ]
        )
        model = _model(client, embedding_dimension=256)

        embedding = model.embed("https://example.com/video.mp4")

        np.testing.assert_allclose(embedding, [1.0, 2.0])
        assert embedding.dtype == np.float32
        np.testing.assert_allclose(model.get_embeddings(), [[1.0, 2.0]])

        # URLs are passed through without uploading or indexing
        client.assets.create.assert_not_called()
        client.indexes.create.assert_not_called()

        kwargs = client.embed.v_2.tasks.create.call_args.kwargs
        assert kwargs["model_name"] == "marengo3.5"
        assert kwargs["embedding_dimension"] == 256
        video = kwargs["video"]
        assert video.media_source.url == "https://example.com/video.mp4"
        assert video.embedding_option == ["visual", "audio"]
        assert video.embedding_type == [
            "separate_embedding",
            "fused_embedding",
        ]

    def test_embed_falls_back_when_not_fused(self, client):
        # Silent videos have no audio, so no fused embedding is returned
        client.embed.v_2.tasks.retrieve.return_value = _ready(
            data=[
                _segment([4.0], "visual", "clip"),
                _segment([5.0], "visual", "asset"),
            ]
        )
        model = _model(client)

        embedding = model.embed("https://example.com/video.mp4")

        np.testing.assert_allclose(embedding, [5.0])

    def test_single_option_is_not_fused(self, client):
        client.embed.v_2.tasks.retrieve.return_value = _ready(
            data=[_segment([2.0], "visual", "asset")]
        )
        model = _model(client, embedding_options=["visual"])

        embedding = model.embed("https://example.com/video.mp4")

        np.testing.assert_allclose(embedding, [2.0])
        video = client.embed.v_2.tasks.create.call_args.kwargs["video"]
        assert video.embedding_option == ["visual"]
        assert video.embedding_type is None

    def test_local_video_is_uploaded_once_and_waited_on(
        self, client, video_path
    ):
        client.embed.v_2.tasks.retrieve.return_value = _ready(
            data=[_segment([1.0], "fused", "asset")]
        )
        client.analyze.return_value = SimpleNamespace(data=" A caption. ")
        model = _model(client, operation="caption")

        model.embed(video_path)
        label = model.predict(video_path)

        assert label.label == "A caption."
        client.assets.create.assert_called_once()
        assert client.assets.create.call_args.kwargs["method"] == "direct"

        # The asset was polled until ready before it was used
        assert client.assets.retrieve.call_count == 2

        video = client.embed.v_2.tasks.create.call_args.kwargs["video"]
        assert video.media_source.asset_id == "asset-1"
        context = client.analyze.call_args.kwargs["video"]
        assert context.asset_id == "asset-1"

    def test_marengo_3_0_uses_first_option(self, client):
        client.embed.v_2.tasks.retrieve.return_value = _ready(
            data=[
                _segment([9.0], "audio", "asset"),
                _segment([3.0], "visual", "asset"),
            ]
        )
        model = _model(client, embedding_model="marengo3.0")

        embedding = model.embed("https://example.com/video.mp4")

        np.testing.assert_allclose(embedding, [3.0])
        video = client.embed.v_2.tasks.create.call_args.kwargs["video"]
        assert video.embedding_option == ["visual"]
        assert video.embedding_type is None

    def test_embed_falls_back_to_average_of_clips(self, client):
        client.embed.v_2.tasks.retrieve.return_value = _ready(
            data=[
                _segment([1.0, 0.0], "fused", "clip"),
                _segment([0.0, 1.0], "fused", "clip"),
            ]
        )
        model = _model(client)

        embedding = model.embed("https://example.com/video.mp4")

        np.testing.assert_allclose(embedding, [2**-0.5, 2**-0.5], rtol=1e-6)

    def test_failed_task_raises(self, client):
        client.embed.v_2.tasks.retrieve.return_value = SimpleNamespace(
            status="failed", error=SimpleNamespace(message="bad video")
        )
        model = _model(client)

        with pytest.raises(RuntimeError, match="bad video"):
            model.embed("https://example.com/video.mp4")

    def test_embed_prompt_marengo_3_5(self, client):
        client.embed.v_2.create.return_value = SimpleNamespace(
            data=[SimpleNamespace(embedding=[0.5, 0.25])]
        )
        model = _model(client, embedding_dimension=128)

        embedding = model.embed_prompt("a dog")

        np.testing.assert_allclose(embedding, [0.5, 0.25])
        kwargs = client.embed.v_2.create.call_args.kwargs
        assert kwargs["input_type"] == "multi_input"
        assert kwargs["multi_input"].input_text == "a dog"
        assert kwargs["embedding_dimension"] == 128

    def test_embed_prompt_marengo_3_0(self, client):
        client.embed.v_2.create.return_value = SimpleNamespace(
            data=[SimpleNamespace(embedding=[0.5])]
        )
        model = _model(client, mode="index")

        model.embed_prompt("a dog")

        kwargs = client.embed.v_2.create.call_args.kwargs
        assert kwargs["input_type"] == "text"
        assert kwargs["model_name"] == "marengo3.0"
        assert kwargs["text"].input_text == "a dog"

    def test_index_mode_embed(self, client, video_path):
        client.indexes.indexed_assets.retrieve.side_effect = [
            SimpleNamespace(status="ready"),
            SimpleNamespace(
                embedding=SimpleNamespace(
                    video_embedding=SimpleNamespace(
                        segments=[
                            SimpleNamespace(
                                float_=[3.0, 0.0], embedding_option="visual"
                            ),
                            SimpleNamespace(
                                float_=[0.0, 3.0], embedding_option="visual"
                            ),
                        ]
                    )
                )
            ),
        ]
        model = _model(client, mode="index", index_name="my-index")

        embedding = model.embed(video_path)

        np.testing.assert_allclose(embedding, [2**-0.5, 2**-0.5], rtol=1e-6)
        assert model.index_id == "index-1"

        create_kwargs = client.indexes.create.call_args.kwargs
        assert create_kwargs["index_name"] == "my-index"
        assert create_kwargs["models"][0]["model_name"] == "marengo3.0"

        client.indexes.indexed_assets.create.assert_called_once_with(
            "index-1", asset_id="asset-1"
        )
        client.embed.v_2.tasks.create.assert_not_called()

    def test_index_mode_caption_analyzes_indexed_video(self, client):
        client.indexes.indexed_assets.retrieve.return_value = SimpleNamespace(
            status="ready"
        )
        client.analyze.return_value = SimpleNamespace(data="caption")
        model = _model(
            client, operation="caption", mode="index", index_id="existing"
        )

        model.predict("https://example.com/video.mp4")
        model.predict("https://example.com/video.mp4")

        # The existing index is reused, and each video is indexed only once
        client.indexes.create.assert_not_called()
        client.indexes.indexed_assets.create.assert_called_once_with(
            "existing", asset_id="asset-1"
        )
        assert client.assets.create.call_args.kwargs["method"] == "url"

        kwargs = client.analyze.call_args.kwargs
        assert kwargs["model_name"] == "pegasus1.6"
        assert kwargs["video"].asset_id == "asset-1"

    def test_caption_url_on_the_fly(self, client):
        client.analyze.return_value = SimpleNamespace(data="caption")
        model = _model(
            client, operation="caption", prompt="What?", temperature=0.1
        )

        model.predict("https://example.com/video.mp4")

        kwargs = client.analyze.call_args.kwargs
        assert kwargs["video"].url == "https://example.com/video.mp4"
        assert kwargs["prompt"] == "What?"
        assert kwargs["max_tokens"] == 512
        assert kwargs["temperature"] == 0.1
        client.assets.create.assert_not_called()

    def test_segment(self, client):
        data = {
            "play": [
                {
                    "start_time": 0.0,
                    "end_time": 4.0,
                    "metadata": {
                        "summary": "A goal",
                        "scored": True,
                        "label": "reserved",
                        "events": [
                            {"start_time": 1.0, "end_time": 2.0, "e": "kick"}
                        ],
                    },
                },
                {"start_time": 5.0, "end_time": 10.0, "metadata": {}},
            ]
        }
        client.analyze_async.tasks.retrieve.return_value = _ready(
            result=SimpleNamespace(data=json.dumps(data))
        )
        model = _model(
            client,
            operation="segment",
            max_tokens="unlimited",
            min_segment_duration=4,
            max_segment_duration=60,
        )
        metadata = fome.VideoMetadata(
            total_frame_count=300, frame_rate=30.0, duration=10.0
        )

        with mock.patch.object(
            model, "_get_video_metadata", return_value=metadata
        ):
            label = model.predict("https://example.com/video.mp4")

        assert isinstance(label, fol.TemporalDetections)
        first, second = label.detections
        assert first.label == "play"
        assert first.support == [1, 121]
        assert first["summary"] == "A goal"
        assert first["scored"] is True
        assert first["label_"] == "reserved"
        assert first["events"][0]["e"] == "kick"
        assert second.support == [151, 300]

        kwargs = client.analyze_async.tasks.create.call_args.kwargs
        assert kwargs["analysis_mode"] == "time_based_metadata"
        assert kwargs["model_name"] == "pegasus1.6"
        assert kwargs["max_tokens"] == "unlimited"
        assert kwargs["min_segment_duration"] == 4
        assert kwargs["max_segment_duration"] == 60
        response_format = kwargs["response_format"]
        assert response_format.type == "segment_definitions"
        assert response_format.segment_definitions[0].id == "scene"

    def test_segment_with_no_results(self, client):
        client.analyze_async.tasks.retrieve.return_value = _ready(result=None)
        model = _model(client, operation="segment")

        with mock.patch.object(
            model,
            "_get_video_metadata",
            return_value=fome.VideoMetadata(
                total_frame_count=30, frame_rate=30.0, duration=1.0
            ),
        ):
            label = model.predict("https://example.com/video.mp4")

        assert label.detections == []

    def test_delete_index(self, client):
        model = _model(client, mode="index", index_id="existing")

        model.delete_index()
        model.delete_index()

        client.indexes.delete.assert_called_once_with("existing")
        assert model.index_id is None


_live = pytest.mark.skipif(
    not os.environ.get("TWELVELABS_API_KEY"),
    reason="TWELVELABS_API_KEY is not set",
)


@_live
def test_live_embed_marengo_3_5():
    model = fout.TwelveLabsModel(_config())

    video_embedding = model.embed(_LIVE_VIDEO_URL)
    text_embedding = model.embed_prompt("trees in a park")

    assert video_embedding.shape == (512,)
    assert text_embedding.shape == (512,)


@_live
def test_live_caption_pegasus_1_6():
    model = fout.TwelveLabsModel(_config(operation="caption"))

    label = model.predict(_LIVE_VIDEO_URL)

    assert label.label


@_live
def test_live_segment_pegasus_1_6():
    model = fout.TwelveLabsModel(_config(operation="segment"))

    label = model.predict(_LIVE_VIDEO_URL)

    assert label.detections
    assert label.detections[0].label == "scene"
    assert label.detections[0]["description"]
