/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * ForceFieldScene - composes the planetary force-field (renamed from esoteric
 * `AuraScene`). Central node is the lagna-tinted `NativeCore` (no avatar);
 * planets sit at REAL ecliptic longitude. Selection is controlled by the parent
 * (lifted to the chart UI store) so the 3D scene and 2D kundli cross-highlight.
 * Optional faint `HouseRing` spokes from the chart cusps.
 *
 * Atmosphere: a token-coloured gradient backdrop (`Backdrop`) and a faint
 * instanced `Starfield` give the scene depth without cost; a calm auto-orbit
 * (`AutoOrbit`) drifts the camera and is suspended whenever the user drags.
 * Bloom/Vignette postprocessing is gated by the parent and passed as children.
 *
 * Palette: every colour derives from `@almamesh/constants` `colors` (brass-gold
 * / lapis observatory), never ad-hoc primary RGB literals.
 *
 * Note: @ts-nocheck — R3F9 intrinsic-element JSX clashes with React 19 typing.
 */

import { useMemo, useRef, type ReactNode } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { colors } from '@almamesh/constants';
import type { EnergyFrame, PlanetWave } from '@almamesh/shared-types';
import { PlanetMesh } from './PlanetMesh';
import { NativeCore } from './NativeCore';
import { WaveBeam } from './WaveBeam';
import { WaveInterference } from './WaveInterference';
import { CENTER_Y } from './placement';

interface ForceFieldSceneProps {
  frame: EnergyFrame;
  animationTime: number;
  reducedMotion?: boolean;
  selectedPlanet?: string | null;
  onPlanetSelect?: (id: string | null) => void;
  lagnaColor?: [number, number, number];
  houseSpokes?: readonly number[];
  lagnaLongitude?: number;
  effects?: ReactNode;
}

// Observatory tokens, resolved once to THREE.Color (avoids per-frame parsing).
const C = {
  base: new THREE.Color(colors.background.primary), // #0B0E17
  deep: new THREE.Color(colors.background.darkest), // #080A11
  nebula: new THREE.Color(colors.accent.lapis), // #3A4FB0
  brass: new THREE.Color(colors.accent.gold), // #C9A24B
  brassBright: new THREE.Color(colors.accent['gold-bright']), // #E3B85A
  lapisLight: new THREE.Color(colors.accent.blue), // #5468C8
  spoke: new THREE.Color(colors.accent.lapis).multiplyScalar(0.55), // faint lapis engraving
  star: new THREE.Color(colors.text.secondary), // muted brass-gray token
};

/**
 * A large back-facing sphere shaded with a vertical gradient (deep obsidian at
 * the horizon → faint lapis "nebula" overhead). Replaces the dead flat clear
 * colour with a sense of atmosphere. Pure vertex-coloured basic material — no
 * lights, no cost.
 */
