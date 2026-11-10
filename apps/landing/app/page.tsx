import { Nav } from "@/components/Nav";
import { Hero } from "@/components/hero/Hero";
import { Footer, Safety, SeeInside } from "@/components/Sections";
import { Cta } from "@/components/Cta";
import { Demo } from "@/components/Demo";
import { ApprovalsScroll } from "@/components/ApprovalsScroll";
import { MeetMinds } from "@/components/MindCards";
import { PoweredBy } from "@/components/PoweredBy";

export default function Home() {
  return (
    <>
      <Nav />
      <main id="top">
        <Hero />
        <PoweredBy />
        <MeetMinds />
        <ApprovalsScroll />
        <div className="md:hidden">
          <Safety />
        </div>
        <SeeInside />
        <Demo />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
