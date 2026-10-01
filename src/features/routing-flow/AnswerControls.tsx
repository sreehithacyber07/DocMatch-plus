import { motion, useReducedMotion } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { presentationFor, type AnswerOptionView } from './answer-presentation.ts';
import { PainExpression, type PainExpressionLevel } from './PainExpression.tsx';
import { encodeMultiSelect, toggleMultiSelect, type IntakeQuestion } from './intake-questions.ts';
import { AssociatedLocation } from './AssociatedLocation.tsx';
import type { BodyRegionId } from '../../body/index.ts';
import type { BodyVariantId } from '../body-explorer/artwork/hitmap-geometry.ts';

/** What a body-location answer needs: the artwork already chosen and the primary area. Presentation only. */
export interface BodyLocationContext {
  variantId: BodyVariantId | null;
  primaryRegionId: BodyRegionId;
}

const EASE = [0.2, 0, 0, 1] as const;

export type AnswerTone = 'routing' | 'safety';

interface SharedProps {
  selectedId?: string | null;
  tone?: AnswerTone;
  onSelect: (optionId: string) => void;
}

/** A single tactile choice, shared by every presentation. */
export function DescriptorChoice({
  children,
  selected,
  tone,
  index,
  reduceMotion,
  className,
  label,
  onSelect,
}: {
  children: ReactNode;
  selected: boolean;
  tone: AnswerTone;
  index: number;
  reduceMotion: boolean;
  className: string;
  label?: string;
  onSelect: () => void;
}) {
  return (
    <motion.button
      className={className}
      type="button"
      data-tone={tone}
      aria-pressed={selected}
      aria-label={label}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduceMotion ? 0 : 0.32,
        ease: EASE,
        delay: reduceMotion ? 0 : 0.05 + index * 0.04,
      }}
      onClick={onSelect}
    >
      {children}
    </motion.button>
  );
}

/* ---------------------------------------------------------------------------
   Engine questions

   Option ids, their order and their meaning come from the approved knowledge
   and are never rewritten here, so a control choice can never change what an
   answer means to the engine.
   --------------------------------------------------------------------------- */

