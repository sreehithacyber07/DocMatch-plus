import { useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState, useSyncExternalStore, type TouchEvent } from 'react';
import { CountUp } from './CountUp.tsx';
import { specialtyLandscape } from './specialtyLandscape.ts';
import { SpecialtyWheel } from './SpecialtyWheel.tsx';
import './specialty-landscape.css';

const MOBILE_QUERY = '(max-width: 43.75rem)';
const REPRESENTATIVE = [
  'Family Medicine',
  'Cardiology',
  'Gastroenterology',
  'Neurology',
  'Emergency Medicine',
] as const;

function subscribeMobile(listener: () => void) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

function isMobileViewport() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function wrap(index: number, count: number) {
  return ((index % count) + count) % count;
}

function SpecialtyReel({ active }: { active: boolean }) {
  const [index, setIndex] = useState(2);
  const pauseUntilRef = useRef(0);
  const touchStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      if (document.hidden || performance.now() < pauseUntilRef.current) return;
      setIndex((current) => current + 1);
    }, 950);
    return () => window.clearInterval(timer);
  }, [active]);

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (start === null) return;
    const distance = event.changedTouches[0].clientY - start;
    if (Math.abs(distance) < 24) return;
    pauseUntilRef.current = performance.now() + 2000;
    setIndex((current) => current + (distance < 0 ? 1 : -1));
  };

  return (
    <div
      className="dm-landscape-reel"
      aria-hidden="true"
      onTouchStart={(event) => { touchStartRef.current = event.touches[0].clientY; }}
      onTouchEnd={onTouchEnd}
    >
      {[-2, -1, 0, 1, 2].map((offset) => (
        <div className="dm-landscape-reel__item" data-offset={offset} key={offset}>
          {specialtyLandscape[wrap(index + offset, specialtyLandscape.length)]}
        </div>
      ))}
    </div>
  );
}

export function SpecialtyLandscape() {
  const sectionRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(false);
  const [countStarted, setCountStarted] = useState(false);
  const reducedMotion = Boolean(useReducedMotion());
  const mobile = useSyncExternalStore(subscribeMobile, isMobileViewport, () => false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(([entry]) => {
      const meaningful = entry.isIntersecting && entry.intersectionRatio >= 0.3;
      setActive(meaningful);
      if (meaningful) setCountStarted(true);
    }, { threshold: [0, 0.3, 0.6] });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || reducedMotion) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const top = section.getBoundingClientRect().top;
      const viewport = window.innerHeight;
      const recede = Math.max(0, Math.min(1, (-top - viewport * 0.22) / (viewport * 0.58)));
      section.style.setProperty('--landscape-recede', recede.toFixed(3));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [reducedMotion]);

  return (
    <section
      ref={sectionRef}
      className="dm-landscape"
      id="specialty-landscape"
      data-dna-anchor
      data-dna-x="0.5"
      data-active={active || undefined}
      aria-labelledby="dm-landscape-title"
    >
      <div className="dm-landscape__frame">
        <div className="dm-landscape__copy">
          <p className="dm-eyebrow">The specialty landscape</p>
          <h2 id="dm-landscape-title">One concern can point<br />in many directions.</h2>
          <p className="dm-landscape__accent">Context narrows the field.</p>
          <p className="dm-landscape__body">Medicine spans a wide range of specialties and subspecialties. DocMatch+ organizes the patient-reported story before presenting the specialty direction supported by the current intake.</p>
          <div className="dm-landscape__count" aria-label={`Reference taxonomy containing ${specialtyLandscape.length} specialty and subspecialty labels.`}>
            <p className="dm-landscape__count-caption">Reference taxonomy</p>
            <div className="dm-landscape__number" aria-hidden="true">
              <CountUp from={0} to={specialtyLandscape.length} duration={1.8} startWhen={countStarted} reducedMotion={reducedMotion} />
            </div>
            <p className="dm-landscape__count-label">Specialty + subspecialty paths</p>
          </div>
          <p className="dm-landscape__disclaimer">Reference landscape only. Displayed specialties are not all enabled routing destinations in this prototype.</p>
        </div>
        <div className="dm-landscape__field">
          <p className="dm-landscape__field-caption">A broad clinical landscape</p>
          {reducedMotion ? (
            <div className="dm-landscape__static" aria-hidden="true">
              {REPRESENTATIVE.map((name) => <span key={name}>{name}</span>)}
            </div>
          ) : mobile ? (
            <SpecialtyReel active={active} />
          ) : (
            <SpecialtyWheel items={specialtyLandscape} active={active} />
          )}
        </div>
      </div>
      <div className="dm-landscape__exit" aria-hidden="true">
        <span />
        <p>From many possibilities<br />to one supported direction.</p>
      </div>
    </section>
  );
}
