#!/usr/bin/env python3
"""
Script to rename Google Docs exported images to sequential RST-friendly names.
Maps from Google Doc export filenames to sequential image1, image2, etc.

Place this script in the same directory as your exported images and run it.
"""

import os
import shutil
from pathlib import Path

# Get the directory where this script is located
SCRIPT_DIR = Path(__file__).parent.resolve()

# Complete mapping from Google Docs HTML export to RST sequential names
# Based on order of appearance in the document
IMAGE_MAPPING = {
    # Basics section
    "image29.gif": "image1.gif",  # Annotate tab in right sidebar
    "image7.png": "image2.png",  # Undo/Redo buttons
    # Schema Management section
    "image22.png": "image3.png",  # Create Annotation Schema button
    "image32.png": "image4.png",  # Explore tab fields checkboxes
    # 2D Label Annotation section
    "image28.png": "image5.png",  # Creating a classification
    "image17.png": "image6.png",  # Create new detection icon
    "image21.gif": "image7.gif",  # Drawing bounding box
    "image15.gif": "image8.gif",  # Editing detection on canvas
    "image34.gif": "image9.gif",  # Editing in right sidebar
    "image38.png": "image10.png",  # Spatial properties editor
    # 3D Datasets & Projections section
    "image24.png": "image11.png",  # Slice selector (3D datasets)
    "image14.png": "image12.png",  # Pointcloud projections
    "image20.png": "image13.png",  # 2D Image projections
    # 3D Annotation Controls section
    "image10.gif": "image14.gif",  # Annotation plane concept
    "image11.gif": "image15.gif",  # Annotation plane positioning
    "image3.gif": "image16.gif",  # Moving annotation plane
    "image13.png": "image17.png",  # 3D toolbar icons (used multiple times in doc)
    "image2.png": "image18.png",  # Cancel annotation icon
    "image4.gif": "image19.gif",  # Camera keyboard controls
    # 3D Cuboid Annotation section
    "image27.png": "image20.png",  # 3D cuboid toolbar
    "image6.gif": "image21.gif",  # Creating 3D cuboid
    "image23.gif": "image22.gif",  # Cuboid translation mode
    "image12.gif": "image23.gif",  # Cuboid rotation mode
    "image8.gif": "image24.gif",  # Cuboid scaling mode
    "image31.png": "image25.png",  # Cuboid attributes panel
    # 3D Polyline Annotation section
    "image37.gif": "image26.gif",  # 3D polyline animation
    "image30.png": "image27.png",  # Polyline toolbar
    "image16.gif": "image28.gif",  # Creating polyline
    "image25.png": "image29.png",  # Polyline segments visualization
    "image5.gif": "image30.gif",  # Adding new segments
    "image33.gif": "image31.gif",  # Vertex manipulation controls
    "image35.gif": "image32.gif",  # Adding/deleting vertices
    "image18.png": "image33.png",  # Delete vertex icon
    "image1.png": "image34.png",  # Polyline attributes panel
    "image19.png": "image35.png",  # Closed polyline example
    "image26.png": "image36.png",  # Filled polyline example
    "image36.png": "image37.png",  # Closed and filled polyline
    "image9.png": "image38.png",  # Auto-close polyline icon
}


