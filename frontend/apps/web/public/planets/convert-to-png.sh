#!/bin/bash
# Convert planet JPG images to PNG format
# Requires ImageMagick: brew install imagemagick

cd "$(dirname "$0")"

echo "Converting JPG images to PNG format..."

for file in planet-*.jpg; do
    if [ -f "$file" ]; then
        base="${file%.jpg}"
        echo "Converting $file to ${base}.png"

        # Convert to PNG, make circular cutout with transparency
        convert "$file" \
            -resize 1024x1024 \
            -gravity center \
            -extent 1024x1024 \
            \( +clone -threshold -1 \
               -draw "fill black polygon 0,0 0,1024 1024,1024 1024,0" \
               -blur 0x2 \) \
            -alpha off -compose copy_opacity -composite \
            "${base}.png"

        # Remove original JPG
        rm "$file"
    fi
done

echo ""
echo "✅ Converted all planet images to PNG format!"
echo ""
echo "Files created:"
ls -lh planet-*.png 2>/dev/null || echo "No PNG files found"
