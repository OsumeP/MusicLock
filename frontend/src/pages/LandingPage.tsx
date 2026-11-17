import { Link } from 'react-router'

import { useAuth } from '../auth/session'

/**
 * Landing pública (Actor 5: usuario no registrado), basada en el mockup
 * musiclock_tu_m_sica_privada_y_segura_landing_page. El contenido describe SOLO
 * lo que hace el MVP; lo demás se marca como "próximamente".
 */

const STEPS = [
  {
    icon: 'upload_file',
    title: 'Sube tus MP3',
    text: 'Elige tus canciones. Se cifran automáticamente en tu equipo antes de viajar por internet: nadie puede escucharlas en el camino.',
    tag: 'Cifrado antes del envío',
  },
  {
    icon: 'key',
    title: 'Solo tú tienes la llave',
    text: 'Tu contraseña genera una llave que solo existe en tu navegador. Sin ella nadie, ni siquiera nosotros, puede abrir ni escuchar tus canciones.',
    tag: 'Tú eres el único dueño',
  },
  {
    icon: 'headphones',
    title: 'Escucha desde cualquier lugar',
    text: 'Inicia sesión en cualquier navegador y reproduce tu música: se descifra en la memoria de tu dispositivo, nunca en el servidor.',
    tag: 'Descifrado local',
  },
]

const BENEFITS = [
  { icon: 'visibility_off', title: 'Privacidad real', text: 'Nadie escanea tus archivos ni analiza tu música para venderte anuncios o entrenar inteligencias artificiales: el servidor solo ve bytes cifrados.' },
  { icon: 'graphic_eq', title: 'Tu archivo, intacto', text: 'Lo que descargas es exactamente el MP3 que subiste, byte por byte. Sin recompresiones.' },
  { icon: 'devices', title: 'Cualquier navegador', text: 'Nada que instalar: el cifrado usa la Web Crypto API que ya trae tu navegador.' },
  { icon: 'shield_lock', title: 'Protección contra filtraciones', text: 'Si alguien accediera a nuestros servidores, solo encontraría archivos ilegibles sin tu contraseña.' },
]

const PLANS = [
  { name: 'Free', price: 'Gratis', features: ['500 MB de almacenamiento cifrado', 'Hasta 20 MB por archivo', 'Reproductor web y descargas'], available: true },
  { name: 'Premium', price: 'Próximamente', features: ['5 GB de almacenamiento cifrado', 'Hasta 100 MB por archivo', 'Estadísticas avanzadas'], available: false },
]

const FAQ = [
  { q: '¿MusicLock puede escuchar mi música?', a: 'No. Tus archivos se cifran en tu navegador antes de subirse y la llave nunca sale de tu dispositivo. El servidor guarda datos cifrados que no puede abrir.' },
  { q: '¿Qué pasa si olvido mi contraseña?', a: 'Tu contraseña es la única llave de tu bóveda: si la olvidas, tus archivos no se pueden recuperar. Por eso al registrarte te pedimos confirmar que lo entiendes. (La recuperación con frase semilla está en nuestra hoja de ruta.)' },
  { q: '¿Qué formatos puedo subir?', a: 'Por ahora, archivos MP3. Otros formatos llegarán más adelante.' },
  { q: '¿Puedo compartir canciones?', a: 'Todavía no. Compartir con permisos revocables, playlists y favoritos están en camino.' },
  { q: '¿El título de mis canciones también se cifra?', a: 'El título y el artista que escribes se guardan sin cifrar para poder buscarlos. El audio y las etiquetas internas del archivo sí viajan y se guardan cifrados.' },
]

