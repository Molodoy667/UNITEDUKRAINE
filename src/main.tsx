import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import Home from "./Home";
import Section from "./Section";
import {SiteProvider,SiteMetadata} from './site/content';
import ContentPage from './site/ContentPage';
import PagePreloader,{BootPreloaderReady} from './ui/PagePreloader';
import "../app/globals.css";

const section = window.location.pathname.split("/").filter(Boolean)[0];
const Forum = lazy(() => import("./Forum"));
const Wiki = lazy(() => import("./Wiki"));
const Account = lazy(() => import("./Account"));
const Roulette = lazy(() => import("./Roulette"));
const Forbes = lazy(() => import("./Forbes"));
const Page = section === 'forbes' ? <Forbes/> : section === 'roulette' ? <Roulette/> : section === 'account' ? <Account/> : section === 'wiki' ? <Wiki/> : section === 'forum' ? <Forum/> : section ? <Section section={section}/> : <Home/>;

const parts=window.location.pathname.split('/').filter(Boolean);
const contentPage=['contacts','terms','privacy'].includes(section)?<ContentPage kind="page" slug={section}/>:['p','news'].includes(section)&&parts.length===2?<ContentPage kind={section==='news'?'news':'page'} slug={parts[1]}/>:null;
createRoot(document.getElementById("root")!).render(
  <StrictMode><BootPreloaderReady/><SiteProvider>{!contentPage&&section&&<SiteMetadata/>}<Suspense fallback={<PagePreloader fullscreen/>}>{contentPage||Page}</Suspense></SiteProvider></StrictMode>,
);
