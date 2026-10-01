import { Suspense, useState, useRef, useCallback, type MutableRefObject, type CSSProperties } from 'react';
import { PhaseShell } from '@components/ui';
import { FocusViewCanvas } from './FocusViewCanvas';
import { BodySVGView } from './BodySVGView';
import type { BodyLayer } from './HolographicBody';
import useAppStore from '@stores/useAppStore';

// ── Types ─────────────────────────────────────────────────────────────────────
type ViewMode = 'front' | 'back';

// ── Data ──────────────────────────────────────────────────────────────────────
const LAYERS: { id: BodyLayer; label: string; color: string }[] = [
  { id: 'hologram', label: 'HOLOGRAM', color: '#22D3EE' },
  { id: 'organs',   label: 'ORGANS',   color: '#F97316' },
  { id: 'systems',  label: 'SYSTEMS',  color: '#A855F7' },
];

const TERRAIN_SYSTEMS = [
  { id: 'nervous',     label: 'Nervous',     color: '#A855F7' },
  { id: 'digestive',   label: 'Digestive',   color: '#F97316' },
  { id: 'respiratory', label: 'Respiratory', color: '#22D3EE' },
  { id: 'muscular',    label: 'Muscular',    color: '#EF4444' },
];

const INTENSITY = [
  { color: '#EF4444', label: 'High Intensity' },
  { color: '#F97316', label: 'Medium Intensity' },
  { color: '#22D3EE', label: 'Low Intensity' },
  { color: '#22C55E', label: 'No Issues' },
];

// ── Icon components ───────────────────────────────────────────────────────────
function HologramIcon({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="4.5" r="2.5" stroke={color} strokeWidth="1.2" />
      <path d="M3.5 13C3.5 10.5 5.1 9 7 9C8.9 9 10.5 10.5 10.5 13" stroke={color} strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M7 0.5V2" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.5" />
      <path d="M7 11.5V13" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.3" />
    </svg>
  );
}

function OrgansIcon({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path
        d="M7 12C7 12 2 8.2 2 5.2C2 3.4 3.2 2 5 2C5.9 2 6.6 2.4 7 3C7.4 2.4 8.1 2 9 2C10.8 2 12 3.4 12 5.2C12 8.2 7 12 7 12Z"
        stroke={color} strokeWidth="1.2" fill={`${color}28`}
      />
    </svg>
  );
}

function SystemsIcon({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="3.5" r="1.8" stroke={color} strokeWidth="1.1" />
      <circle cx="2.5" cy="10.5" r="1.8" stroke={color} strokeWidth="1.1" />
      <circle cx="11.5" cy="10.5" r="1.8" stroke={color} strokeWidth="1.1" />
      <line x1="7" y1="5.3" x2="3.3" y2="8.7" stroke={color} strokeWidth="0.9" opacity="0.6" />
      <line x1="7" y1="5.3" x2="10.7" y2="8.7" stroke={color} strokeWidth="0.9" opacity="0.6" />
      <line x1="4.3" y1="10.5" x2="9.7" y2="10.5" stroke={color} strokeWidth="0.9" opacity="0.6" />
    </svg>
  );
}

function TerrainIcon({ system, color }: { system: string; color: string }) {
  if (system === 'nervous') return <SystemsIcon color={color} />;
  if (system === 'digestive') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M4 2.5C3 3.5 3 5.5 4 7C5 8.5 5.5 9.5 5 11" stroke={color} strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d="M5 2.5C7 3 9 4 10 5.5C11 7 10 9 9 10C8 11 7 11.5 6 11" stroke={color} strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  if (system === 'respiratory') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 2V7.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
        <path d="M7 4C5 4 3 5 3 7.5C3 9.5 4.5 11.5 6.5 11.5" stroke={color} strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d="M7 4C9 4 11 5 11 7.5C11 9.5 9.5 11.5 7.5 11.5" stroke={color} strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <ellipse cx="7" cy="7" rx="4.5" ry="3" transform="rotate(-20 7 7)" stroke={color} strokeWidth="1.2" fill="none" />
      <line x1="3" y1="5" x2="11" y2="9" stroke={color} strokeWidth="0.8" opacity="0.5" />
    </svg>
  );
}

