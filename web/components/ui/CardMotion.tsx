"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { cardHover } from "@/lib/motion-variants";

export function CardMotion({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial="rest"
      whileHover={reduce ? undefined : "hover"}
      variants={cardHover}
    >
      {children}
    </motion.div>
  );
}
