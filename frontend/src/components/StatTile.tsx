import type { ReactNode } from "react";
import "./StatTile.css";

interface StatTileProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  tone?: "amarillo" | "verde" | "hueso";
}

export function StatTile({ label, value, icon, tone = "hueso" }: StatTileProps) {
  return (
    <div className={`stat-tile stat-tile--${tone}`}>
      {icon && <span className="stat-tile-icon">{icon}</span>}
      <div>
        <p className="stat-tile-value mono">{value}</p>
        <p className="stat-tile-label">{label}</p>
      </div>
    </div>
  );
}
