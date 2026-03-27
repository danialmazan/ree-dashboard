import { motion } from "framer-motion";

const sections = [
  { key: "generation", label: "Generation" },
  { key: "interconnectors", label: "Interconnectors" },
  { key: "coverage", label: "Coverage stats" },
  { key: "marginal", label: "Marginal tech" },
  { key: "system", label: "System context" }
];

interface SidebarProps {
  activeSection: string;
  onSelect: (section: string) => void;
}

export function Sidebar({ activeSection, onSelect }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand-block">
        <p className="eyebrow">Spain electricity</p>
        <h1>REE Grid Atlas</h1>
        <p className="support-copy">Generation, exchanges, capacity, emissions, storage, and market-setting technology.</p>
      </div>
      <nav className="sidebar-nav" aria-label="Dashboard sections">
        {sections.map((section) => (
          <button
            key={section.key}
            type="button"
            className={`nav-button ${activeSection === section.key ? "is-active" : ""}`}
            onClick={() => onSelect(section.key)}
          >
            {activeSection === section.key ? <motion.span layoutId="nav-pill" className="nav-pill" /> : null}
            <span>{section.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
