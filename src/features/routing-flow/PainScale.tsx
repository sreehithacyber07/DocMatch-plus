import { PAIN_LEVELS, type PainLevel } from './pain-scale-data.ts';

function PainExpression({ level }: { level: PainLevel }) {
  const mouth = {
    1: 'M7 15c2.5 2 7.5 2 10 0',
    2: 'M8 15c2 1 6 1 8 0',
    3: 'M8 16h8',
    4: 'M7.5 17c2.5-2 6.5-2 9 0',
    5: 'M7 18c2.5-4 7.5-4 10 0',
  }[level];

  return (
    <svg className="pain-face" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path className="pain-face__head" d="M12 1.5c6.1 0 10.5 4.3 10.5 10.5S18.1 22.5 12 22.5 1.5 18.2 1.5 12 5.9 1.5 12 1.5Z" />
      <path className="pain-face__brow" d={level < 3 ? 'M6.5 8.5h3M14.5 8.5h3' : 'M6.5 9.5 9.5 8M14.5 8l3 1.5'} />
      <path className="pain-face__eyes" d={level === 5 ? 'm6.7 11 2.6 2m0-2-2.6 2m8-2 2.6 2m0-2-2.6 2' : 'M8 11v1M16 11v1'} />
      <path className="pain-face__mouth" d={mouth} />
      {level >= 4 ? <path className="pain-face__tension" d="M4.5 14h2M17.5 14h2" /> : null}
    </svg>
  );
}

export function PainScale({ value, onChange }: { value: PainLevel | null; onChange: (level: PainLevel) => void }) {
  return (
    <fieldset className="pain-scale">
      <legend className="pain-scale__legend">Pain / discomfort</legend>
      <div className="pain-scale__options">
        {PAIN_LEVELS.map((item) => (
          <button
            className="pain-scale__option"
            data-level={item.level}
            key={item.level}
            type="button"
            aria-pressed={value === item.level}
            aria-label={`${item.level}, ${item.label}`}
            onClick={() => onChange(item.level)}
          >
            <PainExpression level={item.level} />
            <span className="pain-scale__number">{item.level}</span>
            <span className="pain-scale__label">{item.label}</span>
          </button>
        ))}
      </div>
      <p className="pain-scale__note">Intake context only. This does not change the routing model.</p>
    </fieldset>
  );
}
