export function Fuse({ lit, total = 14, className = "" }: { lit: number; total?: number; className?: string }) {
  const safeLit = Math.min(total, Math.max(0, lit));
  const progress = total ? (safeLit / total) * 100 : 0;

  return (
    <div
      className={`fuse ${className}`.trim()}
      role="progressbar"
      aria-label={`${safeLit} of ${total} hints unlocked`}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={safeLit}
    >
      <span className="fuse__fill" style={{ width: `${progress}%` }}><i className="fuse__ember" /></span>
      <span className="fuse__ticks" aria-hidden="true">
        {Array.from({ length: total }, (_, index) => <i key={index} />)}
      </span>
    </div>
  );
}
