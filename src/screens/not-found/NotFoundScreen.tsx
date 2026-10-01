import './not-found.css';

/**
 * Any path the app does not define. Replaces React Router's developer error
 * screen with a plain way back; it is not a new product surface.
 */
export function NotFoundScreen() {
  return (
    <main className="not-found" id="main-content" tabIndex={-1}>
      <section className="not-found__panel" aria-labelledby="not-found-title">
        <p className="type-label not-found__eyebrow">DocMatch+</p>
        <h1 className="type-heading-1 not-found__title" id="not-found-title">This page does not exist</h1>
        <p className="type-body not-found__lead">The address may be mistyped, or the page may have moved.</p>
        <a className="cta not-found__action" href="/">
          <span className="type-control">Return to DocMatch+</span>
        </a>
      </section>
    </main>
  );
}
