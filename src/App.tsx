import { useEffect } from "react";
import Lenis from "lenis";
import { Intro } from "./components/Intro";
import { Nav } from "./components/Nav";
import { LeftRail } from "./components/LeftRail";
import { Hero } from "./components/Hero";
import { VideoShowcase } from "./components/VideoShowcase";
import { Problem } from "./components/Problem";
import { Approach } from "./components/Approach";
import { Scenarios } from "./components/Scenarios";
import { Proof } from "./components/Proof";
import { Fit } from "./components/Fit";
import { DuckRun } from "./components/DuckRun";
import { JobCarousel } from "./components/JobCarousel";
import { Policies } from "./components/Policies";
import { Faq } from "./components/Faq";
import { Register } from "./components/Register";
import { Footer } from "./components/Footer";
import { AppRoot, isAppPath } from "./app/AppRoot";
import { useHashPath } from "./app/router";
import { PaperEdge } from "./lib/tornEdge";
import { DuckMama } from "./assistant/DuckMama";
import { DuckLab } from "./assistant/DuckLab";
import { PolicyModal } from "./components/PolicyModal";

export default function App() {
  const path = useHashPath();
  const inApp = isAppPath(path);
  useEffect(() => {
    if (inApp) return; // the manager app scrolls natively
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({
      duration: 1.15,
      easing: (t: number) => 1 - Math.pow(1 - t, 4),
    });
    let id = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      id = requestAnimationFrame(raf);
    };
    id = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(id);
      lenis.destroy();
    };
  }, [inApp]);

  const site = (
    <>
      <Intro />
      <Nav />
      <LeftRail />
      <main>
        <Hero />
        <VideoShowcase />
        <Problem />
        {/* The paper sheet slides up over the pinned dark Problem scene, with a real torn edge. */}
        <div className="relative z-30 -mt-[100vh] bg-[#F7F1E6]">
          <PaperEdge seed={47} paper="#F7F1E6" />
          <Approach />
          <Scenarios />
          <Proof />
          <JobCarousel />
          <DuckRun />
          <Fit />
          <Faq />
          <Register />
          <Policies />
        </div>
      </main>
      <Footer />
    </>
  );

  if (import.meta.env.DEV && path === "/duck-lab") return <DuckLab />;
  // DuckMama sits outside the branch so her chat survives moving between the site and the app
  return (
    <>
      {inApp ? <AppRoot /> : site}
      <DuckMama />
      <PolicyModal />
    </>
  );
}