export function AnswerControl({
  options,
  selectedId,
  tone = 'routing',
  onSelect,
}: SharedProps & { options: readonly AnswerOptionView[] }) {
  const reduceMotion = Boolean(useReducedMotion());
  const presentation = presentationFor(options);

  if (presentation === 'binary') {
    return <BinaryDecision options={options} selectedId={selectedId} tone={tone} onSelect={onSelect} />;
  }

  if (presentation === 'ordinal') {
    return <DurationScale options={options} selectedId={selectedId} onSelect={onSelect} />;
  }

  return (
    <div className="answers answers--grid" role="group">
      {options.map((option, index) => (
        <DescriptorChoice
          key={option.id}
          className="answer answer--grid"
          selected={selectedId === option.id}
          tone={tone}
          index={index}
          reduceMotion={reduceMotion}
          onSelect={() => onSelect(option.id)}
        >
          <span className="answer__indicator" aria-hidden="true" />
          <span className="answer__label type-control">{option.label}</span>
        </DescriptorChoice>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Intake instruments
   --------------------------------------------------------------------------- */

/**
 * The intensity question.
 *
 * One horizontal progression, not five cards. Each stop carries its expression,
 * its number and its word; selection is a radial glow behind the mark rather
 * than a box drawn around it.
 */
export function BinaryDecision({
  options,
  selectedId,
  tone = 'routing',
  onSelect,
}: SharedProps & { options: readonly AnswerOptionView[] }) {
  const reduceMotion = Boolean(useReducedMotion());
  return (
    <div className="answers answers--binary" role="group">
      {options.map((option, index) => (
        <DescriptorChoice
          key={option.id}
          className="answer answer--binary"
          selected={selectedId === option.id}
          tone={tone}
          index={index}
          reduceMotion={reduceMotion}
          onSelect={() => onSelect(option.id)}
        >
          <span className="answer__indicator" aria-hidden="true" />
          <span className="answer__label type-control">{option.label}</span>
        </DescriptorChoice>
      ))}
    </div>
  );
}

export function FivePointScale({ options, selectedId, onSelect }: SharedProps & { options: readonly AnswerOptionView[] }) {
  const reduceMotion = Boolean(useReducedMotion());
  return (
    <div className="scale-five" role="group">
      <span className="scale-five__track" aria-hidden="true" />
      {options.map((option, index) => {
        const level = (index + 1) as PainExpressionLevel;
        return (
          <motion.button
            className="scale-five__stop"
            key={option.id}
            type="button"
            data-level={level}
            aria-pressed={selectedId === option.id}
            aria-label={`${level}, ${option.label}`}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.34, ease: EASE, delay: reduceMotion ? 0 : index * 0.06 }}
            onClick={() => onSelect(option.id)}
          >
            <span className="scale-five__halo" aria-hidden="true" />
            <PainExpression level={level} />
            <span className="scale-five__number type-data">{level}</span>
            <span className="scale-five__label type-caption">{option.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

/** An ordered run of durations, drawn as one connected instrument. */
export function DurationScale({ options, selectedId, onSelect }: SharedProps & { options: readonly AnswerOptionView[] }) {
  const reduceMotion = Boolean(useReducedMotion());
  return (
    <div className="segmented" role="group">
      <span className="segmented__track" aria-hidden="true" />
      {options.map((option, index) => (
        <DescriptorChoice
          key={option.id}
          className="segmented__step"
          selected={selectedId === option.id}
          tone="routing"
          index={index}
          reduceMotion={reduceMotion}
          onSelect={() => onSelect(option.id)}
        >
          <span className="segmented__node" aria-hidden="true" />
          <span className="segmented__label type-control">{option.label}</span>
        </DescriptorChoice>
      ))}
    </div>
  );
}

/** Improving, unchanged, worsening: a direction, so it is drawn as one. */
export function TrendSelector({ options, selectedId, onSelect }: SharedProps & { options: readonly AnswerOptionView[] }) {
  const reduceMotion = Boolean(useReducedMotion());
  return (
    <div className="trend" role="group">
      {options.map((option, index) => (
        <DescriptorChoice
          key={option.id}
          className="trend__option"
          selected={selectedId === option.id}
          tone="routing"
          index={index}
          reduceMotion={reduceMotion}
          onSelect={() => onSelect(option.id)}
        >
          <svg className="trend__arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-direction={option.id}>
            <path d={TREND_PATH[option.id] ?? TREND_PATH.same} />
          </svg>
          <span className="trend__label type-control">{option.label}</span>
        </DescriptorChoice>
      ))}
    </div>
  );
}

const TREND_PATH: Record<string, string> = {
  improving: 'M3 19h2l6-8 4 4 6-9v5h-2l-4 6-4-4-6 8H3v-2Z',
  same: 'M3 11h18v2H3v-2Z',
  worsening: 'M3 5h2l6 8 4-4 6 9v-5h-2l-4-6-4 4-6-8H3V5Z',
};

/**
 * Draws an intake question with the instrument its content asks for.
 *
 * The instrument is chosen by the question's declared control, never guessed
 * from the option labels, so adding an option can never silently change how a
 * question is answered.
 */
export function IntakeAnswerControl({
  question,
  selectedId,
  onSelect,
  bodyLocation,
}: SharedProps & { question: IntakeQuestion; bodyLocation?: BodyLocationContext | null }) {
  const shared = { options: question.options, selectedId, onSelect };
  switch (question.control) {
    case 'body-location':
      return bodyLocation
        ? <AssociatedLocation question={question} variantId={bodyLocation.variantId} primaryRegionId={bodyLocation.primaryRegionId} onSubmit={onSelect} />
        : <ChoiceGrid {...shared} />;
    case 'multi-select':
      return <MultiSelectGrid question={question} onSubmit={onSelect} />;
    case 'yes-no':
      return <BinaryDecision {...shared} />;
    case 'five-point-scale':
      return <FivePointScale {...shared} />;
    case 'segmented':
      return <DurationScale {...shared} />;
    case 'trend':
      return <TrendSelector {...shared} />;
    default:
      if (question.category === 'character') return <GraphicChoiceGrid {...shared} kind="character" />;
      if (question.category === 'onset') return <OnsetSelector {...shared} />;
      if (question.category === 'pattern') return <PatternSelector {...shared} />;
      return <ChoiceGrid {...shared} />;
  }
}

/**
 * Several findings that can coexist.
 *
 * Each option toggles; an exclusive answer such as "None of these" clears the
 * others and is cleared by them. Nothing is recorded until Continue, so a
 * patient can change their mind before the answer reaches the questionnaire.
 */
export function MultiSelectGrid({
  question,
  onSubmit,
}: {
  question: IntakeQuestion;
  onSubmit: (optionId: string) => void;
}) {
  const reduceMotion = Boolean(useReducedMotion());
  const [selected, setSelected] = useState<readonly string[]>([]);
  return (
    <div className="answers-multi">
      <div className="answers answers--grid answers--multi" role="group" aria-describedby={`${question.id}-hint`}>
        {question.options.map((option, index) => {
          const checked = selected.includes(option.id);
          return (
            <DescriptorChoice
              key={option.id}
              className="answer answer--grid answer--multi"
              selected={checked}
              tone="routing"
              index={index}
              reduceMotion={reduceMotion}
              onSelect={() => setSelected((current) => toggleMultiSelect(question, current, option.id))}
            >
              <span className="answer__check" aria-hidden="true" data-checked={checked} />
              <span className="answer__label type-control">{option.label}</span>
            </DescriptorChoice>
          );
        })}
      </div>
      <div className="answers-multi__actions">
        <p className="type-caption answers-multi__hint" id={`${question.id}-hint`}>
          {selected.length === 0 ? 'Choose at least one.' : `${selected.length} chosen.`}
        </p>
        <button
          className="cta answers-multi__continue"
          type="button"
          disabled={selected.length === 0}
          onClick={() => onSubmit(encodeMultiSelect(selected))}
        >
          <span className="type-control">Continue</span>
        </button>
      </div>
    </div>
  );
}

/** A descriptor set. Free-standing choices, no card per option. */
export function ChoiceGrid({ options, selectedId, onSelect }: SharedProps & { options: readonly AnswerOptionView[] }) {
  const reduceMotion = Boolean(useReducedMotion());
  return (
    <div className="answers answers--grid" role="group">
      {options.map((option, index) => (
        <DescriptorChoice
          key={option.id}
          className="answer answer--grid"
          selected={selectedId === option.id}
          tone="routing"
          index={index}
          reduceMotion={reduceMotion}
          onSelect={() => onSelect(option.id)}
        >
          <span className="answer__indicator" aria-hidden="true" />
          <span className="answer__label type-control">{option.label}</span>
        </DescriptorChoice>
      ))}
    </div>
  );
}

export function OnsetSelector(props: SharedProps & { options: readonly AnswerOptionView[] }) {
  return <GraphicChoiceGrid {...props} kind="onset" />;
}

export function PatternSelector(props: SharedProps & { options: readonly AnswerOptionView[] }) {
  return <GraphicChoiceGrid {...props} kind="pattern" />;
}

export function FrequencySelector(props: SharedProps & { options: readonly AnswerOptionView[] }) {
  return <DurationScale {...props} />;
}

type GraphicKind = 'character' | 'onset' | 'pattern';

const GRAPHIC_PATHS: Record<GraphicKind, Record<string, string>> = {
  character: {
    aching: 'M4 23c6-13 12-13 18 0s12 13 18 0',
    burning: 'M23 3c4 9-3 10 0 15 3-2 4-5 4-8 8 8 6 18-3 20-10 2-16-6-12-14 1 5 4 7 6 8-2-8 2-12 7-21Z',
    cramping: 'M5 18c5-12 11 12 17 0s11-12 17 0',
    dull: 'M4 20c9-7 25-7 36 0',
    other: 'M8 16h2m11 0h2m11 0h2',
    pressure: 'M3 16h13m-5-5 5 5-5 5m30-5H28m5-5-5 5 5 5',
    sharp: 'M24 2 12 18h10l-3 13 14-18H22l2-11Z',
    stiff: 'M9 5v23m13-23v23M35 5v23',
    throbbing: 'M3 17h10l4-9 7 18 4-9h13',
    'tight-band': 'M4 8h36M4 24h36M11 8v16m22-16v16',
    tight: 'M6 16h8m18 0h8M14 9l6 7-6 7m18-14-6 7 6 7',
    'air-hunger': 'M4 16c5-7 9-7 13 0s8 7 13 0M34 10v12m4-9v6',
    wheezy: 'M3 16c3-4 5-4 8 0s5 4 8 0 5-4 8 0 5 4 8 0 5-4 8 0',
    effort: 'M4 26h9l5-10 7 4 6-12h10M34 8l3-3 2 5',
    unsure: 'M8 16h2m11 0h2m11 0h2',
  },
  onset: {
    sudden: 'M3 25h16V7l7 11V7l7 11V7h9',
    gradual: 'M3 26c13 0 17-2 22-9 4-6 9-10 17-10',
    event: 'M3 24h14m4-14 4 14h18M21 6v4m-6 1 3 3m9-3-3 3',
    unsure: 'M4 23h7m5-6h7m5-6h7m4-3h3',
  },
  pattern: {
    constant: 'M3 16h39',
    intermittent: 'M3 16h7l3-8 6 16 5-16 4 8h6l3-8 5 8',
    triggered: 'M3 21h10l5-12 6 17 5-10h13',
    unsure: 'M3 16h7m6 0h7m6 0h7m5 0h1',
  },
};

function GraphicChoiceGrid({
  options,
  selectedId,
  onSelect,
  kind,
}: SharedProps & { options: readonly AnswerOptionView[]; kind: GraphicKind }) {
  const reduceMotion = Boolean(useReducedMotion());
  return (
    <div className={`answers answers--grid answers--graphic answers--${kind}`} role="group">
      {options.map((option, index) => (
        <DescriptorChoice
          key={option.id}
          className="answer answer--graphic"
          selected={selectedId === option.id}
          tone="routing"
          index={index}
          reduceMotion={reduceMotion}
          onSelect={() => onSelect(option.id)}
        >
          <svg className="answer__graphic" viewBox="0 0 46 32" fill="none" aria-hidden="true" focusable="false">
            <path d={GRAPHIC_PATHS[kind][option.id] ?? GRAPHIC_PATHS.character.unsure} />
          </svg>
          <span className="answer__label type-control">{option.label}</span>
        </DescriptorChoice>
      ))}
    </div>
  );
}
