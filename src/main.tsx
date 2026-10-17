import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import Home from "./Home";
import Section from "./Section";
import "../app/globals.css";

const section = window.location.pathname.split("/").filter(Boolean)[0];
const Forum = lazy(() => import("./Forum"));
const Page = section === "forum" ? <Suspense fallback={<p role="status" style={{padding:'140px 30px'}}>Завантаження форуму…</p>}><Forum /></Suspense> : section ? <Section section={section} /> : <Home />;

createRoot(document.getElementById("root")!).render(
  <StrictMode>{Page}</StrictMode>,
);
