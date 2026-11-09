import { Nav } from "@/components/Nav";
import { Hero } from "@/components/hero/Hero";
import { Cta, Demo, Footer, Safety, SeeInside } from "@/components/Sections";
import { ApprovalsScroll } from "@/components/ApprovalsScroll";
import { MeetMinds } from "@/components/MindCards";

export default function Home() {
  return (
    <>
      <Nav />
      <main id="top">
        <Hero />
        <MeetMinds />
        <ApprovalsScroll />
        <Safety />
        <SeeInside />
        <Demo />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
