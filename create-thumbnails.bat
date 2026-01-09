@echo off
echo ========================================
echo Thumbnail Generator
echo ========================================
echo.
echo This will create compressed thumbnails for faster loading.
echo.
echo Installing required package (Pillow)...
pip install Pillow
echo.
echo Creating thumbnails...
echo.
python create_thumbnails.py
echo.
echo ========================================
echo Thumbnail creation complete!
echo ========================================
echo.
pause

