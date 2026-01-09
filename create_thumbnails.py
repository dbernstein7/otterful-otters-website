#!/usr/bin/env python3
"""
Create compressed thumbnails for scrolling galleries
Thumbnails are smaller and load faster, full quality loads in modal
"""

import os
from PIL import Image
import sys

def create_thumbnail(input_path, output_path, max_size=(500, 375), quality=75):
    """Create a compressed thumbnail"""
    try:
        with Image.open(input_path) as img:
            # Convert RGBA to RGB if necessary
            if img.mode == 'RGBA':
                rgb_img = Image.new('RGB', img.size, (255, 255, 255))
                rgb_img.paste(img, mask=img.split()[3])
                img = rgb_img
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Create thumbnail maintaining aspect ratio
            img.thumbnail(max_size, Image.Resampling.LANCZOS)
            
            # Save as compressed JPEG
            img.save(output_path, 'JPEG', quality=quality, optimize=True)
            
            original_size = os.path.getsize(input_path)
            new_size = os.path.getsize(output_path)
            reduction = ((original_size - new_size) / original_size) * 100
            
            return True, original_size, new_size, reduction
    except Exception as e:
        return False, 0, 0, 0, str(e)

def create_thumbnails_for_folder(folder_path, thumbnail_folder=None, max_size=(500, 375), quality=75):
    """Create thumbnails for all images in a folder"""
    if thumbnail_folder is None:
        thumbnail_folder = folder_path + '_thumbnails'
    
    os.makedirs(thumbnail_folder, exist_ok=True)
    
    total_original = 0
    total_thumbnail = 0
    processed = 0
    failed = 0
    
    print(f"Creating thumbnails for: {folder_path}")
    print(f"Thumbnail folder: {thumbnail_folder}")
    print(f"Max size: {max_size[0]}x{max_size[1]}, Quality: {quality}")
    print("-" * 60)
    
    # Get all image files
    image_extensions = ('.png', '.jpg', '.jpeg', '.PNG', '.JPG', '.JPEG')
    files = [f for f in os.listdir(folder_path) if f.lower().endswith(image_extensions)]
    
    for filename in files:
        input_path = os.path.join(folder_path, filename)
        # Save as .jpg for thumbnails
        output_filename = filename.rsplit('.', 1)[0] + '.jpg'
        output_path = os.path.join(thumbnail_folder, output_filename)
        
        result = create_thumbnail(input_path, output_path, max_size, quality)
        
        if result[0]:
            original_size, new_size, reduction = result[1], result[2], result[3]
            total_original += original_size
            total_thumbnail += new_size
            processed += 1
            print(f"✓ {filename}: {original_size/1024:.1f}KB → {new_size/1024:.1f}KB ({reduction:.1f}% reduction)")
        else:
            failed += 1
            print(f"✗ {filename}: Failed - {result[4] if len(result) > 4 else 'Unknown error'}")
    
    print("-" * 60)
    print(f"Processed: {processed} images")
    print(f"Failed: {failed} images")
    print(f"Total original size: {total_original/1024/1024:.2f}MB")
    print(f"Total thumbnail size: {total_thumbnail/1024/1024:.2f}MB")
    print(f"Total reduction: {((total_original - total_thumbnail) / total_original * 100):.1f}%")
    print(f"\nThumbnails saved to: {thumbnail_folder}")

if __name__ == "__main__":
    print("=" * 60)
    print("Thumbnail Generator for Scrolling Galleries")
    print("=" * 60)
    print()
    
    # Check if PIL/Pillow is installed
    try:
        from PIL import Image
    except ImportError:
        print("ERROR: PIL/Pillow is not installed!")
        print("Please install it with: pip install Pillow")
        sys.exit(1)
    
    # Create thumbnails for both galleries - sized to match display (438x313px) with slight oversize for quality
    folders_to_process = [
        ('Otherside Otter Photos', (500, 375), 75),  # Slightly larger than display size for crisp images
        ('Nifty Photos', (500, 375), 75),  # Slightly larger than display size for crisp images
    ]
    
    for folder_path, max_size, quality in folders_to_process:
        if os.path.exists(folder_path):
            print(f"\n{'='*60}")
            create_thumbnails_for_folder(folder_path, None, max_size, quality)
        else:
            print(f"\nSkipping {folder_path} (directory not found)")
    
    print("\n" + "=" * 60)
    print("Thumbnail creation complete!")
    print("=" * 60)
    print("\nNote: Update your code to use:")
    print("- Thumbnails in scrolling galleries (e.g., 'Otherside Otter Photos_thumbnails/')")
    print("- Original images in modals (e.g., 'Otherside Otter Photos/')")

