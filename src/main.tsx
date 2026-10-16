import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Home from "./Home";
import Section from "./Section";
import "../app/globals.css";
import "./hero-background.css";

const section = window.location.pathname.split("/").filter(Boolean)[0];
const Page = section ? <Section section={section} /> : <Home />;

createRoot(document.getElementById("root")!).render(
  <StrictMode>{Page}</StrictMode>,
);
