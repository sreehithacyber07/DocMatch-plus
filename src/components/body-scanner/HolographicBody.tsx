import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, Html } from '@react-three/drei';
import * as THREE from 'three';

const PRIMARY_URL = 'https://threejs.org/examples/models/gltf/Soldier.glb';
const FALLBACK_URL = 'https://models.readyplayer.me/64bfa15f0e72c63d7c3934a6.glb';

useGLTF.preload(PRIMARY_URL);

// ── Public layer type ─────────────────────────────────────────────────────────
export type BodyLayer = 'hologram' | 'organs' | 'systems';

const LAYER_CFG: Record<BodyLayer, {
  color: string; emissive: string; emissiveIntensity: number;
  opacity: number; transmission: number;
  edgeColor: string; edgeOpacity: number;
}> = {
  hologram: {
    color: '#0F2942', emissive: '#22D3EE', emissiveIntensity: 0.25,
    opacity: 0.45, transmission: 0.40, edgeColor: '#67E8F9', edgeOpacity: 0.60,
  },
  organs: {
    color: '#3D0A0A', emissive: '#F97316', emissiveIntensity: 0.45,
    opacity: 0.72, transmission: 0.10, edgeColor: '#FBA040', edgeOpacity: 0.70,
  },
  systems: {
    color: '#0A0520', emissive: '#A855F7', emissiveIntensity: 0.38,
    opacity: 0.55, transmission: 0.20, edgeColor: '#C084FC', edgeOpacity: 0.65,
  },
};

// ── Circular platform with concentric rings ───────────────────────────────────
function CircularPlatform({ layer }: { layer: BodyLayer }) {
  const ringRefs = useRef<(THREE.Mesh | null)[]>([null, null, null]);
  const primaryColor = LAYER_CFG[layer].emissive;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    ringRefs.current.forEach((ring, i) => {
      if (!ring) return;
      const mat = ring.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.18 + Math.sin(t * 0.9 + i * 1.1) * 0.09;
    });
  });

  return (
    <group>
      {/* Main disc platform */}
      <mesh position={[0, -0.025, 0]}>
        <cylinderGeometry args={[1.55, 1.55, 0.022, 128]} />
        <meshPhysicalMaterial
          color="#001824"
          emissive={primaryColor}
          emissiveIntensity={0.10}
          transparent
          opacity={0.60}
          metalness={0.95}
          roughness={0.05}
          depthWrite={false}
        />
      </mesh>
      {/* Concentric glow rings on platform surface */}
      {[0.45, 0.90, 1.32].map((r, i) => (
        <mesh
          key={i}
          ref={(el) => { ringRefs.current[i] = el; }}
          position={[0, 0.003, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[r, 0.014, 6, 96]} />
          <meshBasicMaterial color={primaryColor} transparent opacity={0.22} />
        </mesh>
      ))}
      {/* Outer edge ring (brighter) */}
      <mesh position={[0, 0.003, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.52, 0.022, 6, 96]} />
        <meshBasicMaterial color={primaryColor} transparent opacity={0.35} />
      </mesh>
      {/* Ground grid plane (very subtle) */}
      <mesh position={[0, -0.036, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5, 5, 10, 10]} />
        <meshBasicMaterial color={primaryColor} wireframe transparent opacity={0.04} />
      </mesh>
    </group>
  );
}

// ── Error boundary ────────────────────────────────────────────────────────────
interface EBProps { children: React.ReactNode; fallback: React.ReactNode; }
interface EBState { hasError: boolean; }

