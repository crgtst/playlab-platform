import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Category, ProductList } from '../api/types';
import { OffersStrip } from '../components/OffersStrip';
import { ProductCard } from '../components/ProductCard';

export function Home() {
  const [featured, setFeatured] = useState<ProductList['data']>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    document.title = 'PlayLab Shop';
    api<ProductList>('/products?sort=newest&limit=4')
      .then((r) => setFeatured(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setFeatured([]));
    api<{ data: Category[] }>('/categories')
      .then((r) => setCategories(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setCategories([]));
  }, []);

  return (
    <>
      <section className="hero" aria-labelledby="hero-heading">
        <h1 id="hero-heading">Welcome to PlayLab Shop</h1>
        <p>A practice shop built for end-to-end testing. Browse, fill your cart and check out with test cards.</p>
        <Link to="/products" className="button pulse" data-testid="hero-shop-link">
          Start shopping
        </Link>
      </section>

      <OffersStrip />

      <section aria-labelledby="categories-heading">
        <h2 id="categories-heading">Shop by category</h2>
        <ul className="category-list" data-testid="category-list">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link to={`/products?category=${c.slug}`} data-testid={`category-link-${c.slug}`}>
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="featured-heading">
        <h2 id="featured-heading">New in</h2>
        <div className="product-grid" data-testid="featured-products">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </>
  );
}
