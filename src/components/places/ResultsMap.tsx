import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Place } from '@/lib/types';

const placeIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const userIcon = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 0 0 2px #2563eb"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

interface ResultsMapProps {
  places: Place[];
  userLocation?: { lat: number; lng: number } | null;
  className?: string;
}

/** Free Leaflet map plotting all result places (+ the user). Pins link to the detail page. */
export function ResultsMap({ places, userLocation, className }: ResultsMapProps) {
  const navigate = useNavigate();
  const pts = places.filter((p) => p.latitude != null && p.longitude != null);

  // Center: user if known, else the first place, else central Pune.
  const center: [number, number] = userLocation
    ? [userLocation.lat, userLocation.lng]
    : pts.length
      ? [Number(pts[0].latitude), Number(pts[0].longitude)]
      : [18.52, 73.85];

  return (
    <MapContainer center={center} zoom={12} scrollWheelZoom className={className ?? 'h-[60vh] w-full'} style={{ borderRadius: 'inherit' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}><Popup>You are here</Popup></Marker>}
      {pts.map((p) => (
        <Marker key={p.id} position={[Number(p.latitude), Number(p.longitude)]} icon={placeIcon}>
          <Popup>
            <button onClick={() => navigate(`/place/${p.slug}`)} className="font-semibold text-left hover:underline">
              {p.name}
            </button>
            <div className="text-xs text-muted-foreground">{p.address}</div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
