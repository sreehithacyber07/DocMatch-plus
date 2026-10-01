/**
 * BodySVGView — anatomical human body as pure SVG/CSS.
 * Replaces the R3F/GLTF Soldier model for the main centre view.
 * - Three layer modes: hologram · organs · systems
 * - CSS perspective rotateY for 360° auto-rotation
 * - Pauses rotation on hover, resumes after 2 s
 * - Hover highlight per body region; click fires selectRegion
 * - Glowing circular CSS platform at the base
 */
import { useState, useRef, useCallback, useEffect, type CSSProperties } from 'react';
import type { BodyLayer } from './HolographicBody';

export type { BodyLayer };

// ── colour palette per layer ─────────────────────────────────────────────────
const LC: Record<BodyLayer, string> = {
  hologram: '#22D3EE',
  organs:   '#F97316',
  systems:  '#A855F7',
};

// ── region hit zones (normalised: x left→right 0→1, y top→bottom 0→1) ────────
const REGIONS = [
  { id: 'head',       x1:0.32, x2:0.68, y1:0.00, y2:0.14 },
  { id: 'neck',       x1:0.42, x2:0.58, y1:0.14, y2:0.19 },
  { id: 'left_arm',   x1:0.00, x2:0.22, y1:0.19, y2:0.58 },
  { id: 'right_arm',  x1:0.78, x2:1.00, y1:0.19, y2:0.58 },
  { id: 'chest',      x1:0.22, x2:0.78, y1:0.19, y2:0.42 },
  { id: 'abdomen',    x1:0.22, x2:0.78, y1:0.42, y2:0.58 },
  { id: 'pelvis',     x1:0.22, x2:0.78, y1:0.58, y2:0.65 },
  { id: 'left_leg',   x1:0.16, x2:0.48, y1:0.65, y2:1.00 },
  { id: 'right_leg',  x1:0.52, x2:0.84, y1:0.65, y2:1.00 },
] as const;

type RegionId = typeof REGIONS[number]['id'];

function hitRegion(nx: number, ny: number): RegionId {
  for (const r of REGIONS) {
    if (nx >= r.x1 && nx <= r.x2 && ny >= r.y1 && ny <= r.y2) return r.id;
  }
  return 'abdomen';
}

// ── SVG body paths (viewBox "0 0 220 510") ──────────────────────────────────
// Hologram body silhouette — single closed outline path
const BODY_OUTLINE = `
  M 110 9
  C 138 9 139 18 139 44
  C 139 66 129 72 123 76
  L 121 88
  C 140 90 158 100 168 114
  C 178 128 180 144 178 152
  C 184 153 192 153 196 150
  C 198 164 194 180 184 188
  L 183 270
  L 177 274
  L 173 268
  C 171 254 169 240 167 252
  C 163 260 158 264 152 268
  L 150 278
  L 132 280
  L 110 281
  L 88  280
  L 70  278
  L 68  268
  C 62  264 57  260 53  252
  C 51  240 49  254 47  268
  L 43  274
  L 37  270
  L 36  188
  C 26  180 22  164 24  150
  C 28  153 36  153 42  152
  C 40  144 42  128 52  114
  C 62  100 80  90  99  88
  L 97  76
  C 91  72 81  66 81  44
  C 81  18 82  9  110 9
  Z
`;

// Left leg (separate path)
const LEFT_LEG = `
  M 68 280
  L 56 280
  C 46 288 40 318 40 362
  C 40 400 44 434 48 464
  C 50 476 56 484 68 486
  C 78 486 84 482 82 472
  C 78 458 76 436 76 400
  C 76 362 78 318 80 280
  Z
`;

// Right leg (separate path)
const RIGHT_LEG = `
  M 152 280
  L 164 280
  C 174 288 180 318 180 362
  C 180 400 176 434 172 464
  C 170 476 164 484 152 486
  C 142 486 136 482 138 472
  C 142 458 144 436 144 400
  C 144 362 142 318 140 280
  Z
`;

