import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import Home from "./Home";
import Section from "./Section";
import {SiteProvider,SiteMetadata} from './site/content';
import ContentPage from './site/ContentPage';
import "../app/globals.css";

const section = window.location.pathname.split("/").filter(Boolean)[0];
const Forum = lazy(() => import("./Forum"));
const Wiki = lazy(() => import("./Wiki"));
const Account = lazy(() => import("./Account"));
const Roulette = lazy(() => import("./Roulette"));
const Forbes = lazy(() => import("./Forbes"));
const Page = section === "forbes" ? <Suspense fallback={<p role="status" style={{padding:'140px 30px'}}>Завантаження Forbes…</p>}><Forbes /></Suspense> : section === "roulette" ? <Suspense fallback={<p role="status" style={{padding:'140px 30px'}}>Завантаження рулетки…</p>}><Roulette /></Suspense> : section === "account" ? <Suspense fallback={<p role="status" style={{padding:'140px 30px'}}>Завантаження кабінету…</p>}><Account /></Suspense> : section === "wiki" ? <Suspense fallback={<p role="status" style={{padding:'140px 30px'}}>Завантаження вікі…</p>}><Wiki /></Suspense> : section === "forum" ? <Suspense fallback={<p role="status" style={{padding:'140px 30px'}}>Завантаження форуму…</p>}><Forum /></Suspense> : section ? <Section section={section} /> : <Home />;

const parts=window.location.pathname.split('/').filter(Boolean);
const contentPage=['contacts','terms','privacy'].includes(section)?<ContentPage kind="page" slug={section}/>:['p','news'].includes(section)&&parts.length===2?<ContentPage kind={section==='news'?'news':'page'} slug={parts[1]}/>:null;
createRoot(document.getElementById("root")!).render(
  <StrictMode><SiteProvider>{!contentPage&&section&&<SiteMetadata/>}{contentPage||Page}</SiteProvider></StrictMode>,
);
