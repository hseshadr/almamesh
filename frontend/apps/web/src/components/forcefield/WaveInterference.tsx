/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * WaveInterference - Visualization of wave interference at the center
 *
 * Shows the combined effect of all planetary waves near the user:
 * - Constructive interference (friendly planets): Brighter, amplified glow
 * - Destructive interference (enemy planets): Dimmer, canceling effect
 * - Uses additive blending for glow effects
 *
 * The interference pattern is calculated from planet friendliness scores
 * and coherence values.
 *
 * Note: TypeScript checking is disabled for this file because React Three Fiber
 * JSX types are incompatible with React 19.
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { colors } from '@almamesh/constants';
import type { PlanetWave, AuraState } from '@almamesh/shared-types';

// Observatory tokens for the interference glow (constructive = brass-gold,
// destructive = lapis-indigo, balanced = warm ivory).
const FLUX_CONSTRUCTIVE = new THREE.Color(colors.accent['gold-bright']); // #E3B85A
const FLUX_DESTRUCTIVE = new THREE.Color(colors.accent.lapis); // #3A4FB0
const FLUX_BALANCED = new THREE.Color(colors.text.body); // #ECE6D8

// ============================================================================
// Types
// ============================================================================

interface WaveInterferenceProps {
  planets: PlanetWave[];
  aura: AuraState;
  time: number;
  reducedMotion?: boolean;
}

interface InterferencePoint {
  position: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  isConstructive: boolean;
}

// ============================================================================
// Helper: Calculate interference between two planet waves
// ============================================================================

function calculateInterference(
  planet1: PlanetWave,
  planet2: PlanetWave,
  time: number,
  centerPos: THREE.Vector3
): InterferencePoint | null {
  // Only show interference for planets with significant relationship
  const relationshipStrength = Math.abs(planet1.friendlinessToActive) +
    Math.abs(planet2.friendlinessToActive);

  if (relationshipStrength < 0.5) return null;

  // Calculate combined phase
  const phase1 = time * planet1.frequency + planet1.phaseShift;
  const phase2 = time * planet2.frequency + planet2.phaseShift;
  const phaseDiff = Math.abs(phase1 - phase2) % (2 * Math.PI);

  // Determine if constructive or destructive
  // Constructive: phases aligned (diff near 0 or 2*PI) AND both friendly
  // Destructive: phases opposed (diff near PI) OR one friendly + one enemy
  const isAligned = phaseDiff < Math.PI / 2 || phaseDiff > (3 * Math.PI / 2);
  const bothFriendly = planet1.friendlinessToActive > 0 && planet2.friendlinessToActive > 0;
  const bothEnemy = planet1.friendlinessToActive < 0 && planet2.friendlinessToActive < 0;
  const mixed = planet1.friendlinessToActive * planet2.friendlinessToActive < 0;

  const isConstructive = isAligned && (bothFriendly || bothEnemy);

  // Position: somewhere between center and midpoint of the two planet orbits
  const avgOrbitRadius = (planet1.orbitRadius + planet2.orbitRadius) / 2;
  const interferenceRadius = avgOrbitRadius * 0.25; // Close to center
  const angle = (Math.atan2(planet1.phase, planet2.phase) + time * 0.1) % (2 * Math.PI);

  const position = new THREE.Vector3(
    Math.cos(angle) * interferenceRadius,
    centerPos.y + Math.sin(time * 0.5) * 0.1,
    Math.sin(angle) * interferenceRadius
  );

  // Color blend of the two planets
  const color1 = new THREE.Color(planet1.waveColor[0], planet1.waveColor[1], planet1.waveColor[2]);
  const color2 = new THREE.Color(planet2.waveColor[0], planet2.waveColor[1], planet2.waveColor[2]);
  const blendedColor = color1.clone().lerp(color2, 0.5);

  // Adjust color based on interference type
  if (isConstructive) {
    blendedColor.offsetHSL(0, 0.1, 0.2); // Brighter
  } else if (mixed) {
    blendedColor.offsetHSL(0, -0.2, -0.1); // Dimmer
  }

  // Intensity based on amplitudes and coherence
  const combinedAmplitude = (planet1.amplitude + planet2.amplitude) / 2;
  const combinedCoherence = (planet1.coherence + planet2.coherence) / 2;
  const intensity = isConstructive
    ? combinedAmplitude * combinedCoherence * 1.5 // Amplify
    : combinedAmplitude * combinedCoherence * 0.3; // Reduce

  return {
    position,
    color: blendedColor,
    intensity,
    isConstructive,
  };
}

// ============================================================================
// Single Interference Glow Component
// ============================================================================

