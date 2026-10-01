// src/features/body-explorer/faceHitMap.ts

/**
 * Shared frontal-face hitmap for DocMatch+.
 *
 * Coordinate system:
 *   viewBox="0 0 1000 1200"
 *
 * IMPORTANT LATERALITY:
 *   SCREEN LEFT  = PATIENT RIGHT
 *   SCREEN RIGHT = PATIENT LEFT
 *
 * This hitmap is shared by both male and female face assets.
 * If their framing differs slightly, align the image using asset registration
 * transforms rather than creating separate hitmaps.
 */

export const FACE_HITMAP_VIEWBOX = {
  width: 1000,
  height: 1200,
} as const

export type FaceRegionId =
  | "forehead"
  | "patient-right-temple"
  | "patient-left-temple"
  | "patient-right-eye"
  | "patient-left-eye"
  | "nose"
  | "patient-right-cheek"
  | "patient-left-cheek"
  | "mouth"
  | "patient-right-jaw"
  | "patient-left-jaw"
  | "chin"
  | "patient-right-ear"
  | "patient-left-ear"
  | "upper-neck"
  | "face-general"

export interface FaceHitRegion {
  id: FaceRegionId
  label: string
  /**
   * SVG path in the normalized 1000x1200 coordinate system.
   */
  path: string
  /**
   * Suggested camera target inside this region.
   * Normalized 0..1 coordinates.
   */
  focus: {
    x: number
    y: number
    defaultZoom: number
    maxZoom: number
  }
  /**
   * Lower number = test/render first.
   * Specific regions should take priority over face-general.
   */
  priority: number
}

