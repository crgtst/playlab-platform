Feature: Catalogue: search, filter, sort, paging (PLS-3)

  Background:
    * url baseUrl
    * def Schemas = Java.type('playlab.Schemas')
    * def session = callonce read('classpath:common/session.feature')
    * configure headers = { 'X-Test-Session': '#(session.id)' }
    # Walks every page of a listing and returns the products in order.
    * def walk =
      """
      function(query) {
        var all = [];
        for (var page = 1; page <= 20; page++) {
          var res = karate.call('classpath:common/products-page.feature', { session: session.id, query: query + '&page=' + page });
          all = all.concat(res.body.data);
          if (page >= res.body.meta.totalPages) return all;
        }
        karate.fail('more than 20 pages');
      }
      """

  @PLS-3.1
  Scenario: PLS-3.1 a search returns only matching products, and the count equals what is listed
    Given path 'api', 'v1', 'products'
    And param q = 'webcam'
    And param limit = 48
    When method get
    Then status 200
    And match Schemas.check('ProductList', response) == []
    And assert response.meta.total > 0 && response.meta.total == response.data.length
    And match each response.data == { id: '#number', sku: '#string', name: '#string', description: '#string', category: '#object', priceCents: '#number', stock: '#number', inStock: '#boolean', imageUrl: '#string', images: '#array', createdAt: '#string', updatedAt: '#string' }
    * def names = karate.jsonPath(response, "$.data[*].name")
    * def haystack = karate.jsonPath(response, "$.data[*]")
    * def matching = karate.filter(haystack, function(p) { return (p.name + ' ' + p.description).toLowerCase().indexOf('webcam') >= 0 })
    * match matching == haystack

  @PLS-3.2
  Scenario: PLS-3.2 an apostrophe in a search is not a server error
    Given path 'api', 'v1', 'products'
    And param q = "O'Neill"
    When method get
    Then status 200
    And match karate.jsonPath(response, '$.data[*].name') contains ["O'Neill Surf Jacket", "O'Neill's Irish Folk Tales"]

  @PLS-3.3
  Scenario: PLS-3.3 category and price filters apply together
    Given path 'api', 'v1', 'products'
    And params { category: 'books', minPrice: 20, maxPrice: 40, sort: 'price_asc' }
    When method get
    Then status 200
    And match response.data == '#[_ > 0]'
    And match each response.data[*].category.slug == 'books'
    And match each response.data[*].priceCents == '#? _ >= 2000 && _ <= 4000'

  @PLS-3.3
  Scenario: PLS-3.3 a minimum price above the maximum is refused
    Given path 'api', 'v1', 'products'
    And params { minPrice: 50, maxPrice: 10 }
    When method get
    Then status 422
    And match Schemas.check('Error', response) == []

  @PLS-3.4
  Scenario: PLS-3.4 sorting by price ascending holds across every page
    * def all = walk('sort=price_asc&limit=12')
    * def prices = karate.map(all, function(p) { return p.priceCents })
    * def sorted = karate.sort(prices, function(x) { return x })
    * match prices == sorted

  @PLS-3.5
  Scenario: PLS-3.5 paging shows every product exactly once, with none missing
    * def all = walk('limit=12')
    * def ids = karate.map(all, function(p) { return p.id })
    # Another scenario may have a throwaway product in the catalogue just now. Those sort last (their names start with "zz"),
    # so they never move a seeded product between pages: every seeded product must be there, once.
    * def seeded = karate.map(shared.products.products, function(p) { return p.id })
    * def missing = karate.filter(seeded, function(id) { return ids.indexOf(id) < 0 })
    * match missing == []
    * def seen = {}
    * karate.forEach(ids, function(id) { seen[id] = true })
    * match karate.keysOf(seen).length == ids.length

  @PLS-3.6
  Scenario: PLS-3.6 no matches is still a 200 with an empty list
    Given path 'api', 'v1', 'products'
    And param q = 'zzzzzz-nothing'
    When method get
    Then status 200
    And match response.data == []
    And match response.meta.total == 0

  @PLS-24.7
  Scenario: PLS-24.7 a limit above the maximum is refused with 422 naming the limit
    Given path 'api', 'v1', 'products'
    And param limit = 100000
    When method get
    Then status 422
    And match response.error.details[*].field contains 'limit'

  @PLS-10.6
  Scenario: PLS-10.6 a product has an ETag, and If-None-Match on it returns 304 with no body
    * def id = productId('EL-001')
    Given path 'api', 'v1', 'products', id
    When method get
    Then status 200
    And match Schemas.check('ProductEnvelope', response) == []
    * def etag = responseHeaders['ETag'][0]
    * match etag == '#string'
    Given path 'api', 'v1', 'products', id
    And header If-None-Match = etag
    When method get
    Then status 304

  @PLS-3.3
  Scenario: PLS-3.3 the categories add up to the whole catalogue
    Given path 'api', 'v1', 'categories'
    When method get
    Then status 200
    * match each response.data == { slug: '#string', name: '#string', productCount: '#number' }
    * def counts = karate.map(response.data, function(c) { return c.productCount })
    * def total = 0
    * karate.forEach(counts, function(n) { total += n })
    * assert total >= shared.products.products.length
