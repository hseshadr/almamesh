/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * PlanetMesh - one graha glyph in the Living Astrolabe.
 *
 * Placement is the planet's TRUE ecliptic longitude (shared `planetPosition`),
 * so the scene reads as the chart wheel. The glyph is a token-coloured shaded
 * disc (the shader reconstructs a lit sphere from the flat billboard) — no
 * photo textures, one coherent engraved-astrolabe language. Rahu/Ketu get a
 * slow smoky swirl on the same material (tints promoted to
 * `colors.forcefield` design tokens).
 *
 * Focal hierarchy (see `astrolabe.ts`): the current dasha lords render larger,
 * full-opacity, with a gentle breath; the other seven recede and hold still.
 * Progressive disclosure: the label and the friendliness halo appear only on
 * hover/selection, and the label BILLBOARDS (copies the camera quaternion) so
 * it never renders edge-on under the auto-orbit. Combust -> desaturated disc.
 * Selection lifts the lowercase `id` for 2D<->3D cross-highlight.
 *
 * Note: @ts-nocheck — R3F9 intrinsic-element JSX clashes with React 19 typing.
 */

import { useRef, useState, useMemo, useEffect } from 'react';
import { useFrame, type ThreeEvent, extend } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { colors } from '@almamesh/constants';
import type { PlanetWave } from '@almamesh/shared-types';
import { planetPosition } from './placement';
import { labelVisible, type PlanetRole } from './astrolabe';

// Observatory-token colours for the non-glyph cues (halo / labels).
const RING_FRIEND = colors.status.exalted; // verdant — friendly to the dasha
const RING_ENEMY = colors.status.debilitated; // dim red — hostile
const RING_NEUTRAL = colors.text.secondary; // muted brass-gray
const LABEL_COLOR = colors.text.primary; // parchment label
const LABEL_OUTLINE = colors.background.darkest; // obsidian outline
const RAHU_TINT = new THREE.Color(colors.forcefield.rahuTint);
const KETU_TINT = new THREE.Color(colors.forcefield.ketuTint);

/**
 * One shader for all nine glyphs: a flat disc shaded as a lit sphere
 * (reconstructed normal + lambert + fresnel rim), tinted by the planet's
 * observatory token colour. `swirl` adds the slow smoky banding that marks
 * the shadow nodes.
 */
class AstrolabeDiscMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        baseColor: { value: new THREE.Color(1, 1, 1) },
        glowColor: { value: new THREE.Color(1, 1, 1) },
        glowIntensity: { value: 0.3 },
        opacity: { value: 1.0 },
        isHovered: { value: 0.0 },
        isSelected: { value: 0.0 },
        desaturate: { value: 0.0 },
        swirl: { value: 0.0 },
        time: { value: 0.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 baseColor;
        uniform vec3 glowColor;
        uniform float glowIntensity;
        uniform float opacity;
        uniform float isHovered;
        uniform float isSelected;
        uniform float desaturate;
        uniform float swirl;
        uniform float time;
        varying vec2 vUv;

        void main() {
          vec2 centeredUv = (vUv - 0.5) * 2.0;
          float dist = length(centeredUv);
          if (dist > 1.0) discard;

          // Reconstruct a sphere normal from the disc so the flat billboard
          // reads as a lit 3D body (soft brass key from the upper-left).
          float z = sqrt(max(0.0, 1.0 - dist * dist));
          vec3 normal = normalize(vec3(centeredUv, z));
          vec3 lightDir = normalize(vec3(-0.5, 0.6, 0.85));
          float lambert = clamp(dot(normal, lightDir), 0.0, 1.0);
          float shade = 0.42 + 0.58 * lambert;
          vec3 col = baseColor * shade;

          // Shadow-node smoke: slow subtle banding, only when swirl = 1.
          float angle = atan(centeredUv.y, centeredUv.x);
          float band = sin(angle * 5.0 + dist * 7.0 - time * 0.6) * 0.5 + 0.5;
          col *= mix(1.0, 0.82 + band * 0.24, swirl);

          // Combust: pull toward luminance (the "burnt" graha).
          float lum = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(col, vec3(lum), desaturate * 0.8);

          // Rim light on the limb — the only glow; bloom lifts it gently.
          float fresnel = pow(1.0 - z, 2.2);
          col += glowColor * fresnel * (glowIntensity + isHovered * 0.25 + isSelected * 0.4);

          float alpha = (1.0 - smoothstep(0.97, 1.0, dist)) * opacity;
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }
}
extend({ AstrolabeDiscMaterial });

interface PlanetMeshProps {
  planet: PlanetWave;
  time: number;
  /** Visual role under the current dasha lords (scale/opacity/pulse). */
  role: PlanetRole;
  /** Entrance reveal 0..1 (sequential fade/scale-in by longitude). */
  reveal?: number;
  onSelect?: (id: string) => void;
  isSelected?: boolean;
  isDimmed?: boolean;
  /** Parent-gated label visibility (selection); hover reveals it locally. */
  showLabel?: boolean;
  reducedMotion?: boolean;
  useRealLongitude?: boolean;
}