export function LandingPage() {
  const { session } = useAuth()
  const signedIn = session.status === 'ready' || session.status === 'locked'

  return (
    <div className="min-h-screen bg-surface-base">
      <header className="sticky top-0 z-30 border-b border-border-subtle bg-surface-base/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 lg:px-8">
          <Link to="/" className="flex items-center gap-3">
            <span aria-hidden className="material-symbols-outlined grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent-cyan text-[20px] text-white">lock</span>
            <span className="flex flex-col">
              <span className="font-display text-[18px] font-bold leading-tight">MusicLock</span>
              <span className="hidden font-mono text-[10px] uppercase tracking-wider text-accent-cyan sm:block">Criptografía Zero-Knowledge</span>
            </span>
          </Link>
          <nav aria-label="Secciones" className="hidden flex-1 justify-center gap-6 text-title-sm text-on-surface-variant md:flex">
            <a href="#como-funciona" className="hover:text-on-surface">¿Cómo funciona?</a>
            <a href="#beneficios" className="hover:text-on-surface">Beneficios</a>
            <a href="#planes" className="hover:text-on-surface">Planes</a>
            <a href="#preguntas" className="hover:text-on-surface">Preguntas</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {signedIn ? (
              <Link to="/inicio" className="whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-title-sm font-semibold hover:bg-primary-hover">Ir a mi bóveda</Link>
            ) : (
              <>
                <Link to="/login" className="whitespace-nowrap rounded-lg px-3 py-2 text-title-sm text-on-surface-variant hover:text-on-surface">Iniciar sesión</Link>
                <Link to="/registro" className="whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-title-sm font-semibold hover:bg-primary-hover">Comenzar gratis</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(2,80,152,0.35),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(14,165,233,0.15),transparent_50%)]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 lg:grid-cols-2 lg:px-8 lg:py-24">
            <div className="flex flex-col gap-6">
              <span className="w-fit rounded-full border border-border-blue px-3 py-1 font-mono text-mono-label uppercase text-accent-cyan">Nube segura de audio · 0 % espionaje</span>
              <h1 className="font-display text-headline-lg font-bold sm:text-display-lg">Tu música, tus archivos, 100 % tuyos.</h1>
              <p className="max-w-xl text-body-lg text-on-surface-variant">
                MusicLock guarda tus canciones en una nube privada donde solo tú tienes la llave. Se cifran en tu navegador antes de subirse:
                ni siquiera nosotros podemos escuchar lo que subes.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link to={signedIn ? '/inicio' : '/registro'} className="rounded-xl bg-primary px-6 py-3 text-title-md font-semibold shadow-lg shadow-primary/30 hover:bg-primary-hover">
                  {signedIn ? 'Ir a mi bóveda' : 'Crear cuenta gratis (500 MB)'}
                </Link>
                <a href="#como-funciona" className="rounded-xl px-6 py-3 text-title-md ring-1 ring-border-blue hover:bg-surface-card">Ver cómo funciona</a>
              </div>
              <ul className="flex flex-wrap gap-x-6 gap-y-2 text-body-sm text-on-surface-variant">
                {['Sin anuncios', 'Cualquier navegador', 'Cifrado AES-256', 'Nunca se comparten'].map((item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    <span aria-hidden className="material-symbols-outlined text-[16px] text-accent-cyan">check_circle</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Ilustración del reproductor (decorativa) */}
            <div aria-hidden className="rounded-2xl bg-surface-card p-6 shadow-2xl ring-1 ring-border-subtle">
              <div className="flex items-center justify-between font-mono text-mono-label text-accent-cyan">
                <span>Bóveda cifrada · Reproductor local</span>
                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">lock</span>Llave única activa</span>
              </div>
              <div className="mt-6 flex items-center gap-4">
                <span className="material-symbols-outlined grid size-16 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent-cyan text-[32px] text-white">graphic_eq</span>
                <div>
                  <p className="font-display text-headline-sm font-semibold">Maqueta — Nocturno #4</p>
                  <p className="text-body-sm text-on-surface-variant">Estudio personal · versión pre-mezcla</p>
                </div>
              </div>
              <div className="mt-6 flex h-12 items-end gap-1">
                {[30, 55, 40, 75, 60, 90, 45, 70, 35, 80, 50, 65, 40, 85, 55, 30, 60, 75, 45, 50].map((h, i) => (
                  <span key={i} className={`flex-1 rounded-sm ${i < 9 ? 'bg-accent-cyan' : 'bg-border-blue'}`} style={{ height: `${h}%` }} />
                ))}
              </div>
              <div className="mt-2 flex justify-between font-mono text-mono-label text-on-surface-variant"><span>02:44</span><span>04:12</span></div>
              <ul className="mt-6 divide-y divide-border-subtle text-body-md">
                {[['Nocturno #4 (Take 03)', '04:12'], ['Guitarra acústica — arreglo B', '02:50'], ['Voz principal limpia', '03:15']].map(([title, time]) => (
                  <li key={title} className="flex justify-between py-2.5">
                    <span>{title}</span>
                    <span className="flex items-center gap-3 font-mono text-mono-crypto text-on-surface-variant"><span className="text-accent-cyan">MP3 · Privado</span>{time}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Cómo funciona */}
        <section id="como-funciona" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 lg:px-8">
          <p className="font-mono text-mono-label uppercase text-accent-cyan">Cero complicaciones</p>
          <h2 className="mt-2 font-display text-headline-lg font-semibold">¿Cómo funciona MusicLock?</h2>
          <p className="mt-2 max-w-2xl text-body-lg text-on-surface-variant">Seguridad de nivel profesional, explicada en el lenguaje de quienes aman la música.</p>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex flex-col gap-3 rounded-xl bg-surface-card p-6 ring-1 ring-border-subtle">
                <span className="font-mono text-mono-label text-on-surface-variant">PASO 0{i + 1}</span>
                <span aria-hidden className="material-symbols-outlined grid size-12 place-items-center rounded-xl bg-primary-container text-[26px] text-primary-light">{step.icon}</span>
                <h3 className="font-display text-headline-sm font-semibold">{step.title}</h3>
                <p className="text-body-md text-on-surface-variant">{step.text}</p>
                <span className="mt-auto w-fit rounded-full bg-surface-container-lowest px-3 py-1 font-mono text-mono-label text-accent-cyan">{step.tag}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Beneficios */}
        <section id="beneficios" className="scroll-mt-20 border-y border-border-subtle bg-surface-raised">
          <div className="mx-auto max-w-7xl px-4 py-16 lg:px-8">
            <p className="font-mono text-mono-label uppercase text-accent-cyan">Ventajas directas</p>
            <h2 className="mt-2 font-display text-headline-lg font-semibold">Diseñado para quienes cuidan su sonido</h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {BENEFITS.map((b) => (
                <div key={b.title} className="flex gap-4 rounded-xl bg-surface-card p-6 ring-1 ring-border-subtle">
                  <span aria-hidden className="material-symbols-outlined text-[28px] text-accent-cyan">{b.icon}</span>
                  <div>
                    <h3 className="font-display text-headline-sm font-semibold">{b.title}</h3>
                    <p className="mt-1 text-body-md text-on-surface-variant">{b.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Planes */}
        <section id="planes" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 lg:px-8">
          <p className="font-mono text-mono-label uppercase text-accent-cyan">Comparación</p>
          <h2 className="mt-2 font-display text-headline-lg font-semibold">Planes</h2>
          <div className="mt-10 grid max-w-4xl gap-6 md:grid-cols-2">
            {PLANS.map((plan) => (
              <div key={plan.name} className={`flex flex-col gap-4 rounded-xl p-6 ring-1 ${plan.available ? 'bg-surface-card ring-primary-light/50' : 'bg-surface-raised ring-border-subtle'}`}>
                <div className="flex items-baseline justify-between">
                  <h3 className="font-display text-headline-md font-semibold">{plan.name}</h3>
                  <span className={`font-mono text-mono-crypto ${plan.available ? 'text-accent-cyan' : 'text-on-surface-variant'}`}>{plan.price}</span>
                </div>
                <ul className="flex flex-col gap-2 text-body-md">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <span aria-hidden className="material-symbols-outlined text-[18px] text-accent-cyan">check</span>
                      {f}
                    </li>
                  ))}
                </ul>
                {plan.available ? (
                  <Link to={signedIn ? '/inicio' : '/registro'} className="mt-auto rounded-lg bg-primary px-4 py-2.5 text-center text-title-sm font-semibold hover:bg-primary-hover">
                    {signedIn ? 'Ir a mi bóveda' : 'Comenzar gratis'}
                  </Link>
                ) : (
                  <span className="mt-auto rounded-lg px-4 py-2.5 text-center text-title-sm text-on-surface-variant ring-1 ring-border-subtle">Disponible próximamente</span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Preguntas frecuentes */}
        <section id="preguntas" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-20 lg:px-8">
          <h2 className="font-display text-headline-lg font-semibold">Preguntas frecuentes</h2>
          <div className="mt-6 flex flex-col gap-3">
            {FAQ.map((item) => (
              <details key={item.q} className="group rounded-xl bg-surface-card p-5 ring-1 ring-border-subtle">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-title-md font-semibold">
                  {item.q}
                  <span aria-hidden className="material-symbols-outlined transition-transform group-open:rotate-180">expand_more</span>
                </summary>
                <p className="mt-3 text-body-md text-on-surface-variant">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border-subtle">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 font-mono text-mono-label text-on-surface-variant lg:px-8">
          <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-accent-cyan" />MusicLock · Universidad Nacional de Colombia · Ingeniería de Software II</span>
          <span>© 2026 MusicLock</span>
        </div>
      </footer>
    </div>
  )
}