// ── Organs definitions ───────────────────────────────────────────────────────
function OrgansOverlay() {
  return (
    <g>
      {/* Brain */}
      <ellipse cx="110" cy="40" rx="20" ry="18"
        fill="rgba(244,114,182,0.28)" stroke="#F472B6" strokeWidth="1.2"/>
      <path d="M 93,40 Q 97,31 106,35 Q 110,37 114,35 Q 123,31 127,40 Q 122,49 110,52 Q 98,49 93,40 Z"
        fill="rgba(244,114,182,0.15)" stroke="#F472B6" strokeWidth="0.8"/>
      {/* Heart */}
      <path d="M 103,128 C 94,118 76,122 76,140 C 76,158 103,174 103,174 C 103,174 130,158 130,140 C 130,122 116,118 103,128 Z"
        fill="rgba(239,68,68,0.38)" stroke="#EF4444" strokeWidth="1.5"/>
      {/* Left lung */}
      <path d="M 80,116 Q 68,122 65,145 Q 62,170 68,188 Q 76,200 90,202 Q 98,198 98,176 Q 94,152 90,130 Q 86,116 80,116 Z"
        fill="rgba(252,165,165,0.28)" stroke="#FCA5A5" strokeWidth="1.1"/>
      {/* Right lung */}
      <path d="M 140,116 Q 152,122 155,145 Q 158,170 152,188 Q 144,200 130,202 Q 122,198 122,176 Q 126,152 130,130 Q 134,116 140,116 Z"
        fill="rgba(252,165,165,0.28)" stroke="#FCA5A5" strokeWidth="1.1"/>
      {/* Stomach */}
      <path d="M 98,210 Q 82,214 78,232 Q 76,252 88,262 Q 100,270 116,266 Q 130,260 133,242 Q 136,222 126,212 Q 116,204 104,206 Q 101,206 98,210 Z"
        fill="rgba(245,158,11,0.36)" stroke="#F59E0B" strokeWidth="1.3"/>
      {/* Liver */}
      <path d="M 128,210 Q 140,212 148,226 Q 152,240 148,250 Q 142,258 132,256 Q 122,253 118,242 Q 116,228 122,218 Z"
        fill="rgba(180,83,9,0.40)" stroke="#B45309" strokeWidth="1.1"/>
      {/* Small intestine coils */}
      <path d="M 90,272 Q 70,280 72,300 Q 74,320 92,322 Q 112,324 114,304 Q 116,286 98,282 Q 80,278 78,298 Q 76,314 92,316 Q 106,318 108,302"
        fill="none" stroke="#F59E0B" strokeWidth="1.4" strokeLinecap="round" opacity="0.78"/>
      {/* Large intestine */}
      <path d="M 66,272 Q 60,296 62,322 Q 64,344 80,350 Q 100,356 120,350 Q 142,344 146,320 Q 148,296 140,272"
        fill="none" stroke="#DC2626" strokeWidth="1.7" strokeLinecap="round" opacity="0.6"/>
    </g>
  );
}

