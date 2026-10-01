// Plain TypeScript — imports ONLY from @/types/index. No React, no Three.js.
// All check() functions are pure predicates (same inputs → same output)
// and defensive (never throw on missing / malformed input).

import type { RedFlagRule } from '@/types/index';

export const redFlagRules: RedFlagRule[] = [
  // ── CRITICAL ─────────────────────────────────────────────────────────────

  {
    id: 'CRITICAL_CHEST_PAIN',
    name: 'Critical Chest Pain',
    severity: 'critical',
    description: 'Chest pain combined with breathing difficulty or radiating pain may indicate a heart attack.',
    immediateAction: 'Proceed to Emergency Care immediately. Sit down and stay calm. Call a staff member now.',
    overrideAction: 'emergency_immediate',
    disableComfort: true,
    check: (ctx) => {
      const hasChest = ctx.regions.includes('chest');
      if (!hasChest) return false;
      const breathless  = ctx.answers['breathless'] === 'yes';
      const radiatesArm = ctx.answers['pain_radiates'] === 'arm';
      const radiatesJaw = ctx.answers['pain_radiates'] === 'jaw';
      return breathless || radiatesArm || radiatesJaw;
    },
  },

  {
    id: 'CRITICAL_STROKE',
    name: 'Possible Stroke',
    severity: 'critical',
    description: 'Sudden weakness with speech difficulty or vision changes may indicate a stroke.',
    immediateAction: 'Note the exact time symptoms started. Proceed to Emergency Care immediately — do not drive yourself.',
    overrideAction: 'emergency_immediate',
    disableComfort: true,
    check: (ctx) => {
      const a = ctx.answers;
      const suddenWeakness   = a['sudden_weakness']   === 'yes';
      const speechDifficulty = a['speech_difficulty'] === 'yes';
      const facialDroop      = a['facial_droop']      === 'yes';
      const visionChanges    = a['vision_changes']    === 'yes';
      return (
        (suddenWeakness && speechDifficulty) ||
        facialDroop ||
        (suddenWeakness && visionChanges)
      );
    },
  },

  {
    id: 'CRITICAL_BLEEDING',
    name: 'Severe / Internal Bleeding',
    severity: 'critical',
    description: 'Vomiting blood or uncontrolled severe bleeding requires immediate emergency care.',
    immediateAction: 'Apply pressure to any visible wound. Call for help immediately and do not leave the patient alone.',
    overrideAction: 'emergency_immediate',
    disableComfort: true,
    check: (ctx) => {
      const a = ctx.answers;
      return a['vomiting_blood'] === 'yes' || a['severe_bleeding'] === 'yes';
    },
  },

  {
    id: 'CRITICAL_BREATHING',
    name: 'Severe Breathing Difficulty',
    severity: 'critical',
    description: 'Severe shortness of breath or inability to speak in full sentences is a life-threatening emergency.',
    immediateAction: 'Sit upright and try to remain calm. Call for emergency assistance immediately.',
    overrideAction: 'emergency_immediate',
    disableComfort: true,
    check: (ctx) => {
      const a = ctx.answers;
      const severeBreathe      = a['breathless'] === 'severe';
      const cannotSpeak        = a['cannot_speak_full_sentences'] === 'yes';
      const breathlessWithGap  = a['breathless'] === 'yes' && cannotSpeak;
      return severeBreathe || breathlessWithGap;
    },
  },

  {
    id: 'CRITICAL_ANAPHYLAXIS',
    name: 'Possible Anaphylaxis',
    severity: 'critical',
    description: 'Throat swelling or a sudden rash with breathing difficulty may indicate a severe allergic reaction.',
    immediateAction: 'Use an EpiPen if available and call Emergency Care immediately. Lie down with legs raised unless breathing is difficult.',
    overrideAction: 'emergency_immediate',
    disableComfort: true,
    check: (ctx) => {
      const a = ctx.answers;
      const throatSwelling = a['throat_swelling'] === 'yes';
      const suddenRashBreath =
        a['skin_rash'] === 'sudden' && a['breathless'] === 'yes';
      return throatSwelling || suddenRashBreath;
    },
  },

  // ── URGENT ────────────────────────────────────────────────────────────────

  {
    id: 'URGENT_HEAD_INJURY',
    name: 'Head Injury with Neurological Signs',
    severity: 'urgent',
    description: 'Recent head trauma combined with confusion or vomiting may indicate a serious brain injury.',
    immediateAction: 'Do not leave the patient alone. Proceed to Urgent Care immediately — CT scan may be required.',
    overrideAction: 'urgent_fast_track',
    disableComfort: true,
    check: (ctx) => {
      const a = ctx.answers;
      const headTrauma = a['recent_head_trauma'] === 'yes';
      if (!headTrauma) return false;
      return a['confusion'] === 'yes' || a['vomiting'] === 'yes';
    },
  },

  {
    id: 'URGENT_SEVERE_PAIN',
    name: 'Sudden Maximum-Severity Pain',
    severity: 'urgent',
    description: 'Pain rated 10/10 with sudden onset may indicate a serious medical emergency.',
    immediateAction: 'Do not wait. Proceed to Urgent Care now for immediate evaluation.',
    overrideAction: 'urgent_fast_track',
    disableComfort: true,
    check: (ctx) => {
      const sev = Number(ctx.answers['severity'] ?? 0);
      return sev >= 10 && ctx.answers['onset'] === 'sudden';
    },
  },

  {
    id: 'URGENT_MENINGITIS_SCREEN',
    name: 'Meningitis Screening',
    severity: 'urgent',
    description: 'High fever combined with stiff neck or light sensitivity may indicate meningitis.',
    immediateAction: 'Proceed to Urgent Care immediately. Bacterial meningitis is time-sensitive.',
    overrideAction: 'urgent_fast_track',
    disableComfort: true,
    check: (ctx) => {
      const a = ctx.answers;
      if (a['fever'] !== 'high') return false;
      return a['stiff_neck'] === 'yes' || a['light_sensitivity'] === 'yes';
    },
  },

  {
    id: 'URGENT_PREGNANCY_BLEEDING',
    name: 'Pregnancy with Vaginal Bleeding',
    severity: 'urgent',
    description: 'Vaginal bleeding during pregnancy requires urgent obstetric evaluation.',
    immediateAction: 'Proceed to Obstetric Urgent Care immediately. Do not drive alone.',
    overrideAction: 'urgent_fast_track',
    disableComfort: true,
    check: (ctx) => {
      const a    = ctx.answers;
      const p    = ctx.patient;
      const isFemalePregnant =
        p.gender === 'female' && a['pregnant'] === 'yes';
      const relevantRegion =
        ctx.regions.includes('abdomen') || ctx.regions.includes('pelvis');
      const hasBleeding = a['vaginal_bleeding'] === 'yes';
      return isFemalePregnant && relevantRegion && hasBleeding;
    },
  },

  // ── WARNING ───────────────────────────────────────────────────────────────

  {
    id: 'WARNING_PERSISTENT_WORSENING',
    name: 'Persistent and Worsening Symptoms',
    severity: 'warning',
    description: 'Symptoms present for a month or more that are worsening should be evaluated promptly.',
    immediateAction: 'Schedule a GP appointment within 48 hours and bring a symptom diary.',
    overrideAction: 'doctor_alert',
    disableComfort: false,
    check: (ctx) => {
      const a = ctx.answers;
      return a['duration'] === 'months' && a['worsening'] === 'yes';
    },
  },

  {
    id: 'WARNING_UNEXPLAINED_WEIGHT_LOSS',
    name: 'Unexplained Weight Loss with Fatigue',
    severity: 'warning',
    description: 'Unintended weight loss combined with fatigue warrants investigation for underlying conditions.',
    immediateAction: 'Book a GP appointment this week for blood tests and a full assessment.',
    overrideAction: 'doctor_alert',
    disableComfort: false,
    check: (ctx) => {
      const a = ctx.answers;
      return a['weight_loss'] === 'yes' && a['fatigue'] === 'yes';
    },
  },

  {
    id: 'WARNING_ELDERLY_FALL',
    name: 'Fall in Elderly Patient',
    severity: 'warning',
    description: 'Falls in patients aged 65+ with moderate or higher pain need prompt medical review.',
    immediateAction: 'Seek a medical assessment today to rule out fractures and check for ongoing fall risk.',
    overrideAction: 'doctor_alert',
    disableComfort: false,
    check: (ctx) => {
      const age = ctx.patient.age ?? 0;
      const sev = Number(ctx.answers['severity'] ?? 0) || 0;
      return age >= 65 && ctx.answers['recent_fall'] === 'yes' && sev >= 5;
    },
  },
];
