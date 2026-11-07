import { Nav } from "@/components/Nav";
import { Hero } from "@/components/hero/Hero";
import { Approvals, Cta, Demo, Footer, Safety, SeeInside } from "@/components/Sections";
import { MeetMinds } from "@/components/MindCards";

export default function Home() {
  return (
    <>
      <Nav />
      <main id="top">
        <Hero />
        <MeetMinds />
        <Approvals />
        <Safety />
        <SeeInside />
        <Demo />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
