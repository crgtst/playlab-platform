import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { isBugOn } from '../lib/bugs';
import { parse } from '../middleware/validate';

export const storesRouter = Router();

const HOURS = 'Mon–Sat 09:00–18:00, Sun 12:00–17:00';

// A fixed list so distances are predictable in tests.
export const STORES = [
  { id: 'dublin-grafton', name: 'PlayLab Grafton Street', address: '1 Grafton Street', city: 'Dublin', lat: 53.3421, lng: -6.2597 },
  { id: 'dublin-swords', name: 'PlayLab Swords', address: 'Pavilions Shopping Centre', city: 'Swords', lat: 53.4555, lng: -6.2197 },
  { id: 'dublin-dunlaoghaire', name: 'PlayLab Dún Laoghaire', address: '12 George’s Street Upper', city: 'Dún Laoghaire', lat: 53.2934, lng: -6.1353 },
  { id: 'cork', name: 'PlayLab Cork', address: '22 Patrick Street', city: 'Cork', lat: 51.8985, lng: -8.4705 },
  { id: 'galway', name: 'PlayLab Galway', address: '18 Shop Street', city: 'Galway', lat: 53.2724, lng: -9.0532 },
  { id: 'limerick', name: 'PlayLab Limerick', address: "5 O'Connell Street", city: 'Limerick', lat: 52.6638, lng: -8.6267 },
  { id: 'waterford', name: 'PlayLab Waterford', address: '14 The Mall', city: 'Waterford', lat: 52.2593, lng: -7.1101 },
  { id: 'kilkenny', name: 'PlayLab Kilkenny', address: '2 High Street', city: 'Kilkenny', lat: 52.6541, lng: -7.2448 },
  { id: 'sligo', name: 'PlayLab Sligo', address: '8 Castle Street', city: 'Sligo', lat: 54.2766, lng: -8.4761 },
  { id: 'athlone', name: 'PlayLab Athlone', address: '4 Church Street', city: 'Athlone', lat: 53.4239, lng: -7.9407 },
  { id: 'killarney', name: 'PlayLab Killarney', address: '31 Main Street', city: 'Killarney', lat: 52.0599, lng: -9.5044 },
  { id: 'belfast', name: 'PlayLab Belfast', address: '40 Donegall Place', city: 'Belfast', lat: 54.5973, lng: -5.9301 },
].map((s) => ({ ...s, hours: HOURS }));

const DUBLIN = { lat: 53.3498, lng: -6.2603 };

/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

const searchSchema = z.object({ q: z.string().trim().max(100).optional() });
const nearestSchema = z.object({
  lat: z.coerce.number({ required_error: 'lat is required', invalid_type_error: 'lat must be a number' }).min(-90).max(90),
  lng: z.coerce.number({ required_error: 'lng is required', invalid_type_error: 'lng must be a number' }).min(-180).max(180),
  limit: z.coerce.number().int().min(1).max(12).default(3),
});

storesRouter.get('/', (req: Request, res: Response) => {
  const { q } = parse(searchSchema, req.query);
  const needle = q?.toLowerCase();
  const data = needle
    ? STORES.filter((s) => `${s.name} ${s.city} ${s.address}`.toLowerCase().includes(needle))
    : STORES;
  res.json({ data, meta: { count: data.length } });
});

storesRouter.get('/nearest', (req: Request, res: Response) => {
  const body = parse(nearestSchema, req.query);
  // geolocation-ignored: the visitor's position is ignored and Dublin is used instead.
  const origin = isBugOn('geolocation-ignored') ? DUBLIN : { lat: body.lat, lng: body.lng };
  const data = STORES.map((s) => ({ ...s, distanceKm: Math.round(haversineKm(origin, s) * 10) / 10 }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, body.limit);
  res.json({ data, meta: { lat: body.lat, lng: body.lng, count: data.length } });
});
