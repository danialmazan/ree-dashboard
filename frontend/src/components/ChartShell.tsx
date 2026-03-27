import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface ChartShellProps {
  eyebrow: string;
  title: string;
  copy: string;
  children: ReactNode;
  className?: string;
}

export function ChartShell({ eyebrow, title, copy, children, className = "" }: ChartShellProps) {
  return (
    <motion.section
      className={`chart-shell ${className}`.trim()}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="chart-header">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
      <div className="chart-body">{children}</div>
    </motion.section>
  );
}
