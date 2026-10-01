import { useCallback, useEffect, useReducer, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { enterAvailable, heroReducer, initialHeroState, videoMounted } from './hero-state.ts';
import { Brandmark } from './Brandmark.tsx';
import './hero.css';

const VIDEO_SRC = '/hero.mp4';
const STILL_SRC = '/hero-poster.jpg';
const EASE = [0.2, 0, 0, 1] as const;

export interface HeroExperienceProps {
  onExiting: () => void;
  onDismissed: () => void;
}

export function HeroExperience({ onExiting, onDismissed }: HeroExperienceProps) {
  const reducedMotion = Boolean(useReducedMotion());
  const [state, dispatch] = useReducer(heroReducer, { reducedMotion }, initialHeroState);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ambientRef = useRef<HTMLVideoElement | null>(null);
  const leavingRef = useRef(false);
  const showVideo = videoMounted(state, { reducedMotion });
  const exiting = state === 'exiting';

  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(() => dispatch('exit-complete'), reducedMotion ? 80 : 650);
    return () => window.clearTimeout(timer);
  }, [exiting, reducedMotion]);

  useEffect(() => {
    if (state === 'dismissed') onDismissed();
  }, [state, onDismissed]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const attempt = video.play();
    attempt?.catch(() => dispatch('video-error'));
  }, [showVideo]);

  const syncAmbient = useCallback(() => {
    const video = videoRef.current;
    const ambient = ambientRef.current;
    if (!video || !ambient) return;
    if (Math.abs(ambient.currentTime - video.currentTime) > 0.25) {
      ambient.currentTime = video.currentTime;
    }
    if (ambient.paused && !video.paused) ambient.play().catch(() => undefined);
  }, []);

  const handleEnded = useCallback(() => {
    videoRef.current?.pause();
    ambientRef.current?.pause();
    dispatch('video-ended');
  }, []);

  const handleEnter = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    onExiting();
    dispatch('enter');
  }, [onExiting]);

  return (
    <motion.div
      className="hero"
      data-state={state}
      initial={false}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: reducedMotion ? 0.08 : 0.65, ease: EASE }}
      aria-label="DocMatch introduction"
    >
      <motion.div
        className="hero__scene"
        initial={false}
        animate={{ scale: exiting && !reducedMotion ? 1.025 : 1 }}
        transition={{ duration: reducedMotion ? 0 : 0.65, ease: EASE }}
      >
        <img className="hero__ambient hero__ambient--still" src={STILL_SRC} alt="" aria-hidden="true" />
        <img className="hero__still" src={STILL_SRC} alt="" aria-hidden="true" />
        {showVideo ? (
          <>
            <video
              className="hero__ambient hero__ambient--video"
              ref={ambientRef}
              src={VIDEO_SRC}
              poster={STILL_SRC}
              muted
              autoPlay
              playsInline
              preload="auto"
              aria-hidden="true"
              tabIndex={-1}
            />
            <video
              className="hero__video"
              ref={videoRef}
              src={VIDEO_SRC}
              poster={STILL_SRC}
              muted
              autoPlay
              playsInline
              preload="auto"
              aria-hidden="true"
              tabIndex={-1}
              onCanPlay={() => dispatch('video-ready')}
              onPlaying={syncAmbient}
              onTimeUpdate={syncAmbient}
              onEnded={handleEnded}
              onError={() => dispatch('video-error')}
            />
          </>
        ) : null}
        <span className="hero__scrim" aria-hidden="true" />
      </motion.div>

      <div className="hero__content">
        <div className="hero__identity">
          <h1 className="hero__heading"><Brandmark size="hero" /></h1>
          {enterAvailable(state) ? (
            <button
              className="hero__action hero__action--enter"
              type="button"
              onClick={handleEnter}
            >
              <span className="type-control">Enter</span>
              <svg className="hero__arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M3 11h13l-5-5 2-2 8 8-8 8-2-2 5-5H3v-2Z" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
