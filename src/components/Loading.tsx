// Holds a full viewport while a lazy page loads, so the footer does not paint near the
// top and then jump down when the page arrives (the old text fallback caused CLS ~0.5).
export const Loading = () => (
  <div className="page-loading" role="status" aria-busy="true">
    <span className="sr-only">Loading…</span>
  </div>
);
