/** Approved presentation assets. Clinical routing never imports this map. */
export const BODY_ASSETS = {
  male: {
    hologram: { front: '/body/male hologram front.png', back: '/body/male hologram back.png' },
    systems: { front: '/body/male systems front.png', back: '/body/male systems back.png' },
    structures: { front: '/body/male organ front.png', back: '/body/male organ back.png' },
    focus: { face: '/body/male face.png' },
  },
  female: {
    hologram: { front: '/body/female hologram front.png', back: '/body/female hologram back.png' },
    systems: { front: '/body/female systems front.png', back: '/body/female systems back.png' },
    structures: { front: '/body/female organ front.png', back: '/body/female organ back.png' },
    focus: { face: '/body/female face.png' },
  },
} as const;