export const FACE_HIT_REGIONS: readonly FaceHitRegion[] = [
  // ---------------------------------------------------------------------------
  // FOREHEAD
  // ---------------------------------------------------------------------------
  {
    id: "forehead",
    label: "Forehead",
    path:
      "M 330 170 C 390 135, 610 135, 670 170 L 690 310 C 625 285, 570 275, 500 278 C 430 275, 375 285, 310 310 Z",
    focus: {
      x: 0.5,
      y: 0.205,
      defaultZoom: 3.1,
      maxZoom: 5.4,
    },
    priority: 1,
  },

  // ---------------------------------------------------------------------------
  // TEMPLES
  //
  // SCREEN LEFT = PATIENT RIGHT
  // ---------------------------------------------------------------------------
  {
    id: "patient-right-temple",
    label: "Patient's right temple",
    path:
      "M 250 265 C 285 235, 330 240, 350 285 L 340 410 C 305 430, 265 420, 235 385 C 225 340, 230 300, 250 265 Z",
    focus: {
      x: 0.285,
      y: 0.285,
      defaultZoom: 3.7,
      maxZoom: 6,
    },
    priority: 1,
  },
  {
    id: "patient-left-temple",
    label: "Patient's left temple",
    path:
      "M 750 265 C 715 235, 670 240, 650 285 L 660 410 C 695 430, 735 420, 765 385 C 775 340, 770 300, 750 265 Z",
    focus: {
      x: 0.715,
      y: 0.285,
      defaultZoom: 3.7,
      maxZoom: 6,
    },
    priority: 1,
  },

  // ---------------------------------------------------------------------------
  // EYES
  // ---------------------------------------------------------------------------
  {
    id: "patient-right-eye",
    label: "Patient's right eye",
    path:
      "M 300 345 C 340 315, 410 312, 455 345 C 430 405, 345 420, 295 380 C 292 367, 294 355, 300 345 Z",
    focus: {
      x: 0.375,
      y: 0.315,
      defaultZoom: 4.6,
      maxZoom: 7,
    },
    priority: 0,
  },
  {
    id: "patient-left-eye",
    label: "Patient's left eye",
    path:
      "M 700 345 C 660 315, 590 312, 545 345 C 570 405, 655 420, 705 380 C 708 367, 706 355, 700 345 Z",
    focus: {
      x: 0.625,
      y: 0.315,
      defaultZoom: 4.6,
      maxZoom: 7,
    },
    priority: 0,
  },

  // ---------------------------------------------------------------------------
  // NOSE
  // ---------------------------------------------------------------------------
  {
    id: "nose",
    label: "Nose",
    path:
      "M 455 350 C 480 330, 520 330, 545 350 L 575 565 C 560 620, 535 650, 500 655 C 465 650, 440 620, 425 565 Z",
    focus: {
      x: 0.5,
      y: 0.445,
      defaultZoom: 4,
      maxZoom: 6.5,
    },
    priority: 0,
  },

  // ---------------------------------------------------------------------------
  // CHEEKS
  // ---------------------------------------------------------------------------
  {
    id: "patient-right-cheek",
    label: "Patient's right cheek",
    path:
      "M 270 430 C 315 405, 390 415, 435 470 L 425 640 C 380 690, 310 680, 265 630 C 240 560, 245 485, 270 430 Z",
    focus: {
      x: 0.345,
      y: 0.47,
      defaultZoom: 3.6,
      maxZoom: 5.8,
    },
    priority: 1,
  },
  {
    id: "patient-left-cheek",
    label: "Patient's left cheek",
    path:
      "M 730 430 C 685 405, 610 415, 565 470 L 575 640 C 620 690, 690 680, 735 630 C 760 560, 755 485, 730 430 Z",
    focus: {
      x: 0.655,
      y: 0.47,
      defaultZoom: 3.6,
      maxZoom: 5.8,
    },
    priority: 1,
  },

  // ---------------------------------------------------------------------------
  // MOUTH
  // ---------------------------------------------------------------------------
  {
    id: "mouth",
    label: "Mouth",
    path:
      "M 385 655 C 430 625, 570 625, 615 655 L 620 745 C 575 785, 425 785, 380 745 Z",
    focus: {
      x: 0.5,
      y: 0.6,
      defaultZoom: 4,
      maxZoom: 6.4,
    },
    priority: 0,
  },

  // ---------------------------------------------------------------------------
  // JAW
  // ---------------------------------------------------------------------------
  {
    id: "patient-right-jaw",
    label: "Patient's right jaw",
    path:
      "M 260 625 C 300 665, 345 700, 395 735 L 420 860 C 370 900, 310 870, 270 820 C 235 765, 230 685, 260 625 Z",
    focus: {
      x: 0.34,
      y: 0.69,
      defaultZoom: 3.5,
      maxZoom: 5.8,
    },
    priority: 1,
  },
  {
    id: "patient-left-jaw",
    label: "Patient's left jaw",
    path:
      "M 740 625 C 700 665, 655 700, 605 735 L 580 860 C 630 900, 690 870, 730 820 C 765 765, 770 685, 740 625 Z",
    focus: {
      x: 0.66,
      y: 0.69,
      defaultZoom: 3.5,
      maxZoom: 5.8,
    },
    priority: 1,
  },

  // ---------------------------------------------------------------------------
  // CHIN
  // ---------------------------------------------------------------------------
  {
    id: "chin",
    label: "Chin",
    path:
      "M 405 770 C 450 795, 550 795, 595 770 L 585 890 C 550 930, 450 930, 415 890 Z",
    focus: {
      x: 0.5,
      y: 0.735,
      defaultZoom: 3.8,
      maxZoom: 6,
    },
    priority: 0,
  },

  // ---------------------------------------------------------------------------
  // EARS
  //
  // SCREEN LEFT EAR = PATIENT RIGHT EAR
  // ---------------------------------------------------------------------------
  {
    id: "patient-right-ear",
    label: "Patient's right ear",
    path:
      "M 195 330 C 160 330, 158 390, 160 480 C 165 555, 175 610, 205 595 C 235 560, 240 500, 225 430 C 215 380, 205 345, 195 330 Z",
    focus: {
      x: 0.175,
      y: 0.395,
      defaultZoom: 4.4,
      maxZoom: 7,
    },
    priority: 0,
  },
  {
    id: "patient-left-ear",
    label: "Patient's left ear",
    path:
      "M 805 330 C 840 330, 842 390, 840 480 C 835 555, 825 610, 795 595 C 765 560, 760 500, 775 430 C 785 380, 795 345, 805 330 Z",
    focus: {
      x: 0.825,
      y: 0.395,
      defaultZoom: 4.4,
      maxZoom: 7,
    },
    priority: 0,
  },

  // ---------------------------------------------------------------------------
  // UPPER NECK / THROAT
  // ---------------------------------------------------------------------------
  {
    id: "upper-neck",
    label: "Upper neck and throat",
    path:
      "M 365 875 C 405 910, 595 910, 635 875 L 680 1135 C 610 1180, 390 1180, 320 1135 Z",
    focus: {
      x: 0.5,
      y: 0.87,
      defaultZoom: 2.9,
      maxZoom: 5.2,
    },
    priority: 1,
  },

  // ---------------------------------------------------------------------------
  // GENERAL FACE FALLBACK
  //
  // IMPORTANT:
  // Render/test this LAST so specific regions win.
  // ---------------------------------------------------------------------------
  {
    id: "face-general",
    label: "General face area",
    path:
      "M 300 170 C 390 115, 610 115, 700 170 C 765 245, 790 400, 760 610 C 735 760, 655 900, 500 955 C 345 900, 265 760, 240 610 C 210 400, 235 245, 300 170 Z",
    focus: {
      x: 0.5,
      y: 0.46,
      defaultZoom: 2.7,
      maxZoom: 5,
    },
    priority: 99,
  },
] as const

export const FACE_REGION_BY_ID = Object.fromEntries(
  FACE_HIT_REGIONS.map(region => [region.id, region]),
) as Record<FaceRegionId, FaceHitRegion>
