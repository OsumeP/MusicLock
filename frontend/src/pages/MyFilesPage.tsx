import { useState } from 'react'
import { Link } from 'react-router'

import { Alert } from '../components/ui'
import { formatBytes } from '../lib/format'
import { NoticeAlert, Pager } from '../vault/ListControls'
import { SongTable } from '../vault/SongTable'
import { UploadModal } from '../vault/UploadModal'
import { useSongActions } from '../vault/useSongActions'
import { useSongList } from '../vault/useSongList'

function EmptyState({ query, onUpload }: { query: string; onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span aria-hidden className="material-symbols-outlined text-[48px] text-border-blue">{query ? 'search_off' : 'library_music'}</span>
      {query ? (
        <>
          <p className="text-title-md font-semibold">Sin resultados para “{query}”</p>
          <Link to="/archivos" className="text-body-md text-primary-light hover:text-on-surface">
            Limpiar búsqueda
          </Link>
        </>
      ) : (
        <>
          <p className="text-title-md font-semibold">Tu bóveda está vacía</p>
          <p className="max-w-sm text-body-md text-on-surface-variant">
            Sube tu primer MP3: se cifra en este navegador antes de salir y solo tú puedes escucharlo.
          </p>
          <button type="button" onClick={onUpload} className="mt-2 rounded-lg bg-primary px-4 py-2 text-title-sm font-semibold hover:bg-primary-hover">
            Subir archivo cifrado
          </button>
        </>
      )}
    </div>
  )
}

/** "Mis Archivos" (mockup musiclock_mis_archivos_b_veda_cifrada). */
export function MyFilesPage() {
  const list = useSongList()
  const { query, pageNumber, page, error, loading } = list
  const [uploadOpen, setUploadOpen] = useState(false)
  const songActions = useSongActions({ onSongChanged: list.updateSong, onReload: list.reload })

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border-blue px-2.5 py-0.5 font-mono text-mono-label uppercase text-accent-cyan">
            <span className="size-1.5 rounded-full bg-accent-cyan" />
            Cifrado cero-conocimiento activo
          </span>
          <h1 className="flex flex-wrap items-center gap-3 font-display text-headline-md font-semibold">
            Mis Archivos
            {page && (
              <span className="rounded-md bg-surface-card px-2 py-0.5 font-mono text-mono-crypto font-normal text-on-surface-variant">
                {page.count} {page.count === 1 ? 'elemento' : 'elementos'}
              </span>
            )}
          </h1>
          <p className="max-w-2xl text-body-lg text-on-surface-variant">
            Tus pistas se cifran con <strong className="font-semibold text-on-surface">AES-GCM (256 bits)</strong> en este navegador y solo se
            descifran en tu memoria local. El servidor guarda bytes que no puede leer.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-title-sm font-semibold shadow-lg shadow-primary/20 hover:bg-primary-hover"
        >
          <span aria-hidden className="material-symbols-outlined">enhanced_encryption</span>
          Subir archivo cifrado
        </button>
      </div>

      {query && (
        <div className="flex items-center gap-2 text-body-md text-on-surface-variant">
          Resultados para <strong className="text-on-surface">“{query}”</strong>
          <Link to="/archivos" className="text-primary-light hover:text-on-surface">
            · Limpiar
          </Link>
        </div>
      )}

      <NoticeAlert notice={songActions.notice} onClose={() => songActions.setNotice(null)} />

      {error && !page && (
        <Alert tone="error">
          {error}{' '}
          <button type="button" className="font-semibold underline" onClick={list.reload}>
            Reintentar
          </button>
        </Alert>
      )}

      <section className="overflow-hidden rounded-xl bg-surface-card ring-1 ring-border-subtle" aria-busy={loading}>
        {!page && !error ? (
          <p className="px-6 py-16 text-center font-mono text-mono-crypto text-on-surface-variant" role="status">
            Cargando bóveda…
          </p>
        ) : page && page.songs.length === 0 ? (
          <EmptyState query={query} onUpload={() => setUploadOpen(true)} />
        ) : page ? (
          <SongTable
            songs={page.songs}
            firstIndex={list.first}
            caption="Archivos cifrados"
            downloadingId={songActions.downloadingId}
            favoritePending={songActions.favoritePending}
            actions={songActions.actions}
          />
        ) : null}
      </section>

      {page && page.count > 0 && (
        <Pager
          first={list.first}
          last={list.last}
          count={page.count}
          pageNumber={pageNumber}
          totalSize={formatBytes(list.totalSize)}
          hasPrevious={page.hasPrevious}
          hasNext={page.hasNext}
          onPage={list.goToPage}
        />
      )}

      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            if (pageNumber !== 1 || query) list.setParams({}) // volver a la primera página para ver la canción nueva
            list.reload()
          }}
        />
      )}

      {songActions.modals}
    </div>
  )
}
