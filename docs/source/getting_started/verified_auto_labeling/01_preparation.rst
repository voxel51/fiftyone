.. _val_preparation:

Step 1: Prepare Your Dataset and Delegated Operators
=====================================================

.. default-role:: code

Before diving into Verified Auto-Labeling, you need to prepare two key components: your dataset and a GPU-enabled delegated orchestrator. This foundational setup ensures efficient model inference and smooth workflow execution.

.. contents:: In this section
   :local:
   :depth: 2

Overview
--------

This preparation phase involves:

1. **Identifying your labeling task** - Define what you want to accomplish
2. **Setting up GPU orchestration** - Configure resources for model inference
3. **Loading and preparing your dataset** - Get your data into FiftyOne

These steps establish the infrastructure needed for efficient auto-labeling at scale.

Identify Your Labeling Task
----------------------------

**Define Your Objective**

Before starting, clearly define your labeling task type:

- **Object Detection**: Bounding boxes around objects with class labels
- **Classification**: Image-level or object-level category assignments
- **Instance Segmentation**: Pixel-precise masks for individual objects
- **Semantic Segmentation**: Pixel-level class assignments across entire images

**Example for This Guide**

Throughout this guide, we'll use **object detection** as our primary example:
- **Goal**: Detect and classify objects in images
- **Output**: Bounding boxes with class labels and confidence scores
- **Use Case**: Identifying common objects (vehicles, people, animals, etc.)

**Consider Your Requirements**

Think about:
- **Classes**: Which object categories do you need to detect?
- **Precision**: How precise do bounding boxes need to be?
- **Scale**: How many samples will you label?
- **Timeline**: What's your target completion timeframe?

These factors influence model selection and confidence threshold settings in later steps.

Set Up Delegated Orchestrator
------------------------------

**Why GPU Orchestration?**

Model inference, especially with modern foundation models, requires significant computational resources. Delegated orchestrators enable:

- **GPU acceleration** without local hardware requirements
- **Parallel processing** across large datasets
- **Resource isolation** and efficient scaling
- **Progress monitoring** and error handling

**Configuration Steps**

1. **Navigate to Orchestrator Settings**

   - Open FiftyOne Teams
   - Click the Settings icon (⚙️) in top-right corner
   - Select "Orchestrators" from left sidebar

2. **Create New Orchestrator**

   - Click "+ New Orchestrator" button
   - Choose orchestrator type:

     - **Kubernetes**: Recommended for production, scalable
     - **Docker**: Good for single-machine setups
     - **Custom**: For specialized infrastructure

3. **Configure Resources**

   Essential settings:

   .. code-block:: yaml

      name: "GPU Inference Orchestrator"
      type: kubernetes  # or docker
      resources:
        gpu:
          count: 1        # Number of GPUs
          type: "nvidia-tesla-t4"  # GPU model
        memory: "16Gi"    # RAM allocation
        cpu: "4"          # CPU cores

   **Resource Recommendations**:

   - **Small models** (YOLO nano/small): 1 GPU, 8GB RAM
   - **Medium models** (YOLO medium, SAM): 1 GPU, 16GB RAM
   - **Large models** (YOLO-XL, SAM2, DINO): 1-2 GPUs, 32GB RAM

4. **Set Environment Variables** (if needed)

   .. code-block:: yaml

      env:
        CUDA_VISIBLE_DEVICES: "0"
        MODEL_CACHE_DIR: "/cache/models"

5. **Save and Verify**

   - Click "Save" to create orchestrator
   - Wait for status to show "Active" (green indicator)
   - If status shows "Error", click to view logs

**Troubleshooting Orchestrator Issues**

*Orchestrator shows "Inactive"*:
- Check that Kubernetes/Docker service is running
- Verify GPU drivers are installed on nodes
- Ensure sufficient resources are available

*GPU not detected*:
- Verify NVIDIA drivers: `nvidia-smi`
- Check GPU resource allocation in cluster
- Confirm GPU device plugin is running

*Out of memory errors*:
- Increase memory allocation
- Use smaller model variants
- Reduce batch size in advanced settings

Load and Prepare Your Dataset
------------------------------

