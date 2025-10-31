.. _vlm-integration:

VLM Run Integration
===================

.. default-role:: code

FiftyOne integrates with `VLM Run <https://vlm.run>`_, a powerful platform for 
extracting structured JSON data from various media types including images, 
documents, PDFs, audio, and video using vision-language models.

With VLM Run, you can extract structured information from your FiftyOne datasets,
including invoice data, form fields, document text, and custom schemas - all with
just a few lines of code!

.. _vlm-overview:

Overview
________

VLM Run provides a unified API for extracting structured data from unstructured 
media using pre-built domains or custom schemas. The integration enables you to:

- Extract structured data from images and documents
- Convert PDFs and documents to Markdown
- Process invoices, forms, and other business documents
- Apply custom extraction schemas using Pydantic models
- Store results as FiftyOne labels or attributes

.. _vlm-setup:

Setup
-----

To get started with VLM Run, install the `vlmrun` package:

.. code-block:: shell

    pip install vlmrun

You'll also need a VLM Run API key, which you can obtain from 
`VLM Run <https://vlm.run>`_.

Set your API key as an environment variable:

.. code-block:: shell

    export VLMRUN_API_KEY="your-api-key"

Or pass it directly when creating models.

.. _vlm-quickstart:

Quickstart
----------

The quickest way to get started is to load a VLM Run model and apply it to your
dataset:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    import fiftyone.utils.vlm as fouv

    # Load a sample dataset
    dataset = foz.load_zoo_dataset("quickstart", max_samples=10)

    # Load a VLM Run model for document invoice extraction
    model = fouv.load_vlm_model("document.invoice")

    # Apply the model to extract invoice data
    fouv.apply_vlm_model(
        dataset,
        model=model,
        label_field="invoice_data",
        output_type="attributes"
    )

    # View the results
    session = fo.launch_app(dataset)

.. _vlm-domains:

Pre-built Domains
-----------------

VLM Run provides several pre-built domains for common extraction tasks:

Document Processing
^^^^^^^^^^^^^^^^^^^

Extract structured data from documents and PDFs:

.. code-block:: python
    :linenos:

    import fiftyone.utils.vlm as fouv

    # Invoice extraction
    model = fouv.load_vlm_model("document.invoice")
    
    # Convert to Markdown
    model = fouv.load_vlm_model("document.markdown")
    
    # Form field extraction
    model = fouv.load_vlm_model("document.form")

Image Analysis
^^^^^^^^^^^^^^

Analyze and classify images:

.. code-block:: python
    :linenos:

    # Image classification
    model = fouv.load_vlm_model("image.classification")

    # Apply to dataset
    dataset.apply_model(model, label_field="vlm_predictions")

Video and Audio (Enterprise)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Process video and audio content (requires enterprise subscription):

.. code-block:: python
    :linenos:

    # Video transcription
    model = fouv.load_vlm_model("video.transcription")
    
    # Audio transcription
    model = fouv.load_vlm_model("audio.transcription")

.. _vlm-custom-schemas:

Custom Schemas
--------------

You can define custom extraction schemas using Pydantic models or dictionaries:

.. code-block:: python
    :linenos:

    from pydantic import BaseModel
    from typing import List, Optional
    import fiftyone.utils.vlm as fouv

    # Define a custom schema
    class ProductInfo(BaseModel):
        name: str
        price: float
        category: str
        in_stock: bool
        description: Optional[str] = None

    # Create model with custom schema
    model = fouv.VLMRunModel(schema=ProductInfo)

    # Apply to dataset
    fouv.apply_vlm_model(
        dataset,
        model=model,
        label_field="product_info",
        output_type="attributes"
    )

.. _vlm-output-types:

Output Types
------------

The integration supports multiple ways to store VLM Run results in your dataset:

Attributes
^^^^^^^^^^

Store extracted data as sample attributes (default):

.. code-block:: python
    :linenos:

    fouv.apply_vlm_model(
        dataset,
        domain="document.invoice",
        label_field="invoice",
        output_type="attributes"
    )

    # Access extracted fields
    sample = dataset.first()
    print(sample["invoice.vendor"])
    print(sample["invoice.total"])

Classifications
^^^^^^^^^^^^^^^

Store results as FiftyOne Classification labels:

.. code-block:: python
    :linenos:

    fouv.apply_vlm_model(
        dataset,
        domain="image.classification", 
        label_field="predictions",
        output_type="classification",
        confidence_thresh=0.8
    )

