import { Nav } from "@/components/Nav";
import { Hero } from "@/components/hero/Hero";

export default function Home() {
  return (
    <>
      <Nav />
      <main id="top">
        <Hero />

        {/* Placeholder sections so the nav links and the scroll change can be tried. */}
        {[
          ["minds", "Pick a Mind you'd like around"],
          ["how-it-works", "Four steps, and you stay in charge"],
          ["safety", "Tricked? Still can't spend it."],
          ["skills", "Skills"],
          ["demo", "Two minutes with a Mind"],
        ].map(([id, title]) => (
          <section key={id} id={id} className="mx-auto flex min-h-[80vh] max-w-[1200px] items-center px-6">
            <h2 className="text-4xl font-medium tracking-tight">{title}</h2>
          </section>
        ))}
      </main>
    </>
  );
}