// ── Systems overlay ──────────────────────────────────────────────────────────
function SystemsOverlay({ activeSystem }: { activeSystem: string | null }) {
  const show = (s: string) => !activeSystem || activeSystem === s;
  return (
    <g>
      {/* Nervous — spine + branches */}
      {show('nervous') && (
        <g opacity={activeSystem === 'nervous' ? 1 : 0.35}>
          <line x1="110" y1="88" x2="110" y2="280" stroke="#A855F7" strokeWidth="2.2" strokeDasharray="3 2"/>
          <path d="M 110,120 Q 94,130 82,142" stroke="#A855F7" strokeWidth="1.2" fill="none" opacity="0.7"/>
          <path d="M 110,120 Q 126,130 138,142" stroke="#A855F7" strokeWidth="1.2" fill="none" opacity="0.7"/>
          <path d="M 110,158 Q 88,168 72,180" stroke="#A855F7" strokeWidth="1.1" fill="none" opacity="0.6"/>
          <path d="M 110,158 Q 132,168 148,180" stroke="#A855F7" strokeWidth="1.1" fill="none" opacity="0.6"/>
          <path d="M 110,200 Q 84,210 64,225" stroke="#A855F7" strokeWidth="1" fill="none" opacity="0.5"/>
          <path d="M 110,200 Q 136,210 156,225" stroke="#A855F7" strokeWidth="1" fill="none" opacity="0.5"/>
          <ellipse cx="110" cy="36" rx="17" ry="15" fill="rgba(168,85,247,0.2)" stroke="#A855F7" strokeWidth="1.2"/>
        </g>
      )}
      {/* Digestive */}
      {show('digestive') && (
        <g opacity={activeSystem === 'digestive' ? 1 : 0.35}>
          <path d="M 110,88 L 110,112 Q 104,130 100,150 Q 96,170 100,190 Q 106,206 110,216 Q 116,232 110,252 Q 104,272 100,292 Q 98,312 104,334"
            fill="none" stroke="#F97316" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M 100,210 Q 82,216 78,232 Q 76,250 88,258 Q 102,266 116,260 Q 130,254 132,238 Q 134,220 122,212"
            fill="rgba(245,158,11,0.25)" stroke="#F59E0B" strokeWidth="1.2"/>
        </g>
      )}
      {/* Respiratory */}
      {show('respiratory') && (
        <g opacity={activeSystem === 'respiratory' ? 1 : 0.35}>
          <line x1="110" y1="88" x2="110" y2="132" stroke="#22D3EE" strokeWidth="2" strokeLinecap="round"/>
          <path d="M 110,132 Q 96,136 82,148 Q 68,164 66,186 Q 68,202 82,206"
            fill="none" stroke="#22D3EE" strokeWidth="1.4" strokeLinecap="round"/>
          <path d="M 110,132 Q 124,136 138,148 Q 152,164 154,186 Q 152,202 138,206"
            fill="none" stroke="#22D3EE" strokeWidth="1.4" strokeLinecap="round"/>
          <ellipse cx="82" cy="160" rx="16" ry="22" fill="rgba(34,211,238,0.15)" stroke="#22D3EE" strokeWidth="1"/>
          <ellipse cx="138" cy="160" rx="16" ry="22" fill="rgba(34,211,238,0.15)" stroke="#22D3EE" strokeWidth="1"/>
        </g>
      )}
      {/* Muscular */}
      {show('muscular') && (
        <g opacity={activeSystem === 'muscular' ? 1 : 0.35}>
          <path d="M 68,94 L 52,110 Q 46,124 48,140 Q 52,150 60,152" fill="rgba(239,68,68,0.2)" stroke="#EF4444" strokeWidth="1.2"/>
          <path d="M 152,94 L 168,110 Q 174,124 172,140 Q 168,150 160,152" fill="rgba(239,68,68,0.2)" stroke="#EF4444" strokeWidth="1.2"/>
          <path d="M 68,116 Q 56,130 56,150 Q 58,170 70,176 Q 86,180 94,172 Q 100,162 98,148 Q 90,132 80,120 Z"
            fill="rgba(239,68,68,0.18)" stroke="#EF4444" strokeWidth="1"/>
          <path d="M 152,116 Q 164,130 164,150 Q 162,170 150,176 Q 134,180 126,172 Q 120,162 122,148 Q 130,132 140,120 Z"
            fill="rgba(239,68,68,0.18)" stroke="#EF4444" strokeWidth="1"/>
          <path d="M 78,204 Q 68,210 66,228 Q 66,246 78,254 Q 96,258 104,248 Q 110,236 106,220 Q 100,208 88,204 Z"
            fill="rgba(239,68,68,0.15)" stroke="#EF4444" strokeWidth="1"/>
          <path d="M 142,204 Q 152,210 154,228 Q 154,246 142,254 Q 124,258 116,248 Q 110,236 114,220 Q 120,208 132,204 Z"
            fill="rgba(239,68,68,0.15)" stroke="#EF4444" strokeWidth="1"/>
        </g>
      )}
    </g>
  );
}

// ── Hologram meridian + scan ring decorations ─────────────────────────────────
function HoloDecorations({ color }: { color: string }) {
  return (
    <g opacity="1">
      {/* Horizontal scan ellipses */}
      {[108, 158, 208, 260].map((y, i) => (
        <ellipse key={i} cx="110" cy={y} rx={y < 130 ? 38 : y < 180 ? 54 : y < 230 ? 52 : 40}
          ry="5" fill="none" stroke={color} strokeWidth="0.7" opacity="0.28"/>
      ))}
      {/* Vertical meridian dashes */}
      <line x1="110" y1="9"  x2="110" y2="488" stroke={color} strokeWidth="0.6" strokeDasharray="3 4" opacity="0.22"/>
      <line x1="80"  y1="90" x2="72"  y2="280" stroke={color} strokeWidth="0.5" strokeDasharray="3 4" opacity="0.16"/>
      <line x1="140" y1="90" x2="148" y2="280" stroke={color} strokeWidth="0.5" strokeDasharray="3 4" opacity="0.16"/>
      {/* Joint glow dots */}
      {[
        [110,8],[110,88],[42,152],[178,152],
        [19,188],[201,188],[19,272],[201,272],
        [64,282],[156,282],[44,365],[176,365],[48,468],[172,468],
      ].map(([cx,cy],i) => (
        <circle key={i} cx={cx} cy={cy} r="3.5" fill={color} opacity="0.85"
          style={{ filter:`drop-shadow(0 0 4px ${color})` }}/>
      ))}
    </g>
  );
}

