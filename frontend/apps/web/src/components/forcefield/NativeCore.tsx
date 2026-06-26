/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * NativeCore - the central "native" energy core (renamed from esoteric
 * `AuraSphere`). No OAuth avatar: the centre is a lagna-tinted Fresnel/rim-lit
 * core that pulses with `aura.glow` and tints by `aura.color`. Energy-pulse
 * rings respond to incoming wave flux exactly as before.
 *
 * Note: @ts-nocheck — R3F9 intrinsic-element JSX clashes with React 19 typing.
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AuraState } from '@almamesh/shared-types';

interface NativeCoreProps {
  aura: AuraState;
  time: number;
  reducedMotion?: boolean;
  /** Lagna (ascendant) tint, RGB 0-1, identifies "the native". */
  lagnaColor?: [number, number, number];
  /** Number of active planet waves for pulse intensity. */
  activePlanetCount?: number;
}

function EnergyPulseRing({
  color,
  netFlux,
  activePlanetCount,
  reducedMotion,
}: {
  color: THREE.Color;
  netFlux: number;
  activePlanetCount: number;
  reducedMotion: boolean;
}) {
  const r1 = useRef<THREE.Mesh>(null);
  const r2 = useRef<THREE.Mesh>(null);
  const r3 = useRef<THREE.Mesh>(null);
  const m1 = useRef<THREE.MeshBasicMaterial>(null);
  const m2 = useRef<THREE.MeshBasicMaterial>(null);
  const m3 = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    if (reducedMotion) return;
    const time = state.clock.elapsedTime;
    const baseFrequency = 0.8 + activePlanetCount * 0.15;
    const pulseIntensity = 0.3 + Math.abs(netFlux) * 0.5;
    const phases = [0, Math.PI * 0.67, Math.PI * 1.33];
    const rings = [r1, r2, r3];
    const mats = [m1, m2, m3];
    rings.forEach((ringRef, index) => {
      if (!ringRef.current) return;
      const pulseCycle =
        ((time * baseFrequency + phases[index]) % (Math.PI * 2)) / (Math.PI * 2);
      ringRef.current.scale.setScalar(0.8 + pulseCycle * 0.7);
      const matRef = mats[index];
      if (matRef.current) matRef.current.opacity = (1 - pulseCycle) * pulseIntensity * 0.4;
    });
  });

  return (
    <group position={[0, 0.4, 0]}>
      <mesh ref={r1} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 0.95, 64]} />
        <meshBasicMaterial ref={m1} color={color} transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={r2} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 0.95, 64]} />
        <meshBasicMaterial ref={m2} color={color} transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={r3} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 0.95, 64]} />
        <meshBasicMaterial ref={m3} color={color} transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function NativeCore({
  aura,
  time,
  reducedMotion = false,
  lagnaColor,
  activePlanetCount = 9,
}: NativeCoreProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const innerMeshRef = useRef<THREE.Mesh>(null);

  const auraColor = useMemo(
    () => new THREE.Color(aura.color[0], aura.color[1], aura.color[2]),
    [aura.color],
  );

  // The native's identity tint = lagna sign colour; falls back to the aura hue.
  const coreColor = useMemo(() => {
    if (!lagnaColor) return auraColor.clone();
    return new THREE.Color(lagnaColor[0], lagnaColor[1], lagnaColor[2]);
  }, [lagnaColor, auraColor]);

  const innerColor = useMemo(() => coreColor.clone().offsetHSL(0, 0, 0.1), [coreColor]);

  useFrame((state) => {
    if (!meshRef.current || !innerMeshRef.current) return;
    const animTime = reducedMotion ? time : state.clock.elapsedTime;
    const pulseSpeed = 0.5 + (1 - aura.stability) * 1.5;
    const pulseAmount = 0.05 + (1 - aura.stability) * 0.1;
    const pulse = 1 + Math.sin(animTime * pulseSpeed) * pulseAmount;
    const scale = aura.baseRadius * pulse;
    meshRef.current.scale.setScalar(scale);
    const innerPulse = 1 + Math.sin(animTime * pulseSpeed + Math.PI) * pulseAmount * 0.5;
    innerMeshRef.current.scale.setScalar(scale * 0.85 * innerPulse);
    if (!reducedMotion) {
      meshRef.current.rotation.y += 0.001;
      innerMeshRef.current.rotation.y -= 0.0015;
    }
  });

  const outerOpacity = 0.18 + aura.glow * 0.28;
  const innerOpacity = 0.12 + aura.glow * 0.18;
  const emissiveIntensity = 0.35 + Math.abs(aura.netFlux) * 0.45;

  return (
    <group>
      {/* Solid lagna-tinted nucleus (replaces the OAuth avatar disk). */}
      <mesh>
        <icosahedronGeometry args={[0.45, 2]} />
        <meshStandardMaterial
          color={coreColor}
          emissive={coreColor}
          emissiveIntensity={emissiveIntensity * 1.5}
          roughness={0.35}
          metalness={0.2}
        />
      </mesh>

      <EnergyPulseRing
        color={auraColor}
        netFlux={aura.netFlux}
        activePlanetCount={activePlanetCount}
        reducedMotion={reducedMotion}
      />

      {/* Lagna marker ground ring. */}
      <mesh position={[0, -0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.35, 32]} />
        <meshBasicMaterial color={coreColor} transparent opacity={0.5} />
      </mesh>

      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1.2, 3]} />
        <meshStandardMaterial
          color={auraColor}
          emissive={auraColor}
          emissiveIntensity={emissiveIntensity}
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
          emissiveIntensity={emissiveIntensity * 1.3}
          transparent
          opacity={innerOpacity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      <pointLight color={auraColor} intensity={aura.glow * 2} distance={5} decay={2} />
    </group>
  );
}
