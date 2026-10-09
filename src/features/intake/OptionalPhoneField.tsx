import type { CountryCode } from 'libphonenumber-js/min';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { countries, searchCallingCodes, type PhoneValue } from './phone-country.ts';

const flagPath = (iso: string) => `/flags/${iso.toLowerCase()}.svg`;

/**
 * Optional contact. The value is held by the intake in page memory, so it is
 * still there when the patient goes back to About you. It is never part of the
 * patient context, never persisted and never written to browser storage.
 */
export function OptionalPhoneField({ value, onChange }: { value: PhoneValue; onChange: (value: PhoneValue) => void }) {
  const { country, number } = value;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<CSSProperties>({ position: 'fixed', visibility: 'hidden' });
  const choices = searchCallingCodes(query);
  const selected = countries.find((item) => item.iso === country)!;

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(360, window.innerWidth - 30);
      const height = Math.min(330, window.innerHeight - 25);
      const left = Math.max(15, Math.min(rect.left, window.innerWidth - width - 15));
      const above = rect.top > height + 15;
      const top = above ? rect.top - height - 6 : Math.min(rect.bottom + 6, window.innerHeight - height - 12);
      setPlacement({ position: 'fixed', left, top: Math.max(12, top), width, visibility: 'visible' });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popoverRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const choose = (iso: CountryCode) => {
    onChange({ ...value, country: iso });
    setQuery('');
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="context-phone">
      <div className="context-phone__row">
        <button
          ref={triggerRef}
          className="context-phone__country-trigger"
          type="button"
          aria-label={`Country calling code, ${selected.name} ${selected.dial}`}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => {
            setOpen((value) => !value);
            window.requestAnimationFrame(() => searchRef.current?.focus());
          }}
        >
          <img className="context-phone__flag" src={flagPath(selected.iso)} alt="" aria-hidden="true" width="20" height="15" />
          <span>{selected.dial}</span>
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m4 6 4 4 4-4" /></svg>
        </button>
        <input
          id="context-phone-number"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          spellCheck={false}
          aria-label="Contact number, optional"
          placeholder="Mobile number (optional)"
          value={number}
          onChange={(event) => onChange({ ...value, number: event.target.value.replace(/[^\d\s()-]/g, '').slice(0, 25) })}
        />
      </div>
      {open ? createPortal(
        <div className="context-phone__popover" ref={popoverRef} style={placement}>
          <label className="sr-only" htmlFor="context-phone-search">Search country or code</label>
          <input
            id="context-phone-search"
            ref={searchRef}
            role="combobox"
            aria-expanded="true"
            aria-controls="context-phone-options"
            aria-activedescendant={choices[active] ? `context-phone-option-${choices[active].iso}` : undefined}
            autoComplete="off"
            spellCheck={false}
            placeholder="Search country or code"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActive(0); }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setOpen(false);
                triggerRef.current?.focus();
              }
              if (event.key === 'ArrowDown') { event.preventDefault(); setActive((index) => Math.min(choices.length - 1, index + 1)); }
              if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => Math.max(0, index - 1)); }
              if (event.key === 'Enter' && choices[active]) { event.preventDefault(); choose(choices[active].iso); }
            }}
          />
          <div id="context-phone-options" className="context-phone__options" role="listbox" aria-label="Country calling codes">
            {choices.length ? choices.map((option, index) => (
              <button
                type="button"
                role="option"
                aria-selected={country === option.iso}
                id={`context-phone-option-${option.iso}`}
                className="context-phone__option"
                data-active={index === active}
                key={option.iso}
                onClick={() => choose(option.iso)}
              >
                <span><img className="context-phone__flag" src={flagPath(option.iso)} alt="" aria-hidden="true" width="20" height="15" loading="lazy" /> {option.name} <small>{option.iso}</small></span>
                <strong>{option.dial}</strong>
              </button>
            )) : <p className="context-phone__empty">No matching country</p>}
          </div>
        </div>, document.body,
      ) : null}
    </div>
  );
}
