interface Props {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}

export function Pagination({ page, totalPages, onPage }: Props) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  return (
    <nav aria-label="Pagination" className="pagination" data-testid="pagination">
      <button type="button" className="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)} data-testid="pagination-prev">
        Previous
      </button>
      <ul>
        {pages.map((p) => (
          <li key={p}>
            <button
              type="button"
              className={p === page ? 'current' : 'secondary'}
              aria-current={p === page ? 'page' : undefined}
              aria-label={`Page ${p}`}
              onClick={() => onPage(p)}
              data-testid={`pagination-page-${p}`}
            >
              {p}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)} data-testid="pagination-next">
        Next
      </button>
    </nav>
  );
}