**Option 1: Load from FiftyOne Zoo**

Perfect for getting started or testing VAL:

.. code-block:: python
   :linenos:

   import fiftyone as fo
   import fiftyone.zoo as foz

   # Load a subset of COCO for quick testing
   dataset = foz.load_zoo_dataset(
       "coco-2017",
       split="validation",
       max_samples=500,
       shuffle=True,
   )

   # Launch the App to explore
   session = fo.launch_app(dataset)

**Option 2: Import Custom Dataset**

For your own data:

.. code-block:: python
   :linenos:

   import fiftyone as fo

   # Import from common formats
   dataset = fo.Dataset.from_dir(
       dataset_dir="/path/to/data",
       dataset_type=fo.types.COCODetectionDataset,
       name="my_dataset",
   )

   # Or create from scratch
   dataset = fo.Dataset(name="my_dataset")
   samples = []

   for filepath in image_paths:
       sample = fo.Sample(filepath=filepath)
       # Add existing labels if available
       samples.append(sample)

   dataset.add_samples(samples)

**Data Quality Checklist**

Before proceeding with VAL, verify:

✓ **Images load correctly**: Browse samples in grid view
✓ **Consistent format**: Check image dimensions and file types
✓ **Sufficient quantity**: At least 100-500 samples for meaningful results
✓ **Proper file paths**: All images accessible from orchestrator
✓ **Existing labels** (optional): Pre-labels visible if present

**Prepare Data for Orchestrator Access**

Ensure your orchestrator can access image files:

**For cloud storage** (S3, GCS, Azure):

.. code-block:: python

   # Configure cloud credentials in FiftyOne Teams settings
   # Samples with cloud URLs work automatically
   sample.filepath = "s3://bucket/path/to/image.jpg"

**For local files**:

.. code-block:: python

   # Mount local directory to orchestrator
   # Or copy files to shared storage accessible by orchestrator

**For remote servers**:

.. code-block:: python

   # Use FiftyOne's cloud media features
   # Or set up network file system (NFS) mounts

Verify Your Setup
-----------------

Before proceeding to configure your VAL run, verify:

**1. Orchestrator Health Check**

.. code-block:: python

   import fiftyone as fo

   # List available orchestrators
   orchestrators = fo.list_orchestrators()
   print(f"Available orchestrators: {orchestrators}")

   # Check specific orchestrator status
   status = fo.get_orchestrator_status("GPU Inference Orchestrator")
   print(f"Status: {status}")

Expected output: `Status: active`

**2. Dataset Accessibility**

.. code-block:: python

   # Verify sample count
   print(f"Dataset has {len(dataset)} samples")

   # Check first sample loads
   sample = dataset.first()
   print(f"First sample: {sample.filepath}")

   # Verify image dimensions
   print(f"Dimensions: {sample.metadata.width}x{sample.metadata.height}")

**3. GPU Availability**

From orchestrator node:

.. code-block:: bash

   # Check NVIDIA GPU
   nvidia-smi

   # Should show available GPUs and memory

Pre-Flight Checklist
--------------------

Before moving to the next step, confirm:

.. list-table::
   :widths: 70 30
   :header-rows: 1

   * - Requirement
     - Status
   * - Labeling task clearly defined (detection, classification, etc.)
     - ☐
   * - Delegated orchestrator created and showing "Active" status
     - ☐
   * - GPU resources allocated (at least 1 GPU, 8GB+ RAM)
     - ☐
   * - Dataset loaded into FiftyOne (100+ samples recommended)
     - ☐
   * - Images accessible and loading correctly in App
     - ☐
   * - Orchestrator can access image files (cloud or mounted storage)
     - ☐

Next Steps
----------

With your infrastructure prepared and dataset ready, you're now set to configure your first VAL run.

In the next section, you'll learn how to:
- Select appropriate models for your task
- Choose which samples to label
- Configure classes and confidence thresholds
- Launch your auto-labeling run

Click **Next** to continue to :ref:`Step 2: Configure VAL Run <val_configure_run>`.

.. tip::
   **Save this setup!** Once your orchestrator is configured, you can reuse it for multiple VAL runs across different datasets. The initial setup investment pays dividends over time.
