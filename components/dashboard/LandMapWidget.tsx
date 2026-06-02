'use client';
import { MapContainer, TileLayer, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslations } from 'next-intl';
import { MapPin } from 'lucide-react';

interface LandMapWidgetProps {
  coordinates: Array<{ lat: number; lng: number }>;
  landArea: number;
  s3ImageKey?: string;
}

export default function LandMapWidget({ coordinates, landArea }: LandMapWidgetProps) {
  const t = useTranslations('land');
  const tc = useTranslations('common');
  if (!coordinates?.length) return (
    <div className="bg-white rounded-2xl p-5 shadow border border-gray-100 flex flex-col items-center justify-center h-48 text-gray-400">
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
    <div className="bg-white rounded-2xl shadow overflow-hidden border border-gray-100">
      <div className="flex items-center justify-between p-3 border-b border-gray-100">
        <span className="flex items-center gap-2 font-medium text-gray-700">
          <MapPin className="w-4 h-4 text-brand-600" /> {t('yourLand')}
        </span>
        <span className="text-sm text-gray-500">{landArea} {tc('acres')}</span>
      </div>
      <div className="h-48">
        <MapContainer
          center={center}
          zoom={15}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          attributionControl={false}
        >
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
