# Planet Images for Energy Aura Visualization

This directory contains planet textures used for the 3D Energy Aura visualization.

## Current Status

✅ **Downloaded (7 planets):**
- planet-sun.jpg (803 KB)
- planet-moon.jpg (1.0 MB)
- planet-mercury.jpg (852 KB)
- planet-venus.jpg (224 KB) - atmosphere view
- planet-mars.jpg (733 KB)
- planet-jupiter.jpg (487 KB)
- planet-saturn.jpg (195 KB)

⚠️ **Still Needed (2 shadow planets):**
- planet-rahu.png (dragon head icon)
- planet-ketu.png (dragon tail icon)

## Image Format

The downloaded planet images are **equirectangular texture maps** (2048x1024px) from Solar System Scope. These are designed for wrapping around 3D spheres.

For **2D sprite billboards**, these will work but may show some distortion. If you want better quality:

### Option A: Use Current Images (Quick)
The existing JPG files will work with Three.js TextureLoader on sprite billboards. The equirectangular distortion won't be very noticeable on small billboards.

### Option B: Get Circular Planet Renders (Better Quality)
Download pre-rendered circular planet images (512x512 or 1024x1024 PNG with transparent backgrounds):

**Recommended Sources:**
1. **Vecteezy**: https://www.vecteezy.com/free-png/planets
   - Search for "planets PNG transparent"
   - Download individual planet PNGs

2. **NASA Image Gallery**: https://science.nasa.gov/gallery/our-solar-system-images/
   - High-quality official NASA images
   - Will need background removal

3. **Flaticon**: https://www.flaticon.com/search?word=planets
   - Stylized planet icons
   - Pre-made circular designs

## Dragon Symbols for Rahu & Ketu

Rahu and Ketu are **shadow planets** in Vedic astrology, traditionally represented as a dragon/serpent (naga) with:
- **Rahu**: Dragon HEAD (the ascending lunar node)
- **Ketu**: Dragon TAIL (the descending lunar node)

### Download Sources:

**The Noun Project** (Best Quality):
- Dragon Head: https://thenounproject.com/icon/dragon-head-2602075/
- Dragon Head: https://thenounproject.com/icon/dragon-head-100463/
- Dragon Head: https://thenounproject.com/icon/dragon-head-5374958/

**Vecteezy** (Free Vectors):
- Search: https://www.vecteezy.com/free-vector/naga-logo
- Download dragon head and tail SVGs

**Flaticon** (Icons):
- Dragon: https://www.flaticon.com/search?word=dragon%20head
- Serpent: https://www.flaticon.com/search?word=serpent

### Requirements:
- **Format**: PNG with transparent background
- **Size**: 512x512 or 1024x1024 pixels
- **Style**: Traditional serpent/naga iconography preferred
- **Naming**:
  - Save dragon head as: `planet-rahu.png`
  - Save dragon tail as: `planet-ketu.png`

## Scripts

### `download-images.sh`
Downloads the 7 planet texture maps from Solar System Scope.

### `convert-to-png.sh`
Converts JPG textures to PNG format (requires ImageMagick).
**Note**: This creates square PNGs but they'll still have equirectangular distortion.

## License Attribution

**Planet Textures**: Solar System Scope (CC BY 4.0)
- Source: https://www.solarsystemscope.com/textures/
- License: Creative Commons Attribution 4.0 International
- Free for any purpose including commercial use

**Dragon Icons**: Varies by source
- The Noun Project: Requires attribution or Pro subscription
- Vecteezy: Check individual asset licenses
- Flaticon: Requires attribution unless Premium

## Next Steps

1. ✅ Planet textures downloaded
2. ⏳ Download dragon head icon → save as `planet-rahu.png`
3. ⏳ Download dragon tail icon → save as `planet-ketu.png`
4. ⏳ (Optional) Replace planet JPGs with circular PNG renders
5. ⏳ Implement sprite billboard rendering in `PlanetMesh.tsx`

## Usage in Code

The images will be loaded via Three.js TextureLoader:

```typescript
const texture = new THREE.TextureLoader().load(`/planets/planet-${planetId}.png`);
texture.colorSpace = THREE.SRGBColorSpace;
```

The implementation will automatically fall back to colored circles if textures fail to load.
