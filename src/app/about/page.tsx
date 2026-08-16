import Image from "next/image";

export default function AboutPage() {
  return (
    <section>
      <div className="pageTitle"><div><h1>About</h1><p className="muted">Provider credits and service information.</p></div></div>
      <div className="card">
        <h2>TMDB</h2>
        <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
          <Image src="/tmdb-logo.svg" width={205} height={27} alt="TMDB" />
        </a>
        <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
      </div>
    </section>
  );
}
