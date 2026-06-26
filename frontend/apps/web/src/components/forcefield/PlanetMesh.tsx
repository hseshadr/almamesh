/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * PlanetMesh - one graha glyph in the force field.
 *
 * Ported from esoteric `aura/PlanetMesh.tsx`. Placement is the planet's TRUE
 * ecliptic longitude (shared `planetPosition`), so the scene reads as the chart
 * wheel. Cues added: combust -> desaturated glyph + faint "burnt" tint;
 * retrograde -> a small reversed-arc marker ring. Selection lifts the planet's
 * lowercase `id` (matches the 2D kundli `selectedPlanet` name) for 2D<->3D
 * cross-highlight.
 *
 * Keeps the GLSL CircularPlanetMaterial / ShadowNodeMaterial + glow.
 *
 * Note: @ts-nocheck — R3F9 intrinsic-element JSX clashes with React 19 typing.
 */

import { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, type ThreeEvent, extend } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { colors } from '@almamesh/constants';
import type { PlanetWave } from '@almamesh/shared-types';
import { planetPosition } from './placement';

// Observatory-token colours for the non-glyph cues (rings / labels).
const RING_FRIEND = colors.status.exalted; // verdant — friendly to the dasha
const RING_ENEMY = colors.status.debilitated; // dim red — hostile
const RING_NEUTRAL = colors.text.secondary; // muted brass-gray
const ORBIT_LINE = colors.text.secondary; // faint engraved orbit shell
const RETRO_MARK = colors.accent['gold-bright']; // brass retro arc
const LABEL_COLOR = colors.text.primary; // parchment label
const LABEL_OUTLINE = colors.background.darkest; // obsidian outline

class CircularPlanetMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        map: { value: null },
        glowColor: { value: new THREE.Color(1, 1, 1) },
        glowIntensity: { value: 0.4 },
        opacity: { value: 1.0 },
        isHovered: { value: 0.0 },
        isSelected: { value: 0.0 },
        desaturate: { value: 0.0 },
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
        uniform sampler2D map;
        uniform vec3 glowColor;
        uniform float glowIntensity;
        uniform float opacity;
        uniform float isHovered;
        uniform float isSelected;
        uniform float desaturate;
        uniform float time;
        varying vec2 vUv;

        void main() {
          vec2 centeredUv = (vUv - 0.5) * 2.0;
          float dist = length(centeredUv);
          if (dist > 1.0) discard;

          vec2 textureUv = vUv * 0.85 + 0.075;
          vec4 texColor = texture2D(map, textureUv);

          // Combust: pull texture toward its own luminance (desaturate / "burnt").
          float lum = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
          texColor.rgb = mix(texColor.rgb, vec3(lum), desaturate * 0.8);

          // Reconstruct a sphere normal from the disc so the flat billboard
          // reads as a lit 3D body (soft brass key from the upper-left).
          float z = sqrt(max(0.0, 1.0 - dist * dist));
          vec3 normal = normalize(vec3(centeredUv, z));
          vec3 lightDir = normalize(vec3(-0.5, 0.6, 0.85));
          float lambert = clamp(dot(normal, lightDir), 0.0, 1.0);
          float shade = 0.45 + 0.55 * lambert; // ambient floor + key
          texColor.rgb *= shade;

          float edgeSmoothness = 0.03;
          float alpha = 1.0 - smoothstep(1.0 - edgeSmoothness, 1.0, dist);

          // Fresnel-style rim that brightens the limb (lit-sphere terminator).
          float fresnel = pow(1.0 - z, 2.2);

          float glowStart = 0.7;
          float glowStrength = smoothstep(glowStart, 1.0, dist) * glowIntensity;
          glowStrength *= (1.0 + isHovered * 0.5 + isSelected * 0.8);
          float pulse = sin(time * 3.0) * 0.1 + 1.0;
          glowStrength *= mix(1.0, pulse, isSelected);

          vec3 finalColor = mix(texColor.rgb, glowColor, glowStrength * 0.6);
          finalColor += glowColor * fresnel * (0.28 + isHovered * 0.2 + isSelected * 0.2);

          // Dim non-selected planets when something else is selected handled in opacity.
          gl_FragColor = vec4(finalColor, alpha * opacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }
}
extend({ CircularPlanetMaterial });

class ShadowNodeMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        map: { value: null },
        nodeColor: { value: new THREE.Color(0.5, 0.5, 0.6) },
        opacity: { value: 1.0 },
        isHovered: { value: 0.0 },
        isSelected: { value: 0.0 },
        time: { value: 0.0 },
        isKetu: { value: 0.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        uniform vec3 nodeColor;
        uniform float opacity;
        uniform float isHovered;
        uniform float isSelected;
        uniform float time;
        uniform float isKetu;
        varying vec2 vUv;

        void main() {
          vec2 centeredUv = (vUv - 0.5) * 2.0;
          float dist = length(centeredUv);
          if (dist > 1.0) discard;

          vec4 texColor = texture2D(map, vUv);

          float angle = atan(centeredUv.y, centeredUv.x);
          float swirl = sin(angle * 6.0 + time * 2.0) * 0.1;
          float nebula = sin(dist * 10.0 - time * 1.5 + swirl) * 0.15 + 0.85;

          float edgeSmoothness = 0.05;
          float alpha = 1.0 - smoothstep(1.0 - edgeSmoothness, 1.0, dist);

          float outerGlow = smoothstep(0.6, 1.0, dist) * 0.8;
          float innerDark = 1.0 - smoothstep(0.0, 0.5, dist) * 0.3;

          vec3 rahuColor = vec3(0.4, 0.45, 0.6);
          vec3 ketuColor = vec3(0.6, 0.45, 0.35);
          vec3 baseColor = mix(rahuColor, ketuColor, isKetu);

          vec3 finalColor = texColor.rgb * nebula * innerDark;
          finalColor = mix(finalColor, baseColor, 0.4 + outerGlow * 0.3);
          finalColor += baseColor * outerGlow * (0.5 + isHovered * 0.3 + isSelected * 0.5);

          float shimmer = sin(time * 4.0 + dist * 8.0) * 0.05 * (isHovered + isSelected * 0.5);
          finalColor += vec3(shimmer);

          gl_FragColor = vec4(finalColor, alpha * opacity * max(texColor.a, 0.7));
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }
}
extend({ ShadowNodeMaterial });

interface PlanetMeshProps {
  planet: PlanetWave;
  time: number;
  onSelect?: (id: string) => void;
  isSelected?: boolean;
  isDimmed?: boolean;
  showLabel?: boolean;
  reducedMotion?: boolean;
  useRealLongitude?: boolean;
}

function getFriendlinessColor(friendliness: number): string {
  if (friendliness > 0.5) return RING_FRIEND;
  if (friendliness < -0.5) return RING_ENEMY;
  return RING_NEUTRAL;
}

const textureCache = new Map<string, THREE.Texture>();

function usePlanetTexture(planetId: string): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    const normalizedId = planetId.toLowerCase();
    if (textureCache.has(normalizedId)) {
      setTexture(textureCache.get(normalizedId)!);
      return;
    }
    const extension = normalizedId === 'rahu' || normalizedId === 'ketu' ? 'png' : 'jpg';
    const loader = new THREE.TextureLoader();
    loader.load(
      `/planets/planet-${normalizedId}.${extension}`,
      (loadedTexture) => {
        loadedTexture.colorSpace = THREE.SRGBColorSpace;
        loadedTexture.needsUpdate = true;
        textureCache.set(normalizedId, loadedTexture);
        setTexture(loadedTexture);
      },
      undefined,
      (error) => console.warn(`Failed to load planet texture for ${planetId}:`, error),
    );
  }, [planetId]);
  return texture;
}

