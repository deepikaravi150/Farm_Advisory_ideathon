'use client';
import dynamic from 'next/dynamic';

/**
 * Client wrapper so the Leaflet-based widget can be loaded with `ssr: false`.
 * Next.js 15 disallows `ssr: false` dynamic imports inside Server Components,
 * so the dynamic() call must live in a Client Component like this one.
 */
const LandMapWidget = dynamic(() => import('./LandMapWidget'), {
  ssr: false,
  loading: () => <div className="bg-white rounded-2xl h-48 animate-pulse shadow border border-gray-100" />,
});

export default LandMapWidget;
