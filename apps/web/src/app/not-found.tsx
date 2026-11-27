import Link from 'next/link';
export default function NotFound(){return <main id="main" className="dc-container section prose"><p className="eyebrow">404</p><h1>Это место пока не нашлось</h1><p>Возможно, ссылка устарела или запись недоступна. Попробуйте поиск по адресу или категории.</p><Link className="dc-button dc-button--primary" href="/map">Открыть поиск</Link></main>;}
