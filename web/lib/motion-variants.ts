import type { Variants } from "framer-motion";

export const cardHover: Variants = {
  rest: { scale: 1 },
  hover: {
    scale: 1.03,
    transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
  },
};