Detections
^^^^^^^^^^

If your schema includes bounding boxes, store as Detections:

.. code-block:: python
    :linenos:

    # Custom schema with bounding boxes
    class ObjectDetection(BaseModel):
        detections: List[dict]  # Each dict has label, bbox, confidence

    model = fouv.VLMRunModel(schema=ObjectDetection)
    
    fouv.apply_vlm_model(
        dataset,
        model=model,
        label_field="detections",
        output_type="detections"
    )

Raw JSON
^^^^^^^^

Store the raw JSON response:

.. code-block:: python
    :linenos:

    fouv.apply_vlm_model(
        dataset,
        domain="document.invoice",
        label_field="raw_data",
        output_type="raw"
    )

.. _vlm-examples:

Examples
--------

Invoice Processing
^^^^^^^^^^^^^^^^^^

Extract structured invoice data from a dataset of invoice images:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.utils.vlm as fouv

    # Load dataset of invoice images
    dataset = fo.Dataset()
    dataset.add_samples([
        fo.Sample(filepath="/path/to/invoice1.pdf"),
        fo.Sample(filepath="/path/to/invoice2.jpg"),
    ])

    # Extract invoice data
    fouv.apply_vlm_model(
        dataset,
        domain="document.invoice",
        label_field="invoice",
        output_type="attributes"
    )

    # Query extracted data
    high_value = dataset.filter_labels("invoice.total", F() > 1000)
    print(f"Found {len(high_value)} high-value invoices")

Document to Markdown
^^^^^^^^^^^^^^^^^^^^

Convert documents to clean Markdown format:

.. code-block:: python
    :linenos:

    # Convert PDFs to Markdown
    model = fouv.load_vlm_model("document.markdown")
    
    for sample in dataset:
        result = model.predict(sample.filepath)
        sample["markdown_content"] = result.data
        sample.save()

Custom Product Extraction
^^^^^^^^^^^^^^^^^^^^^^^^^^

Extract product information using a custom schema:

.. code-block:: python
    :linenos:

    from pydantic import BaseModel
    from typing import List

    class Product(BaseModel):
        name: str
        price: float
        features: List[str]
        available: bool

    # Create dataset of product images
    dataset = fo.Dataset()
    dataset.add_dir("/path/to/product/images")

    # Extract product info
    model = fouv.VLMRunModel(schema=Product)
    
    fouv.apply_vlm_model(
        dataset,
        model=model,
        label_field="product",
        output_type="attributes"
    )

    # Filter by extracted attributes
    available_products = dataset.match(F("product.available") == True)
    expensive = dataset.match(F("product.price") > 100)

.. _vlm-api-reference:

API Reference
-------------

.. _vlm-models:

Models
^^^^^^

.. code-block:: python

    fouv.VLMRunModel(
        domain=None,      # VLM Run domain (e.g., "document.invoice")
        schema=None,      # Custom Pydantic schema or dict
        api_key=None,     # VLM Run API key
        base_url=None,    # API base URL
        timeout=120.0,    # Request timeout
        max_retries=5     # Max retry attempts
    )

.. _vlm-functions:

Functions
^^^^^^^^^

.. code-block:: python

    # Load a VLM Run model
    fouv.load_vlm_model(domain, api_key=None, **kwargs)

    # Convert model for FiftyOne
    fouv.convert_vlm_model(domain=None, schema=None, **kwargs)

    # Apply model to dataset
    fouv.apply_vlm_model(
        samples,
        model=None,
        domain=None,
        schema=None,
        label_field="vlm_predictions",
        output_type="attributes",
        confidence_thresh=None,
        api_key=None,
        batch_size=None,
        progress=None
    )

    # Converter utilities
    fouv.to_classification(result, confidence_thresh=None)
    fouv.to_detections(result, confidence_thresh=None)
    fouv.to_attributes(result, prefix=None)

.. _vlm-limitations:

Limitations
-----------

- Video and audio processing require an enterprise VLM Run subscription
- API rate limits apply based on your subscription tier
- Large files may take longer to process
- Internet connection required for API calls

.. _vlm-resources:

Resources
---------

- `VLM Run Documentation <https://docs.vlm.run>`_
- `VLM Run API Reference <https://docs.vlm.run/sdk-reference>`_
- `VLM Run Hub <https://github.com/vlm-run/hub>`_