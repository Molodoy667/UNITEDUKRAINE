import {Header,Footer} from '@/components/site-shell';
import ContentPage from './site/ContentPage';
const pages:Record<string,string>={forum:'Форум',wiki:'Вікі',donate:'Донат',account:'Особистий кабінет'};
export default function Section({section}:{section:string}){
 if(['contacts','terms','privacy'].includes(section))return <ContentPage kind="page" slug={section}/>;
 const title=pages[section];return <><Header/><main id="main-content" className="subpage"><div className="eyebrow"><span className="flag"/> UNITED UKRAINE ROLEPLAY</div><h1>{title||'Сторінку не знайдено'}</h1>{!title&&<a className="btn primary" href="/">На головну</a>}</main><Footer/></>;
}
