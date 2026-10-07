'use client';
import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Users, Building, Navigation, Layers } from 'lucide-react';

export interface MapSite {
  id: string;
  name: string;
  lat_e6: number;
  lng_e6: number;
  customer_id?: string;
  machines_count?: number;
}

export interface MapTechnician {
  id: string;
  name: string;
  site_id: string;
  available: boolean;
  distance_km: number;
  skills: Record<string, number>;
  active_job_id?: string;
}

export interface MapViewProps {
  sites?: MapSite[];
  technicians?: MapTechnician[];
  selectedSiteId?: string;
  onSelectSite?: (siteId: string) => void;
  className?: string;
}

const DEFAULT_SITES: MapSite[] = [
  { id: 'site-a', name: 'Aster Works · Plant A', lat_e6: 19076000, lng_e6: 72877000, machines_count: 8 },
  { id: 'site-b', name: 'Site B · Parts Depot', lat_e6: 19198000, lng_e6: 72987000, machines_count: 0 },
  { id: 'site-c', name: 'Site C · Remote Plant', lat_e6: 20760000, lng_e6: 73150000, machines_count: 4 },
];

const DEFAULT_TECHNICIANS: MapTechnician[] = [
  { id: 'ravi', name: 'Ravi', site_id: 'site-a', available: true, distance_km: 6, skills: { hydraulics: 2, gearbox: 2 } },
  { id: 'priya', name: 'Priya', site_id: 'site-a', available: true, distance_km: 12, skills: { hydraulics: 2, gearbox: 2 } },
  { id: 'dev', name: 'Dev', site_id: 'site-a', available: true, distance_km: 20, skills: { hydraulics: 2, gearbox: 2 } },
  { id: 'karthik', name: 'Karthik', site_id: 'site-a', available: true, distance_km: 17, skills: { hydraulics: 1, gearbox: 2 } },
  { id: 'meena', name: 'Meena', site_id: 'site-c', available: true, distance_km: 150, skills: { hydraulics: 2, gearbox: 2 } },
];

