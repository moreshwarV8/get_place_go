// Live weather context via Open-Meteo — FREE, no API key, no billing.
// Used to make suggestions context-aware ("it's raining → favor cozy indoor spots").

export interface Weather {
  tempC: number;
  code: number;
  isRaining: boolean;
  isPleasant: boolean;
  label: string;
  emoji: string;
}

function describe(code: number, tempC: number): { label: string; emoji: string; isRaining: boolean; isPleasant: boolean } {
  // WMO weather codes
  const raining = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95);
  if (raining) return { label: "Rainy", emoji: "🌧️", isRaining: true, isPleasant: false };
  if (code === 0) {
    const pleasant = tempC >= 18 && tempC <= 32;
    return { label: pleasant ? "Clear & pleasant" : "Clear", emoji: "☀️", isRaining: false, isPleasant: pleasant };
  }
  if (code >= 1 && code <= 3) {
    const pleasant = tempC >= 18 && tempC <= 32;
    return { label: "Partly cloudy", emoji: "⛅", isRaining: false, isPleasant: pleasant };
  }
  if (code === 45 || code === 48) return { label: "Foggy", emoji: "🌫️", isRaining: false, isPleasant: false };
  return { label: "Cloudy", emoji: "☁️", isRaining: false, isPleasant: false };
}

export async function fetchWeather(lat: number, lng: number): Promise<Weather | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const tempC = data?.current?.temperature_2m;
    const code = data?.current?.weather_code;
    if (typeof tempC !== "number" || typeof code !== "number") return null;
    const d = describe(code, tempC);
    return { tempC, code, ...d };
  } catch {
    return null;
  }
}

/** Time-of-day bucket for context-aware nudges. */
export function timeOfDay(now: Date = new Date()): "morning" | "afternoon" | "evening" | "night" {
  const h = now.getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "night";
}
