import crypto from 'crypto';
import { Request, Response, Router } from 'express';
import { PoolClient } from 'pg';
import { typeErrors, z } from '../lib/zod';
import { pool, query, withTransaction } from '../db/pool';
import { clock } from '../lib/clock';
import { ApiError, conflict, notFound, validationError } from '../lib/errors';
import { isBugOn } from '../lib/bugs';
import { checkIfMatch } from '../lib/preconditions';
import { requireRole } from '../middleware/auth';
import { emitStock } from '../services/stock';
import { asyncHandler, parse } from '../middleware/validate';

export const productsRouter = Router();
export const categoriesRouter = Router();

const SORTS = {
  price_asc: 'p.price_cents ASC, p.id ASC',
  price_desc: 'p.price_cents DESC, p.id ASC',
  name_asc: 'p.name ASC, p.id ASC',
  name_desc: 'p.name DESC, p.id ASC',
  newest: 'p.created_at DESC, p.id DESC',
} as const;

const euros = z.coerce
  .number(typeErrors({ invalid: 'Must be a number' }))
  .min(0, 'Must be zero or more')
  .max(1_000_000, 'Too large');

const listSchema = z
  .object({
    q: z.string().trim().max(200, 'Search must be at most 200 characters').optional(),
    category: z.string().trim().max(100).optional(),
    minPrice: euros.optional(),
    maxPrice: euros.optional(),
    sort: z.enum(Object.keys(SORTS) as [keyof typeof SORTS, ...(keyof typeof SORTS)[]]).default('name_asc'),
    page: z.coerce.number().int('Must be a whole number').min(1, 'Must be 1 or more').default(1),
    limit: z.coerce.number().int('Must be a whole number').min(1, 'Must be 1 or more').max(48, 'Must be 48 or fewer').default(12),
  })
  .refine((v) => v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice, {
    message: 'minPrice must not be greater than maxPrice',
    path: ['minPrice'],
  });

const productFields = z.object({
  sku: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1, 'Name is required').max(200),
  description: z.string().max(2000),
  category: z.string().trim().min(1, 'Category is required'),
  priceCents: z.number().int('Must be whole cents').min(0),
  stock: z.number().int('Must be a whole number').min(0),
  imageUrl: z.string().max(500).optional(),
});
// A new or replaced product gets an empty description by default. PATCH uses productFields.partial(), with no default:
// zod 4 applies defaults even inside .partial(), which would blank the description on every PATCH that leaves it out.
const productBody = productFields.extend({ description: productFields.shape.description.default('') });

const idParam = z.coerce.number().int().positive();

const SELECT_PRODUCT = `
  SELECT p.*, c.slug AS category_slug, c.name AS category_name
    FROM products p JOIN categories c ON c.id = p.category_id`;

export function productView(r: any) {
  return {
    id: r.id,
    sku: r.sku,
    name: r.name,
    description: r.description,
    category: { slug: r.category_slug, name: r.category_name },
    priceCents: r.price_cents,
    stock: r.stock,
    inStock: r.stock > 0,
    imageUrl: r.image_url,
    // Gallery: the main image plus a side view and a detail view for the category.
    images: [r.image_url, `/img/gallery/${r.category_slug}-2.svg`, `/img/gallery/${r.category_slug}-3.svg`],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function buildLink(req: Request, page: number, totalPages: number): string {
  const base = `${req.baseUrl}${req.path === '/' ? '' : req.path}`;
  const make = (p: number, rel: string) => {
    const params = new URLSearchParams(req.query as Record<string, string>);
    params.set('page', String(p));
    return `<${base}?${params.toString()}>; rel="${rel}"`;
  };
  const links = [make(1, 'first')];
  if (page > 1) links.push(make(page - 1, 'prev'));
  if (page < totalPages) links.push(make(page + 1, 'next'));
  links.push(make(Math.max(totalPages, 1), 'last'));
  return links.join(', ');
}

productsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const q = parse(listSchema, req.query);
    if (isBugOn('search-apostrophe') && q.q?.includes("'")) {
      // Simulates a query built by string concatenation breaking on the quote.
      throw Object.assign(new Error(`syntax error at or near "${q.q.slice(q.q.indexOf("'") + 1)}"`), {
        query: `SELECT * FROM products WHERE name ILIKE '%${q.q}%'`,
      });
    }
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.q) {
      params.push(`%${escapeLike(q.q)}%`);
      where.push(`(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`);
    }
    if (q.category) {
      params.push(q.category);
      where.push(`c.slug = $${params.length}`);
    }
    if (q.minPrice !== undefined) {
      params.push(Math.round(q.minPrice * 100));
      where.push(`p.price_cents >= $${params.length}`);
    }
    if (q.maxPrice !== undefined) {
      params.push(Math.round(q.maxPrice * 100));
      where.push(`p.price_cents <= $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRows = await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM products p JOIN categories c ON c.id = p.category_id ${whereSql}`,
      params,
    );
    const total = countRows[0].n;
    const totalPages = Math.ceil(total / q.limit);
    const rows = await query(
      `${SELECT_PRODUCT} ${whereSql} ORDER BY ${SORTS[q.sort]} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      // pagination-duplicate: page 2 onwards starts one item early, repeating the previous page's last item.
      [...params, q.limit, Math.max(0, (q.page - 1) * q.limit - (isBugOn('pagination-duplicate') && q.page > 1 ? 1 : 0))],
    );
    res.setHeader('Link', buildLink(req, q.page, totalPages));
    res.setHeader('X-Total-Count', String(total));
    res.json({
      data: rows.map(productView),
      meta: { page: q.page, limit: q.limit, total, totalPages, sort: q.sort },
    });
  }),
);

productsRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = idParam.safeParse(req.params.id);
    if (!id.success) throw notFound('Product not found');
    const rows = await query(`${SELECT_PRODUCT} WHERE p.id = $1`, [id.data]);
    if (!rows[0]) throw notFound('Product not found');
    const view = productView(rows[0]);
    const body = JSON.stringify({ data: view });
    const etag = productEtag(view);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    const inm = req.headers['if-none-match'];
    if (
      inm &&
      inm
        .split(',')
        .map((s) => s.trim().replace(/^W\//, ''))
        .includes(etag)
    ) {
      return res.status(304).end();
    }
    res.type('application/json').send(body);
  }),
);

async function categoryId(slug: string): Promise<number> {
  const rows = await query<{ id: number }>('SELECT id FROM categories WHERE slug = $1', [slug]);
  if (!rows[0]) throw validationError([{ field: 'category', message: 'Unknown category' }]);
  return rows[0].id;
}

/** A hash of the product as GET returns it, so any change (stock included) gives a new ETag. */
export function productEtag(view: ReturnType<typeof productView>): string {
  return `"${crypto
    .createHash('sha1')
    .update(JSON.stringify({ data: view }))
    .digest('base64url')}"`;
}

/** `forUpdate` locks the row inside the caller's transaction, so the If-Match check and the write can't interleave. */
async function loadProduct(id: number, db: PoolClient | typeof pool = pool, forUpdate = false) {
  const rows = await db.query(`${SELECT_PRODUCT} WHERE p.id = $1${forUpdate ? ' FOR UPDATE OF p' : ''}`, [id]);
  return rows.rows[0] ? productView(rows.rows[0]) : null;
}

function uniqueSku(err: any): never {
  if (err?.code === '23505') throw conflict('SKU_IN_USE', 'A product with this SKU already exists');
  throw err;
}

productsRouter.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = parse(productBody, req.body);
    const cat = await categoryId(body.category);
    const rows = await query<{ id: number }>(
      `INSERT INTO products (sku, name, description, category_id, price_cents, stock, image_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING id`,
      [body.sku, body.name, body.description, cat, body.priceCents, body.stock, body.imageUrl ?? `/img/${body.category}.svg`, clock.now()],
    ).catch(uniqueSku);
    await emitStock([rows[0].id]);
    res
      .status(201)
      .location(`/api/v1/products/${rows[0].id}`)
      .json({ data: await loadProduct(rows[0].id) });
  }),
);