function Backdrop() {
  const geometry = useMemo(() => {
    const geo = new THREE.SphereGeometry(60, 32, 24);
    const pos = geo.getAttribute('position');
    const count = pos.count;
    const colorAttr = new Float32Array(count * 3);
    const top = C.nebula.clone().lerp(C.base, 0.72); // very subtle lapis wash
    const bottom = C.deep;
    for (let i = 0; i < count; i++) {
      // Normalised height -1..1 → 0..1, eased so the wash sits high up.
      const h = THREE.MathUtils.clamp((pos.getY(i) / 60) * 0.5 + 0.5, 0, 1);
      const t = Math.pow(h, 1.8);
      const c = bottom.clone().lerp(top, t);
      colorAttr[i * 3] = c.r;
      colorAttr[i * 3 + 1] = c.g;
      colorAttr[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colorAttr, 3));
    return geo;
  }, []);

  return (
    <mesh geometry={geometry} scale={[1, 1, 1]}>
      <meshBasicMaterial
        vertexColors
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}

/**
 * Faint instanced starfield on a far shell. Low count, points material, no
 * per-frame work (a whole-group slow yaw only). Cheap on mobile.
 */
function Starfield({ reducedMotion }: { reducedMotion: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const { geometry, material } = useMemo(() => {
    const COUNT = 320;
    const positions = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);
    // Deterministic LCG so the starfield is identical every mount.
    let seed = 0x9e3779b9;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let i = 0; i < COUNT; i++) {
      // Scatter on a far shell, biased to the upper hemisphere.
      const r = 30 + rnd() * 18;
      const theta = rnd() * Math.PI * 2;
      const phi = Math.acos(1 - rnd() * 1.4); // bias upward
      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      positions[i * 3 + 1] = Math.cos(phi) * r * 0.9 + 4;
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
      sizes[i] = 0.06 + rnd() * 0.16;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.PointsMaterial({
      color: C.star,
      transparent: true,
      opacity: 0.55,
      sizeAttenuation: true,
      size: 0.14,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    });
    return { geometry: geo, material: mat };
  }, []);

  useFrame((_, delta) => {
    if (reducedMotion || !groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.006; // glacial drift
  });

  return (
    <group ref={groupRef}>
      <points geometry={geometry} material={material} />
    </group>
  );
}

// Shared flag the OrbitControls toggles on drag start/end so AutoOrbit yields.
const userDragging = { value: false };

/**
 * Calm cinematic auto-orbit: a slow azimuthal drift + a gentle vertical breathe
 * applied to the camera around the scene centre. Suspended while the user is
 * dragging the OrbitControls (resumes after release). Never spinny.
 */
function AutoOrbit({
  controlsRef,
  reducedMotion,
}: {
  controlsRef: React.MutableRefObject<unknown>;
  reducedMotion: boolean;
}) {
  useFrame((_, delta) => {
    if (reducedMotion) return;
    const controls = controlsRef.current as {
      getAzimuthalAngle?: () => number;
      setAzimuthalAngle?: (a: number) => void;
      update?: () => void;
    } | null;
    if (
      !controls ||
      userDragging.value ||
      typeof controls.getAzimuthalAngle !== 'function' ||
      typeof controls.setAzimuthalAngle !== 'function'
    ) {
      return;
    }
    // Nudge the controls' own azimuth so damping/zoom keep working naturally.
    // ~0.045 rad/s → a calm full lap roughly every 2.3 minutes. Never spinny.
    controls.setAzimuthalAngle(controls.getAzimuthalAngle() + delta * 0.045);
    controls.update?.();
  });

  return null;
}

function GroundPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.3, 0]} receiveShadow>
      <circleGeometry args={[12, 64]} />
      <meshStandardMaterial
        color={colors.background.darker}
        transparent
        opacity={0.55}
        roughness={1}
        metalness={0}
      />
    </mesh>
  );
}

/** Faint radial spokes at each house cusp longitude + a brighter lagna spoke. */
function HouseRing({
  spokes,
  lagnaLongitude,
}: {
  spokes: readonly number[];
  lagnaLongitude?: number;
}) {
  const lines = useMemo(() => {
    const inner = 1.6;
    const outer = 8.2;
    return spokes.map((lon) => {
      const a = (-lon * Math.PI) / 180;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          [Math.cos(a) * inner, 0, Math.sin(a) * inner, Math.cos(a) * outer, 0, Math.sin(a) * outer],
          3,
        ),
      );
      return geo;
    });
  }, [spokes]);

  return (
    <group position={[0, -0.02, 0]}>
      {lines.map((geo, i) => (
        <primitive
          key={`spoke-${i}`}
          object={new THREE.Line(geo, new THREE.LineBasicMaterial({ color: C.spoke, transparent: true, opacity: 0.4 }))}
        />
      ))}
      {typeof lagnaLongitude === 'number' && (
        <mesh
          position={[
            Math.cos((-lagnaLongitude * Math.PI) / 180) * 8.4,
            0,
            Math.sin((-lagnaLongitude * Math.PI) / 180) * 8.4,
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[0.18, 24]} />
          <meshBasicMaterial color={C.brassBright} transparent opacity={0.85} />
        </mesh>
      )}
    </group>
  );
}

