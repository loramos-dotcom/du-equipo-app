import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { BarChart3, ChevronDown, ChevronRight, Edit3, MapPin, Plus, Save, Trash2, X } from 'lucide-react'
import type { SpecialView, ViewMode } from '../../domain/types'
import { isExcludedFromDashboard } from './dashboardSpecialViews'
import { mapMarkers, summarizeMapMarkers, type MapMarker } from '../../domain/markerStatus'
import { saveSpecialView } from './api'
import cabaImprovementFocusRaw from '../../data/caba-improvement-focus.json?raw'

interface SpecialViewsPanelProps {
  activeArea: string
  views: SpecialView[]
  scopedProjectIds: Set<string>
  scopedAreaKeys: Set<string>
  mode: ViewMode
  canEdit: boolean
  onChanged: () => Promise<void>
  onNotice: (type: 'success' | 'error', text: string) => void
}

const cabaBounds = { west: -58.55, east: -58.32, north: -34.51, south: -34.74 }
const leafletCssUrl = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
const leafletScriptUrl = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
const cabaImprovementMapBounds = [[-34.725, -58.565], [-34.505, -58.315]] as [[number, number], [number, number]]
const cabaImprovementMapViewportBounds = [[-34.705, -58.535], [-34.525, -58.335]] as [[number, number], [number, number]]
const cabaImprovementMapMinZoom = 10
const cabaImprovementMapMaxZoom = 12
const cabaImprovementFocusGeoJson = JSON.parse(cabaImprovementFocusRaw.replace(/^\uFEFF/, '')) as unknown

function isWorksMapView(view: SpecialView) {
  const viewKey = view.viewKey.toLocaleLowerCase('es')
  const title = view.title.toLocaleLowerCase('es')
  return viewKey.includes('administrative_works_map') || title.includes('mapa de obras')
}

function markerPosition(marker: MapMarker, bounds: typeof cabaBounds) {
  const left = ((marker.lng - bounds.west) / (bounds.east - bounds.west)) * 100
  const top = ((bounds.north - marker.lat) / (bounds.north - bounds.south)) * 100
  return {
    left: `${Math.max(2, Math.min(98, left))}%`,
    top: `${Math.max(2, Math.min(98, top))}%`,
  }
}

function PrintWorksMap({markers}:{markers:MapMarker[]}) {
  const position=(lat:number,lng:number)=>({x:20+((lng-cabaBounds.west)/(cabaBounds.east-cabaBounds.west))*420,y:20+((cabaBounds.north-lat)/(cabaBounds.north-cabaBounds.south))*440});
  const rings:number[][][]=[];
  const collect=(value:unknown)=>{if(!Array.isArray(value)||!value.length)return;if(Array.isArray(value[0])&&typeof value[0][0]==='number'){rings.push(value as number[][]);return;}for(const part of value)collect(part);};
  const geo=cabaImprovementFocusGeoJson as {features?:{geometry?:{coordinates?:unknown}}[]};for(const feature of geo.features??[])collect(feature.geometry?.coordinates);
  return (
    <div className="print-works-map" aria-label="Mapa de obras para impresión">
      <svg viewBox="0 0 460 490" role="img" aria-label="Ubicación de las obras con los datos actuales" style={{width:'100%',height:'auto'}}>
        <rect width="460" height="490" fill="#f2f6f8"/>
        {rings.map((ring,index)=><polygon key={index} points={ring.map(([lng,lat])=>{const p=position(lat,lng);return p.x+','+p.y;}).join(' ')} fill="#e8f1f5" stroke="#035c80" strokeWidth="1"/>)}
        {markers.map((marker,index)=>{const p=position(marker.lat,marker.lng);return <g key={marker.id}><circle cx={p.x} cy={p.y} r="8" fill={marker.color} stroke="#fcfcfc" strokeWidth="1"/><text x={p.x} y={p.y+3} textAnchor="middle" fill="#1d3343" fontSize="8" fontWeight="700">{index+1}</text></g>;})}
        <text x="20" y="478" fill="#607384" fontSize="10">Esquema de ubicación · Ciudad de Buenos Aires</text>
      </svg>
    </div>
  )
}