function InterferenceGlow({
  point,
  time,
  reducedMotion,
}: {
  point: InterferencePoint;
  time: number;
  reducedMotion: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current || !glowRef.current) return;

    const animTime = reducedMotion ? time : state.clock.elapsedTime;

    // Pulsing based on constructive vs destructive
    const pulseSpeed = point.isConstructive ? 2.0 : 1.0;
    const pulseAmount = point.isConstructive ? 0.3 : 0.1;
    const pulse = 1 + Math.sin(animTime * pulseSpeed) * pulseAmount;

    const scale = point.intensity * pulse * 0.4;
    meshRef.current.scale.setScalar(scale);
    glowRef.current.scale.setScalar(scale * 2);

    // Update position with slight drift
    meshRef.current.position.copy(point.position);
    glowRef.current.position.copy(point.position);
  });

  const opacity = point.isConstructive ? 0.6 : 0.2;
  const glowOpacity = point.isConstructive ? 0.3 : 0.1;

  return (
    <group>
      {/* Outer glow */}
      <mesh ref={glowRef} position={point.position}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial
          color={point.color}
          transparent
          opacity={glowOpacity}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Core */}
      <mesh ref={meshRef} position={point.position}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial
          color={point.color}
          emissive={point.color}
          emissiveIntensity={point.isConstructive ? 1.5 : 0.5}
          transparent
          opacity={opacity}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ============================================================================
// Central Interference Ring
// ============================================================================

function CentralInterferenceRing({
  aura: _aura,
  planets,
  time,
  reducedMotion,
}: {
  aura: AuraState;
  planets: PlanetWave[];
  time: number;
  reducedMotion: boolean;
}) {
  const ringRef = useRef<THREE.Mesh>(null);

  // Calculate net interference from all planets
  const netInterference = useMemo(() => {
    let constructive = 0;
    let destructive = 0;

    for (const planet of planets) {
      if (planet.friendlinessToActive > 0) {
        constructive += planet.amplitude * planet.coherence * planet.friendlinessToActive;
      } else {
        destructive += planet.amplitude * planet.coherence * Math.abs(planet.friendlinessToActive);
      }
    }

    return { constructive, destructive, net: constructive - destructive };
  }, [planets]);

  // Ring color based on net interference (observatory tokens).
  const ringColor = useMemo(() => {
    if (netInterference.net > 0.2) {
      // Constructive dominant - brass-gold glow.
      return FLUX_CONSTRUCTIVE.clone();
    } else if (netInterference.net < -0.2) {
      // Destructive dominant - lapis-indigo.
      return FLUX_DESTRUCTIVE.clone();
    }
    // Balanced - warm ivory.
    return FLUX_BALANCED.clone();
  }, [netInterference.net]);

  useFrame((state) => {
    if (!ringRef.current) return;

    const animTime = reducedMotion ? time : state.clock.elapsedTime;

    // Pulse and rotate
    const pulse = 1 + Math.sin(animTime * 1.5) * 0.1;
    ringRef.current.scale.setScalar(pulse);
    ringRef.current.rotation.z = animTime * 0.2;
  });

  const intensity = Math.abs(netInterference.net) * 0.5 + 0.2;

  return (
    <mesh
      ref={ringRef}
      position={[0, 0.4, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <ringGeometry args={[0.8, 0.95, 64]} />
      <meshBasicMaterial
        color={ringColor}
        transparent
        opacity={intensity}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function WaveInterference({
  planets,
  aura,
  time,
  reducedMotion = false,
}: WaveInterferenceProps) {
  const centerPos = useMemo(() => new THREE.Vector3(0, 0.4, 0), []);

  // Calculate interference points between planet pairs
  const interferencePoints = useMemo(() => {
    const points: InterferencePoint[] = [];

    // Only consider pairs of planets with significant interaction
    for (let i = 0; i < planets.length; i++) {
      for (let j = i + 1; j < planets.length; j++) {
        const point = calculateInterference(planets[i], planets[j], time, centerPos);
        if (point && point.intensity > 0.1) {
          points.push(point);
        }
      }
    }

    // Limit to top 5 most intense interference points
    return points
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, 5);
  }, [planets, time, centerPos]);

  return (
    <group>
      {/* Central interference ring showing net effect */}
      <CentralInterferenceRing
        aura={aura}
        planets={planets}
        time={time}
        reducedMotion={reducedMotion}
      />

      {/* Individual interference glow points */}
      {interferencePoints.map((point, index) => (
        <InterferenceGlow
          key={`interference-${index}`}
          point={point}
          time={time}
          reducedMotion={reducedMotion}
        />
      ))}

      {/* Ambient interference light */}
      <pointLight
        position={[0, 0.5, 0]}
        color={aura.netFlux > 0 ? FLUX_CONSTRUCTIVE : FLUX_DESTRUCTIVE}
        intensity={Math.abs(aura.netFlux) * 1.5}
        distance={3}
        decay={2}
      />
    </group>
  );
}
