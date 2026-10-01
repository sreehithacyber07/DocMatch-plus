import { type ReactNode, useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as ThreeOrbitControls } from 'three-stdlib';
import { EffectComposer, Bloom } from '@react-three/postprocessing';

export interface BodyScannerCanvasProps {
  children: ReactNode;
  viewMode?: 'front' | 'back';
}

function SceneControls({ viewMode }: { viewMode: 'front' | 'back' }) {
  const controlsRef = useRef<ThreeOrbitControls>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { camera } = useThree();

  // Snap camera to front or back when viewMode changes
  useEffect(() => {
    const z = viewMode === 'front' ? 4.2 : -4.2;
    camera.position.set(0, 1.4, z);
    camera.lookAt(0, 1.0, 0);
    controlsRef.current?.update();
  }, [viewMode, camera]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const handleStart = () => {
      controls.autoRotate = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };

    const handleEnd = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (controlsRef.current) controlsRef.current.autoRotate = true;
      }, 3000);
    };

    controls.addEventListener('start', handleStart);
    controls.addEventListener('end', handleEnd);

    return () => {
      controls.removeEventListener('start', handleStart);
      controls.removeEventListener('end', handleEnd);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      target={[0, 1.0, 0]}
      minDistance={3}
      maxDistance={8}
      minPolarAngle={Math.PI * 0.28}
      maxPolarAngle={Math.PI * 0.72}
      enableDamping
      dampingFactor={0.06}
      autoRotate
      autoRotateSpeed={0.50}
    />
  );
}

export function BodyScannerCanvas({ children, viewMode = 'front' }: BodyScannerCanvasProps) {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        camera={{ position: [0, 1.4, 4.2], fov: 32, near: 0.1, far: 100 }}
        gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
        dpr={[1, 2]}
        style={{ background: 'transparent' }}
      >
        <fog attach="fog" args={['#0A0E27', 9, 24]} />
        <ambientLight intensity={0.30} color="#7DD3FC" />
        <directionalLight position={[3, 5, 4]} intensity={0.55} color="#A5B4FC" />
        <pointLight position={[-4, 0, 3]} intensity={0.50} color="#22D3EE" />
        <pointLight position={[0, -2, -4]} intensity={0.40} color="#8B5CF6" />
        <SceneControls viewMode={viewMode} />
        {children}
        <EffectComposer>
          <Bloom
            intensity={0.55}
            luminanceThreshold={0.6}
            luminanceSmoothing={0.3}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
