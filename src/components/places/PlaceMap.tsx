import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Leaflet's default marker images don't resolve correctly under bundlers, so point
// them at the CDN copies explicitly. Free OpenStreetMap tiles — no API key, no billing.
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface PlaceMapProps {
  latitude: number;
  longitude: number;
  name?: string;
  zoom?: number;
  className?: string;
}

/** Free Leaflet + OpenStreetMap map showing a single place marker. */
export function PlaceMap({ latitude, longitude, name, zoom = 15, className }: PlaceMapProps) {
  const position: [number, number] = [latitude, longitude];

  return (
    <MapContainer
      center={position}
      zoom={zoom}
      scrollWheelZoom={false}
      className={className ?? 'h-32 w-full'}
      style={{ borderRadius: 'inherit' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={position} icon={defaultIcon}>
        {name && <Popup>{name}</Popup>}
      </Marker>
    </MapContainer>
  );
}
