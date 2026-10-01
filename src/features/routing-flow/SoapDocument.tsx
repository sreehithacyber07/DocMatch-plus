import { motion } from 'framer-motion';
import { accordionChild } from '../../styles/motion-variants.ts';
import type { SoapSection } from './soap-handoff.ts';

export interface SoapDocumentProps {
  /** The sections from buildSoapHandoff, rendered as given. */
  sections: readonly SoapSection[];
  status: string;
  reduced: boolean;
}

const ROLE: Record<SoapSection['key'], string> = {
  S: 'What the patient reported',
  O: 'What this device captured',
  A: 'Specialty direction from your answers',
  P: 'Where to be seen next',
};

/**
 * The SOAP handoff drawn as one document rather than four cards.
 *
 * The content is exactly what buildSoapHandoff returns; this component adds
 * only the role line under each heading, which restates the rule that section
 * already follows. The document spine joins S, O, A and P in reading order.
 *
 * MECHANICAL REASON for the motion: the spine draws down as the sections land,
 * so the four parts read as one document being assembled in order rather than
 * separate notes. With reduced motion the finished document is shown at once.
 */
export function SoapDocument({ sections, status, reduced }: SoapDocumentProps) {
  return (
    <div className="soap soap-document">
      <div className="soap-document__head">
        <span className="type-caption soap-document__kind">Clinical handoff summary</span>
        <span className="type-caption soap-document__status">{status}</span>
      </div>
      <div className="soap-document__body">
        <motion.span
          className="soap-document__spine"
          aria-hidden="true"
          initial={reduced ? false : { scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: reduced ? 0 : 0.7, ease: [0.2, 0, 0, 1] }}
        />
        {sections.map((section) => (
          // Each section is a staggered child of the SOAP Summary disclosure,
          // the same variant DiscloseItem uses.
          <motion.div className="soap__section soap-document__section" key={section.key} variants={accordionChild(reduced)}>
            <span className="soap__key soap-document__key" aria-hidden="true">
              {section.key}
            </span>
            <div className="soap__body">
              <p className="type-label soap__title">
                {section.title}
                <span className="soap-document__role"> · {ROLE[section.key]}</span>
              </p>
              <dl className="soap__lines">
                {section.lines.map((line) => (
                  <div className="soap__line" key={`${section.key}-${line.label}`}>
                    <dt className="type-caption">{line.label}</dt>
                    <dd className="type-body-small">{line.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
