
# Getting Started with Image Classification, Model Comparison, and Dataset Curation using FiftyOne and PyTorch

## Zero-shot Classification with CLIP vs Supervised Learning with Convolutional Neural Networks

### Who Is this Tutorial for

This tutorial is designed for computer vision practitioners and data scientists who want to master image classification workflows using FiftyOne. Whether you're new to computer vision or experienced with other tools, you'll learn how to leverage FiftyOne's powerful capabilities for dataset curation, model evaluation, and visual analysis.

This tutorial is appropriate for any level of computer vision knowledge. By the end of this series, you'll be able to quickly identify mislabeled samples, compare classification models, create meaningful embeddings, and seamlessly move between FiftyOne and PyTorch workflows.

### Assumed Knowledge

We assume familiarity with basic Python programming and fundamental machine learning concepts. Knowledge of PyTorch is helpful but not required; we'll explain the key concepts as we go. This tutorial is recommended for beginners to intermediate practitioners in computer vision.

### Time to Complete

90-120 minutes (for the entire series)

### Required Packages

FiftyOne, PyTorch, and several other packages are required. You can install them in the first notebook with:

```bash
pip install fiftyone torch torchvision numpy albumentations
```

### Content Overview

This tutorial series is broken down into the following parts:

1.  **MNIST Dataset Exploration with FiftyOne**: Load the MNIST dataset, compute metadata, and explore its distributions visually.
2.  **Image Embeddings with CLIP**: Generate and visualize high-dimensional image embeddings using a pre-trained CLIP model to understand image similarity.
3.  **Zero-Shot Classification with CLIP**: Perform image classification using CLIP without any task-specific training and evaluate its performance.
4.  **Supervised Classification: LeNet-5 with PyTorch**: Build, train, and validate a classic LeNet-5 convolutional neural network from scratch using PyTorch.
5.  **LeNet-5 Model Evaluation**: Apply the trained LeNet-5 model to the test set, evaluate its performance, and analyze prediction characteristics like hardness and mistakenness.
6.  **Analysis of LeNet-5 Learned Features**: Extract embeddings from your trained LeNet model to analyze its learned features, uniqueness, and representativeness on the training data.
7.  **Data Augmentation and Retraining**: Use insights from model analysis to perform targeted data augmentation on misclassified samples and fine-tune the model for improved performance.

## The MNIST dataset

![](https://github.com/andandandand/practical-computer-vision/blob/main/images/mnist_clean.png?raw=true)

The Modified National Institute of Standards and Technology (MNIST) dataset is one of the most influential benchmarks in computer vision. It contains 60,000 training and 10,000 testing images of 28x28 grayscale handwritten digits (0-9). Its simplicity and small size make it ideal for learning fundamental concepts, yet achieving state-of-the-art performance requires sophisticated techniques.

## CLIP

CLIP (Contrastive Language-Image Pre-training) is a vision-language model from OpenAI that learns visual concepts from natural language supervision. Trained on 400 million image-text pairs, CLIP can perform "zero-shot" classification by matching images to text descriptions of categories it has never explicitly seen during training.

![](https://github.com/andandandand/images-for-colab-notebooks/blob/main/clip%20contrastive%20pre-training.png?raw=true)

While CLIP is immensely useful, it struggles with specialized datasets that are too different from its training distribution. MNIST is one of those cases and we will explore it here. 

---

## LeNet-5

While modern, large-scale models like CLIP are incredibly powerful, understanding how to build and train a neural network from scratch is a cornerstone of computer vision. For this, we turn to **LeNet-5**, one of the earliest and most influential Convolutional Neural Networks (CNNs). Proposed by Yann LeCun and his colleagues in 1998, its architecture laid the groundwork for the deep learning revolution and introduced concepts that are still fundamental to today's state-of-the-art models.

LeNet-5 was groundbreaking because it effectively demonstrated the power of hierarchical feature learning. The network uses a sequence of convolutional and pooling layers to automatically learn to detect simple features like edges and corners in the initial layers, which are then combined into more complex features like curves and digit shapes in deeper layers. This is followed by a set of fully connected layers that perform the final classification.

The architecture is elegantly simple yet powerful:

![](https://raw.githubusercontent.com/andandandand/practical-computer-vision/refs/heads/main/images/lenet5-architecture.png)

In this tutorial series, we will build, train, and evaluate a modernized version of LeNet-5. This process serves two purposes: first, it provides a hands-on understanding of the core mechanics of a CNN; second, it creates a high-performing, specialized model that we can benchmark against CLIP's generalist, zero-shot approach.

### Integrating FiftyOne with PyTorch for Training

A key aspect of this tutorial is demonstrating a seamless workflow between data management and model training. We leverage the strengths of both FiftyOne and PyTorch by:

1.  **Managing Data in FiftyOne**: We use FiftyOne to load the MNIST dataset, explore it, and split it into training and validation sets. FiftyOne's powerful querying and tagging capabilities make this data preparation step robust and reproducible.
2.  **Bridging to PyTorch**: We create a custom `torch.utils.data.Dataset` class that acts as a bridge between our FiftyOne dataset views and the PyTorch ecosystem. This custom class reads file paths and labels directly from the FiftyOne dataset.
3.  **Training in PyTorch**: The custom dataset is then wrapped in a PyTorch `DataLoader`, which efficiently handles batching, shuffling, and multi-process data loading, feeding the data directly to our LeNet-5 model for training.

This approach gives us the best of both worlds: the rich, interactive data curation and analysis features of FiftyOne, and the powerful, flexible model training and optimization capabilities of PyTorch.



