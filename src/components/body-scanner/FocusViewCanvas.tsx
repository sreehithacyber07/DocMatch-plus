import { Suspense, useMemo, useEffect, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { BodyLayer } from './HolographicBody';

const MODEL_URL = 'https://threejs.org/examples/models/gltf/Soldier.glb';

const LAYER_CFG: Record<BodyLayer, {
  body: string; emissive: string; emissiveIntensity: number;
  opacity: number; edge: string;
}> = {
  hologram: { body: '#0F2942', emissive: '#22D3EE', emissiveIntensity: 0.35, opacity: 0.55, edge: '#67E8F9' },
  organs:   { body: '#3D0A0A', emissive: '#F97316', emissiveIntensity: 0.55, opacity: 0.75, edge: '#FBA040' },
  systems:  { body: '#0A0520', emissive: '#A855F7', emissiveIntensity: 0.50, opacity: 0.60, edge: '#C084FC' },
};

function FocusCam({ cursorRef }: { cursorRef: MutableRefObject<{ x: number; y: number }> }) {
  const { camera } = useThree();
  const targetY = { current: 1.3 };

  useFrame(() => {
    // cy: 0 = bottom, 1 = top → map to body Y range [0.3, 2.5]
    const cy = cursorRef.current.y;
    const goalY = THREE.MathUtils.lerp(0.3, 2.5, cy);
    targetY.current = THREE.MathUtils.lerp(targetY.current, goalY, 0.055);
    camera.position.set(0, targetY.current, 1.8);
    camera.lookAt(0, targetY.current, 0);
  });

  return null;
}

function FocusBodyMesh({ layer }: { layer: BodyLayer }) {
  const gltf = useGLTF(MODEL_URL);
  const cfg = LAYER_CFG[layer];

  const mat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: cfg.body,
        transparent: true,
        opacity: cfg.opacity,
        metalness: 0.70,
        roughness: 0.20,
        clearcoat: 1.0,
        emissive: new THREE.Color(cfg.emissive),
        emissiveIntensity: cfg.emissiveIntensity,
        side: THREE.DoubleSide,
        transmission: 0.25,
        depthWrite: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layer]
  );

  const edgeMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({ color: cfg.edge, transparent: true, opacity: 0.65 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layer]
  );

  const { clonedScene, transform } = useMemo(() => {
    const clone = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const scale = 2.6 / Math.max(size.y, 0.001);

    clone.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m?.dispose());
      mesh.material = mat;
      const edgesGeo = new THREE.EdgesGeometry(mesh.geometry, 18);
      mesh.add(new THREE.LineSegments(edgesGeo, edgeMat));
    });

    return {
      clonedScene: clone,
      transform: { scale, x: -center.x * scale, y: -box.min.y * scale, z: -center.z * scale },
    };
  }, [gltf.scene, mat, edgeMat]);

  useEffect(
    () => () => {
      clonedScene.traverse((child) => {
        if ((child as THREE.LineSegments).isLineSegments) {
          (child as THREE.LineSegments).geometry.dispose();
        }
      });
      mat.dispose();
      edgeMat.dispose();
    },
    [clonedScene, mat, edgeMat]
  );

  return (
    <group position={[transform.x, transform.y, transform.z]} scale={transform.scale}>
      <primitive object={clonedScene} />
    </group>
  );
}

export function FocusViewCanvas({
  cursorRef,
  layer,
}: {
  cursorRef: MutableRefObject<{ x: number; y: number }>;
  layer: BodyLayer;
}) {
  return (
    <Canvas
      camera={{ position: [0, 1.3, 1.8], fov: 45, near: 0.1, far: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      dpr={[1, 1.5]}
      style={{ background: 'transparent', width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.35} color="#7DD3FC" />
      <pointLight position={[1, 2, 2]} intensity={0.90} color={LAYER_CFG[layer].emissive} />
      <pointLight position={[-1, 0, 1]} intensity={0.40} color={LAYER_CFG[layer].emissive} />
      <FocusCam cursorRef={cursorRef} />
      <Suspense fallback={null}>
        <FocusBodyMesh layer={layer} />
      </Suspense>
    </Canvas>
  );
}
