'use client';
export default function ErrorPage({reset}:{error:Error&{digest?:string};reset:()=>void}){return <main id="main" className="dc-container section prose"><h1>Не удалось загрузить страницу</h1><p>Попробуйте ещё раз. Если ошибка повторяется, вернитесь к поиску позже.</p><button className="dc-button dc-button--primary" onClick={reset}>Повторить</button></main>;}
