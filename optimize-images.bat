@echo off
echo ========================================
echo Otterful Website Image Optimizer
echo ========================================
echo.
echo This will compress and optimize all images for faster loading.
echo.
echo Installing required package (Pillow)...
pip install Pillow
echo.
echo Starting optimization...
echo.
python optimize_images.py
echo.
echo ========================================
echo Optimization complete!
echo ========================================
echo.
echo The optimized images are in new folders:
echo - images_compressed_optimized
echo - Otherside Otter Photos_optimized
echo.
echo After reviewing, you can replace the original folders.
echo.
pause

