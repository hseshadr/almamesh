#!/bin/bash
# Create placeholder dragon symbols for Rahu and Ketu
# These are simple SVG-based placeholders until you download proper icons

cd "$(dirname "$0")"

echo "Creating placeholder dragon symbols..."

# Create Rahu placeholder (dragon head - upward triangle with horns)
cat > planet-rahu-placeholder.svg << 'EOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <circle cx="256" cy="256" r="250" fill="#8B4513" opacity="0.9"/>
  <!-- Dragon head shape -->
  <path d="M 256 100 L 350 280 L 162 280 Z" fill="#D2691E" stroke="#8B4513" stroke-width="3"/>
  <!-- Eyes -->
  <circle cx="230" cy="220" r="15" fill="#FF0000"/>
  <circle cx="282" cy="220" r="15" fill="#FF0000"/>
  <!-- Horns -->
  <path d="M 200 180 L 180 100 L 220 160 Z" fill="#8B4513"/>
  <path d="M 312 180 L 332 100 L 292 160 Z" fill="#8B4513"/>
  <!-- Mouth -->
  <path d="M 220 250 Q 256 270 292 250" fill="none" stroke="#8B4513" stroke-width="4"/>
</svg>
EOF

# Create Ketu placeholder (dragon tail - downward triangle with spikes)
cat > planet-ketu-placeholder.svg << 'EOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <circle cx="256" cy="256" r="250" fill="#4682B4" opacity="0.9"/>
  <!-- Dragon tail shape -->
  <path d="M 256 412 L 162 232 L 350 232 Z" fill="#5F9EA0" stroke="#4682B4" stroke-width="3"/>
  <!-- Tail spikes -->
  <path d="M 200 280 L 180 230 L 220 260 Z" fill="#4682B4"/>
  <path d="M 256 320 L 240 270 L 272 270 Z" fill="#4682B4"/>
  <path d="M 312 280 L 332 230 L 292 260 Z" fill="#4682B4"/>
  <!-- Detail lines -->
  <line x1="256" y1="232" x2="256" y2="350" stroke="#4682B4" stroke-width="3"/>
</svg>
EOF

echo "✅ Created SVG placeholders"
echo ""
echo "Converting SVG to PNG..."

# Check if ImageMagick is installed
if command -v convert &> /dev/null; then
    convert planet-rahu-placeholder.svg -resize 512x512 -background none planet-rahu.png
    convert planet-ketu-placeholder.svg -resize 512x512 -background none planet-ketu.png
    echo "✅ Converted to PNG (512x512)"
    rm planet-rahu-placeholder.svg planet-ketu-placeholder.svg
else
    echo "⚠️  ImageMagick not installed. SVG placeholders created."
    echo "   Install ImageMagick: brew install imagemagick"
    echo "   Then run: convert planet-rahu-placeholder.svg planet-rahu.png"
    mv planet-rahu-placeholder.svg planet-rahu.svg
    mv planet-ketu-placeholder.svg planet-ketu.svg
fi

echo ""
echo "🐉 Placeholder dragon symbols created!"
echo ""
echo "⚠️  IMPORTANT: These are simple placeholders."
echo "   Replace with proper dragon icons from:"
echo "   - The Noun Project: https://thenounproject.com/browse/icons/term/dragon-head/"
echo "   - Vecteezy: https://www.vecteezy.com/free-vector/naga-logo"
