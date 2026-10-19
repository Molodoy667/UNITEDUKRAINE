import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export class AccountError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function fail(status, code, message) { throw new AccountError(status, code, message); }
export const digest = value => createHash('sha256').update(String(value)).digest('hex');
export const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && timingSafeEqual(Buffer.from(digest(a), 'hex'), Buffer.from(digest(b), 'hex'));
export const stamp = (raw, account) => createHmac('sha256', raw).update(JSON.stringify([account.players_password, account.email, account.google_auth, account.google_code])).digest('hex');

export function credentials(body) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 61 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) fail(400, 'invalid_email', 'Вкажіть email, прив’язаний до ігрового акаунта.');
  if (typeof body.password !== 'string' || body.password.length < 1 || body.password.length > 84 || /\0/.test(body.password)) fail(400, 'invalid_password', 'Вкажіть пароль ігрового акаунта.');
  return { email, password: body.password };
}

// senior.pwn: GetExpToNextLevel=(level+1)*4; GivePlayerExp promotes only on exp > threshold.
export function experience(level, exp) {
  const current = Math.max(0, Number(exp) || 0), required = (Math.max(1, Number(level) || 1) + 1) * 4 + 1;
  return { current, required, remaining: Math.max(0, required - current), percent: Math.min(100, Math.max(0, current / required * 100)) };
}
const teams = ['Немає', 'Уряд', 'Військова частина', 'Лікарня', 'ТРК «Ритм»', 'МВС', 'ДКВС', 'СБУ', 'Національна гвардія', 'ДСНС'];
const ranks = [
  ['Водій','Охоронець','Начальник охорони','Секретар','Радник','Ліцензійний інспектор','Адвокат','Депутат','Віцегубернатор','Губернатор'],
  ['Рядовий','Єфрейтор','Сержант','Прапорщик','Лейтенант','Капітан','Майор','Підполковник','Полковник','Генерал'],
  ['Інтерн','Фельдшер','Дільничний лікар','Терапевт','Проктолог','Нарколог','Хірург','Завідувач відділення','Заступник головного лікаря','Головний лікар'],
  ['Практикант','Фотограф','Журналіст','Кореспондент','Ведучий','Редактор','Маркетолог','Менеджер','Продюсер','Директор'],
  ['Рядовий','Сержант','Старший сержант','Прапорщик','Лейтенант','Капітан','Майор','Підполковник','Полковник','Генерал'],
  ['Охоронець','Постовий','Начальник охорони','Конвоїр','Наглядач','Фахівець','Керівник служби безпеки','Інспектор',"Заступник начальника в’язниці","Начальник в’язниці"],
  ['Рядовий','Сержант','Старший сержант','Молодший оперативник','Оперативник','Старший оперативник','Майор','Підполковник','Полковник','Генерал'],
  ['Рядовий','Єфрейтор','Сержант','Прапорщик','Лейтенант','Капітан','Майор','Підполковник','Полковник','Генерал'],
  ['Рядовий','Сержант','Старшина','Прапорщик','Лейтенант','Капітан','Майор','Підполковник','Полковник','Генерал'],
];
// Employment_OnPlayerApply uses legacy P_JOB IDs distinct from the Job_Name array.
const jobs = { 0:'Не працевлаштований', 1:'Водій автобуса', 2:'Таксист', 4:'Далекобійник', 6:'Електрик', 7:'Працівник дорожньої служби' };
// Actual names/indices in pawno/include/zones.inc, g_sa_city (commented rows excluded).
const cities = ['Гарель','Новый Арзамас','Эдово','Аэропорт Лыткарино','Нижегородск','Гоночный трек','Завод','Арзамас','Арзамас','Арзамас','Батырево','Батырево','Аэропорт Батырево','Роговичи','Лыткарино'];
export function propertyView(row, apartment = false) {
  return { ...row, ...(row.city !== undefined ? {cityName: cities[Number(row.city)] || null} : {}),
    ...(apartment ? {apartmentNumber: (Number(row.floor) - 1) * 4 + Number(row.apt_num) + 1} : {}) };
}
const unix = value => Number(value) > 0 ? new Date(Number(value) * 1000).toISOString() : null;
const money = value => /^-?\d{1,21}$/.test(String(value)) ? String(value) : '0';
export function profile(row) {
  const team = Number(row.team), job = Number(row.job), admin = Number(row.admin), level = Number(row.level);
  const rank = team > 0 && teams[team] ? ranks[team - 1][job >= 1 && job <= 10 ? job - 1 : 0] : null;
  return {
    id: Number(row.id), nickname: row.name, email: row.email, skinId: Number(row.skin), level,
    experience: experience(level, row.exp), adminLevel: admin, isSiteAdmin: admin === 12,
    role: admin > 0 ? 'Адміністратор' : team > 0 && job === 10 ? 'Лідер фракції' : 'Гравець',
    employment: { id: job, name: rank || jobs[job] || `Робота #${job}`, organization: teams[team] || `Фракція #${team}`, rank },
    phone: Number(row.phone) > 0 ? String(row.phone) : null, phoneBalance: Number(row.phone_balance) || 0,
    balances: { cash: money(row.money), bank: money(row.bank), donate: String(Number(row.donate_current) || 0), coins: String(Number(row.coins) || 0) },
    registeredAt: unix(row.reg_time), lastActivityAt: unix(Math.max(Number(row.last_login) || 0, Number(row.last_exit) || 0)),
    lastExitAt: unix(row.last_exit), premium: { tier: Number(row.premium), expiresAt: unix(row.premium_time), active: Number(row.premium) > 0 && Number(row.premium_time) * 1000 > Date.now() },
    drivingLicense: Number(row.driving_lic) > 0, weaponLicense: Number(row.weapon_lic) > 0,
    warnings: Number(row.warn) || 0, twoFactor: Number(row.google_auth) > 0,
    playtime: { todaySeconds: Math.max(0, Number(row.game_for_day) || 0), yesterdaySeconds: Math.max(0, Number(row.game_for_day_prev) || 0) },
    health: Math.max(0, Number(row.health) || 0), lawAbiding: Number(row.law_abiding) || 0,
    slots: { cars: Number(row.car_slots), houses: Number(row.house_slots), businesses: Number(row.biz_slots) },
  };
}
