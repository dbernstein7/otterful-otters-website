#!/usr/bin/env python3
"""
Image optimization script for Otterful Website
Compresses PNG images to reduce file size while maintaining quality
"""

import os
from PIL import Image
import sys

def optimize_image(input_path, output_path, quality=75, max_size=(1920, 1920)):
    """Optimize a single image"""
    try:
        with Image.open(input_path) as img:
            # Convert RGBA to RGB if necessary (removes alpha channel for smaller size)
            if img.mode == 'RGBA':
                # Create white background
                rgb_img = Image.new('RGB', img.size, (255, 255, 255))
                rgb_img.paste(img, mask=img.split()[3])  # Use alpha channel as mask
                img = rgb_img
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Resize if image is too large
            if img.size[0] > max_size[0] or img.size[1] > max_size[1]:
                img.thumbnail(max_size, Image.Resampling.LANCZOS)
            
            # Save optimized image
            img.save(output_path, 'JPEG', quality=quality, optimize=True)
            
            # Get file sizes
            original_size = os.path.getsize(input_path)
            new_size = os.path.getsize(output_path)
            reduction = ((original_size - new_size) / original_size) * 100
            
            return True, original_size, new_size, reduction
    except Exception as e:
        return False, 0, 0, 0, str(e)

def optimize_directory(directory, output_dir=None, quality=75):
    """Optimize all images in a directory"""
    if output_dir is None:
        output_dir = directory + '_optimized'
    
    os.makedirs(output_dir, exist_ok=True)
    
    total_original = 0
    total_optimized = 0
    processed = 0
    failed = 0
    
    print(f"Optimizing images in: {directory}")
    print(f"Output directory: {output_dir}")
    print("-" * 60)
    
    # Get all image files
    image_extensions = ('.png', '.jpg', '.jpeg', '.PNG', '.JPG', '.JPEG')
    files = [f for f in os.listdir(directory) if f.lower().endswith(image_extensions)]
    
    for filename in files:
        input_path = os.path.join(directory, filename)
        output_path = os.path.join(output_dir, filename.rsplit('.', 1)[0] + '.jpg')
        
        result = optimize_image(input_path, output_path, quality)
        
        if result[0]:
            original_size, new_size, reduction = result[1], result[2], result[3]
            total_original += original_size
            total_optimized += new_size
            processed += 1
            print(f"✓ {filename}: {original_size/1024:.1f}KB → {new_size/1024:.1f}KB ({reduction:.1f}% reduction)")
        else:
            failed += 1
            print(f"✗ {filename}: Failed - {result[4] if len(result) > 4 else 'Unknown error'}")
    
    print("-" * 60)
    print(f"Processed: {processed} images")
    print(f"Failed: {failed} images")
    print(f"Total original size: {total_original/1024/1024:.2f}MB")
    print(f"Total optimized size: {total_optimized/1024/1024:.2f}MB")
    print(f"Total reduction: {((total_original - total_optimized) / total_original * 100):.1f}%")
    print(f"\nOptimized images saved to: {output_dir}")

if __name__ == "__main__":
    print("=" * 60)
    print("Otterful Website Image Optimizer")
    print("=" * 60)
    print()
    
    # Check if PIL/Pillow is installed
    try:
        from PIL import Image
    except ImportError:
        print("ERROR: PIL/Pillow is not installed!")
        print("Please install it with: pip install Pillow")
        sys.exit(1)
    
    # Optimize different directories with aggressive compression
    directories_to_optimize = [
        ('images_compressed', 'images_compressed_optimized', 75),  # Gallery images - balance quality/size
        ('Otherside Otter Photos', 'Otherside Otter Photos_optimized', 70),  # Carousel - can be more compressed
        ('Nifty Photos', 'Nifty Photos_optimized', 70),  # Carousel - can be more compressed
    ]
    
    for input_dir, output_dir, quality in directories_to_optimize:
        if os.path.exists(input_dir):
            print(f"\n{'='*60}")
            optimize_directory(input_dir, output_dir, quality=quality)
        else:
            print(f"\nSkipping {input_dir} (directory not found)")
    
    print("\n" + "=" * 60)
    print("Optimization complete!")
    print("=" * 60)
    print("\nNote: After optimization, you may want to:")
    print("1. Review the optimized images")
    print("2. Replace the original directories with optimized versions")
    print("3. Update image paths in your code if needed")

