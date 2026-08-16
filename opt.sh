#!/bin/bash

mkdir -p static/raw_images
mkdir -p static/images

for file in static/raw_images/*.{jpg,JPG,jpeg,JPEG,png,PNG}; do
    [ -e "$file" ] || continue

    filename=$(basename -- "$file")
    filename_no_ext="${filename%.*}"

    target_webp="static/images/${filename_no_ext}.webp"

    if [ ! -f "$target_webp" ]; then
        echo "Converting: $filename -> ${filename_no_ext}.webp"
        cwebp -quiet -q 80 -resize 1200 0 "$file" -o "$target_webp"
    fi
done

echo "Image check complete!"
