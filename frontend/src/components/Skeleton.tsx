import "./Skeleton.css";

interface SkeletonProps {
  height?: number | string;
  width?: number | string;
  radius?: string;
  className?: string;
}

export function Skeleton({ height = 16, width = "100%", radius = "var(--radio-s)", className }: SkeletonProps) {
  return (
    <span
      className={`skeleton ${className ?? ""}`}
      style={{ height, width, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export function SkeletonRow() {
  return (
    <div className="glass-card skeleton-row">
      <div className="skeleton-row-main">
        <Skeleton height={14} width="40%" />
        <Skeleton height={11} width="65%" />
        <Skeleton height={11} width="30%" />
      </div>
      <Skeleton height={27} width={48} radius="999px" />
    </div>
  );
}