// ── Hover region overlays ─────────────────────────────────────────────────────
const REGION_PATHS: Record<RegionId, string> = {
  head:      'M 83,8 A 28,33 0 1 1 137,8 A 28,33 0 1 1 83,8 Z',
  neck:      'M 93,74 L 93,90 L 127,90 L 127,74 Z',
  chest:     'M 42,90 L 178,90 L 178,210 L 42,210 Z',
  abdomen:   'M 46,210 L 174,210 L 174,278 L 46,278 Z',
  pelvis:    'M 54,278 L 166,278 L 166,295 L 54,295 Z',
  left_arm:  'M 16,150 L 46,150 L 46,280 L 16,280 Z',
  right_arm: 'M 174,150 L 204,150 L 204,280 L 174,280 Z',
  left_leg:  'M 36,280 L 84,280 L 84,492 L 36,492 Z',
  right_leg: 'M 136,280 L 184,280 L 184,492 L 136,492 Z',
};

// ── CSS platform rings ───────────────────────────────────────────────────────
function PlatformRings({ color }: { color: string }) {
  return (
    <div style={{ position:'absolute', bottom:0, left:'50%', transform:'translateX(-50%)', width:380, height:30, pointerEvents:'none' }}>
      {[
        { w:320, opacity:0.22, dur:'10s' },
        { w:240, opacity:0.35, dur:'7s' },
        { w:152, opacity:0.55, dur:'5s' },
      ].map((r,i) => (
        <div key={i} style={{
          position:'absolute', left:'50%', top:'50%',
          width:r.w, height:14,
          transform:'translate(-50%,-50%)',
          borderRadius:'50%',
          border:`1px solid ${color}`,
          opacity:r.opacity,
          boxShadow:`0 0 10px ${color}50, inset 0 0 8px ${color}20`,
          animation:`platformSpin${i} ${r.dur} linear infinite`,
        }}/>
      ))}
      {/* Floor glow */}
      <div style={{
        position:'absolute', left:'50%', top:'50%',
        transform:'translate(-50%,-50%)',
        width:148, height:6, borderRadius:'50%',
        background:`radial-gradient(ellipse, ${color}70 0%, transparent 70%)`,
      }}/>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
interface Props {
  layer:        BodyLayer;
  viewMode?:    'front' | 'back';
  activeSystem?: string | null;
  onHover?:     (regionId: string | null) => void;
  onSelect?:    (regionId: string) => void;
  selectedRegions?: string[];
}

export function BodySVGView({
  layer,
  viewMode = 'front',
  activeSystem = null,
  onHover,
  onSelect,
  selectedRegions = [],
}: Props) {
  const [hoveredRegion, setHoveredRegion] = useState<RegionId | null>(null);
  const [spinning, setSpinning]           = useState(true);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const c = LC[layer];
  const fillBase   = layer === 'hologram' ? 'rgba(5,22,48,0.68)'
                   : layer === 'organs'   ? 'rgba(12,3,3,0.82)'
                   : 'rgba(5,3,18,0.78)';
  const strokeBase = layer === 'hologram' ? '#22D3EE'
                   : layer === 'organs'   ? 'rgba(249,115,22,0.5)'
                   : 'rgba(168,85,247,0.55)';
  const glowPx     = layer === 'hologram' ? 12 : 7;

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top)  / rect.height;
    const region = hitRegion(nx, ny);
    if (region !== hoveredRegion) {
      setHoveredRegion(region);
      onHover?.(region);
    }
    // pause rotation while hovering
    setSpinning(false);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setSpinning(true), 2000);
  }, [hoveredRegion, onHover]);

  const handleMouseLeave = useCallback(() => {
    setHoveredRegion(null);
    onHover?.(null);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setSpinning(true), 500);
  }, [onHover]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top)  / rect.height;
    const region = hitRegion(nx, ny);
    onSelect?.(region);
  }, [onSelect]);

  useEffect(() => () => { if (resumeTimer.current) clearTimeout(resumeTimer.current); }, []);

  // flip X for back view
  const bodyTransform = viewMode === 'back'
    ? 'scale(-1,1) translate(-220,0)'
    : undefined;

  const spinStyle: CSSProperties = {
    animation: spinning ? 'bodySpin 14s linear infinite' : 'none',
    transformStyle: 'preserve-3d',
  };

  return (
    <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end', position:'relative' }}>
      {/* perspective wrapper */}
      <div style={{ perspective:'700px', perspectiveOrigin:'50% 46%', flex:1, display:'flex', alignItems:'center', justifyContent:'center', paddingBottom:28 }}>
        <div
          ref={containerRef}
          style={{
            ...spinStyle,
            position:'relative',
            height:'min(88vh, 740px)',
            aspectRatio:'0.43',
            cursor:'crosshair',
            filter:`drop-shadow(0 0 ${glowPx}px ${c}80) drop-shadow(0 0 ${glowPx*2.5}px ${c}30)`,
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
        >
          {/* Scanlines overlay */}
          <div style={{
            position:'absolute', inset:0, zIndex:3, pointerEvents:'none',
            background:'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(34,211,238,0.022) 3px,rgba(34,211,238,0.022) 4px)',
          }}/>

          {/* Main SVG */}
          <svg
            viewBox="0 0 220 510"
            width="100%"
            height="100%"
            style={{ display:'block', overflow:'visible' }}
          >
            <defs>
              <filter id="bsv-glow">
                <feGaussianBlur stdDeviation="3.5" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="bsv-soft">
                <feGaussianBlur stdDeviation="2" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            {/* ── Body silhouette ── */}
            <g transform={bodyTransform} filter="url(#bsv-glow)">
              {/* Torso + arms + head */}
              <path
                d={BODY_OUTLINE}
                fill={fillBase}
                stroke={strokeBase}
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              {/* Left leg */}
              <path
                d={LEFT_LEG}
                fill={fillBase}
                stroke={strokeBase}
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              {/* Right leg */}
              <path
                d={RIGHT_LEG}
                fill={fillBase}
                stroke={strokeBase}
                strokeWidth="1.4"
                strokeLinejoin="round"
              />

              {/* ── Layer-specific overlays ── */}
              {layer === 'hologram' && <HoloDecorations color={c}/>}
              {layer === 'organs'   && <OrgansOverlay/>}
              {layer === 'systems'  && <SystemsOverlay activeSystem={activeSystem}/>}

              {/* ── Hover + selected region highlights ── */}
              {(Object.entries(REGION_PATHS) as [RegionId, string][]).map(([id, d]) => {
                const isHov = hoveredRegion === id;
                const isSel = selectedRegions.includes(id);
                if (!isHov && !isSel) return null;
                return (
                  <path
                    key={id}
                    d={d}
                    fill={isSel ? `${c}28` : `${c}15`}
                    stroke={c}
                    strokeWidth="1.2"
                    strokeDasharray={isHov && !isSel ? '5 3' : undefined}
                    opacity="0.9"
                    style={{ transition:'fill 0.15s' }}
                  />
                );
              })}

              {/* Hover label */}
              {hoveredRegion && (
                <text
                  x="110" y="502"
                  textAnchor="middle"
                  fill={c}
                  fontSize="9"
                  letterSpacing="2.5"
                  style={{ filter:`drop-shadow(0 0 5px ${c})`, fontFamily:'monospace' }}
                >
                  {hoveredRegion.replace('_',' ').toUpperCase()}
                </text>
              )}
            </g>
          </svg>
        </div>
      </div>

      {/* ── Circular platform ── */}
      <PlatformRings color={c}/>

      {/* CSS keyframes */}
      <style>{`
        @keyframes bodySpin {
          from { transform: perspective(700px) rotateY(0deg);   }
          to   { transform: perspective(700px) rotateY(360deg); }
        }
        @keyframes platformSpin0 {
          from { transform: translate(-50%,-50%) rotate(0deg)   scaleY(0.18); }
          to   { transform: translate(-50%,-50%) rotate(360deg) scaleY(0.18); }
        }
        @keyframes platformSpin1 {
          from { transform: translate(-50%,-50%) rotate(0deg)    scaleY(0.18); }
          to   { transform: translate(-50%,-50%) rotate(-360deg) scaleY(0.18); }
        }
        @keyframes platformSpin2 {
          from { transform: translate(-50%,-50%) rotate(0deg)   scaleY(0.18); }
          to   { transform: translate(-50%,-50%) rotate(360deg) scaleY(0.18); }
        }
      `}</style>
    </div>
  );
}
