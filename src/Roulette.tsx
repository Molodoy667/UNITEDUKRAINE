import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {ArrowRight,ArrowUpRight,Check,ChevronDown,Coins,Crown,Gift,History,LoaderCircle,LockKeyhole,RefreshCw,ShieldCheck,Sparkles,Volume2,VolumeX,X,Zap} from 'lucide-react';
import {Header,Footer} from '../components/site-shell';
import {createTape,rouletteApi,RouletteError,spinProgress,type Prize,type Rarity,type RouletteState,type Spin} from './roulette/model';
import {RouletteSound} from './roulette/sound';
import './roulette/roulette.css';

const amount=(n:number)=>new Intl.NumberFormat('uk-UA').format(n);
const colors=(rarities:Rarity[],id:string)=>rarities.find(r=>r.id===id)?.color||'#bdc8d8';
const theme=(color:string)=>({'--prize-color':color} as CSSProperties);
function PrizeArt({prize,rarities}:{prize:Prize;rarities:Rarity[]}){
  const [failed,setFailed]=useState(false);
  return <div className={`ru-prize-art ${prize.type==='Скін'?'ru-skin-art':''}`} style={theme(colors(rarities,prize.rarity))}><div className="ru-prize-aura"/><div className="ru-triangle ru-triangle-back"/><div className="ru-triangle ru-triangle-front"/>{failed?<Gift size={56}/>:<img src={prize.image} alt={prize.title} decoding="async" onError={()=>setFailed(true)}/>}<div className="ru-prize-platform"/></div>;
}
function PrizeCard({prize,rarities,odds=false}:{prize:Prize;rarities:Rarity[];odds?:boolean}){
  const rarity=rarities.find(r=>r.id===prize.rarity);
  return <div className={`ru-prize-card ru-rarity-${prize.rarity}`} style={theme(rarity?.color||'#bdc8d8')}><div className="ru-prize-meta"><span>{rarity?.name}</span>{odds&&<span>{new Intl.NumberFormat('uk-UA',{maximumFractionDigits:2}).format(prize.weight/100)}%</span>}</div><PrizeArt prize={prize} rarities={rarities}/><div className="ru-prize-caption"><small>{prize.type}</small><h3>{prize.title}</h3></div><div className="ru-rarity-line"><i/></div></div>;
}
type Round={spin:Spin;duration:number};
function Reel({prizes,rarities,round,rolling,sound,onFinish}:{prizes:Prize[];rarities:Rarity[];round:Round|null;rolling:boolean;sound:RouletteSound;onFinish:()=>void}){
  const viewport=useRef<HTMLDivElement>(null),track=useRef<HTMLOListElement>(null),cards=useRef<(HTMLLIElement|null)[]>([]);
  // Freeze the tape for this round; balance polling must never restart a paid animation.
  const tape=useMemo(()=>round?createTape(prizes,round.spin.prize):[...prizes,...prizes,...prizes],[round]);
  useLayoutEffect(()=>{
    const surface=viewport.current,belt=track.current;if(!surface||!belt)return;
    let raf=0,done=false,lastTick=-1;const start=performance.now(),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,duration=reduced?600:round?.duration||0;
    function draw(time:number){
      const width=cards.current[0]?.offsetWidth||210,gap=parseFloat(getComputedStyle(belt!).columnGap)||16,pitch=width+gap;
      const t=round?Math.min(1,(time-start)/duration):0,index=round?4+92*spinProgress(t):7;
      belt!.style.transform=`translate3d(${surface!.clientWidth/2-width/2-index*pitch}px,0,0)`;
      for(let i=Math.max(0,Math.floor(index)-5);i<Math.min(tape.length,Math.ceil(index)+6);i++){
        const el=cards.current[i];if(!el)continue;const distance=i-index;
        el.style.setProperty('--card-lean',`${Math.max(-36,Math.min(36,-distance*16))}deg`);el.style.setProperty('--card-scale',String(Math.max(.83,1-Math.abs(distance)*.035)));el.style.setProperty('--card-brightness',String(Math.max(.5,1-Math.abs(distance)*.13)));
      }
      if(round){const tick=Math.floor(index);if(tick!==lastTick){sound.tick();lastTick=tick;}sound.speed(t<.1?t/.1:t<.7?1:Math.pow(1-(t-.7)/.3,4));if(t<1)raf=requestAnimationFrame(draw);else if(!done){done=true;sound.finish();onFinish();}}
    }
    if(round)sound.start();draw(start);const resize=()=>{if(!round)draw(performance.now());};window.addEventListener('resize',resize);
    return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize);if(!done)sound.stop();};
  },[round,tape,onFinish,sound]);
  return <div className={`ru-reel ${rolling?'is-rolling':''}`}><div className="ru-reel-roof"><span><i/> UNITED DROP SYSTEM</span><span>{rolling?'ОБЕРТАННЯ ТРИВАЄ':round?'ТВІЙ ПРИЗ У ЦЕНТРІ':'ГОТОВО ДО ОБЕРТАННЯ'}</span></div><div className="ru-reel-focus"/><div className="ru-marker ru-marker-top"/><div className="ru-marker ru-marker-bottom"/><div ref={viewport} className="ru-reel-viewport" aria-hidden="true"><ol className="ru-track" ref={track}>{tape.map((prize,index)=><li ref={node=>{cards.current[index]=node;}} className="ru-slot" key={index}><PrizeCard prize={prize} rarities={rarities}/></li>)}</ol></div><div className="ru-reel-floor"/><div className="ru-reel-status" role="status">{rolling?<><span className="ru-spinner-dot"/> Ловимо твій момент…</>:<><ShieldCheck size={13}/> Результат визначає сервер</>}</div></div>;
}
function Modal({children,onClose,label,className=''}:{children:ReactNode;onClose:()=>void;label:string;className?:string}){
  const ref=useRef<HTMLDialogElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{const node=ref.current;if(!node)return;node.showModal();const cancel=(event:Event)=>{event.preventDefault();close.current();};node.addEventListener('cancel',cancel);return()=>{node.removeEventListener('cancel',cancel);node.close();};},[]);
  return <dialog ref={ref} className={`ru-modal ${className}`} aria-label={label}><button className="ru-modal-close" onClick={onClose} aria-label="Закрити вікно"><X size={20}/></button>{children}</dialog>;
}
function Result({spin,data,busy,error,onResolve,onClose}:{spin:Spin;data:RouletteState;busy:boolean;error:string;onResolve:(decision:'keep'|'sell')=>void;onClose:()=>void}){
  const color=colors(data.rarities,spin.prize.rarity),rarity=data.rarities.find(r=>r.id===spin.prize.rarity);
  return <Modal label="Твій виграш" onClose={()=>{if(!busy)onClose();}} className="ru-result-modal"><div style={theme(color)} className="ru-result-content"><div className="ru-result-rays" aria-hidden="true">{Array.from({length:14},(_,i)=><i key={i} style={{'--ray':i} as CSSProperties}/>)}</div><div className="ru-result-heading"><span className="ru-eyebrow">ЦЕ ТВІЙ МОМЕНТ</span><h2>Ось він. Твій приз.</h2><span className="ru-result-rarity">◆ {rarity?.name}</span></div><div className="ru-result-prize"><PrizeArt prize={spin.prize} rarities={data.rarities}/></div><h3>{spin.prize.title}</h3><p className="ru-result-type">{spin.prize.type} · тестовий приз</p><p className="ru-result-note">Забери у свою колекцію на сайті або продай за справжній донат. Тестові предмети в грі не видаються.</p>{error&&<p role="alert" className="ru-alert">{error}</p>}<div className="ru-result-actions"><button className="ru-button ru-gold" onClick={()=>onResolve('keep')} disabled={busy}>{busy?<LoaderCircle className="ru-spin" size={17}/>:<Gift size={17}/>} Забрати в колекцію</button><button className="ru-button ru-sell" onClick={()=>onResolve('sell')} disabled={busy||!data.moneyAvailable}><Coins size={18}/> Продати · {amount(data.salePrice)}</button></div>{!data.moneyAvailable&&<p className="ru-wallet-note">{data.moneyReason}</p>}<small>Продаж можна виконати лише один раз.</small></div></Modal>;
}

