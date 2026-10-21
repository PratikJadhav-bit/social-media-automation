"use client";
export default function AppRecovery({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="recovery-screen">
      <section className="panel">
        <h1>Let’s get your workspace back.</h1>
        <p>
          The page could not finish loading. Saved content is still in your
          workspace.
        </p>
        <button className="button" onClick={retry}>
          Try again
        </button>
        <a href="/">Return to dashboard</a>
      </section>
    </main>
  );
}
