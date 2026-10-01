export const DEPLOYMENT_MODES = ['hospital-kiosk', 'staffed-tablet', 'web/self-service'] as const;

export type DeploymentMode = (typeof DEPLOYMENT_MODES)[number];

export interface DeploymentProfile {
  label: string;
  careContext: 'hospital' | 'staffed' | 'self-service';
  kioskIdleReset: boolean;
}

export const DEPLOYMENT_PROFILES: Readonly<Record<DeploymentMode, DeploymentProfile>> = {
  'hospital-kiosk': {
    label: 'Hospital kiosk',
    careContext: 'hospital',
    kioskIdleReset: true,
  },
  'staffed-tablet': {
    label: 'Staffed tablet',
    careContext: 'staffed',
    kioskIdleReset: false,
  },
  'web/self-service': {
    label: 'Web / self-service',
    careContext: 'self-service',
    kioskIdleReset: false,
  },
};

/** Accepts the R7 names plus the two pre-R7 aliases used by existing builds. */
export function resolveDeploymentMode(value: unknown): DeploymentMode {
  if (value === 'staffed-tablet' || value === 'tablet') return 'staffed-tablet';
  if (value === 'web/self-service' || value === 'web') return 'web/self-service';
  return 'hospital-kiosk';
}

export interface PriorityPayloadCopy {
  actionLabel: string;
  secondaryLabel?: string;
  headline: string;
  guidance: string;
}

export interface PriorityPresentation {
  title: string;
  guidance: string;
  primaryLabel: string;
  primaryKind: 'local-instruction' | 'telephone' | 'text';
  confirmation: string | null;
  fallback: string | null;
}

/** R3 decides whether to interrupt; this adapter changes presentation only. */
export function priorityPresentationFor(
  mode: DeploymentMode,
  payload: PriorityPayloadCopy,
): PriorityPresentation {
  if (mode === 'hospital-kiosk') {
    return {
      title: 'Priority clinical review',
      guidance: 'A reported warning sign needs review by the hospital care team now.',
      primaryLabel: 'Request clinical assistance',
      primaryKind: 'local-instruction',
      confirmation:
        'Keep this screen visible and ask the nearest hospital staff member for help now. This prototype does not notify staff automatically.',
      fallback: `Outside a staffed hospital, follow local emergency guidance: ${payload.actionLabel}`,
    };
  }

  if (mode === 'staffed-tablet') {
    return {
      title: 'Priority clinical review',
      guidance: 'A reported warning sign needs immediate review by clinical staff.',
      primaryLabel: 'Begin clinical review',
      primaryKind: 'local-instruction',
      confirmation:
        'Keep the patient with clinical staff and use this intake summary for immediate review. No external alert was sent.',
      fallback: `Emergency-services fallback outside the staffed setting: ${payload.actionLabel}`,
    };
  }

  return {
    title: payload.headline,
    guidance: payload.guidance,
    primaryLabel: payload.actionLabel,
    primaryKind: payload.actionLabel.toLowerCase().includes('112') ? 'telephone' : 'text',
    confirmation: null,
    fallback: payload.secondaryLabel ?? null,
  };
}