export function PlanetMesh({
  planet,
  time,
  onSelect,
  isSelected = false,
  isDimmed = false,
  showLabel = true,
  reducedMotion = false,
  useRealLongitude = true,
}: PlanetMeshProps) {
  const planetMeshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const labelGroupRef = useRef<THREE.Group>(null);
  const friendlinessRingRef = useRef<THREE.Mesh>(null);
  const retroRingRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [hovered, setHovered] = useState(false);

  const isShadowNode = planet.id === 'rahu' || planet.id === 'ketu';
  const isKetu = planet.id === 'ketu';
  const texture = usePlanetTexture(planet.id);

  const planetColor = useMemo(
    () => new THREE.Color(planet.waveColor[0], planet.waveColor[1], planet.waveColor[2]),
    [planet.waveColor],
  );

  useEffect(() => {
    if (materialRef.current && texture) {
      materialRef.current.uniforms.map.value = texture;
      materialRef.current.uniforms.glowColor = { value: planetColor };
      materialRef.current.needsUpdate = true;
    }
  }, [texture, planetColor]);

  useFrame((state) => {
    const mesh = planetMeshRef.current;
    if (!mesh || !glowRef.current) return;

    const animTime = reducedMotion ? time : state.clock.elapsedTime;
    const { x, y, z } = planetPosition(planet, animTime, useRealLongitude);

    mesh.position.set(x, y, z);
    glowRef.current.position.set(x, y, z);
    mesh.quaternion.copy(state.camera.quaternion);

    if (labelGroupRef.current) labelGroupRef.current.position.set(x, y + 0.55, z);
    if (friendlinessRingRef.current) friendlinessRingRef.current.position.set(x, y - 0.05, z);
    if (retroRingRef.current) {
      retroRingRef.current.position.set(x, y - 0.05, z);
      retroRingRef.current.rotation.z = -animTime * 0.8; // reversed spin cue
    }

    const basePulse = 1 + Math.sin(animTime * planet.frequency * 2) * 0.1;
    const scale = (0.3 + planet.amplitude * 0.4) * basePulse;
    mesh.scale.setScalar(scale);
    glowRef.current.scale.setScalar(scale * (1.5 + planet.coherence * 0.5));

    if (materialRef.current) {
      materialRef.current.uniforms.time.value = animTime;
      materialRef.current.uniforms.isHovered.value = hovered ? 1.0 : 0.0;
      materialRef.current.uniforms.isSelected.value = isSelected ? 1.0 : 0.0;
      if ('desaturate' in materialRef.current.uniforms) {
        materialRef.current.uniforms.desaturate.value = planet.isCombust ? 1.0 : 0.0;
      }
      const baseOpacity = isSelected ? 1.0 : hovered ? 0.95 : 0.85;
      materialRef.current.uniforms.opacity.value = isDimmed ? baseOpacity * 0.35 : baseOpacity;
    }
  });

  const glowOpacity = 0.15 + planet.coherence * 0.2;
  const displayName = planet.id.charAt(0).toUpperCase() + planet.id.slice(1);
  const initialX = Math.cos((-planet.eclipticLongitude * Math.PI) / 180) * planet.orbitRadius;
  const initialZ = Math.sin((-planet.eclipticLongitude * Math.PI) / 180) * planet.orbitRadius;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[planet.orbitRadius - 0.02, planet.orbitRadius + 0.02, 64]} />
        <meshBasicMaterial color={ORBIT_LINE} transparent opacity={0.1} side={THREE.DoubleSide} />
      </mesh>

      <mesh ref={glowRef}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color={planetColor} transparent opacity={glowOpacity} depthWrite={false} />
      </mesh>

      <mesh
        key={`${planet.id}-${texture ? 'loaded' : 'loading'}`}
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
        {texture ? (
          isShadowNode ? (
            <shadowNodeMaterial
              ref={materialRef}
              attach="material"
              map={texture}
              isKetu={isKetu ? 1.0 : 0.0}
              opacity={isSelected ? 1.0 : hovered ? 0.95 : 0.85}
            />
          ) : (
            <circularPlanetMaterial
              ref={materialRef}
              attach="material"
              map={texture}
              glowColor={planetColor}
              glowIntensity={0.4 + planet.coherence * 0.3}
              desaturate={planet.isCombust ? 1.0 : 0.0}
              opacity={isSelected ? 1.0 : hovered ? 0.95 : 0.85}
            />
          )
        ) : (
          <meshBasicMaterial color={planetColor} transparent opacity={0.8} side={THREE.DoubleSide} />
        )}
      </mesh>

      {showLabel && (
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

      <mesh
        ref={friendlinessRingRef}
        position={[initialX, -0.05, initialZ]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0.4, 0.48, 32]} />
        <meshBasicMaterial
          color={getFriendlinessColor(planet.friendlinessToActive)}
          transparent
          opacity={hovered || isSelected ? 0.8 : 0.35}
        />
      </mesh>

      {planet.isRetrograde && (
        <mesh
          ref={retroRingRef}
          position={[initialX, -0.05, initialZ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          {/* Partial arc -> visually reads as the reversed retrograde loop. */}
          <ringGeometry args={[0.52, 0.58, 32, 1, 0, Math.PI * 1.4]} />
          <meshBasicMaterial color={RETRO_MARK} transparent opacity={0.7} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}
