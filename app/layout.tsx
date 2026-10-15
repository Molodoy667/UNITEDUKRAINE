import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'United Ukraine — Твоя країна. Твоя історія.', description: 'United Ukraine Roleplay — українська ігрова платформа КРМП. Почни свою історію.', icons: {icon:'/assets/logo.png'} };
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="uk"><body>{children}</body></html>}
