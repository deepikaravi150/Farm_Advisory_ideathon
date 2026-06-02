'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, Polygon, CircleMarker, Polyline, useMapEvents, useMap } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslations } from 'next-intl';
import { MapPin, Trash2, CheckCircle2, Search, Crosshair } from 'lucide-react';

interface Coordinate { lat: number; lng: number; }
interface Props { onChange: (coords: Coordinate[]) => void; initialAddress?: string; }

const TN_CENTER: [number, number] = [11.1271, 78.6569];
const ESRI_SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

/**
 * Exposes the Leaflet map instance via a ref so the search box can pan/zoom it.
 * Must be a direct child of MapContainer so useMap() works.
 * NOTE: react-leaflet v5's MapContainer already removes the map on unmount, so
 * we must NOT call map.remove() here — doing so double-removes and throws.
 */
function MapRefBridge({ mapRef }: { mapRef: React.MutableRefObject<LeafletMap | null> }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    return () => { mapRef.current = null; };
  }, [map, mapRef]);
  return null;
}

function DrawHandler({ drawing, onPoint, onFinish }: {
  drawing: boolean;
  onPoint: (lat: number, lng: number) => void;
  onFinish: () => void;
}) {
  useMapEvents({
    click(e) { if (drawing) onPoint(e.latlng.lat, e.latlng.lng); },
    dblclick(e) { if (drawing) { e.originalEvent.preventDefault(); onFinish(); } },
  });
  return null;
}

export default function LandMapSelector({ onChange, initialAddress }: Props) {
  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState<[number, number][]>([]);
  const [finished, setFinished] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialAddress ?? '');
  const [searching, setSearching] = useState(false);
  const mapRef = useRef<LeafletMap | null>(null);
  const autoLocated = useRef(false);
  const t = useTranslations('map');

  const addPoint = useCallback((lat: number, lng: number) => {
    setPoints(prev => [...prev, [lat, lng]]);
  }, []);

  const finishDrawing = useCallback(() => {
    setDrawing(false);
    setFinished(true);
    setPoints(prev => {
      onChange(prev.map(([lat, lng]) => ({ lat, lng })));
      return prev;
    });
  }, [onChange]);

  function clearPolygon() {
    setPoints([]);
    setFinished(false);
    setDrawing(false);
    onChange([]);
  }

  function startDrawing() {
    clearPolygon();
    setDrawing(true);
  }

  const geocode = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ' Tamil Nadu India')}&limit=1`,
        { headers: { 'User-Agent': 'FarmAdvisor/1.0' } }
      );
      const data = await res.json();
      if (data[0] && mapRef.current) {
        mapRef.current.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 15);
      }
    } catch { /* silent */ }
    finally { setSearching(false); }
  }, []);

  async function searchLocation(e: React.FormEvent) {
    e.preventDefault();
    geocode(searchQuery);
  }

  // On first mount, auto-locate the map to the address entered during registration.
  // The map instance becomes available asynchronously via MapRefBridge, so retry briefly.
  useEffect(() => {
    if (!initialAddress?.trim() || autoLocated.current) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (mapRef.current) {
        autoLocated.current = true;
        clearInterval(timer);
        geocode(initialAddress);
      } else if (tries > 20) {
        clearInterval(timer);
      }
    }, 150);
    return () => clearInterval(timer);
  }, [initialAddress, geocode]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600 flex items-center gap-1">
          <MapPin className="w-4 h-4 text-brand-600" />
          {t('instruction')}
        </p>
        {points.length > 0 && (
          <button onClick={clearPolygon} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
            <Trash2 className="w-3.5 h-3.5" /> {t('clear')}
          </button>
        )}
      </div>

      {/* Location search */}
      <form onSubmit={searchLocation} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
        <button type="submit" disabled={searching}
          className="px-4 py-2.5 bg-brand-600 text-white rounded-xl text-sm hover:bg-brand-700 disabled:opacity-50 font-medium flex-shrink-0">
          {searching ? '...' : t('find')}
        </button>
      </form>

      {/* Map */}
      <div
        className={`rounded-2xl overflow-hidden border-2 h-80 transition-all ${drawing ? 'border-brand-500 shadow-[0_0_0_3px_rgba(34,197,94,0.2)]' : 'border-gray-200'}`}
        style={{ cursor: drawing ? 'crosshair' : 'grab' }}
      >
        <MapContainer
          center={TN_CENTER}
          zoom={7}
          style={{ width: '100%', height: '100%' }}
          doubleClickZoom={false}
          zoomControl
        >
          {/* Bridges the map instance to mapRef for the search-to-pan feature */}
          <MapRefBridge mapRef={mapRef} />

          <TileLayer url={ESRI_SAT} attribution='&copy; <a href="https://www.esri.com">Esri</a>' maxZoom={19} />
          <TileLayer url={ESRI_LABELS} attribution='' maxZoom={19} opacity={0.9} />
          <DrawHandler drawing={drawing} onPoint={addPoint} onFinish={finishDrawing} />

          {points.length > 1 && (
            <Polyline
              positions={finished ? [...points, points[0]] : points}
              pathOptions={{ color: '#22c55e', weight: 2, dashArray: finished ? undefined : '6 4' }}
            />
          )}

          {finished && points.length > 2 && (
            <Polygon
              positions={points}
              pathOptions={{ color: '#16a34a', weight: 2, fillColor: '#22c55e', fillOpacity: 0.25 }}
            />
          )}

          {points.map(([lat, lng], i) => (
            <CircleMarker key={i} center={[lat, lng]} radius={5}
              pathOptions={{ color: '#16a34a', fillColor: '#22c55e', fillOpacity: 1, weight: 2 }} />
          ))}
        </MapContainer>
      </div>

      {/* Drawing controls */}
      <div className="flex gap-2 items-center">
        {!drawing && !finished && (
          <button onClick={startDrawing}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-xl text-sm hover:bg-brand-700 font-medium">
            <Crosshair className="w-4 h-4" /> {t('drawBoundary')}
          </button>
        )}

        {drawing && (
          <>
            <p className="flex-1 text-sm text-brand-700 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2 flex items-center gap-2">
              <Crosshair className="w-4 h-4 flex-shrink-0" />
              {t('drawingHint')}
            </p>
            {points.length >= 3 && (
              <button onClick={finishDrawing}
                className="px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm hover:bg-green-700 font-medium flex-shrink-0">
                {t('done', { count: points.length })}
              </button>
            )}
          </>
        )}

        {finished && (
          <div className="flex-1 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            {t('pointsSaved', { count: points.length })}
            <button onClick={startDrawing} className="ml-auto text-xs text-green-600 underline">{t('redraw')}</button>
          </div>
        )}
      </div>

      {!drawing && !finished && (
        <p className="text-xs text-gray-400 text-center">
          {t('firstSearchHint')}
        </p>
      )}
    </div>
  );
}
