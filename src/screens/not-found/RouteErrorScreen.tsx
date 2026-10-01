import './route-error.css';

/**
 * Shown when a route cannot render: a lazy chunk that failed to load (a slow
 * network, or a tab left open across a release whose old chunk names no longer
 * exist) or an unexpected render error. Replaces React Router's developer
 * error page so a patient is never left without a way forward. It shows no
 * error detail. It is in the entrance bundle so it renders even when a chunk
 * cannot be fetched.
 */
export function RouteErrorScreen() {
  return (
    <main className="route-error" id="main-content" tabIndex={-1}>
      <section className="route-error__panel" aria-labelledby="route-error-title">
        <p className="type-label route-error__eyebrow">DocMatch+</p>
        <h1 className="type-heading-1 route-error__title" id="route-error-title">This screen could not load</h1>
        <p className="type-body route-error__lead">
          Reload to try again. An assessment that was in progress starts again from the beginning.
        </p>
        <p className="type-body route-error__lead">If the situation becomes an emergency, call 112.</p>
        <button className="route-error__action" type="button" onClick={() => window.location.reload()}>
          <span className="type-control">Reload</span>
        </button>
        <a className="route-error__action" href="/">
          <span className="type-control">Return to DocMatch+</span>
        </a>
      </section>
    </main>
  );
}