export default function Roulette(){
  const [data,setData]=useState<RouletteState|null>(null),[phase,setPhase]=useState<'loading'|'guest'|'ready'|'error'>('loading'),[message,setMessage]=useState(''),[resultError,setResultError]=useState(''),[success,setSuccess]=useState('');
  const [round,setRound]=useState<Round|null>(null),[rolling,setRolling]=useState(false),[result,setResult]=useState<Spin|null>(null),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[refreshing,setRefreshing]=useState(false),[fast,setFast]=useState(false),[muted,setMuted]=useState(false),[view,setView]=useState<'catalog'|'history'>('catalog');
  const sound=useMemo(()=>new RouletteSound(),[]),working=useRef(false),requestVersion=useRef(0),activeSpin=useRef<Spin|null>(null);
  const reload=useCallback(async(showPending=false)=>{const version=++requestVersion.current;setRefreshing(true);try{const next=await rouletteApi<RouletteState>();if(version!==requestVersion.current)return;setData(next);setPhase('ready');if(showPending&&next.pending)setResult(next.pending);return next;}catch(error){if(version!==requestVersion.current)return;if(error instanceof RouletteError&&error.status===401){setPhase('guest');setData(null);}else{setMessage(error instanceof Error?error.message:'Не вдалося завантажити рулетку.');setPhase(current=>current==='ready'?'ready':'error');}throw error;}finally{if(version===requestVersion.current)setRefreshing(false);}},[]);
  useEffect(()=>{document.title='Рулетка — United Ukraine';void reload(true).catch(()=>{});return()=>{++requestVersion.current;};},[reload]);
  useEffect(()=>()=>sound.dispose(),[sound]);
  useEffect(()=>{if(phase!=='ready')return;const id=setInterval(()=>{if(!working.current&&document.visibilityState==='visible')void reload().catch(()=>{});},30000);return()=>clearInterval(id);},[phase,reload]);
  const finish=useCallback(()=>{setResult(activeSpin.current);setRolling(false);working.current=false;},[]);
  async function spin(payment:'free'|'donate'){
    if(!data||working.current||data.pending)return;working.current=true;setBusy(true);setConfirm(false);setMessage('');setSuccess('');setResultError('');await sound.unlock();
    try{const response=await rouletteApi<{spin:Spin}>('spin',{payment,requestId:crypto.randomUUID()},data.csrf);activeSpin.current=response.spin;setRolling(true);setRound({spin:response.spin,duration:fast?2800:12000});void reload().catch(()=>{});}
    catch(error){working.current=false;setMessage(error instanceof Error?error.message:'Не вдалося розпочати обертання.');await reload(true).catch(()=>{});}
    finally{setBusy(false);}
  }
  async function resolve(decision:'keep'|'sell'){
    if(!data||!result||busy)return;setBusy(true);setResultError('');
    try{await rouletteApi('resolve',{spinId:result.id,decision},data.csrf);setResult(null);setSuccess(decision==='sell'?`Приз продано. +${data.salePrice} донату на ігровий рахунок.`:'Приз додано до твоєї тестової колекції.');await reload().catch(()=>{setMessage('Операцію виконано. Оновіть дані, щоб побачити актуальний баланс.');});}
    catch(error){setResultError(error instanceof Error?error.message:'Не вдалося виконати дію.');await reload().catch(()=>{});}
    finally{setBusy(false);}
  }
  const locked=busy||rolling||refreshing;
  return <><Header/><main id="main-content" className="ru-page">
    {phase==='loading'?<div className="ru-loading" role="status"><Sparkles size={32}/><span>Готуємо твій щасливий момент…</span></div>:phase==='guest'?<section className="ru-guest"><div className="ru-guest-visual"><div className="ru-hero-triangle"/><img src="/roulette/aurora-gt.png" alt="Золотий концепт-кар Aurora GT"/></div><span className="ru-eyebrow">UNITED UKRAINE · РУЛЕТКА</span><h1>Твій наступний<br/><em>великий момент.</em></h1><p>Увійди в ігровий акаунт, щоб відкрити рулетку,<br/>побачити свій баланс і колекцію призів.</p><a className="ru-button ru-gold" href="/account"><LockKeyhole size={18}/> Увійти до акаунта <ArrowUpRight size={17}/></a><small>Шість рідкостей. Один неповторний момент.</small></section>:phase==='error'||!data?<section className="ru-loading"><Sparkles size={32}/><h1>Рулетка готується.</h1><p role="alert">{message}</p><button className="ru-button ru-gold" onClick={()=>void reload(true).catch(()=>{})}>Спробувати знову</button></section>:<>
    <div className="ru-topline"><span><i/> UNITED DROP · TEST EDITION</span><span><ShieldCheck size={13}/> Захищено твоїм ігровим акаунтом</span></div>
    <section className="ru-hero"><div className="ru-hero-copy"><span className="ru-eyebrow"><span/> ДОЛЯ ЛЮБИТЬ СМІЛИВИХ</span><h1>ОДИН ОБЕРТ.<br/><em>НОВА ІСТОРІЯ.</em></h1><p>Від звичайного до ексклюзивного.<br/>Знайди свій наступний привід повернутися в гру.</p><div className="ru-hero-chips"><span>6 рідкостей</span><span>1 безкоштовний старт</span><span>Твій шанс — твій вибір</span></div></div><div className="ru-hero-car"><div className="ru-hero-orbit"/><div className="ru-hero-triangle"/><span className="ru-hero-watermark">AURORA<br/>GT</span><img src="/roulette/aurora-gt.png" alt="Aurora GT — ексклюзивний тестовий концепт-кар"/><div className="ru-hero-car-label"><span><Crown size={13}/> ЕКСКЛЮЗИВ</span><strong>Aurora GT</strong><small>ТЕСТОВИЙ КОНЦЕПТ-КАР</small></div></div></section>
    <div className="ru-wallet-bar"><div className="ru-player"><span className="ru-player-icon">{data.user.nickname.slice(0,1)}</span><div><small>ТВІЙ ІГРОВИЙ АКАУНТ</small><strong>{data.user.nickname}</strong></div></div><div className="ru-wallet"><Coins size={22}/><div><small>СПРАВЖНІЙ ДОНАТ</small><strong aria-live="polite">{amount(data.balance)} <span>донату</span></strong></div></div><div className="ru-free-count"><Gift size={21}/><div><small>БЕЗКОШТОВНИХ ОБЕРТАНЬ</small><strong>{data.freeSpins} <span>{data.freeSpins?'готове до обертання':'поки немає'}</span></strong></div></div><button className="ru-icon-button" onClick={()=>void reload(true).catch(()=>{})} disabled={locked} aria-label="Оновити баланс"><RefreshCw size={17} className={refreshing?'ru-spin':''}/></button></div>
    <section className="ru-machine-section" aria-label="Рулетка призів"><div className="ru-machine-heading"><div><span className="ru-eyebrow">В ЦЕНТРІ — ТВОЯ МОЖЛИВІСТЬ</span><h2>Злови свій момент.</h2></div><div className="ru-machine-tools"><label className="ru-fast"><input type="checkbox" checked={fast} disabled={locked} onChange={e=>setFast(e.target.checked)}/><span><Check size={12}/></span><Zap size={14}/> Крутити швидко</label><button className="ru-icon-button" aria-label={muted?'Увімкнути звук':'Вимкнути звук'} aria-pressed={!muted} onClick={()=>{sound.mute(!muted);setMuted(!muted);}}>{muted?<VolumeX size={18}/>:<Volume2 size={18}/>}</button></div></div>
      <Reel prizes={data.prizes} rarities={data.rarities} round={round} rolling={rolling} sound={sound} onFinish={finish}/>
      <div className="ru-controls"><button className="ru-button ru-free-button" disabled={locked||data.freeSpins<1||Boolean(data.pending)} onClick={()=>void spin('free')}><Gift size={19}/><span>Крутити безкоштовно<small>{data.freeSpins?`${data.freeSpins} безкоштовне обертання`:'Безкоштовних обертань немає'}</small></span><ArrowRight size={18}/></button><button className="ru-button ru-gold ru-paid-button" disabled={locked||!data.moneyAvailable||data.balance<data.spinPrice||Boolean(data.pending)} onClick={()=>setConfirm(true)}>{busy?<LoaderCircle size={19} className="ru-spin"/>:<Coins size={19}/>} Крутити за {amount(data.spinPrice)} донату <ArrowRight size={18}/></button></div>
      {data.pending&&!rolling&&<div className="ru-pending"><Gift size={18}/><span>На тебе чекає незабраний приз.</span><button onClick={()=>{setResultError('');setResult(data.pending);}}>Відкрити приз <ArrowRight size={15}/></button></div>}
      <p className="ru-money-disclosure">Тестові призи · справжній донат. Прокрут коштує {data.spinPrice}, продаж призу повертає {data.salePrice} донату. <span>Предмети зберігаються в колекції сайту.</span></p>
      {data.moneyReason&&<p className="ru-wallet-note"><LockKeyhole size={13}/>{data.moneyReason}</p>}
      {message&&<div className="ru-alert" role="alert">{message}</div>}{success&&<div className="ru-success" role="status"><Check size={18}/>{success}<button aria-label="Приховати повідомлення" onClick={()=>setSuccess('')}><X size={16}/></button></div>}
    </section>
    <section className="ru-prizes-section"><div className="ru-prizes-toolbar"><div className="ru-view-tabs" aria-label="Каталог і колекція"><button aria-pressed={view==='catalog'} onClick={()=>setView('catalog')}><Sparkles size={17}/> Можливі призи <span>6</span></button><button aria-pressed={view==='history'} onClick={()=>setView('history')}><History size={17}/> Мої призи <span>{data.history.length}</span></button></div><span className="ru-probability-note">Шанс указаний на кожній картці <ChevronDown size={13}/></span></div>
      {view==='catalog'?<div className="ru-prize-grid">{data.prizes.map(prize=><PrizeCard key={prize.id} prize={prize} rarities={data.rarities} odds/>)}</div>:data.history.length?<div className="ru-history-grid">{data.history.map(spin=><article className="ru-history-card" key={spin.id}><PrizeCard prize={spin.prize} rarities={data.rarities}/><div className="ru-history-details"><time>{new Intl.DateTimeFormat('uk-UA',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(spin.createdAt))}</time><span data-status={spin.status}>{spin.status==='kept'?'У колекції':spin.status==='sold'?`Продано · +${data.salePrice}`:'Чекає на тебе'}</span>{spin.status==='pending'&&<button onClick={()=>{setResultError('');setResult(spin);}}>Відкрити <ArrowUpRight size={14}/></button>}</div></article>)}</div>:<div className="ru-empty"><Gift size={32}/><h3>Почни свою колекцію.</h3><p>Тут будуть усі твої виграші — забрані та продані.</p></div>}
    </section><div className="ru-bottom-note"><ShieldCheck size={16}/><p>Шанси не залежать від швидкого режиму чи звуку. Обертання та рішення щодо призів зберігаються на сервері.</p><span>STAY UNITED. GET LUCKY.</span></div>
    {confirm&&<Modal label="Підтвердження платного обертання" onClose={()=>setConfirm(false)} className="ru-confirm-modal"><Coins size={37}/><span className="ru-eyebrow">ПЕРЕД ЩАСЛИВИМ МОМЕНТОМ</span><h2>Одне обертання —<br/>{data.spinPrice} донату.</h2><p>З твого ігрового рахунку буде списано <strong>{data.spinPrice} справжніх донатів</strong>. Призи у цій версії тестові та зберігаються лише на сайті.</p><div className="ru-confirm-balance"><span>Баланс після списання</span><strong>{amount(Math.max(0,data.balance-data.spinPrice))} донату</strong></div><button className="ru-button ru-gold" onClick={()=>void spin('donate')}>Підтверджую · крутити <ArrowRight size={17}/></button><button className="ru-cancel" onClick={()=>setConfirm(false)}>Ще подумаю</button></Modal>}
    {result&&<Result spin={result} data={data} busy={busy} error={resultError} onResolve={decision=>void resolve(decision)} onClose={()=>setResult(null)}/>}
    </>}
  </main><Footer/></>;
}