function WaveBeams({
  planets,
  time,
  reducedMotion,
}: {
  planets: PlanetWave[];
  time: number;
  reducedMotion: boolean;
}) {
  const targetPosition = useMemo(() => new THREE.Vector3(0, CENTER_Y, 0), []);
  return (
    <group>
      {planets.map((planet) => (
        <WaveBeam
          key={`wave-${planet.id}`}
          planet={planet}
          time={time}
          reducedMotion={reducedMotion}
          targetPosition={targetPosition}
        />
      ))}
    </group>
  );
}

export function ForceFieldScene({
  frame,
  animationTime,
  reducedMotion = false,
  selectedPlanet = null,
  onPlanetSelect,
  lagnaColor,
  houseSpokes,
  lagnaLongitude,
  effects,
}: ForceFieldSceneProps) {
  const controlsRef = useRef(null);

  const handlePlanetSelect = (id: string) => {
    onPlanetSelect?.(selectedPlanet === id ? null : id);
  };

  const sortedPlanets = useMemo(
    () => [...frame.planets].sort((a, b) => a.orbitRadius - b.orbitRadius),
    [frame.planets],
  );

  return (
    <>
      {/* Atmosphere (drawn first, never fogged). */}
      <Backdrop />
      <Starfield reducedMotion={reducedMotion} />

      {/* Lighting: soft brass key + cool lapis fill + ambient so spheres read
          as lit 3D bodies. */}
      <ambientLight intensity={0.5} color={C.base} />
      <hemisphereLight
        intensity={0.35}
        color={C.lapisLight}
        groundColor={C.deep}
      />
      <directionalLight
        position={[6, 11, 6]}
        intensity={1.05}
        color={C.brassBright}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0005}
      />
      <pointLight position={[-6, 5, -5]} intensity={0.45} color={C.nebula} />
      <spotLight
        position={[0, 9, 0]}
        angle={0.5}
        penumbra={0.6}
        intensity={0.5}
        color={C.brass}
        target-position={[0, 0, 0]}
      />

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableZoom
        enableRotate
        minDistance={6}
        maxDistance={24}
        maxPolarAngle={Math.PI * 0.82}
        minPolarAngle={Math.PI * 0.14}
        target={[0, 0.5, 0]}
        enableDamping
        dampingFactor={0.06}
        rotateSpeed={0.55}
        onStart={() => {
          userDragging.value = true;
        }}
        onEnd={() => {
          userDragging.value = false;
        }}
      />

      <AutoOrbit controlsRef={controlsRef} reducedMotion={reducedMotion} />

      <GroundPlane />

      {houseSpokes && houseSpokes.length > 0 && (
        <HouseRing spokes={houseSpokes} lagnaLongitude={lagnaLongitude} />
      )}

      <WaveBeams planets={sortedPlanets} time={animationTime} reducedMotion={reducedMotion} />

      <WaveInterference planets={sortedPlanets} aura={frame.aura} time={animationTime} reducedMotion={reducedMotion} />

      <group position={[0, CENTER_Y, 0]}>
        <NativeCore
          aura={frame.aura}
          time={animationTime}
          reducedMotion={reducedMotion}
          lagnaColor={lagnaColor}
          activePlanetCount={sortedPlanets.length}
        />
      </group>

      {sortedPlanets.map((planet) => (
        <PlanetMesh
          key={planet.id}
          planet={planet}
          time={animationTime}
          onSelect={handlePlanetSelect}
          isSelected={selectedPlanet === planet.id}
          isDimmed={selectedPlanet !== null && selectedPlanet !== planet.id}
          showLabel
          reducedMotion={reducedMotion}
        />
      ))}

      <fog attach="fog" args={[colors.background.darkest, 18, 42]} />

      {effects}
    </>
  );
}
