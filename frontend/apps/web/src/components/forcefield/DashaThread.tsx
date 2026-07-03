/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * DashaThread - one visible thread from a dasha lord (or the strongest
 * discordant planet) to the native core. Replaces the 27 one-pixel WaveBeam
 * polylines: at most three threads render (see `selectThreads`), each a real
 * TubeGeometry arc with a traveling pulse, so the chart's true signal — WHO
 * rules this moment — is the only thing that draws lines to the core.
 *
 * Semantics preserved from the old beams:
 * - retrograde -> the pulse travels OUTWARD (core -> planet) instead of inward
 * - combust    -> thread colour desaturated (the "burnt" graha)
 * - discord    -> thinner, dimmer thread tinted toward the debilitated token
 *
 * Entrance: `drawProgress` (0..1) draws the tube in from the planet toward the
 * core with the pulse riding the tip.
 *
 * Note: @ts-nocheck — R3F9 intrinsic-element JSX clashes with React 19 typing.
 */

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { colors } from '@almamesh/constants';
import type { PlanetWave } from '@almamesh/shared-types';
import { CENTER_Y, planetPosition } from './placement';
import type { ThreadKind } from './astrolabe';

interface DashaThreadProps {
  planet: PlanetWave;
  kind: ThreadKind;
  time: number;
  reducedMotion?: boolean;
  /** Entrance draw-in 0..1 (1 = fully drawn). */
  drawProgress?: number;
}

/** Per-kind visual weight — maha dominates, antar seconds, discord whispers. */
const KIND_STYLE: Record<
  ThreadKind,
  { radius: number; opacity: number; pulseSize: number; speed: number; phase: number }
> = {
  maha: { radius: 0.04, opacity: 0.55, pulseSize: 0.11, speed: 0.16, phase: 0 },
  antar: { radius: 0.026, opacity: 0.5, pulseSize: 0.085, speed: 0.19, phase: 0.4 },
  discord: { radius: 0.016, opacity: 0.32, pulseSize: 0.065, speed: 0.13, phase: 0.7 },
};

const DISCORD_TINT = new THREE.Color(colors.status.debilitated);
const TUBE_SEGMENTS = 64;

/** Desaturate a colour toward grey (used for combust planets). */
function desaturate(color: THREE.Color, amount: number): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  return color.clone().setHSL(hsl.h, hsl.s * (1 - amount), hsl.l);
}

export function DashaThread({
  planet,
  kind,
  time,
  reducedMotion = false,
  drawProgress = 1,
}: DashaThreadProps) {
  const pulseRef = useRef<THREE.Mesh>(null);
  const style = KIND_STYLE[kind];

  const threadColor = useMemo(() => {
    let base = new THREE.Color(
      planet.waveColor[0],
      planet.waveColor[1],
      planet.waveColor[2],
    );
    if (kind === 'discord') base = base.lerp(DISCORD_TINT, 0.45);
    return planet.isCombust ? desaturate(base, 0.7) : base;
  }, [planet.waveColor, planet.isCombust, kind]);

  // The planet sits at its REAL static longitude, so the arc is built once.
  const curve = useMemo(() => {
    const { x, y, z } = planetPosition(planet, 0, true);
    const start = new THREE.Vector3(x, y, z);
    const end = new THREE.Vector3(0, CENTER_Y, 0);
    const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.9, 0));
    return new THREE.QuadraticBezierCurve3(start, mid, end);
  }, [planet]);

  const tubeGeometry = useMemo(
    () => new THREE.TubeGeometry(curve, TUBE_SEGMENTS, style.radius, 8, false),
    [curve, style.radius],
  );

  const tubeMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: threadColor,
        transparent: true,
        opacity: style.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [threadColor, style.opacity],
  );

  const pulseColor = useMemo(
    () => threadColor.clone().lerp(new THREE.Color(1, 1, 1), 0.35),
    [threadColor],
  );

  useEffect(() => {
    return () => {
      tubeGeometry.dispose();
      tubeMaterial.dispose();
    };
  }, [tubeGeometry, tubeMaterial]);

  // Entrance draw-in: reveal the tube's index range planet -> core.
  useEffect(() => {
    const indexCount = tubeGeometry.index ? tubeGeometry.index.count : 0;
    const clamped = Math.max(0, Math.min(1, drawProgress));
    tubeGeometry.setDrawRange(0, Math.floor((indexCount * clamped) / 3) * 3);
  }, [tubeGeometry, drawProgress]);

  useFrame((state) => {
    if (!pulseRef.current) return;
    const animTime = reducedMotion ? time : state.clock.elapsedTime;

    let u: number;
    if (drawProgress < 1) {
      // While drawing in, the pulse rides the tip of the growing thread.
      u = Math.max(0.001, Math.min(0.999, drawProgress));
    } else if (reducedMotion) {
      u = 0.65; // static frame — pulse held mid-thread
    } else {
      const cycle = (animTime * style.speed + style.phase) % 1;
      // Retrograde flows OUTWARD (core -> planet); direct flows inward.
      u = planet.isRetrograde ? 1 - cycle : cycle;
    }
    const p = curve.getPointAt(u);
    pulseRef.current.position.copy(p);
    const breathe = reducedMotion ? 1 : 1 + Math.sin(animTime * 2.2) * 0.12;
    pulseRef.current.scale.setScalar(style.pulseSize * breathe);
  });

  return (
    <group>
      <mesh geometry={tubeGeometry} material={tubeMaterial} />
      <mesh ref={pulseRef} scale={style.pulseSize}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial
          color={pulseColor}
          transparent
          opacity={planet.isCombust ? 0.55 : 0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