function getFriendlinessColor(friendliness: number): string {
  if (friendliness > 0.5) return RING_FRIEND;
  if (friendliness < -0.5) return RING_ENEMY;
  return RING_NEUTRAL;
}

export function PlanetMesh({
  planet,
  time,
  role,
  reveal = 1,
  onSelect,
  isSelected = false,
  isDimmed = false,
  showLabel = false,
  reducedMotion = false,
  useRealLongitude = true,
}: PlanetMeshProps) {
  const planetMeshRef = useRef<THREE.Mesh>(null);
  const labelGroupRef = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [hovered, setHovered] = useState(false);

  const isShadowNode = planet.id === 'rahu' || planet.id === 'ketu';

  const planetColor = useMemo(() => {
    if (planet.id === 'rahu') return RAHU_TINT.clone();
    if (planet.id === 'ketu') return KETU_TINT.clone();
    return new THREE.Color(planet.waveColor[0], planet.waveColor[1], planet.waveColor[2]);
  }, [planet.id, planet.waveColor]);

  // ShaderMaterial subclasses do NOT map JSX props onto uniforms — every
  // uniform must be written imperatively (the slow-changing ones here, the
  // per-frame ones in useFrame below).
  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.baseColor.value = planetColor;
    material.uniforms.glowColor.value = planetColor;
    material.uniforms.glowIntensity.value = role.isLord ? 0.5 : 0.24;
    material.uniforms.swirl.value = isShadowNode ? 1.0 : 0.0;
  }, [planetColor, role.isLord, isShadowNode]);

  useFrame((state) => {
    const mesh = planetMeshRef.current;
    if (!mesh) return;

    const animTime = reducedMotion ? time : state.clock.elapsedTime;
    const { x, y, z } = planetPosition(planet, animTime, useRealLongitude);

    mesh.position.set(x, y, z);
    mesh.quaternion.copy(state.camera.quaternion);

    if (labelGroupRef.current) {
      labelGroupRef.current.position.set(x, y + 0.55, z);
      // BILLBOARD the label — the auto-orbit rotates the camera, so a static
      // orientation would render the text edge-on / mirrored.
      labelGroupRef.current.quaternion.copy(state.camera.quaternion);
    }
    if (haloRef.current) haloRef.current.position.set(x, y - 0.05, z);

    // Motion economy: only the dasha lords breathe; the field holds still.
    const pulse = 1 + Math.sin(animTime * 1.1) * role.pulseAmplitude;
    const revealScale = 0.4 + 0.6 * reveal;
    const scale = (0.3 + planet.amplitude * 0.4) * role.scale * pulse * revealScale;
    mesh.scale.setScalar(scale);

    if (materialRef.current) {
      materialRef.current.uniforms.time.value = animTime;
      materialRef.current.uniforms.isHovered.value = hovered ? 1.0 : 0.0;
      materialRef.current.uniforms.isSelected.value = isSelected ? 1.0 : 0.0;
      materialRef.current.uniforms.desaturate.value = planet.isCombust ? 1.0 : 0.0;
      const baseOpacity = isSelected ? 1.0 : hovered ? Math.min(role.opacity + 0.25, 1) : role.opacity;
      const dimFactor = isDimmed ? 0.35 : 1;
      materialRef.current.uniforms.opacity.value = baseOpacity * dimFactor * reveal;
    }
  });

  const displayName = planet.id.charAt(0).toUpperCase() + planet.id.slice(1);
  const initialX = Math.cos((-planet.eclipticLongitude * Math.PI) / 180) * planet.orbitRadius;
  const initialZ = Math.sin((-planet.eclipticLongitude * Math.PI) / 180) * planet.orbitRadius;
  const revealLabel = labelVisible(hovered, showLabel || isSelected);
  const revealHalo = labelVisible(hovered, isSelected);

  return (
    <group>
      <mesh
        ref={planetMeshRef}
        scale={[1, 1, 1]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelect?.(planet.id);
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'default';
        }}
      >
        <planeGeometry args={[1, 1]} />
        <astrolabeDiscMaterial ref={materialRef} attach="material" />
      </mesh>

      {/* Progressive disclosure: label only on hover / selection. */}
      {revealLabel && (
        <group ref={labelGroupRef} position={[initialX, 0.55, initialZ]}>
          <Text
            font="/fonts/HankenGrotesk-Bold.ttf"
            fontSize={0.2}
            color={LABEL_COLOR}
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.025}
            outlineColor={LABEL_OUTLINE}
            fontWeight="bold"
          >
            {planet.isRetrograde ? `${displayName} (R)` : displayName}
          </Text>
        </group>
      )}

      {/* Friendliness halo — hover/selection-only detail, not ambient noise. */}
      {revealHalo && (
        <mesh
          ref={haloRef}
          position={[initialX, -0.05, initialZ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.42, 0.5, 32]} />
          <meshBasicMaterial
            color={getFriendlinessColor(planet.friendlinessToActive)}
            transparent
            opacity={0.8}
          />
        </mesh>
      )}
    </group>
  );
}
