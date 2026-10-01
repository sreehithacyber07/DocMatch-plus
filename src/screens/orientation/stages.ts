import type { PictogramName } from '../../components/pictograms';

export interface Stage {
  id: string;
  name: string;
  /** The action the person takes, written as a short instruction. */
  action: string;
  detail: string;
  provides: string;
  returns: string;
  pictogram: PictogramName;
  /** Steps that belong to the safety register read in critical colour. */
  register?: 'critical';
}

/**
 * The five stages of the DocMatch route. These describe the product's actual
 * flow. No symptom, question, specialty or clinical value is stated here; that
 * content belongs to the engine and is not connected to this screen.
 */
export const stages: Stage[] = [
  {
    id: 'locate',
    name: 'Locate',
    action: 'Point to the part of the body that is affected.',
    detail:
      'The route opens on the body. You indicate the area that brought you here, without needing a name for it.',
    provides: 'A place on the body',
    returns: 'A body region',
    pictogram: 'body',
  },
  {
    id: 'refine',
    name: 'Refine',
    action: 'Narrow the area down to the exact spot.',
    detail:
      'A general area is enough to begin. Refining the point separates areas that sit close together and read alike.',
    provides: 'An exact point',
    returns: 'A narrowed region',
    pictogram: 'location',
  },
  {
    id: 'clarify',
    name: 'Clarify',
    action: 'Answer the questions that follow from your answers.',
    detail:
      'Each question is chosen from what you have already said. Questions that no longer separate anything are not asked.',
    provides: 'Answers in your own terms',
    returns: 'A narrowed set of specialties',
    pictogram: 'question',
  },
  {
    id: 'check',
    name: 'Check',
    action: 'The answers are screened for patterns that need urgent care.',
    detail:
      'This check runs against every answer, not only the last one. When a pattern matches, the route changes register and says so plainly.',
    provides: 'The answers already given',
    returns: 'An urgent care flag when a pattern matches',
    pictogram: 'alert',
    register: 'critical',
  },
  {
    id: 'route',
    name: 'Route',
    action: 'Take the result to the right specialist.',
    detail:
      'The route ends with the kind of specialist to see and the reasoning that led there, in language you can carry into an appointment.',
    provides: 'A completed route',
    returns: 'A specialty to see',
    pictogram: 'routing',
  },
];
