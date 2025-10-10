"""
FiftyOne VLM Run integration unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest
from unittest.mock import patch, MagicMock, PropertyMock
import os

import numpy as np
from PIL import Image

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.utils.vlmrun as vlmrun

from decorators import drop_datasets


class MockVLMResponse:
    """Mock response object for VLM Run API."""
    
    def __init__(self, data):
        self.data = data


class VLMRunModelTests(unittest.TestCase):
    """Tests for VLMRunModel class."""

    def setUp(self):
        """Set up test fixtures."""
        self.api_key = "test_api_key"
        self.domain = "document.invoice"
        
    def test_model_initialization(self):
        """Test VLMRunModel initialization."""
        model = vlmrun.VLMRunModel(
            domain=self.domain,
            api_key=self.api_key
        )
        
        self.assertEqual(model.config.domain, self.domain)
        self.assertEqual(model.config.api_key, self.api_key)
        self.assertEqual(model.media_type, "document")  # document.invoice -> "document"
        self.assertFalse(model.has_logits)
        
    def test_model_config(self):
        """Test VLMRunModelConfig."""
        config = vlmrun.VLMRunModelConfig(
            domain=self.domain,
            api_key=self.api_key,
            timeout=60.0,
            max_retries=3
        )
        
        self.assertEqual(config.domain, self.domain)
        self.assertEqual(config.api_key, self.api_key)
        self.assertEqual(config.timeout, 60.0)
        self.assertEqual(config.max_retries, 3)
        
    def test_model_config_env_var(self):
        """Test API key from environment variable."""
        with patch.dict(os.environ, {"VLMRUN_API_KEY": "env_api_key"}):
            config = vlmrun.VLMRunModelConfig(domain=self.domain)
            self.assertEqual(config.api_key, "env_api_key")
            
    @patch("vlmrun.client.VLMRun")
    def test_predict_with_domain(self, mock_VLMRun):
        """Test prediction with domain."""
        # Setup mock client
        mock_client = MagicMock()
        mock_VLMRun.return_value = mock_client
        
        # Mock image generate response
        mock_response = MockVLMResponse({"label": "invoice", "confidence": 0.95})
        mock_client.image.generate.return_value = mock_response
        
        model = vlmrun.VLMRunModel(domain="image.classification", api_key=self.api_key)
        
        # Create test image
        img = Image.new("RGB", (100, 100), color="red")
        
        with model:
            result = model.predict(img)
        
        self.assertEqual(result.data, {"label": "invoice", "confidence": 0.95})
        mock_client.image.generate.assert_called_once()
        
    @patch("vlmrun.client.VLMRun")
    def test_predict_with_document_domain(self, mock_VLMRun):
        """Test prediction with document domain."""
        # Setup mock client
        mock_client = MagicMock()
        mock_VLMRun.return_value = mock_client
        
        # Mock document generate response
        mock_response = MockVLMResponse({"total": 100.0, "vendor": "Test Corp"})
        mock_client.document.generate.return_value = mock_response
        
        model = vlmrun.VLMRunModel(domain="document.invoice", api_key=self.api_key)
        
        # Create test image
        img = Image.new("RGB", (100, 100), color="white")
        
        with model:
            result = model.predict(img)
        
        self.assertEqual(result.data, {"total": 100.0, "vendor": "Test Corp"})
        mock_client.document.generate.assert_called_once()
        
    @patch("vlmrun.client.VLMRun")
    def test_predict_batch(self, mock_VLMRun):
        """Test batch prediction."""
        # Setup mock client
        mock_client = MagicMock()
        mock_VLMRun.return_value = mock_client
        
        # Mock responses
        mock_responses = [
            MockVLMResponse({"label": "cat", "confidence": 0.9}),
            MockVLMResponse({"label": "dog", "confidence": 0.85}),
        ]
        mock_client.image.generate.side_effect = mock_responses
        
        model = vlmrun.VLMRunModel(domain="image.classification", api_key=self.api_key)
        
        # Create test images
        imgs = [
            Image.new("RGB", (100, 100), color="red"),
            Image.new("RGB", (100, 100), color="blue"),
        ]
        
        with model:
            results = model.predict_all(imgs)
        
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0].data, {"label": "cat", "confidence": 0.9})
        self.assertEqual(results[1].data, {"label": "dog", "confidence": 0.85})
        

class VLMRunConverterTests(unittest.TestCase):
    """Tests for VLM Run output converters."""
    
    def test_to_classification(self):
        """Test classification conversion."""
        # Test with dict data
        result = MockVLMResponse({"label": "cat", "confidence": 0.95})
        classification = vlmrun.to_classification(result)
        
        self.assertIsInstance(classification, fol.Classification)
        self.assertEqual(classification.label, "cat")
        self.assertEqual(classification.confidence, 0.95)
        
        # Test with confidence threshold
        classification = vlmrun.to_classification(result, confidence_thresh=0.96)
        self.assertIsNone(classification)
        
        # Test with None result
        classification = vlmrun.to_classification(None)
        self.assertIsNone(classification)
        
    def test_to_classification_custom_field(self):
        """Test classification conversion with custom label field."""
        result = MockVLMResponse({"category": "dog", "confidence": 0.88})
        classification = vlmrun.to_classification(result, label_field="category")
        
        self.assertIsInstance(classification, fol.Classification)
        self.assertEqual(classification.label, "dog")
        self.assertEqual(classification.confidence, 0.88)
        
    def test_to_detections(self):
        """Test detections conversion."""
        # Test with list of detections
        result = MockVLMResponse({
            "detections": [
                {"label": "car", "bbox": [0.1, 0.2, 0.3, 0.4], "confidence": 0.9},
                {"label": "person", "bbox": [0.5, 0.6, 0.7, 0.8], "confidence": 0.85},
            ]
        })
        
        detections = vlmrun.to_detections(result)
        
        self.assertIsInstance(detections, fol.Detections)
        self.assertEqual(len(detections.detections), 2)
        
        det1 = detections.detections[0]
        self.assertEqual(det1.label, "car")
        self.assertEqual(det1.confidence, 0.9)
        
        det2 = detections.detections[1]
        self.assertEqual(det2.label, "person")
        self.assertEqual(det2.confidence, 0.85)
        
        # Test with confidence threshold
        detections = vlmrun.to_detections(result, confidence_thresh=0.87)
        self.assertEqual(len(detections.detections), 1)
        self.assertEqual(detections.detections[0].label, "car")
        
        # Test with None result
        detections = vlmrun.to_detections(None)
        self.assertIsInstance(detections, fol.Detections)
        self.assertEqual(len(detections.detections), 0)
        
    def test_to_attributes(self):
        """Test attributes conversion."""
        # Test with nested dict data
        result = MockVLMResponse({
            "vendor": "Test Corp",
            "total": 150.50,
            "items": ["item1", "item2"],
            "details": {
                "date": "2025-01-01",
                "invoice_number": "INV-001"
            }
        })
        
        attributes = vlmrun.to_attributes(result)
        
        self.assertEqual(attributes["vendor"], "Test Corp")
        self.assertEqual(attributes["total"], 150.50)
        self.assertEqual(attributes["items"], "item1, item2")
        self.assertEqual(attributes["details_date"], "2025-01-01")
        self.assertEqual(attributes["details_invoice_number"], "INV-001")
        
        # Test with prefix
        attributes = vlmrun.to_attributes(result, prefix="invoice")
        
        self.assertEqual(attributes["invoice_vendor"], "Test Corp")
        self.assertEqual(attributes["invoice_total"], 150.50)
        self.assertEqual(attributes["invoice_details_date"], "2025-01-01")
        
        # Test with None result
        attributes = vlmrun.to_attributes(None)
        self.assertEqual(attributes, {})


class VLMRunIntegrationTests(unittest.TestCase):
    """Integration tests for VLM Run with FiftyOne datasets."""
    
    @drop_datasets
    @patch("vlmrun.client.VLMRun")
    def test_apply_vlmrun_model_attributes(self, mock_VLMRun):
        """Test applying VLM model with attributes output."""
        # Setup mock client
        mock_client = MagicMock()
        mock_VLMRun.return_value = mock_client
        
        # Mock response
        mock_response = MockVLMResponse({
            "vendor": "Test Corp",
            "total": 250.00,
            "date": "2025-01-01"
        })
        mock_client.document.generate.return_value = mock_response
        
        # Create test dataset
        dataset = fo.Dataset()
        
        # Add sample with dummy image
        img = np.zeros((100, 100, 3), dtype=np.uint8)
        sample = fo.Sample(filepath="test.jpg")
        dataset.add_sample(sample)
        
        # Mock PIL Image.open
        with patch("PIL.Image.open") as mock_open:
            mock_open.return_value = Image.new("RGB", (100, 100))
            
            # Apply model
            vlmrun.apply_vlmrun_model(
                dataset,
                domain="document.invoice",
                label_field="invoice",
                output_type="attributes",
                api_key="test_key"
            )
        
        # Check results
        sample = dataset.first()
        self.assertEqual(sample["invoice_vendor"], "Test Corp")
        self.assertEqual(sample["invoice_total"], 250.00)
        self.assertEqual(sample["invoice_date"], "2025-01-01")
        
    @drop_datasets
    @patch("vlmrun.client.VLMRun")
    def test_apply_vlmrun_model_classification(self, mock_VLMRun):
        """Test applying VLM model with classification output."""
        # Setup mock client
        mock_client = MagicMock()
        mock_VLMRun.return_value = mock_client
        
        # Mock response
        mock_response = MockVLMResponse({"label": "cat", "confidence": 0.92})
        mock_client.image.generate.return_value = mock_response
        
        # Create test dataset
        dataset = fo.Dataset()
        
        # Add sample
        sample = fo.Sample(filepath="test.jpg")
        dataset.add_sample(sample)
        
        # Mock PIL Image.open
        with patch("PIL.Image.open") as mock_open:
            mock_open.return_value = Image.new("RGB", (100, 100))
            
            # Apply model
            vlmrun.apply_vlmrun_model(
                dataset,
                domain="image.classification",
                label_field="predictions",
                output_type="classification",
                api_key="test_key"
            )
        
        # Check results
        sample = dataset.first()
        self.assertIsInstance(sample["predictions"], fol.Classification)
        self.assertEqual(sample["predictions"].label, "cat")
        self.assertEqual(sample["predictions"].confidence, 0.92)
        
    @drop_datasets
    @patch("vlmrun.client.VLMRun")
    def test_apply_vlmrun_model_detections(self, mock_VLMRun):
        """Test applying VLM model with detections output."""
        # Setup mock client
        mock_client = MagicMock()
        mock_VLMRun.return_value = mock_client
        
        # Mock response
        mock_response = MockVLMResponse({
            "detections": [
                {"label": "car", "bbox": [0.1, 0.2, 0.3, 0.4], "confidence": 0.95},
                {"label": "person", "bbox": [0.5, 0.5, 0.6, 0.6], "confidence": 0.88},
            ]
        })
        mock_client.image.generate.return_value = mock_response
        
        # Create test dataset
        dataset = fo.Dataset()
        
        # Add sample
        sample = fo.Sample(filepath="test.jpg")
        dataset.add_sample(sample)
        
        # Mock PIL Image.open
        with patch("PIL.Image.open") as mock_open:
            mock_open.return_value = Image.new("RGB", (100, 100))
            
            # Apply model
            vlmrun.apply_vlmrun_model(
                dataset,
                domain="image.detection",
                label_field="detections",
                output_type="detections",
                api_key="test_key"
            )
        
        # Check results
        sample = dataset.first()
        self.assertIsInstance(sample["detections"], fol.Detections)
        self.assertEqual(len(sample["detections"].detections), 2)
        self.assertEqual(sample["detections"].detections[0].label, "car")
        self.assertEqual(sample["detections"].detections[1].label, "person")


class VLMRunFactoryTests(unittest.TestCase):
    """Tests for VLM Run model factory functions."""
    
    def test_convert_vlm_model(self):
        """Test convert_vlm_model factory function."""
        model = vlmrun.convert_vlm_model(
            domain="document.invoice",
            api_key="test_key"
        )
        
        self.assertIsInstance(model, vlmrun.VLMRunModel)
        self.assertEqual(model.config.domain, "document.invoice")
        self.assertEqual(model.config.api_key, "test_key")
        
    def test_load_vlmrun_model(self):
        """Test load_vlm_model factory function."""
        model = vlmrun.load_vlmrun_model(
            domain="image.classification",
            api_key="test_key",
            timeout=30.0
        )
        
        self.assertIsInstance(model, vlmrun.VLMRunModel)
        self.assertEqual(model.config.domain, "image.classification")
        self.assertEqual(model.config.api_key, "test_key")
        self.assertEqual(model.config.timeout, 30.0)

class VLMRunDomainTests(unittest.TestCase):
    """Tests for VLM Run domain discovery functions."""

    @patch("vlmrun.client.VLMRun")
    def test_list_vlmrun_domains(self, mock_VLMRun):
        """Test listing VLM Run domains."""
        # Setup mock client
        mock_client = MagicMock()
        mock_VLMRun.return_value = mock_client

        # Mock domain objects
        mock_domains = [
            MagicMock(domain="document.invoice"),
            MagicMock(domain="image.classification")
        ]
        mock_client.hub.list_domains.return_value = mock_domains

        domains = vlmrun.list_vlmrun_domains(api_key="test_key")

        self.assertEqual(len(domains), 2)
        self.assertIn("document.invoice", domains)
        self.assertIn("image.classification", domains)

    @patch("vlmrun.client.VLMRun")
    def test_get_domain_schema(self, mock_VLMRun):
        """Test getting domain schema."""
        # Setup mock client
        mock_client = MagicMock()
        mock_VLMRun.return_value = mock_client

        mock_schema = MagicMock()
        mock_schema.schema = {"fields": ["vendor", "total", "date"]}
        mock_client.hub.get_schema.return_value = mock_schema

        schema = vlmrun.get_domain_schema("document.invoice", api_key="test_key")

        self.assertEqual(schema["fields"], ["vendor", "total", "date"])
        mock_client.hub.get_schema.assert_called_with("document.invoice")


class VLMRunParsingTests(unittest.TestCase):
    """Tests for VLM Run parsing functions."""

    def test_parse_visual_grounding(self):
        """Test parsing visual grounding data."""
        # Test with single detection
        result = MagicMock()
        result.metadata = {
            "bbox": {"x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4},
            "label": "car",
            "confidence": "high"
        }

        detections = vlmrun.parse_visual_grounding(result)

        self.assertIsInstance(detections, fol.Detections)
        self.assertEqual(len(detections.detections), 1)
        self.assertEqual(detections.detections[0].label, "car")
        self.assertEqual(detections.detections[0].confidence, 0.9)  # "high" -> 0.9

        # Test with multiple detections
        result.metadata = [
            {"bbox": {"x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4}, "label": "car", "confidence": 0.95},
            {"bbox": {"x": 0.5, "y": 0.6, "w": 0.2, "h": 0.3}, "label": "person", "confidence": 0.85}
        ]

        detections = vlmrun.parse_visual_grounding(result)

        self.assertEqual(len(detections.detections), 2)
        self.assertEqual(detections.detections[0].label, "car")
        self.assertEqual(detections.detections[1].label, "person")

    def test_parse_temporal_grounding(self):
        """Test parsing temporal grounding data."""
        result = MagicMock()
        result.response = {
            "segments": [
                {"start_time": 0.0, "end_time": 5.0, "text": "First segment"},
                {"start_time": 5.0, "end_time": 10.0, "text": "Second segment"}
            ]
        }

        segments = vlmrun.parse_temporal_grounding(result)

        self.assertEqual(len(segments), 2)
        self.assertEqual(segments[0]["start_time"], 0.0)
        self.assertEqual(segments[0]["end_time"], 5.0)
        self.assertEqual(segments[0]["text"], "First segment")


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)