type LeafletGlobal = {
  map: (element: HTMLElement, options?: Record<string, unknown>) => LeafletMap
  tileLayer: (url: string, options?: Record<string, unknown>) => { addTo: (map: LeafletMap) => unknown }
  layerGroup: () => LeafletLayerGroup
  circleMarker: (latLng: [number, number], options?: Record<string, unknown>) => LeafletCircleMarker
  marker: (latLng: [number, number], options?: Record<string, unknown>) => LeafletMarker
  divIcon: (options?: Record<string, unknown>) => unknown
  latLngBounds: (bounds: [[number, number], [number, number]] | [number, number][]) => unknown
  geoJSON: (geoJson: unknown, options?: Record<string, unknown>) => { addTo: (layer: LeafletLayerGroup | LeafletMap) => unknown }
}

type LeafletMap = {
  fitBounds: (bounds: unknown, options?: Record<string, unknown>) => void
  invalidateSize: () => void
  remove: () => void
  setMaxBounds: (bounds: [[number, number], [number, number]]) => void
  setMinZoom: (zoom: number) => void
}

type LeafletLayerGroup = {
  addTo: (map: LeafletMap) => LeafletLayerGroup
  clearLayers: () => void
}

type LeafletCircleMarker = {
  addTo: (layer: LeafletLayerGroup) => LeafletCircleMarker
  bindPopup: (html: string, options?: Record<string, unknown>) => LeafletCircleMarker
}

type LeafletMarker = {
  addTo: (layer: LeafletLayerGroup) => LeafletMarker
  bindPopup: (html: string, options?: Record<string, unknown>) => LeafletMarker
}

declare global {
  interface Window {
    L?: LeafletGlobal
    __leafletLoadingPromise?: Promise<LeafletGlobal>
  }
}

async function loadLeaflet() {const module=await import('leaflet');return (module.default??module) as unknown as LeafletGlobal;}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function markerPopup(marker: MapMarker) {
  const detail = marker.detail ? marker.detail.split('\n').map((line) => `<div>${escapeHtml(line)}</div>`).join('') : ''
  return `
    <div>
      <p class="admin-map-popup-title">${escapeHtml(marker.address || marker.name || 'Sin dirección')}</p>
      <div><strong>Estado del mapa:</strong> ${escapeHtml(marker.status || 'Sin estado informado')}</div>
      ${detail}
    </div>
  `
}

