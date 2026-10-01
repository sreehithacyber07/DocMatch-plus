export const CLINICAL_BOUNDARY =
  'DocMatch+ organizes what the patient reports and recommends a specialty direction; it is not a diagnosis. Clinical assessment, prescribing, treatment decisions and final clinical judgment remain with the care team.';

/*
  Session notices. Which one is true depends on the build, so neither is used
  directly by a screen: `sessionNoticeFor` picks by whether R9D persistence is
  enabled, and the runtime passes that decision in.

  Local-only builds (hospital kiosk, or no backend configured) keep responses in
  page memory and send nothing.

  Persisting builds (web/self-service, or R9G-B staffed tablet, with a backend)
  send responses to the DocMatch+ backend. The temporary sign-in is kept in page
  memory only. A staffed-tablet assessment is bound to the care team's
  facility, whose clinical staff can view it, so its notice says so.
*/
export const LOCAL_ONLY_SESSION_NOTICE =
  'Responses are held in page memory for the current assessment. DocMatch+ does not write these responses to browser storage or send them to a server. Refreshing or starting a new patient clears them.';

export const PERSISTED_SESSION_NOTICE =
  'Responses are sent to the DocMatch+ backend to keep this assessment and prepare a clinical routing handoff. Your name and other identity details are not required. The temporary sign-in for this assessment stays in page memory and is not saved to browser storage. Refreshing ends access to this assessment on this screen, and starting a new patient begins a separate one.';

export const PERSISTED_STAFFED_SESSION_NOTICE =
  'Responses are sent to the DocMatch+ backend to keep this assessment and prepare a clinical routing handoff. Clinical staff at this facility can view these responses and the prepared handoff. Your name and other identity details are not required. The temporary sign-in for this assessment stays in page memory and is not saved to browser storage. Refreshing ends access to this assessment on this screen, and starting a new patient begins a separate one.';

export interface SessionNoticeCopy {
  label: string;
  notice: string;
}

export function sessionNoticeFor(persistenceEnabled: boolean, deploymentMode?: string): SessionNoticeCopy {
  if (!persistenceEnabled) return { label: 'This session only', notice: LOCAL_ONLY_SESSION_NOTICE };
  return {
    label: 'How responses are handled',
    notice: deploymentMode === 'staffed-tablet' ? PERSISTED_STAFFED_SESSION_NOTICE : PERSISTED_SESSION_NOTICE,
  };
}