class GLTFErrorBoundary extends React.Component<EBProps, EBState> {
  state: EBState = { hasError: false };
  static getDerivedStateFromError(): EBState { return { hasError: true }; }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function BodyErrorCard() {
  return (
    <Html center>
      <div style={{
        background: 'rgba(10,14,39,0.88)',
        border: '1px solid rgba(34,211,238,0.35)',
        borderRadius: 12, padding: '24px 32px',
        color: '#67E8F9', fontFamily: 'system-ui, sans-serif',
        textAlign: 'center', maxWidth: 280, backdropFilter: 'blur(12px)',
      }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>⚠</div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Body model unavailable</div>
        <div style={{ opacity: 0.65, fontSize: 13 }}>Please check your connection</div>
      </div>
    </Html>
  );
}

// ── Core body mesh ────────────────────────────────────────────────────────────
function HolographicBodyMesh({ url, layer }: { url: string; layer: BodyLayer }) {
  const gltf = useGLTF(url);
  const breathGroupRef = useRef<THREE.Group>(null);

  const holoMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: LAYER_CFG.hologram.color,
        transparent: true,
        opacity: LAYER_CFG.hologram.opacity,
        metalness: 0.70,
        roughness: 0.20,
        clearcoat: 1.0,
        clearcoatRoughness: 0.15,
        emissive: new THREE.Color(LAYER_CFG.hologram.emissive),
        emissiveIntensity: LAYER_CFG.hologram.emissiveIntensity,
        side: THREE.DoubleSide,
        transmission: LAYER_CFG.hologram.transmission,
        thickness: 0.6,
        ior: 1.3,
        depthWrite: false,
      }),
    []
  );

  const edgeMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: LAYER_CFG.hologram.edgeColor,
        transparent: true,
        opacity: LAYER_CFG.hologram.edgeOpacity,
      }),
    []
  );

  // Update materials imperatively when layer changes — avoids re-cloning scene
  useEffect(() => {
    const cfg = LAYER_CFG[layer];
    holoMaterial.color.set(cfg.color);
    holoMaterial.emissive.set(cfg.emissive);
    holoMaterial.emissiveIntensity = cfg.emissiveIntensity;
    holoMaterial.opacity = cfg.opacity;
    holoMaterial.transmission = cfg.transmission;
    holoMaterial.needsUpdate = true;
    edgeMaterial.color.set(cfg.edgeColor);
    edgeMaterial.opacity = cfg.edgeOpacity;
    edgeMaterial.needsUpdate = true;
  }, [layer, holoMaterial, edgeMaterial]);

  const { clonedScene, transform } = useMemo(() => {
    const clone = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const scaleFactor = 2.6 / Math.max(size.y, 0.001);

    clone.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m?.dispose());
      mesh.material = holoMaterial;
      const edgesGeo = new THREE.EdgesGeometry(mesh.geometry, 18);
      const lineSegs = new THREE.LineSegments(edgesGeo, edgeMaterial);
      lineSegs.name = '__edge__';
      mesh.add(lineSegs);
    });

    return {
      clonedScene: clone,
      transform: {
        scale: scaleFactor,
        x: -center.x * scaleFactor,
        y: -box.min.y * scaleFactor,
        z: -center.z * scaleFactor,
      },
    };
  }, [gltf.scene, holoMaterial, edgeMaterial]);

  // Breathing animation
  useFrame(({ clock }) => {
    if (breathGroupRef.current) {
      breathGroupRef.current.scale.y = 1 + Math.sin(clock.getElapsedTime() * 1.0) * 0.008;
    }
  });

  useEffect(() => {
    return () => {
      clonedScene.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;
        (child as THREE.Mesh).children
          .filter((c) => c.name === '__edge__')
          .forEach((c) => (c as THREE.LineSegments).geometry.dispose());
      });
      holoMaterial.dispose();
      edgeMaterial.dispose();
    };
  }, [clonedScene, holoMaterial, edgeMaterial]);

  const meridianCurves = useMemo(() => {
    const r = 0.5;
    return [0, Math.PI / 2, Math.PI, Math.PI * 1.5].map(
      (angle) =>
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(Math.sin(angle) * r, 2.7, Math.cos(angle) * r),
          new THREE.Vector3(Math.sin(angle) * r, 1.35, Math.cos(angle) * r),
          new THREE.Vector3(Math.sin(angle) * r, 0, Math.cos(angle) * r),
        ])
    );
  }, []);

  const RING_Y = [0.4, 0.9, 1.4, 1.9, 2.4] as const;
  const edgeColor = LAYER_CFG[layer].edgeColor;

  return (
    <>
      <group position={[transform.x, transform.y, transform.z]} scale={transform.scale}>
        <group ref={breathGroupRef}>
          <primitive object={clonedScene} />
        </group>
      </group>

      {/* Blueprint overlay — scan rings + meridians */}
      <group>
        {RING_Y.map((y, i) => (
          <mesh key={`ring-${i}`} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.9, 0.005, 4, 96]} />
            <meshBasicMaterial color={edgeColor} transparent opacity={0.22} />
          </mesh>
        ))}
        {meridianCurves.map((curve, i) => (
          <mesh key={`meridian-${i}`}>
            <tubeGeometry args={[curve, 20, 0.004, 4, false]} />
            <meshBasicMaterial color={edgeColor} transparent opacity={0.28} />
          </mesh>
        ))}
      </group>

      {/* Circular platform */}
      <CircularPlatform layer={layer} />
    </>
  );
}

function PrimaryBody({ layer }: { layer: BodyLayer }) {
  return <HolographicBodyMesh url={PRIMARY_URL} layer={layer} />;
}
function FallbackBody({ layer }: { layer: BodyLayer }) {
  return <HolographicBodyMesh url={FALLBACK_URL} layer={layer} />;
}

export function HolographicBody({ layer }: { layer: BodyLayer }) {
  return (
    <GLTFErrorBoundary
      fallback={
        <GLTFErrorBoundary fallback={<BodyErrorCard />}>
          <FallbackBody layer={layer} />
        </GLTFErrorBoundary>
      }
    >
      <PrimaryBody layer={layer} />
    </GLTFErrorBoundary>
  );
}