async function updateProduct(req: Request, res: Response, partial: boolean) {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) throw notFound('Product not found');
  const schema = partial ? productFields.partial() : productBody;
  const { updated, stockChanged } = await withTransaction(async (client) => {
    const existing = await loadProduct(id.data, client, true);
    if (!existing) throw notFound('Product not found');
    checkIfMatch(req, productEtag(existing), 'product');
    const body = parse(schema, req.body);
    if (partial && Object.keys(body).length === 0) {
      throw validationError([{ field: '', message: 'Provide at least one field to update' }]);
    }
    const merged = {
      sku: body.sku ?? existing.sku,
      name: body.name ?? existing.name,
      description: body.description ?? existing.description,
      category: body.category ?? existing.category.slug,
      priceCents: body.priceCents ?? existing.priceCents,
      stock: body.stock ?? existing.stock,
      imageUrl: body.imageUrl ?? existing.imageUrl,
    };
    const cat = await categoryId(merged.category);
    await client
      .query(
        `UPDATE products SET sku = $1, name = $2, description = $3, category_id = $4, price_cents = $5, stock = $6,
                image_url = $7, updated_at = $8 WHERE id = $9`,
        [merged.sku, merged.name, merged.description, cat, merged.priceCents, merged.stock, merged.imageUrl, clock.now(), id.data],
      )
      .catch(uniqueSku);
    return { updated: (await loadProduct(id.data, client))!, stockChanged: merged.stock !== existing.stock };
  });
  if (stockChanged) await emitStock([id.data]);
  res.setHeader('ETag', productEtag(updated));
  res.json({ data: updated });
}

productsRouter.put(
  '/:id',
  requireRole('admin'),
  asyncHandler((req: Request, res: Response) => updateProduct(req, res, false)),
);
productsRouter.patch(
  '/:id',
  requireRole('admin'),
  asyncHandler((req: Request, res: Response) => updateProduct(req, res, true)),
);

productsRouter.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = idParam.safeParse(req.params.id);
    if (!id.success) throw notFound('Product not found');
    const used = await query('SELECT 1 FROM order_items WHERE product_id = $1 LIMIT 1', [id.data]);
    if (used.length) throw new ApiError(409, 'PRODUCT_IN_USE', 'This product appears on orders and cannot be deleted');
    const rows = await query('DELETE FROM products WHERE id = $1 RETURNING id', [id.data]);
    if (!rows[0]) throw notFound('Product not found');
    res.status(204).end();
  }),
);

categoriesRouter.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await query(
      `SELECT c.slug, c.name, COUNT(p.id)::int AS product_count
         FROM categories c LEFT JOIN products p ON p.category_id = c.id
        GROUP BY c.id ORDER BY c.name`,
    );
    res.json({ data: rows.map((r: any) => ({ slug: r.slug, name: r.name, productCount: r.product_count })) });
  }),
);
