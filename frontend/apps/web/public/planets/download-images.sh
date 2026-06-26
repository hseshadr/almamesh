#!/bin/bash
# Download planet images for Energy Aura visualization
# Using Solar System Scope textures (CC BY 4.0 license)

echo "Downloading planet images..."

# Create planets directory if it doesn't exist
mkdir -p "$(dirname "$0")"

cd "$(dirname "$0")"

# Download planets from Solar System Scope (2K resolution)
echo "⬇️  Downloading Sun..."
curl -L "https://www.solarsystemscope.com/textures/download/2k_sun.jpg" -o "planet-sun.jpg"

echo "⬇️  Downloading Moon..."
curl -L "https://www.solarsystemscope.com/textures/download/2k_moon.jpg" -o "planet-moon.jpg"

echo "⬇️  Downloading Mercury..."
curl -L "https://www.solarsystemscope.com/textures/download/2k_mercury.jpg" -o "planet-mercury.jpg"

echo "⬇️  Downloading Venus..."
curl -L "https://www.solarsystemscope.com/textures/download/2k_venus_atmosphere.jpg" -o "planet-venus.jpg"

echo "⬇️  Downloading Mars..."
curl -L "https://www.solarsystemscope.com/textures/download/2k_mars.jpg" -o "planet-mars.jpg"

echo "⬇️  Downloading Jupiter..."
curl -L "https://www.solarsystemscope.com/textures/download/2k_jupiter.jpg" -o "planet-jupiter.jpg"

echo "⬇️  Downloading Saturn..."
curl -L "https://www.solarsystemscope.com/textures/download/2k_saturn.jpg" -o "planet-saturn.jpg"

echo ""
echo "✅ Downloaded 7 planet images!"
echo ""
echo "⚠️  MANUAL STEPS REQUIRED:"
echo "1. For Rahu (dragon head) and Ketu (dragon tail), download from:"
echo "   - The Noun Project: https://thenounproject.com/browse/icons/term/dragon-head/"
echo "   - Or Vecteezy: https://www.vecteezy.com/free-vector/naga-logo"
echo ""
echo "2. Save as:"
echo "   - planet-rahu.png (dragon head icon)"
echo "   - planet-ketu.png (dragon tail icon)"
echo ""
echo "3. Convert JPG planet images to PNG with transparency:"
echo "   Run: ./convert-to-png.sh"
echo ""
echo "License Attribution Required:"
echo "Images from Solar System Scope (CC BY 4.0)"
echo "https://www.solarsystemscope.com/textures/"
