'use client'

import { useEffect } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'

type MapRecord = {
  id?: string
  kind: 'alert' | 'report' | 'shelter' | 'resource'
  label: string
  latitude: number
  longitude: number
  isDemonstration?: boolean
  demoLabel?: string
  status?: string
  description?: string
  address?: string
  available?: number | string
}

const colors = {
  alert: '#b51f30',
  report: '#d9283c',
  shelter: '#245483',
  resource: '#15803d',
}

function FitBounds({ records }: { records: MapRecord[] }) {
  const map = useMap()
  useEffect(() => {
    if (!records.length) return
    const bounds: LatLngBoundsExpression = records.map((record) => [record.latitude, record.longitude])
    map.fitBounds(bounds, { padding: [42, 42], maxZoom: 14 })
  }, [map, records])
  return null
}

export default function LiveMap({ records }: { records: MapRecord[] }) {
  const center: [number, number] = records.length
    ? [records.reduce((sum, record) => sum + record.latitude, 0) / records.length, records.reduce((sum, record) => sum + record.longitude, 0) / records.length]
    : [17.385, 78.4867]

  return (
    <MapContainer center={center} zoom={records.length ? 12 : 11} scrollWheelZoom className="h-[480px] w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {records.length > 0 && <FitBounds records={records} />}
      {records.map((record) => (
        <CircleMarker
          key={`${record.kind}-${record.id}`}
          center={[record.latitude, record.longitude]}
          radius={record.kind === 'alert' ? 10 : 8}
          pathOptions={{ color: colors[record.kind], fillColor: colors[record.kind], fillOpacity: 0.9, weight: 3 }}
        >
          <Popup>
            <strong>{record.isDemonstration ? 'DEMO — ' : ''}{record.label}</strong>
            {record.demoLabel && <div>{record.demoLabel}</div>}
            {record.status && <div>Status: {record.status}</div>}
            {record.address && <div>{record.address}</div>}
            {record.available !== undefined && <div>Available: {record.available}</div>}
            {record.description && <div>{record.description}</div>}
            <div className="mt-1 text-xs text-slate-500">{record.latitude.toFixed(5)}, {record.longitude.toFixed(5)}</div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