export function MapView({
  sites = DEFAULT_SITES,
  technicians = DEFAULT_TECHNICIANS,
  selectedSiteId,
  onSelectSite,
  className = '',
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [activeLayer, setActiveLayer] = useState<'all' | 'sites' | 'techs'>('all');
  const [selectedPin, setSelectedPin] = useState<{ type: 'site' | 'tech'; id: string; data: any } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current) return;

    let map: any = null;

    // Dynamically load Leaflet on client side
    import('leaflet').then((L) => {
      if (!mapContainerRef.current) return;

      // Clean up previous instance if any
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      // Initialize map centered between Plant A (Mumbai region) and Site C (Nashik region)
      map = L.map(mapContainerRef.current, {
        center: [19.45, 72.95],
        zoom: 9,
        zoomControl: true,
        attributionControl: true,
      });
      mapInstanceRef.current = map;

      // Add OpenStreetMap tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      // Create Custom SVG Icons
      const siteIcon = L.divIcon({
        className: 'custom-site-pin',
        html: `<div style="background:#2563eb;color:#ffffff;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.4);font-size:14px;font-weight:bold;">🏢</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const techIcon = (avail: boolean) => L.divIcon({
        className: 'custom-tech-pin',
        html: `<div style="background:${avail ? '#16a34a' : '#ea580c'};color:#ffffff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #ffffff;box-shadow:0 2px 5px rgba(0,0,0,0.3);font-size:12px;font-weight:bold;">🔧</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      // Add Site Markers
      sites.forEach((site) => {
        const lat = site.lat_e6 / 1e6;
        const lng = site.lng_e6 / 1e6;
        const marker = L.marker([lat, lng], { icon: siteIcon }).addTo(map);

        marker.bindPopup(`
          <div style="font-family:sans-serif;min-width:160px;">
            <strong style="color:#2563eb;font-size:13px;">${site.name}</strong><br/>
            <span style="font-size:11px;color:#666;">ID: ${site.id.toUpperCase()}</span><br/>
            <span style="font-size:11px;color:#333;">GPS: ${lat.toFixed(4)}°, ${lng.toFixed(4)}°</span>
          </div>
        `);

        marker.on('click', () => {
          setSelectedPin({ type: 'site', id: site.id, data: site });
          if (onSelectSite) onSelectSite(site.id);
        });
      });

      // Add Technician Markers (projected near their base sites)
      technicians.forEach((tech, idx) => {
        const baseSite = sites.find((s) => s.id === tech.site_id) || sites[0];
        // Offset slightly around site coordinates for clear visualization
        const offsetLat = (idx % 2 === 0 ? 0.02 : -0.02) * (Math.floor(idx / 2) + 1);
        const offsetLng = (idx % 2 === 0 ? 0.025 : -0.025) * (Math.floor(idx / 2) + 1);
        const lat = (baseSite.lat_e6 / 1e6) + offsetLat;
        const lng = (baseSite.lng_e6 / 1e6) + offsetLng;

        const marker = L.marker([lat, lng], { icon: techIcon(tech.available) }).addTo(map);

        marker.bindPopup(`
          <div style="font-family:sans-serif;min-width:160px;">
            <strong style="color:#16a34a;font-size:13px;">${tech.name}</strong><br/>
            <span style="font-size:11px;color:#666;">Base: ${tech.site_id.toUpperCase()} · ${tech.distance_km} km radius</span><br/>
            <span style="font-size:11px;color:#333;font-weight:600;">Status: ${tech.available ? 'AVAILABLE' : 'ON JOB / DROPOUT'}</span>
          </div>
        `);

        marker.on('click', () => {
          setSelectedPin({ type: 'tech', id: tech.id, data: tech });
        });
      });
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [sites, technicians, onSelectSite]);

  return (
    <section className={`panel ${className}`} data-testid="map-slot-panel" style={{ marginTop: '20px' }}>
      {/* Include Leaflet CSS */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossOrigin=""
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <span className="eyebrow" style={{ marginBottom: '2px' }}>GEOSPATIAL FLEET TRACKING &middot; SITES & DISPATCH</span>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Regional Network Map</h2>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className="badge" style={{ fontFamily: 'var(--mono)' }}>{sites.length} SITES</span>
          <span className="badge green" style={{ fontFamily: 'var(--mono)' }}>{technicians.length} TECHS</span>
        </div>
      </div>

      <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '0 0 14px' }}>
        Real-time OpenStreetMap overlay of plant sites, parts depots, and field technician locations.
      </p>

      {/* Map Viewport */}
      <div
        ref={mapContainerRef}
        data-testid="leaflet-map-container"
        style={{
          height: '340px',
          width: '100%',
          borderRadius: '4px',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          background: 'var(--panel-alt)',
          zIndex: 1,
        }}
      />

      {/* Map Pins Legend & Details */}
      <div
        data-testid="map-pins-legend"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '10px',
          marginTop: '12px',
          padding: '10px 14px',
          background: 'var(--panel-alt)',
          border: '1px solid var(--border)',
          borderRadius: '3px',
          fontSize: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>🏢</span>
          <div>
            <strong>Customer Plants & Depots</strong>
            <small style={{ display: 'block', color: 'var(--muted)', fontSize: '10px' }}>
              Plant A (Aster Works), Site B Depot, Site C Plant
            </small>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>🔧</span>
          <div>
            <strong>Field Technicians</strong>
            <small style={{ display: 'block', color: 'var(--muted)', fontSize: '10px' }}>
              Priya, Ravi, Dev, Karthik (Site A), Meena (Site C)
            </small>
          </div>
        </div>

        {selectedPin && (
          <div data-testid="selected-pin-info" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)' }}>
            <Navigation size={14} />
            <div>
              <strong>Selected: {selectedPin.data.name}</strong>
              <small style={{ display: 'block', fontSize: '10px' }}>
                {selectedPin.type === 'site' ? `Site ID: ${selectedPin.id}` : `Technician (${selectedPin.data.site_id})`}
              </small>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
