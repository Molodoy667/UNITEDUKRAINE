import { useState } from 'react';
import { ArrowRight, KeyRound, LogIn, Mail, ShieldCheck } from 'lucide-react';
import { href, setCsrf } from './client';
import { useForum, useMutation } from './context';
import { ErrorNotice, Panel } from './ui';

export default function Auth({ mode, query }: { mode: string; query: URLSearchParams }) {
  const { bootstrap,navigate,refresh,notice } = useForum(), mutation = useMutation();
  const [login,setLogin] = useState(''), [name,setName] = useState(''), [mail,setMail] = useState(''), [password,setPassword] = useState(''), [code,setCode] = useState('');
  const register = mode === 'register', recover = mode === 'recover', confirm = mode === 'confirm';
  const title = register ? 'Створи свою історію' : recover ? 'Відновлення доступу' : confirm ? 'Підтвердження облікового запису' : 'З поверненням до спільноти';
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const action = register ? 'auth.register' : recover ? 'auth.recover' : confirm ? 'auth.confirm' : 'auth.login';
    const result = await mutation.run(action, { login, username:name,email:mail,password,code,token:query.get('token'),purpose:query.get('purpose') }, undefined, false);
    if (!result) return;
    if (result.csrf) { setCsrf(result.csrf); refresh(); notice(register ? (result.emailSent ? 'Підтвердіть email за посиланням у листі' : 'Акаунт створено, але лист не доставлено. Повторіть надсилання у налаштуваннях.') : 'Ви увійшли до форуму'); navigate('home'); }
    else { notice(result.message || 'Готово'); if (!recover) { refresh(); window.history.replaceState(null,'',href('login')); navigate('login'); } }
  }
  return <div className="forum-auth-layout"><div className="forum-auth-copy"><span className="eyebrow gold"><ShieldCheck size={16} /> UNITED UKRAINE COMMUNITY</span><h1>ТВОЯ КРАЇНА.<br /><span>ТВОЇ ЛЮДИ.</span></h1><p>Обговорюй гру, знаходь друзів і будь частиною історії United Ukraine.</p><img src="/assets/logo.png" alt="United Ukraine" /></div><Panel className="forum-auth-card"><span className="forum-overline">ОБЛІКОВИЙ ЗАПИС</span><h2>{title}</h2>
    {mutation.error && <ErrorNotice>{mutation.error}</ErrorNotice>}
    <form onSubmit={submit} className="forum-form">{register && <label>Нік на форумі<input value={name} onChange={e=>setName(e.target.value)} minLength={3} maxLength={32} autoComplete="username" required /></label>}
      {(register || recover) && <label>Email<input type="email" value={mail} onChange={e=>setMail(e.target.value)} autoComplete="email" required maxLength={254} /></label>}
      {!register && !recover && !confirm && <label>Нік або email<input value={login} onChange={e=>setLogin(e.target.value)} autoComplete="username" required /></label>}
      {(!recover && (!confirm || query.get('purpose') === 'reset')) && <label>{confirm ? 'Новий пароль' : 'Пароль'}<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={register || confirm ? 'new-password' : 'current-password'} minLength={register || confirm ? 12 : 1} maxLength={192} required /></label>}
      {!register && !recover && (!confirm || query.get('purpose') === 'reset') && <label>Код 2FA, якщо увімкнено<input value={code} onChange={e=>setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" /></label>}
      {register && <p className="forum-help">Пароль має містити щонайменше 12 символів. Після реєстрації підтвердьте email, щоб публікувати повідомлення.</p>}
      {register && (!bootstrap.capabilities?.email || !bootstrap.settings?.registrationOpen) && <ErrorNotice>Реєстрація тимчасово недоступна. Адміністрація налаштовує сервіс.</ErrorNotice>}
      {recover && !bootstrap.capabilities?.email && <ErrorNotice>Відновлення через email тимчасово недоступне: поштовий сервіс ще не налаштований. Зверніться до адміністрації через офіційний Discord.</ErrorNotice>}
      <button className="btn primary" disabled={mutation.busy || (register && (!bootstrap.capabilities?.email || !bootstrap.settings?.registrationOpen)) || (recover && !bootstrap.capabilities?.email)}>{mutation.busy ? 'Зачекайте…' : register ? 'Створити акаунт' : recover ? 'Надіслати лист' : confirm ? 'Підтвердити' : 'Увійти'}<ArrowRight size={17}/></button>
    </form><div className="forum-auth-links">{!register && <a href={href('register')}>Створити акаунт</a>}{mode !== 'login' && <a href={href('login')}>Уже є акаунт? Увійти</a>}{mode === 'login' && <a href={href('recover')}>Не пам’ятаю пароль</a>}</div></Panel></div>;
}
