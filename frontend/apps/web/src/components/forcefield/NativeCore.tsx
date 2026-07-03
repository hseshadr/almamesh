/**
 * NativeCore - the single hero of the Living Astrolabe.
 *
 * The centre is a lagna-tinted Fresnel/rim-lit nucleus wrapped in two soft
 * aura shells, plus ONE expanding flux ring. The old three EnergyPulseRings +
 * the separate CentralInterferenceRing are merged into that single ring
 * system: its colour carries the aura's net flux (brass = constructive,
 * lapis = destructive, ivory = balanced — `colors.forcefield` tokens) and its
 * rate comes from `ringRateFromNetFlux` (≤ 0.5 rad/s, decoupled from planet
 * count) so the core breathes instead of strobing.
 *
 * `ignition` (0..1) drives the entrance: the core scales/brightens in first.
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { colors } from '@almamesh/constants';
import type { AuraState, RGBColor } from '@almamesh/shared-types';
import { ringRateFromNetFlux } from './astrolabe';

const FLUX_CONSTRUCTIVE = new THREE.Color(colors.forcefield.fluxConstructive);
const FLUX_DESTRUCTIVE = new THREE.Color(colors.forcefield.fluxDestructive);
const FLUX_BALANCED = new THREE.Color(colors.forcefield.fluxBalanced);

interface NativeCoreProps {
  aura: AuraState;
  time: number;
  reducedMotion?: boolean;
  /** Lagna (ascendant) tint, RGB 0-1, identifies "the native". */
  lagnaColor?: RGBColor;
  /** Entrance ignition 0..1 (1 = fully lit). */
  ignition?: number;
}

/**
 * Net-flux colour from the observatory tokens — a CONTINUOUS lapis→brass lerp
 * (netFlux oscillates each frame; discrete state bands would pop). A touch of
 * ivory softens the balanced middle.
 */
function fluxColor(netFlux: number): THREE.Color {
  const t = (Math.max(-1, Math.min(1, netFlux)) + 1) / 2;
  const c = FLUX_DESTRUCTIVE.clone().lerp(FLUX_CONSTRUCTIVE, t);
  return c.lerp(FLUX_BALANCED, 0.12 * (1 - Math.abs(Math.max(-1, Math.min(1, netFlux)))));
}

/**
 * The ONE ring system: a single ring expanding outward and fading, colour +
 * rate carrying the net flux. Calm by construction (rate capped at 0.5 rad/s).
 */
function FluxRing({
  color,
  netFlux,
  intensity,
  time,
  reducedMotion,
}: {
  color: THREE.Color;
  netFlux: number;
  intensity: number;
  time: number;
  reducedMotion: boolean;
}) {
  const ringRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const rate = ringRateFromNetFlux(netFlux);

  useFrame((state) => {
    if (!ringRef.current || !matRef.current) return;
    const animTime = reducedMotion ? time : state.clock.elapsedTime;
    // One angular cycle at `rate` rad/s -> one slow outward wash.
    const cycle = reducedMotion
      ? 0.35
      : ((animTime * rate) % (Math.PI * 2)) / (Math.PI * 2);
    ringRef.current.scale.setScalar(0.9 + cycle * 1.1);
    matRef.current.opacity = (1 - cycle) * intensity;
  });

  return (
    <mesh ref={ringRef} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Starts just outside the aura shells so the wash reads as radiating. */}
      <ringGeometry args={[1.5, 1.56, 64]} />
      <meshBasicMaterial
        ref={matRef}
        color={color}
        transparent
        opacity={intensity}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

export function NativeCore({
  aura,
  time,
  reducedMotion = false,
  lagnaColor,
  ignition = 1,
}: NativeCoreProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const innerMeshRef = useRef<THREE.Mesh>(null);

  // The native's identity tint = lagna sign colour; falls back to warm brass.
  const coreColor = useMemo(() => {
    if (!lagnaColor) return FLUX_CONSTRUCTIVE.clone();
    return new THREE.Color(lagnaColor[0], lagnaColor[1], lagnaColor[2]);
  }, [lagnaColor]);

  const shellColor = useMemo(() => fluxColor(aura.netFlux), [aura.netFlux]);
  const innerColor = useMemo(
    () => shellColor.clone().offsetHSL(0, 0, 0.08),
    [shellColor],
  );

  useFrame((state) => {
    if (!meshRef.current || !innerMeshRef.current) return;
    const animTime = reducedMotion ? time : state.clock.elapsedTime;
    // Calm breath — slow, small, stability-eased.
    const pulseSpeed = 0.4 + (1 - aura.stability) * 0.5;
    const pulseAmount = 0.04 + (1 - aura.stability) * 0.05;
    const pulse = 1 + Math.sin(animTime * pulseSpeed) * pulseAmount;
    const scale = aura.baseRadius * pulse * (0.55 + 0.45 * ignition);
    meshRef.current.scale.setScalar(scale);
    const innerPulse = 1 + Math.sin(animTime * pulseSpeed + Math.PI) * pulseAmount * 0.5;
    innerMeshRef.current.scale.setScalar(scale * 0.85 * innerPulse);
    if (!reducedMotion) {
      meshRef.current.rotation.y += 0.001;
      innerMeshRef.current.rotation.y -= 0.0015;
    }
  });

  const outerOpacity = (0.07 + aura.glow * 0.11) * ignition;
  const innerOpacity = (0.05 + aura.glow * 0.09) * ignition;
  const emissiveIntensity = (0.35 + Math.abs(aura.netFlux) * 0.45) * ignition;
  const ringIntensity = (0.4 + Math.abs(aura.netFlux) * 0.25) * ignition;

  return (
    <group>
      {/* Solid lagna-tinted nucleus — the native's identity, bright enough to
          catch the bloom pass and read as the single radiant focal point. */}
      <mesh scale={0.4 + 0.6 * ignition}>
        <icosahedronGeometry args={[0.45, 2]} />
        <meshStandardMaterial
          color={coreColor}
          emissive={coreColor}
          emissiveIntensity={emissiveIntensity * 3.2}
          roughness={0.35}
          metalness={0.2}
        />
      </mesh>

      <FluxRing
        color={shellColor}
        netFlux={aura.netFlux}
        intensity={ringIntensity}
        time={time}
        reducedMotion={reducedMotion}
      />

      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1.2, 3]} />
        <meshStandardMaterial
          color={shellColor}
          emissive={shellColor}
          emissiveIntensity={emissiveIntensity * 1.6}
          transparent
          opacity={outerOpacity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      <mesh ref={innerMeshRef}>
        <icosahedronGeometry args={[1, 2]} />
        <meshStandardMaterial
          color={innerColor}
          emissive={innerColor}
          emissiveIntensity={emissiveIntensity * 2}
          transparent
          opacity={innerOpacity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      <pointLight
        color={shellColor}
        intensity={aura.glow * 2 * ignition}
        distance={5}
        decay={2}
      />
    </group>
  );
}
