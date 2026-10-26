import { collection, folder, request } from '../dsl.mjs';

// Walks every page of a listing and returns the products in order. `query` is the listing's query string.
const walk = `
  async function walk(query) {
    const all = [];
    for (let page = 1; page <= 20; page++) {
      const res = await PL.call('GET', '/api/v1/products?' + query + '&page=' + page);
      const body = res.json();
      all.push(...body.data);
      if (page >= body.meta.totalPages) return { all, total: body.meta.total };
    }
    throw new Error('more than 20 pages');
  }`;

export default collection('04 Catalogue: search, filter, sort, paging', 'PLS-3 over the API, with every response checked against the shared schemas.', [
  folder('Search and filter', [
    request({
      name: 'Search for a product',
      path: '/api/v1/products?q=webcam&limit=48',
      test: `
        PL.status('PLS-3.1', 200, 'a search returns 200');
        PL.schema('PLS-3.1', 'ProductList');
        PL.ac('PLS-3.1', 'every product matches, and the count equals what is listed', () => {
          const body = PL.json();
          pm.expect(body.meta.total).to.be.above(0).and.to.eql(body.data.length);
          for (const p of body.data) pm.expect((p.name + ' ' + p.description).toLowerCase()).to.include('webcam');
        });`,
    }),
    request({
      name: 'Search with an apostrophe',
      path: "/api/v1/products?q=O'Neill",
      test: `
        PL.status('PLS-3.2', 200, 'an apostrophe does not cause a server error');
        PL.ac('PLS-3.2', 'both O’Neill products are found', () => {
          const names = PL.json().data.map((p) => p.name);
          pm.expect(names).to.include.members(["O'Neill Surf Jacket", "O'Neill's Irish Folk Tales"]);
        });`,
    }),
    request({
      name: 'Filter by category and price together',
      path: '/api/v1/products?category=books&minPrice=20&maxPrice=40&sort=price_asc',
      test: `
        PL.status('PLS-3.3', 200, 'combined filters return 200');
        PL.schema('PLS-3.3', 'ProductList');
        PL.ac('PLS-3.3', 'every product is a book priced between €20 and €40', () => {
          const data = PL.json().data;
          pm.expect(data).to.not.be.empty;
          for (const p of data) {
            pm.expect(p.category.slug).to.eql('books');
            pm.expect(p.priceCents).to.be.within(2000, 4000);
          }
        });`,
    }),
    request({
      name: 'A minimum price above the maximum is refused',
      path: '/api/v1/products?minPrice=50&maxPrice=10',
      test: `
        PL.status('PLS-3.3', 422, 'minPrice above maxPrice returns 422');
        PL.schema('PLS-3.3', 'Error');`,
    }),
    request({
      name: 'No matches',
      path: '/api/v1/products?q=zzzzzz-nothing',
      test: `
        PL.status('PLS-3.6', 200, 'no matches is still 200');
        PL.ac('PLS-3.6', 'the list is empty with a total of 0', () => {
          pm.expect(PL.json().data).to.eql([]);
          pm.expect(PL.json().meta.total).to.eql(0);
        });`,
    }),
  ]),
  folder('Sorting and paging', [
    request({
      name: 'Sort by price, ascending, across every page',
      path: '/api/v1/products?limit=1',
      test: `${walk}
        PL.status('PLS-3.4', 200, 'the listing responds');
        const { all } = await walk('sort=price_asc&limit=12');
        PL.ac('PLS-3.4', 'prices never go down from one product to the next, across all pages', () => {
          const prices = all.map((p) => p.priceCents);
          pm.expect(prices).to.eql([...prices].sort((a, b) => a - b));
        });`,
    }),
    request({
      name: 'Page through the whole catalogue',
      path: '/api/v1/products?limit=12',
      test: `${walk}
        PL.status('PLS-3.5', 200, 'the first page responds');
        const { all, total } = await walk('limit=12');
        const seeded = PL.shared().products.products;
        PL.ac('PLS-3.5', 'every product appears exactly once, with none missing', () => {
          const ids = all.map((p) => p.id);
          pm.expect(new Set(ids).size, 'duplicates').to.eql(ids.length);
          pm.expect(ids.length).to.eql(total);
          pm.expect(ids.length).to.eql(seeded.length);
          pm.expect([...ids].sort((a, b) => a - b)).to.eql(seeded.map((p) => p.id).sort((a, b) => a - b));
        });`,
    }),
    request({
      name: 'A limit above the maximum is refused',
      path: '/api/v1/products?limit=100000',
      test: `
        PL.status('PLS-24.7', 422, 'limit=100000 returns 422');
        PL.ac('PLS-24.7', 'the error names the limit', () => pm.expect(PL.json().error.details.map((d) => d.field)).to.include('limit'));`,
    }),
  ]),
  folder('One product and the categories', [
    request({
      name: 'Read one product',
      path: '/api/v1/products/{{productId}}',
      pre: `pm.environment.set('productId', PL.shared().products.products[0].id);`,
      test: `
        PL.status('PLS-3.1', 200, 'a product is returned');
        PL.schema('PLS-10.4', 'ProductEnvelope');
        PL.ac('PLS-10.6', 'it has an ETag', () => pm.expect(pm.response.headers.get('ETag')).to.be.a('string').and.not.empty);`,
    }),
    request({
      name: 'An unknown product is a 404',
      path: '/api/v1/products/999999',
      test: `
        PL.status('PLS-10.1', 404, 'an unknown product returns 404');
        PL.schema('PLS-10.1', 'Error');`,
    }),
    request({
      name: 'The categories with their product counts',
      path: '/api/v1/categories',
      test: `
        PL.status('PLS-3.3', 200, 'the categories are returned');
        PL.ac('PLS-10.4', 'each category matches the CategoryWithCount schema', () => {
          const data = PL.json().data;
          pm.expect(data).to.have.length(PL.shared().products.categories.length);
          for (const category of data) PL.matches('CategoryWithCount', category);
        });
        PL.ac('PLS-3.5', 'the counts add up to the whole catalogue', () => pm.expect(PL.json().data.reduce((n, c) => n + c.productCount, 0)).to.eql(PL.shared().products.products.length));`,
    }),
  ]),
]);
