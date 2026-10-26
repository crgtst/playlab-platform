// Karate's configuration, run before every scenario. The address comes from BASE_URL, or from API_PORT in app/.env
// (never a hard-coded port). `-Dkarate.env=ci` picks an environment; `-Ddefects=a,b` switches defects on for the run.
function fn() {
  var env = karate.env || 'local';

  var baseUrl = java.lang.System.getenv('BASE_URL');
  if (!baseUrl) {
    var envFile = java.nio.file.Paths.get('../../app/.env');
    var dotenv = java.nio.file.Files.exists(envFile) ? karate.readAsString('file:../../app/.env') : '';
    var match = /^API_PORT=(\d+)/m.exec(dotenv);
    if (!match) karate.fail('Set BASE_URL, or API_PORT in app/.env, so the suite knows where the API is.');
    baseUrl = 'http://localhost:' + match[1];
  }

  var environments = {
    local: { responseTimeMs: 1500, rateLimitPerMin: 100 },
    ci: { responseTimeMs: 3000, rateLimitPerMin: 100 },
    perf: { responseTimeMs: 300, rateLimitPerMin: 0 }
  };
  var config = karate.merge({ env: env, baseUrl: baseUrl.replace(/\/$/, ''), defects: java.lang.System.getProperty('defects') || '' }, environments[env] || environments.local);

  // The shared data contract (tests/shared): accounts, products, cards and discounts, so nothing is hard-coded here.
  config.shared = {
    products: karate.read('file:../shared/products.json'),
    cards: karate.read('file:../shared/cards.json'),
    discounts: karate.read('file:../shared/discounts.json')
  };

  // Small helpers every feature can call. They read the shared data through karate.get, not a closure, so they also
  // work inside a called feature.
  config.product = function (sku) {
    var list = karate.get('shared').products.products;
    for (var i = 0; i < list.length; i++) if (list[i].sku === sku) return list[i];
    karate.fail('No product with SKU ' + sku + ' in tests/shared/products.json');
  };
  config.productId = function (sku) { return karate.get('product')(sku).id; };
  config.deliveryDate = function (days) { return new Date(Date.now() + (days || 5) * 86400000).toISOString().slice(0, 10); };
  config.orderBody = function (card) {
    return {
      shipping: { fullName: 'Karate Customer', line1: '1 Main Street', city: 'Dublin', postcode: 'D01 F5P2', country: 'IE' },
      deliveryDate: karate.get('deliveryDate')(5),
      payment: { nameOnCard: 'Casey Customer', cardNumber: card || karate.get('shared').cards.success.number, expiry: '12/30', cvc: '123' }
    };
  };

  // The payment timeout card takes 5 seconds on purpose.
  karate.configure('readTimeout', 15000);
  karate.configure('connectTimeout', 5000);
  return config;
}