def rename_images(backup=True):
    """
    Rename images from Google Docs export names to RST sequential names.
    Images must be in the same directory as this script.

    Args:
        backup: Whether to create backups before renaming (default: True)
    """
    images_path = SCRIPT_DIR

    # Create backup directory if requested
    if backup:
        backup_path = SCRIPT_DIR / "backup_images"
        if backup_path.exists():
            print(
                f"Warning: Backup directory '{backup_path.name}' already exists!"
            )
            response = input("Continue anyway? (y/n): ")
            if response.lower() != "y":
                print("Aborted.")
                return
            print()
        else:
            backup_path.mkdir()
            # Copy only the image files we're going to rename
            backed_up = 0
            for old_name in IMAGE_MAPPING.keys():
                old_file = images_path / old_name
                if old_file.exists():
                    shutil.copy2(old_file, backup_path / old_name)
                    backed_up += 1
            print(
                f"✓ Created backup at: {backup_path.name}/ ({backed_up} files)"
            )

    # Create temporary directory for renamed files
    temp_path = SCRIPT_DIR / "temp_rename"
    temp_path.mkdir(exist_ok=True)

    # Rename files to temporary location
    renamed_count = 0
    missing_files = []

    print("\nRenaming images (Google Doc export → RST):")
    print("-" * 70)

    for old_name, new_name in IMAGE_MAPPING.items():
        old_file = images_path / old_name
        temp_file = temp_path / new_name

        if old_file.exists():
            shutil.copy2(old_file, temp_file)
            renamed_count += 1
            print(f"✓ {old_name:20s} → {new_name}")
        else:
            missing_files.append(old_name)
            print(f"✗ {old_name:20s} NOT FOUND")

    # Move renamed files back to script directory
    if renamed_count > 0:
        # First, delete the old files that were successfully renamed
        for old_name in IMAGE_MAPPING.keys():
            old_file = images_path / old_name
            if old_file.exists():
                old_file.unlink()

        # Then move new files from temp to script directory
        for new_file in temp_path.iterdir():
            target = images_path / new_file.name
            shutil.move(str(new_file), str(target))

        # Remove temporary directory
        temp_path.rmdir()

        print("-" * 70)
        print(
            f"✓ Successfully renamed {renamed_count}/{len(IMAGE_MAPPING)} images"
        )

        if missing_files:
            print(f"\n⚠  Missing files ({len(missing_files)}):")
            for filename in sorted(missing_files):
                print(f"   - {filename}")

        if backup:
            print(f"\n✓ Original images backed up in: {backup_path.name}/")
    else:
        print("\n✗ No images were renamed")
        temp_path.rmdir()


def verify_images():
    """Verify which images exist in the script directory."""
    images_path = SCRIPT_DIR

    print(f"Images found in script directory:")
    print("-" * 70)

    # Get all image files
    image_files = sorted(images_path.glob("image*.*"))

    if not image_files:
        print("  (no image files found)")
    else:
        for img in image_files:
            size_kb = img.stat().st_size / 1024

            # Check if it's a source or target name
            if img.name in IMAGE_MAPPING:
                status = "[Google Doc export] → will be renamed"
            elif img.name in IMAGE_MAPPING.values():
                status = "[RST sequential] ✓"
            else:
                status = "[other]"

            print(f"  {img.name:20s} ({size_kb:7.1f} KB)  {status}")

    print("-" * 70)
    print(f"Total: {len(image_files)} images")

    # Summary
    expected_original = set(IMAGE_MAPPING.keys())
    expected_renamed = set(IMAGE_MAPPING.values())
    found = {img.name for img in image_files}

    missing_original = expected_original - found
    found_renamed = found & expected_renamed

    if missing_original:
        print(
            f"\n📋 Google Doc exports not yet found ({len(missing_original)}):"
        )
        for filename in sorted(missing_original):
            print(f"   - {filename}")

    if found_renamed:
        print(f"\n✓ Already renamed to RST format ({len(found_renamed)}):")
        for filename in sorted(list(found_renamed)[:5]):  # Show first 5
            print(f"   - {filename}")
        if len(found_renamed) > 5:
            print(f"   ... and {len(found_renamed) - 5} more")


if __name__ == "__main__":
    import sys

    print("=" * 70)
    print("FiftyOne Annotation Documentation - Image Renamer")
    print("Google Doc Export → RST Sequential Names")
    print("=" * 70)
    print(f"Working directory: {SCRIPT_DIR}")
    print("=" * 70)

    if len(sys.argv) > 1 and sys.argv[1] == "--verify":
        print("\nVerifying images...\n")
        verify_images()
    elif len(sys.argv) > 1 and sys.argv[1] == "--no-backup":
        print("\nRenaming images (no backup)...\n")
        rename_images(backup=False)
    else:
        print("\nRenaming images (with backup)...\n")
        rename_images()

    print("\nDone!")