function BodySilhouette({ size, color, flip }: { size: number; color: string; flip: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 30" fill="none"
      style={{ transform: flip ? 'scaleX(-1)' : undefined }}>
      <circle cx="10" cy="3.5" r="3" stroke={color} strokeWidth="1.2" />
      <path d="M7 7H13L12.5 18H7.5L7 7Z" stroke={color} strokeWidth="1.2" fill="none" strokeLinejoin="round" />
      <path d="M7 8L3.5 15" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M13 8L16.5 15" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M8 18L6.5 28" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M12 18L13.5 28" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const panelBase: CSSProperties = {
  background: 'rgba(5, 9, 25, 0.84)',
  backdropFilter: 'blur(16px)',
};

const sectionLabel: CSSProperties = {
  fontSize: 9,
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  color: 'rgba(34,211,238,0.42)',
  fontFamily: 'monospace',
  marginBottom: 8,
};

const divider: CSSProperties = {
  width: 1,
  background: 'rgba(34,211,238,0.09)',
  alignSelf: 'stretch',
};

// ── Layer icon helper ─────────────────────────────────────────────────────────
function LayerIcon({ id, color }: { id: BodyLayer; color: string }) {
  if (id === 'hologram') return <HologramIcon color={color} />;
  if (id === 'organs') return <OrgansIcon color={color} />;
  return <SystemsIcon color={color} />;
}

// ── Main stage component ──────────────────────────────────────────────────────
export function BodyScanStage() {
  const setPhase          = useAppStore((s) => s.setPhase);
  const selectRegion      = useAppStore((s) => s.selectRegion);
  const selectedBodyRegions = useAppStore((s) => s.selectedBodyRegions);

  const [activeLayer,    setActiveLayer]    = useState<BodyLayer>('hologram');
  const [activeSystem,   setActiveSystem]   = useState<string | null>(null);
  const [viewMode,       setViewMode]       = useState<ViewMode>('front');
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  // cursorRef for FocusViewCanvas — updated by BodySVGView hover callbacks
  const cursorRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });

  // Region → normalised Y for focus-cam (0=bottom, 1=top)
  const REGION_Y: Record<string, number> = {
    head: 0.93, neck: 0.78, chest: 0.64, abdomen: 0.50,
    pelvis: 0.38, left_leg: 0.22, right_leg: 0.22,
    left_foot: 0.06, right_foot: 0.06, left_arm: 0.60, right_arm: 0.60,
  };

  const handleSVGHover = useCallback((regionId: string | null) => {
    if (regionId) cursorRef.current = { x: 0.5, y: REGION_Y[regionId] ?? 0.5 };
    setSelectedRegion(prev => regionId ?? prev);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSVGSelect = useCallback((regionId: string) => {
    selectRegion(regionId);
    setSelectedRegion(regionId);
  }, [selectRegion]);

  const toggleSystem = useCallback((id: string) => {
    setActiveSystem((prev) => prev === id ? null : id);
  }, []);

  const activeLayerInfo = LAYERS.find((l) => l.id === activeLayer)!;

  const layerLabel =
    activeLayer === 'hologram' ? 'Hologram Layer' :
    activeLayer === 'organs'   ? 'Organs Layer'   : 'Systems Layer';

  const layerDesc =
    activeLayer === 'hologram' ? 'Full body blueprint scan' :
    activeLayer === 'organs'   ? 'Internal organ visualization' : 'Body systems network';

  return (
    <PhaseShell phaseId="body-scan" variant="slide-up">
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          height: 36, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          background: 'rgba(5,9,25,0.78)', backdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(34,211,238,0.07)',
        }}>
          <span style={{ fontSize: 11, letterSpacing: '0.22em', color: 'rgba(34,211,238,0.55)', fontFamily: 'monospace' }}>
            BODY DIAGRAM
          </span>
          <span style={{ width: 1, height: 12, background: 'rgba(34,211,238,0.22)' }} />
          <span style={{ fontSize: 11, letterSpacing: '0.18em', color: activeLayerInfo.color, fontFamily: 'monospace', opacity: 0.88 }}>
            {activeLayer.toUpperCase()} VIEW
          </span>
        </div>

        {/* ── Main content row ──────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

          {/* ── LEFT PANEL ────────────────────────────────────────────── */}
          <div style={{
            ...panelBase,
            width: 172, flexShrink: 0,
            borderRight: '1px solid rgba(34,211,238,0.09)',
            padding: '14px 12px',
            display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto',
          }}>

            {/* Layer selector */}
            <div>
              <div style={sectionLabel}>Select Layer</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {LAYERS.map(({ id, label, color }) => {
                  const active = activeLayer === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setActiveLayer(id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 9,
                        padding: '8px 10px', borderRadius: 9,
                        border: `1px solid ${active ? color : 'rgba(255,255,255,0.06)'}`,
                        background: active ? `${color}1A` : 'rgba(255,255,255,0.02)',
                        color: active ? color : 'rgba(255,255,255,0.35)',
                        fontSize: 11, letterSpacing: '0.10em', fontFamily: 'monospace',
                        cursor: 'pointer', transition: 'border-color 0.2s, background 0.2s, color 0.2s',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{
                        width: 28, height: 28, borderRadius: '50%',
                        border: `1px solid ${active ? color : 'rgba(255,255,255,0.10)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: active ? `${color}22` : 'transparent',
                        flexShrink: 0,
                        transition: 'border-color 0.2s, background 0.2s',
                      }}>
                        <LayerIcon id={id} color={active ? color : 'rgba(255,255,255,0.28)'} />
                      </span>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pain Point Locator */}
            <div>
              <div style={sectionLabel}>Pain Point Locator</div>
              <div style={{
                padding: '8px 10px', borderRadius: 8,
                border: '1px solid rgba(34,211,238,0.10)',
                background: 'rgba(34,211,238,0.03)',
                marginBottom: 10,
              }}>
                <div style={{ fontSize: 10, color: 'rgba(34,211,238,0.50)', fontFamily: 'monospace', marginBottom: 6, lineHeight: 1.4 }}>
                  Tap any point on the body
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 2px' }}>
                  <div style={{ position: 'relative', width: 38, height: 38 }}>
                    <div style={{
                      position: 'absolute', inset: 0, borderRadius: '50%',
                      border: '1px solid rgba(34,211,238,0.18)',
                    }} />
                    <div style={{
                      position: 'absolute', inset: 5, borderRadius: '50%',
                      border: '1.5px solid rgba(34,211,238,0.40)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(34,211,238,0.60)' }} />
                    </div>
                    {/* Cursor hand indicator */}
                    <div style={{
                      position: 'absolute', bottom: -2, right: -2, fontSize: 13,
                      color: 'rgba(34,211,238,0.55)',
                    }}>↗</div>
                  </div>
                </div>
              </div>

              {/* Intensity legend */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {INTENSITY.map(({ color, label }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)', fontFamily: 'monospace' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Selected region indicator */}
            {selectedRegion && (
              <div style={{
                padding: '7px 9px', borderRadius: 7,
                border: '1px solid rgba(34,211,238,0.22)',
                background: 'rgba(34,211,238,0.06)',
              }}>
                <div style={{ fontSize: 9, color: 'rgba(34,211,238,0.40)', fontFamily: 'monospace', marginBottom: 3, letterSpacing: '0.1em' }}>
                  SELECTED
                </div>
                <div style={{ fontSize: 11, color: '#22D3EE', fontFamily: 'monospace' }}>
                  {selectedRegion.replace(/_/g, ' ')}
                </div>
              </div>
            )}

            {/* Continue CTA at bottom */}
            <div style={{ marginTop: 'auto' }}>
              <button
                onClick={() => setPhase('questions')}
                style={{
                  width: '100%', padding: '9px 0',
                  borderRadius: 8,
                  border: '1px solid rgba(34,211,238,0.32)',
                  background: 'rgba(34,211,238,0.09)',
                  color: '#22D3EE', fontSize: 11, letterSpacing: '0.12em',
                  fontFamily: 'monospace', cursor: 'pointer',
                  transition: 'background 0.2s, border-color 0.2s',
                }}
              >
                Continue →
              </button>
            </div>
          </div>

          {/* ── CENTER — SVG body view ─────────────────────────────────── */}
          <div style={{ flex: 1, position: 'relative', minWidth: 0, overflow: 'hidden' }}>
            <BodySVGView
              layer={activeLayer}
              viewMode={viewMode}
              activeSystem={activeSystem}
              selectedRegions={selectedBodyRegions}
              onHover={handleSVGHover}
              onSelect={handleSVGSelect}
            />

            {/* Auto-rotate label */}
            <div style={{
              position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
              pointerEvents: 'none',
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(5,9,25,0.55)', backdropFilter: 'blur(8px)',
              border: '1px solid rgba(34,211,238,0.09)',
              borderRadius: 20, padding: '4px 14px',
              whiteSpace: 'nowrap', zIndex: 4,
            }}>
              <span style={{ fontSize: 10, color: 'rgba(34,211,238,0.42)', fontFamily: 'monospace', letterSpacing: '0.18em' }}>
                ← AUTO-ROTATE · 360° →
              </span>
            </div>
          </div>

          {/* ── RIGHT PANEL ───────────────────────────────────────────── */}
          <div style={{
            ...panelBase,
            borderLeft: '1px solid rgba(34,211,238,0.09)',
            width: 204, flexShrink: 0,
            padding: '12px 10px',
            display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto',
          }}>

            {/* FOCUS VIEW */}
            <div>
              <div style={sectionLabel}>Focus View</div>
              <div style={{ position: 'relative' }}>
                {/* Circular canvas container — strictly within right panel */}
                <div style={{
                  width: '100%',
                  paddingBottom: '100%', // square via padding trick
                  position: 'relative',
                  borderRadius: '50%', overflow: 'hidden',
                  border: '1.5px solid rgba(34,211,238,0.22)',
                  background: 'rgba(5,9,25,0.70)',
                }}>
                  <div style={{ position: 'absolute', inset: 0 }}>
                    <Suspense fallback={null}>
                      <FocusViewCanvas cursorRef={cursorRef as MutableRefObject<{ x: number; y: number }>} layer={activeLayer} />
                    </Suspense>
                  </div>
                  {/* Magnifier icon */}
                  <div style={{
                    position: 'absolute', top: 8, right: 8,
                    width: 20, height: 20, borderRadius: '50%',
                    border: '1px solid rgba(34,211,238,0.35)',
                    background: 'rgba(5,9,25,0.75)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'none',
                  }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <circle cx="4" cy="4" r="2.8" stroke="rgba(34,211,238,0.55)" strokeWidth="1.2" />
                      <line x1="6.2" y1="6.2" x2="9" y2="9" stroke="rgba(34,211,238,0.55)" strokeWidth="1.2" />
                    </svg>
                  </div>
                </div>

                {/* Zoom indicator */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 8, marginTop: 6,
                }}>
                  <span style={{ fontSize: 13, color: 'rgba(34,211,238,0.30)', userSelect: 'none' }}>−</span>
                  <span style={{ fontSize: 10, color: 'rgba(34,211,238,0.45)', fontFamily: 'monospace' }}>ZOOM 1.6×</span>
                  <span style={{ fontSize: 13, color: 'rgba(34,211,238,0.30)', userSelect: 'none' }}>+</span>
                </div>
              </div>
            </div>

            {/* TERRAIN VIEW */}
            <div>
              <div style={sectionLabel}>Terrain View</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {TERRAIN_SYSTEMS.map(({ id, label, color }) => {
                  const active = activeSystem === id;
                  return (
                    <button
                      key={id}
                      onClick={() => toggleSystem(id)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '6px 9px', borderRadius: 7,
                        border: `1px solid ${active ? color : 'rgba(255,255,255,0.06)'}`,
                        background: active ? `${color}14` : 'rgba(255,255,255,0.018)',
                        color: active ? color : 'rgba(255,255,255,0.38)',
                        fontSize: 11, fontFamily: 'monospace',
                        cursor: 'pointer', transition: 'border-color 0.18s, background 0.18s, color 0.18s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{
                          width: 7, height: 7, borderRadius: '50%',
                          background: active ? color : 'rgba(255,255,255,0.18)',
                          transition: 'background 0.18s',
                        }} />
                        {label}
                      </div>
                      <TerrainIcon system={id} color={active ? color : 'rgba(255,255,255,0.14)'} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* VIEW MODE */}
            <div>
              <div style={sectionLabel}>View Mode</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['front', 'back'] as const).map((mode) => {
                  const active = viewMode === mode;
                  return (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      style={{
                        flex: 1, padding: '8px 4px', borderRadius: 8,
                        border: `1px solid ${active ? '#22D3EE' : 'rgba(255,255,255,0.07)'}`,
                        background: active ? 'rgba(34,211,238,0.10)' : 'rgba(255,255,255,0.018)',
                        color: active ? '#22D3EE' : 'rgba(255,255,255,0.32)',
                        fontSize: 10, letterSpacing: '0.10em', fontFamily: 'monospace',
                        cursor: 'pointer', transition: 'border-color 0.18s, background 0.18s, color 0.18s',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                      }}
                    >
                      <BodySilhouette size={22} color={active ? '#22D3EE' : 'rgba(255,255,255,0.20)'} flip={mode === 'back'} />
                      {mode.toUpperCase()} VIEW
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Layer info block */}
            <div style={{
              marginTop: 'auto',
              padding: '8px 9px', borderRadius: 8,
              border: `1px solid ${activeLayerInfo.color}28`,
              background: `${activeLayerInfo.color}0A`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                  border: `1px solid ${activeLayerInfo.color}38`,
                  background: `${activeLayerInfo.color}12`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <LayerIcon id={activeLayer} color={activeLayerInfo.color} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: activeLayerInfo.color, fontFamily: 'monospace', letterSpacing: '0.08em' }}>
                    {layerLabel}
                  </div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.30)', fontFamily: 'monospace', marginTop: 2 }}>
                    {layerDesc}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── BOTTOM BAR ──────────────────────────────────────────────────── */}
        <div style={{
          height: 48, flexShrink: 0,
          display: 'flex', alignItems: 'center',
          background: 'rgba(5,9,25,0.85)', backdropFilter: 'blur(10px)',
          borderTop: '1px solid rgba(34,211,238,0.07)',
          padding: '0 16px', gap: 0,
        }}>
          {/* Pain locator section */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              border: '1.5px solid rgba(239,68,68,0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(239,68,68,0.70)' }} />
            </div>
            <span style={{ fontSize: 10, color: 'rgba(34,211,238,0.50)', fontFamily: 'monospace', letterSpacing: '0.10em', whiteSpace: 'nowrap' }}>
              PAIN POINT LOCATOR
            </span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Tap any body region to identify pain points
            </span>
          </div>

          <div style={divider} />
          <div style={{ width: 16 }} />

          {/* Intensity scale */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: 'rgba(34,211,238,0.55)', fontFamily: 'monospace' }}>LOW</span>
            <div style={{
              width: 80, height: 4, borderRadius: 2,
              background: 'linear-gradient(to right, #22D3EE, #F97316, #EF4444)',
              opacity: 0.65,
            }} />
            <span style={{ fontSize: 10, color: 'rgba(239,68,68,0.65)', fontFamily: 'monospace' }}>HIGH</span>
          </div>

          <div style={{ width: 16 }} />
          <div style={divider} />
          <div style={{ width: 16 }} />

          {/* Layer info bottom strip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 6,
              border: `1px solid ${activeLayerInfo.color}38`,
              background: `${activeLayerInfo.color}10`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <LayerIcon id={activeLayer} color={activeLayerInfo.color} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: activeLayerInfo.color, fontFamily: 'monospace', letterSpacing: '0.06em' }}>
                {layerLabel}
              </div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', fontFamily: 'monospace' }}>
                {layerDesc}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PhaseShell>
  );
}
