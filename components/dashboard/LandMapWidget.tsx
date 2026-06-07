'use client';
import { useEffect } from 'react';
import { MapContainer, TileLayer, Polygon, ZoomControl, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslations } from 'next-intl';
import { MapPin } from 'lucide-react';

interface LandMapWidgetProps {
  coordinates: Array<{ lat: number; lng: number }>;
  landArea: number;
  s3ImageKey?: string;
}

function FitLandBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();
      if (positions.length >= 2) {
        map.fitBounds(positions, { padding: [24, 24], maxZoom: 17 });
      } else if (positions[0]) {
        map.setView(positions[0], 16);
      }
    }, 100);

    return () => window.clearTimeout(timer);
  }, [map, positions]);

  return null;
}

export default function LandMapWidget({ coordinates, landArea }: LandMapWidgetProps) {
  const t = useTranslations('land');
  const tc = useTranslations('common');
  if (!coordinates?.length) return (
    <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-gray-100 bg-white p-5 text-gray-400 shadow">
      <MapPin className="w-8 h-8 mb-2" />
      <p className="text-sm">{t('noCoords')}</p>
    </div>
  );

  const center: [number, number] = [
    coordinates.reduce((s, c) => s + c.lat, 0) / coordinates.length,
    coordinates.reduce((s, c) => s + c.lng, 0) / coordinates.length,
  ];

  const positions: [number, number][] = coordinates.map(c => [c.lat, c.lng]);

  return (
    <div className="self-start overflow-hidden rounded-xl border border-gray-100 bg-white shadow">
      <div className="flex items-center justify-between p-3 border-b border-gray-100">
        <span className="flex items-center gap-2 font-medium text-gray-700">
          <MapPin className="w-4 h-4 text-brand-600" /> {t('yourLand')}
        </span>
        <span className="text-sm text-gray-500">{landArea} {tc('acres')}</span>
      </div>
      <div className="relative z-0 h-48">
        <MapContainer
          center={center}
          zoom={15}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
          dragging
          scrollWheelZoom={false}
          doubleClickZoom
          attributionControl={false}
          minZoom={3}
          maxZoom={19}
        >
          <FitLandBounds positions={positions} />
          <ZoomControl position="bottomright" />
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
            opacity={0.9}
          />
          <Polygon
            positions={positions}
            pathOptions={{ color: '#22c55e', weight: 2, fillColor: '#22c55e', fillOpacity: 0.25 }}
          />
        </MapContainer>
      </div>
    </div>
  );
}
