/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * WaveBeam - Animated sine wave from a planet to the native core.
 *
 * Ported from esoteric `aura/WaveBeam.tsx`. Origin is now the planet's TRUE
 * ecliptic-longitude position (via shared `planetPosition`). Semantics added:
 * - retrograde -> wave flows OUTWARD (reversed) instead of toward the core
 * - combust    -> beam colour desaturated (the "burnt" graha)
 * - friend/enemy -> opacity & secondary-wave strength from coherence
 *
 * PERFORMANCE: direct BufferAttribute mutation in useFrame (no React state).
 *
 * Note: @ts-nocheck — R3F9 intrinsic-element JSX clashes with React 19 typing.
 */

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlanetWave } from '@almamesh/shared-types';
import { CENTER_Y, planetPosition } from './placement';

interface WaveBeamProps {
  planet: PlanetWave;
  time: number;
  reducedMotion?: boolean;
  useRealLongitude?: boolean;
  targetPosition?: THREE.Vector3;
}

const WAVE_SEGMENTS = 100;
const BASE_AMPLITUDE = 0.12;
const FREQUENCY_MULTIPLIER = 3.5;
const FLOW_SPEED = 0.12;

/** Desaturate a colour toward grey (used for combust planets). */
function desaturate(color: THREE.Color, amount: number): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  return color.clone().setHSL(hsl.h, hsl.s * (1 - amount), hsl.l);
}

export function WaveBeam({
  planet,
  time,
  reducedMotion = false,
  useRealLongitude = true,
  targetPosition = new THREE.Vector3(0, CENTER_Y, 0),
}: WaveBeamProps) {
  const phaseRef = useRef(0);
  const lineRef = useRef<THREE.Line>(null);
  const glowLineRef = useRef<THREE.Line>(null);
  const secondaryLineRef = useRef<THREE.Line>(null);

  const waveColor = useMemo(() => {
    const base = new THREE.Color(
      planet.waveColor[0],
      planet.waveColor[1],
      planet.waveColor[2],
    );
    return planet.isCombust ? desaturate(base, 0.7) : base;
  }, [planet.waveColor, planet.isCombust]);

  const opacity = (0.5 + planet.coherence * 0.4) * (planet.isCombust ? 0.6 : 1);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array((WAVE_SEGMENTS + 1) * 3), 3),
    );
    return geo;
  }, []);
  const secondaryGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array((WAVE_SEGMENTS + 1) * 3), 3),
    );
    return geo;
  }, []);
  const glowGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array((WAVE_SEGMENTS + 1) * 3), 3),
    );
    return geo;
  }, []);

  const mainMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: waveColor,
        transparent: true,
        opacity,
        depthWrite: false,
      }),
    [waveColor, opacity],
  );
  const secondaryMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: waveColor,
        transparent: true,
        opacity: opacity * 0.6,
        depthWrite: false,
      }),
    [waveColor, opacity],
  );
  const glowMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: waveColor,
        transparent: true,
        opacity: opacity * 0.2,
        depthWrite: false,
      }),
    [waveColor, opacity],
  );

  const mainLine = useMemo(() => new THREE.Line(geometry, mainMaterial), [geometry, mainMaterial]);
  const secondaryLine = useMemo(
    () => new THREE.Line(secondaryGeometry, secondaryMaterial),
    [secondaryGeometry, secondaryMaterial],
  );
  const glowLine = useMemo(() => new THREE.Line(glowGeometry, glowMaterial), [glowGeometry, glowMaterial]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      secondaryGeometry.dispose();
      glowGeometry.dispose();
      mainMaterial.dispose();
      secondaryMaterial.dispose();
      glowMaterial.dispose();
    };
  }, [geometry, secondaryGeometry, glowGeometry, mainMaterial, secondaryMaterial, glowMaterial]);

  useFrame((state) => {
    const animTime = reducedMotion ? time : state.clock.elapsedTime;

    const { x, y, z } = planetPosition(planet, animTime, useRealLongitude);
    const planetPos = new THREE.Vector3(x, y, z);

    // Wave flow: toward core normally, OUTWARD when retrograde.
    if (!reducedMotion) {
      phaseRef.current += planet.isRetrograde ? FLOW_SPEED : -FLOW_SPEED;
    }

    const direction = new THREE.Vector3().subVectors(targetPosition, planetPos);
    const distance = direction.length();
    direction.normalize();

    const up = new THREE.Vector3(0, 1, 0);
    const perpendicular = new THREE.Vector3().crossVectors(direction, up).normalize();
    if (perpendicular.length() < 0.1) perpendicular.set(1, 0, 0);

    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    const secondaryPositions = secondaryGeometry.getAttribute('position') as THREE.BufferAttribute;
    const glowPositions = glowGeometry.getAttribute('position') as THREE.BufferAttribute;

    const amplitude = BASE_AMPLITUDE * planet.amplitude;
    const frequency = planet.frequency * FREQUENCY_MULTIPLIER;

    for (let i = 0; i <= WAVE_SEGMENTS; i++) {
      const t = i / WAVE_SEGMENTS;
      const baseX = planetPos.x + direction.x * distance * t;
      const baseY = planetPos.y + direction.y * distance * t;
      const baseZ = planetPos.z + direction.z * distance * t;

      const taper = Math.min(t * 4, 1.0) * Math.min((1 - t) * 3, 1.0);
      const effectiveAmplitude = amplitude * taper;

      const wavePhase = t * Math.PI * 2 * frequency + phaseRef.current;
      const waveOffset = Math.sin(wavePhase) * effectiveAmplitude;
      const secondaryOffset = Math.sin(wavePhase + Math.PI * 0.5) * effectiveAmplitude * 0.7;

      positions.setXYZ(
        i,
        baseX + perpendicular.x * waveOffset,
        baseY + perpendicular.y * waveOffset,
        baseZ + perpendicular.z * waveOffset,
      );
      secondaryPositions.setXYZ(
        i,
        baseX + perpendicular.x * secondaryOffset,
        baseY + 0.03 + perpendicular.y * secondaryOffset,
        baseZ + perpendicular.z * secondaryOffset,
      );
      glowPositions.setXYZ(
        i,
        baseX + perpendicular.x * waveOffset,
        baseY + perpendicular.y * waveOffset,
        baseZ + perpendicular.z * waveOffset,
      );
    }

    positions.needsUpdate = true;
    secondaryPositions.needsUpdate = true;
    glowPositions.needsUpdate = true;
  });

  return (
    <group>
      <primitive object={glowLine} ref={glowLineRef} />
      <primitive object={secondaryLine} ref={secondaryLineRef} />
      <primitive object={mainLine} ref={lineRef} />
    </group>
  );
}
