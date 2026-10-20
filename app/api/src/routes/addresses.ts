import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { parse } from '../middleware/validate';

export const addressesRouter = Router();

// A fixed address book so autocomplete results are predictable in tests.
const ADDRESSES = [
  { line1: '1 Grafton Street', city: 'Dublin 2', county: 'Dublin', postcode: 'D02 XY45' },
  { line1: '12 Henry Street', city: 'Dublin 1', county: 'Dublin', postcode: 'D01 K2E4' },
  { line1: '45 Baggot Street Lower', city: 'Dublin 2', county: 'Dublin', postcode: 'D02 F891' },
  { line1: '7 Main Street', city: 'Swords', county: 'Dublin', postcode: 'K67 E2P3' },
  { line1: '22 Patrick Street', city: 'Cork', county: 'Cork', postcode: 'T12 RX56' },
  { line1: '3 Oliver Plunkett Street', city: 'Cork', county: 'Cork', postcode: 'T12 P8C2' },
  { line1: '18 Shop Street', city: 'Galway', county: 'Galway', postcode: 'H91 A2B3' },
  { line1: '9 Quay Street', city: 'Galway', county: 'Galway', postcode: 'H91 D7F1' },
  { line1: "5 O'Connell Street", city: 'Limerick', county: 'Limerick', postcode: 'V94 C4D2' },
  { line1: '14 The Mall', city: 'Waterford', county: 'Waterford', postcode: 'X91 W2K8' },
  { line1: '2 High Street', city: 'Kilkenny', county: 'Kilkenny', postcode: 'R95 Y6T1' },
  { line1: '31 Main Street', city: 'Killarney', county: 'Kerry', postcode: 'V93 H2N5' },
  { line1: '8 Castle Street', city: 'Sligo', county: 'Sligo', postcode: 'F91 X3V7' },
  { line1: '27 Main Street', city: 'Letterkenny', county: 'Donegal', postcode: 'F92 E4R9' },
  { line1: '4 Church Street', city: 'Athlone', county: 'Westmeath', postcode: 'N37 K5P3' },
  { line1: '16 Market Square', city: 'Dundalk', county: 'Louth', postcode: 'A91 T6Y2' },
  { line1: '6 Mill Street', city: 'Westport', county: 'Mayo', postcode: 'F28 D3W8' },
  { line1: '11 Bridge Street', city: 'Ennis', county: 'Clare', postcode: 'V95 R2X4' },
].map((a, i) => ({ id: `addr-${i + 1}`, ...a, country: 'IE', label: `${a.line1}, ${a.city}, ${a.postcode}` }));

const schema = z.object({
  q: z.string({ required_error: 'q is required' }).trim().min(2, 'Type at least 2 characters').max(100),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

addressesRouter.get('/suggest', (req: Request, res: Response) => {
  const { q, limit } = parse(schema, req.query);
  const needle = q.toLowerCase();
  const data = ADDRESSES.filter((a) => a.label.toLowerCase().includes(needle)).slice(0, limit);
  res.json({ data });
});