function WorksMapReferences({ markers }: { markers: MapMarker[] }) {
  if (!markers.length) return null
  return (
    <section className="works-map-references" aria-label="Referencias del mapa de obras">
      <div className="works-reference-header">
        <div className="works-reference-heading">
          <span className="works-reference-icon"><MapPin size={15} /></span>
          <div><small>Mapa de obras</small><h5>Referencias</h5></div>
        </div>
        <span className="works-reference-total"><b>{markers.length}</b> obras visibles</span>
      </div>
      <div className="works-reference-list">
        {markers.map((marker, index) => {
          const label = String(index + 1).padStart(2, '0')
          const tone = marker.tone
          const progressValue = Number.parseFloat(marker.progress.replace(',', '.'))
          const progress = Number.isFinite(progressValue) ? Math.max(0, Math.min(progressValue, 100)) : null
          return (
            <article className={`works-reference-item tone-${tone}`} key={marker.id} style={{ '--blue': marker.color } as CSSProperties}>
              <div className="works-reference-item-main">
                <b className={`works-reference-number tone-${tone}`}>{label}</b>
                <div className="works-reference-copy">
                  <header>
                    <strong>{marker.address || marker.name}</strong>
                    {marker.status && <span className="works-reference-status">{marker.status}</span>}
                  </header>
                  {marker.progress && <footer><span className="works-reference-metric-label">Avance</span><b className="works-reference-progress">{marker.progress}</b></footer>}
                </div>
              </div>
              {progress !== null && <div className="works-reference-track" aria-label={`Avance ${marker.progress}`}><span style={{ width: `${progress}%` }} /></div>}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function addCabaFocusLayer(L: LeafletGlobal, map: LeafletMap) {
  const focusLayer = L.layerGroup().addTo(map)
  L.geoJSON(cabaImprovementFocusGeoJson, {
    interactive: false,
    style: () => ({
      color: '#2563eb',
      weight: 8,
      opacity: 0.14,
      fillColor: '#2563eb',
      fillOpacity: 0.02,
    }),
  }).addTo(focusLayer)
  L.geoJSON(cabaImprovementFocusGeoJson, {
    interactive: false,
    style: () => ({
      color: '#2563eb',
      weight: 2,
      opacity: 0.78,
      fillColor: '#2563eb',
      fillOpacity: 0.045,
      dashArray: '6 5',
    }),
  }).addTo(focusLayer)
}

function LeafletWorksMap({ markers }: { markers: MapMarker[] }) {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const layerRef = useRef<LeafletLayerGroup | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let disposed = false

    loadLeaflet()
      .then((L) => {
        if (disposed || !elementRef.current) return

        if (!mapRef.current) {
          const map = L.map(elementRef.current, {
            scrollWheelZoom: false,
            zoomSnap: 0.25,
            zoomDelta: 0.25,
          })
          L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
          }).addTo(map)
          map.setMaxBounds(cabaImprovementMapBounds)
          map.setMinZoom(cabaImprovementMapMinZoom)
          addCabaFocusLayer(L, map)
          mapRef.current = map
          layerRef.current = L.layerGroup().addTo(map)
        }

        const map = mapRef.current
        const layer = layerRef.current
        if (!map || !layer) return

        map.setMaxBounds(cabaImprovementMapBounds)
        map.setMinZoom(cabaImprovementMapMinZoom)
        layer.clearLayers()

        markers.forEach((marker, index) => {
          const textColor = marker.color === '#f3a116' ? '#163053' : '#ffffff'
          const label = String(index + 1).padStart(2, '0')
          L.marker([marker.lat, marker.lng], {
            icon: L.divIcon({
              className: 'leaflet-works-marker',
              html: `<span style="background:${marker.color};color:${textColor}">${escapeHtml(label)}</span>`,
              iconAnchor: [10, 10],
              iconSize: [20, 20],
            }),
          }).bindPopup(markerPopup(marker), {
            autoPan: true,
            keepInView: true,
            closeButton: true,
            minWidth: 220,
            maxWidth: 280,
            maxHeight: 210,
            autoPanPaddingTopLeft: [16, 64],
            autoPanPaddingBottomRight: [16, 16],
          }).addTo(layer)
        })

        window.setTimeout(() => {
          if (!mapRef.current) return
          mapRef.current.invalidateSize()
          mapRef.current.fitBounds(L.latLngBounds(cabaImprovementMapViewportBounds), {
            padding: [24, 24],
            maxZoom: cabaImprovementMapMaxZoom,
            animate: false,
          })
        }, 0)
      })
      .catch((error: Error) => {
        if (!disposed) setLoadError(error.message)
      })

    return () => {
      disposed = true
    }
  }, [markers])

  useEffect(() => () => {
    mapRef.current?.remove()
    mapRef.current = null
    layerRef.current = null
  }, [])

  return (
    <div className="leaflet-works-map-shell">
      <div className="leaflet-works-map" ref={elementRef} />
      <div className="leaflet-works-a11y" aria-hidden="false">
        {markers.map((marker) => <button type="button" key={marker.id} aria-label={`${marker.name} - ${marker.status}`} tabIndex={-1} />)}
      </div>
      {loadError && <div className="leaflet-works-map-empty">{loadError}</div>}
    </div>
  )
}

export function MapSpecialView({ view }: { view: SpecialView }) {
  const [selected, setSelected] = useState<MapMarker | null>(null)
  const isWorksMap = isWorksMapView(view)
  const markers = useMemo(() => mapMarkers(view.payload, { excludeFinished: isWorksMap, useTrafficLight: isWorksMap }), [isWorksMap, view.payload])
  const markerSummary = useMemo(() => summarizeMapMarkers(markers), [markers])
  const bbox = `${cabaBounds.west},${cabaBounds.south},${cabaBounds.east},${cabaBounds.north}`
  return (
    <div className={`native-map-view ${isWorksMap ? 'is-leaflet-works-map' : ''}`}>
      <div className={`native-map-canvas ${isWorksMap ? 'leaflet-works-canvas' : ''}`}>
        {isWorksMap ? (
          <><LeafletWorksMap markers={markers} /><PrintWorksMap markers={markers}/></>
        ) : (
          <iframe title="Mapa de la Ciudad de Buenos Aires" src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik`} loading="lazy" />
        )}
        {!isWorksMap && <div className="native-map-markers">
          {markers.map((marker, index) => (
            <button key={marker.id} type="button" title={marker.name} style={{ ...markerPosition(marker, cabaBounds), background: marker.color }} onClick={() => setSelected(marker)}>{index + 1}</button>
          ))}
        </div>}
        {!isWorksMap && selected && <aside className="native-map-popup"><button type="button" aria-label="Cerrar detalle" onClick={() => setSelected(null)}><X size={14} /></button><strong>{selected.name}</strong>{selected.address && <span>{selected.address}</span>}{selected.status && <b>{selected.status}</b>}{selected.detail && <p>{selected.detail}</p>}</aside>}
      </div>
      {isWorksMap
        ? <><div className="native-map-status-strip">{markerSummary.map(({label, count, tone, color}) => <span key={tone+':'+label}><i className={`status-${tone}`} style={{background:color}} />{label}: {count}</span>)}</div><WorksMapReferences markers={markers} /></>
        : <div className="native-map-legend">{markers.map((marker, index) => <button type="button" key={marker.id} onClick={() => setSelected(marker)}><i style={{ background: marker.color }}>{index + 1}</i><span><strong>{marker.name}</strong>{marker.status && <small>{marker.status}</small>}</span></button>)}</div>}
    </div>
  )
}

interface MetricCard {
  label: string
  value: string
  target?: string
  tone?: string
}

interface SpecialViewDraft {
  id: string
  title: string
  kind: 'metrics' | 'table'
  originalPayload: Record<string, unknown>
  cards: MetricCard[]
  columns: string[]
  rows: string[][]
}

function metricCards(payload: Record<string, unknown>): MetricCard[] {
  if (!Array.isArray(payload.cards)) return []
  return payload.cards.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return []
    const item = raw as Record<string, unknown>
    return [{
      label: String(item.label ?? ''),
      value: String(item.value ?? ''),
      target: item.target == null ? '' : String(item.target),
      tone: String(item.tone ?? 'neutral'),
    }]
  })
}

export function SpecialDataView({ view }: { view: SpecialView }) {
  const cards = metricCards(view.payload)
  const columns = Array.isArray(view.payload.columns) ? view.payload.columns.map(String) : []
  const rows = Array.isArray(view.payload.rows) ? view.payload.rows.filter(Array.isArray) as unknown[][] : []
  if (cards.length || view.payload.kind === 'metrics') {
    return cards.length
      ? <div className="special-metric-grid">{cards.map((card, index) => <article className={`special-metric-card tone-${card.tone}`} key={`${card.label}-${index}`}><small>{card.label}</small><strong>{card.value || 'Sin dato'}</strong>{card.target && <span>Meta: {card.target}</span>}</article>)}</div>
      : <p className="portfolio-empty">Todavía no hay datos cargados.</p>
  }
  if (columns.length || view.payload.kind === 'table') {
    return columns.length
      ? <div className="special-table" role="table"><div className="special-table-row is-head" role="row">{columns.map((column, index) => <b key={`${column}-${index}`}>{column}</b>)}</div>{rows.map((row, index) => <div className="special-table-row" role="row" key={index}>{columns.map((_, columnIndex) => <span key={columnIndex}>{String(row[columnIndex] ?? '')}</span>)}</div>)}</div>
      : <p className="portfolio-empty">Todavía no hay columnas cargadas.</p>
  }
  return <pre className="special-view-data">{JSON.stringify(view.payload, null, 2)}</pre>
}

function draftFromView(view: SpecialView): SpecialViewDraft | null {
  if (Array.isArray(view.payload.markers)) return null
  const cards = metricCards(view.payload)
  const columns = Array.isArray(view.payload.columns) ? view.payload.columns.map(String) : []
  const rows = Array.isArray(view.payload.rows)
    ? view.payload.rows.filter(Array.isArray).map((row) => (row as unknown[]).map(String))
    : []
  const kind = view.payload.kind === 'table' || columns.length || rows.length ? 'table' : 'metrics'
  return {
    id: view.id,
    title: view.title,
    kind,
    originalPayload: view.payload,
    cards,
    columns,
    rows,
  }
}

export function SpecialViewsPanel({ activeArea, views, scopedProjectIds, scopedAreaKeys, mode, canEdit, onChanged, onNotice }: SpecialViewsPanelProps) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState<SpecialViewDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const visible = views.filter((view) => !isExcludedFromDashboard(view) && !view.projectId && !isWorksMapView(view) && (activeArea === 'dashboard'
    ? (view.projectId ? scopedProjectIds.has(view.projectId) : scopedAreaKeys.has(view.areaKey))
    : view.areaKey === activeArea))
  if (!visible.length) return null

  const submitDraft = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft || saving) return
    setSaving(true)
    try {
      const payload = draft.kind === 'metrics'
        ? { ...draft.originalPayload, kind: 'metrics', cards: draft.cards.map((card) => ({ label: card.label, value: card.value, target: card.target || '', tone: card.tone || 'neutral' })) }
        : { ...draft.originalPayload, kind: 'table', columns: draft.columns, rows: draft.rows.map((row) => draft.columns.map((_, index) => row[index] ?? '')) }
      await saveSpecialView({ id: draft.id, title: draft.title, payload })
      await onChanged()
      setDraft(null)
      onNotice('success', 'El contenido se guardó correctamente.')
    } catch (error) {
      onNotice('error', error instanceof Error ? error.message : 'No se pudo guardar el contenido.')
    } finally {
      setSaving(false)
    }
  }

  const updateCard = (index: number, field: keyof MetricCard, value: string) => setDraft((current) => current ? {
    ...current,
    cards: current.cards.map((card, cardIndex) => cardIndex === index ? { ...card, [field]: value } : card),
  } : current)

  const removeColumn = (columnIndex: number) => setDraft((current) => current ? {
    ...current,
    columns: current.columns.filter((_, index) => index !== columnIndex),
    rows: current.rows.map((row) => row.filter((_, index) => index !== columnIndex)),
  } : current)

  return (
    <section className="special-views" aria-label="Visualizaciones especiales">
      {visible.map((view) => {
        const expanded = open.has(view.id)
        const isMap = view.viewKey.toLocaleLowerCase('es').includes('map') || Array.isArray(view.payload.markers)
        const isWorksMap = isWorksMapView(view)
        const itemCount = isMap ? mapMarkers(view.payload, { excludeFinished: isWorksMap, useTrafficLight: isWorksMap }).length : metricCards(view.payload).length || (Array.isArray(view.payload.rows) ? view.payload.rows.length : 0)
        return (
          <section className="portfolio-section" key={view.id}>
            <button className="portfolio-disclosure" type="button" aria-expanded={expanded} onClick={() => setOpen((current) => { const next = new Set(current); if (next.has(view.id)) next.delete(view.id); else next.add(view.id); return next })}>
              <span className="portfolio-disclosure-icon">{isMap ? <MapPin size={18} /> : <BarChart3 size={18} />}</span><span><strong>{view.title}</strong><small>{isMap ? 'Mapa, estados y referencias' : 'Indicadores y datos de seguimiento'}</small></span><b>{itemCount || ''}</b>{expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
            {expanded && <div className="portfolio-content">
              {mode === 'edit' && canEdit && !isMap && <button className="secondary-button portfolio-add" type="button" onClick={() => setDraft(draftFromView(view))}><Edit3 size={15} /> Editar contenido</button>}
              {isMap ? <MapSpecialView view={view} /> : <SpecialDataView view={view} />}
            </div>}
          </section>
        )
      })}

      {draft && (
        <div className="modal-backdrop" role="presentation">
          <form className="compact-editor special-view-editor" role="dialog" aria-modal="true" aria-labelledby="special-view-editor-title" onSubmit={submitDraft}>
            <header><div><small>Datos de seguimiento</small><h2 id="special-view-editor-title">Editar contenido</h2></div><button className="icon-button" type="button" aria-label="Cerrar" onClick={() => setDraft(null)}><X size={17} /></button></header>
            <div className="compact-form-grid special-view-form">
              <label className="span-2">Título del bloque<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required /></label>

              {draft.kind === 'metrics' && <div className="special-editor-section span-2">
                <div className="special-editor-section-heading"><strong>Indicadores</strong><button className="secondary-button" type="button" onClick={() => setDraft({ ...draft, cards: [...draft.cards, { label: '', value: '', target: '', tone: 'neutral' }] })}><Plus size={14} /> Agregar indicador</button></div>
                <div className="special-editor-list">
                  {draft.cards.map((card, index) => <fieldset className="special-editor-item" key={index}>
                    <legend>Indicador {index + 1}</legend>
                    <label>Etiqueta<input aria-label={`Etiqueta ${index + 1}`} value={card.label} onChange={(event) => updateCard(index, 'label', event.target.value)} /></label>
                    <label>Valor<input aria-label={`Valor ${index + 1}`} value={card.value} onChange={(event) => updateCard(index, 'value', event.target.value)} /></label>
                    <label>Meta<input aria-label={`Meta ${index + 1}`} value={card.target || ''} onChange={(event) => updateCard(index, 'target', event.target.value)} /></label>
                    <label>Color<select aria-label={`Color ${index + 1}`} value={card.tone || 'neutral'} onChange={(event) => updateCard(index, 'tone', event.target.value)}><option value="green">Verde</option><option value="blue">Azul</option><option value="amber">Amarillo</option><option value="neutral">Neutro</option></select></label>
                    <button className="icon-button danger" type="button" title="Eliminar indicador" aria-label={`Eliminar indicador ${index + 1}`} onClick={() => setDraft({ ...draft, cards: draft.cards.filter((_, cardIndex) => cardIndex !== index) })}><Trash2 size={15} /></button>
                  </fieldset>)}
                  {!draft.cards.length && <p className="portfolio-empty">Todavía no hay indicadores. Podés agregar el primero.</p>}
                </div>
              </div>}

              {draft.kind === 'table' && <div className="special-editor-section span-2">
                <div className="special-editor-section-heading"><strong>Columnas</strong><button className="secondary-button" type="button" onClick={() => setDraft({ ...draft, columns: [...draft.columns, ''], rows: draft.rows.map((row) => [...row, '']) })}><Plus size={14} /> Agregar columna</button></div>
                <div className="special-column-editor">
                  {draft.columns.map((column, index) => <div key={index}><label>Columna {index + 1}<input aria-label={`Encabezado de columna ${index + 1}`} value={column} onChange={(event) => setDraft({ ...draft, columns: draft.columns.map((item, columnIndex) => columnIndex === index ? event.target.value : item) })} /></label><button className="icon-button danger" type="button" title="Eliminar columna" aria-label={`Eliminar columna ${index + 1}`} onClick={() => removeColumn(index)}><Trash2 size={15} /></button></div>)}
                </div>
                <div className="special-editor-section-heading"><strong>Filas</strong><button className="secondary-button" type="button" disabled={!draft.columns.length} onClick={() => setDraft({ ...draft, rows: [...draft.rows, draft.columns.map(() => '')] })}><Plus size={14} /> Agregar fila</button></div>
                <div className="special-table-editor">
                  {draft.rows.map((row, rowIndex) => <fieldset className="special-table-editor-row" key={rowIndex}>
                    <legend>Fila {rowIndex + 1}</legend>
                    <div>{draft.columns.map((column, columnIndex) => <label key={columnIndex}>{column || `Columna ${columnIndex + 1}`}<input aria-label={`Fila ${rowIndex + 1}, ${column || `columna ${columnIndex + 1}`}`} value={row[columnIndex] ?? ''} onChange={(event) => setDraft({ ...draft, rows: draft.rows.map((item, index) => index === rowIndex ? draft.columns.map((_, cellIndex) => cellIndex === columnIndex ? event.target.value : item[cellIndex] ?? '') : item) })} /></label>)}</div>
                    <button className="icon-button danger" type="button" title="Eliminar fila" aria-label={`Eliminar fila ${rowIndex + 1}`} onClick={() => setDraft({ ...draft, rows: draft.rows.filter((_, index) => index !== rowIndex) })}><Trash2 size={15} /></button>
                  </fieldset>)}
                  {!draft.rows.length && <p className="portfolio-empty">Todavía no hay filas cargadas.</p>}
                </div>
              </div>}
            </div>
            <footer><button className="secondary-button" type="button" onClick={() => setDraft(null)}>Cancelar</button><button className="primary-button" type="submit" disabled={saving}><Save size={15} /> {saving ? 'Guardando…' : 'Guardar cambios'}</button></footer>
          </form>
        </div>
      )}
    </section>
  )
}
