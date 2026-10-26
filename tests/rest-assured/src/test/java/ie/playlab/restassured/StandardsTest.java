package ie.playlab.restassured;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;

import ie.playlab.restassured.support.Api;
import ie.playlab.restassured.support.Env;
import ie.playlab.restassured.support.Jwt;
import ie.playlab.restassured.support.Schema;
import ie.playlab.restassured.support.Shared;
import ie.playlab.restassured.support.TestUser;
import io.restassured.response.Response;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/** API standards, security basics, observability, rate limits and test sessions. */
class StandardsTest extends ApiTest {
    private static final String UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

    static Stream<Arguments> errorResponses() {
        return Stream.of(
                Arguments.of("an unknown path", "/api/v1/no-such-route", null, 404),
                Arguments.of("an unknown id", "/api/v1/products/99999", null, 404),
                Arguments.of("no token", "/api/v1/orders", null, 401),
                Arguments.of("the wrong role", "/api/v1/admin/users", "customer", 403),
                Arguments.of("a bad limit", "/api/v1/products?limit=0", null, 422));
    }

    @ParameterizedTest(name = "PLS-10.1 {0} returns {3} in the one error shape")
    @MethodSource("errorResponses")
    @Tag("PLS-10.1")
    @DisplayName("PLS-10.1 every error has the same shape, with the correlation ID in body and header")
    void errorShape(String what, String path, String role, int status) {
        var request = role == null ? api.guest() : api.as(newUser(role));
        Response response = request.get(path);
        response.then().statusCode(status).body(Schema.matches("Error")).body("error.keySet()", contains("code", "message", "details", "correlationId"));
        assertEquals(response.header("X-Correlation-Id"), response.path("error.correlationId"));
    }

    @Test
    @Tag("PLS-25.1")
    @DisplayName("PLS-25.1 a valid correlation ID is echoed back, an invalid one is replaced by a UUID")
    void correlationIds() {
        api.guest().header("X-Correlation-Id", "restassured-trace-1").get("/api/v1/categories").then().header("X-Correlation-Id", "restassured-trace-1");
        api.guest().header("X-Correlation-Id", "not valid!").get("/api/v1/categories").then().header("X-Correlation-Id", matchesPattern(UUID_PATTERN));
    }

    @Test
    @Tag("PLS-25.2")
    @DisplayName("PLS-25.2 a request's log line has every field, and the password in it is redacted (PLS-25.3)")
    void logLine() {
        TestUser user = newUser("customer");
        String id = "restassured-log-" + UUID.randomUUID();
        api.guest().header("X-Correlation-Id", id).body(Map.of("email", user.email(), "password", user.password())).post("/api/v1/auth/login").then().statusCode(200);
        Response logs = api.hook().queryParam("correlationId", id).get("/test/logs");
        logs.then().statusCode(200).body("data", hasSize(1));
        assertEquals(Map.of("email", user.email(), "password", "[REDACTED]"), logs.path("data[0].req.body"));
        logs.then().body("data[0].method", equalTo("POST"), "data[0].route", equalTo("/api/v1/auth/login"), "data[0].status", equalTo(200),
                "data[0].testSession", equalTo(api.session), "data[0].durationMs", instanceOf(Number.class), "data[0].defects", empty());
        assertFalse(logs.asString().contains(user.password()));
    }

    @Test
    @Tag("PLS-24.2")
    @DisplayName("PLS-24.2 an unsigned token and a token signed with another key are both refused with 401")
    void forgedTokens() throws Exception {
        TestUser user = newUser("customer");
        String claims = Jwt.claimsOf(user.token());
        api.as(user).get("/api/v1/auth/me").then().statusCode(200);
        api.as(new TestUser(0, "", "", "", "", Jwt.forge(claims, "none", ""))).get("/api/v1/auth/me").then().statusCode(401);
        api.as(new TestUser(0, "", "", "", "", Jwt.forge(claims, "HS256", "not-the-servers-secret"))).get("/api/v1/auth/me").then().statusCode(401);
    }

    @Test
    @Tag("PLS-24.3")
    @DisplayName("PLS-24.3 a registered and an unknown email get the same failed-login answer")
    void noEnumeration() {
        TestUser user = newUser("customer");
        Response known = api.guest().body(Map.of("email", user.email(), "password", "wrong-password")).post("/api/v1/auth/login");
        Response unknown = api.guest().body(Map.of("email", "nobody-at-all@playlab.test", "password", "wrong-password")).post("/api/v1/auth/login");
        assertEquals(known.statusCode(), unknown.statusCode());
        assertEquals((String) known.path("error.code"), unknown.path("error.code"));
        assertEquals((String) known.path("error.message"), unknown.path("error.message"));
    }

    @Test
    @Tag("PLS-24.13")
    @DisplayName("PLS-24.13 the retired /api/v0/orders route is a 404")
    void retiredRoute() {
        api.guest().get("/api/v0/orders").then().statusCode(404);
    }

    static Stream<Arguments> readableResponses() {
        return Stream.of(
                Arguments.of("/api/v1/health", "Health", null),
                Arguments.of("/api/v1/products?limit=3", "ProductList", null),
                Arguments.of("/api/v1/products/{product}", "ProductEnvelope", null),
                Arguments.of("/api/v1/products/{product}/reviews", "ReviewList", null),
                Arguments.of("/api/v1/cart", "Cart", "customer"),
                Arguments.of("/api/v1/wishlist", "Wishlist", "customer"),
                Arguments.of("/api/v1/orders", "OrderList", "customer"),
                Arguments.of("/api/v1/auth/me", "UserEnvelope", "customer"),
                Arguments.of("/test/clock", "ClockState", null));
    }

    @ParameterizedTest(name = "PLS-10.4 GET {0} matches the {1} schema")
    @MethodSource("readableResponses")
    @Tag("PLS-10.4")
    @DisplayName("PLS-10.4 every readable response matches its schema")
    void matchesSchema(String path, String schema, String role) {
        var request = role == null ? api.guest() : api.as(newUser(role));
        request.get(path.replace("{product}", String.valueOf(Shared.productId("EL-001"))))
                .then().spec(FAST).statusCode(200).contentType(containsString("application/json")).body(Schema.matches(schema));
    }

    @Test
    @Tag("PLS-10.4")
    @DisplayName("PLS-10.4 every store, category and admin user in a list matches its item schema")
    void listItemsMatchSchemas() throws Exception {
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        for (var entry : List.of(
                Map.entry("/api/v1/stores", "Store"), Map.entry("/api/v1/categories", "CategoryWithCount"), Map.entry("/api/v1/admin/users?limit=5", "AdminUser"))) {
            Response response = entry.getKey().contains("admin") ? api.as(admin).get(entry.getKey()) : api.guest().get(entry.getKey());
            response.then().statusCode(200);
            for (var item : mapper.readTree(response.asString()).get("data")) {
                assertEquals(java.util.Set.of(), Schema.problems(entry.getValue(), item.toString()), entry.getKey());
            }
        }
    }

    @Test
    @Tag("PLS-13.1")
    @DisplayName("PLS-13.1 the 3 nearest stores to Galway are Galway, Limerick and Athlone, nearest first")
    void nearestStores() {
        Response response = api.guest().queryParams(Map.of("lat", 53.2724, "lng", -9.0532)).get("/api/v1/stores/nearest");
        response.then().statusCode(200).body("data.id", contains("galway", "limerick", "athlone"));
        List<Number> distances = response.path("data.distanceKm");
        List<Double> km = distances.stream().map(Number::doubleValue).toList();
        assertEquals(km.stream().sorted().toList(), km);
    }

    /** Sends {@code count} GETs in the given session, one after another, and returns the last status. */
    private int hammer(Api own, int count, boolean rotateForwardedFor) {
        int last = 0;
        for (int i = 0; i < count; i++) {
            var request = given().baseUri(Env.BASE_URL).header("X-Test-Session", own.session);
            if (rotateForwardedFor) {
                request.header("X-Forwarded-For", "198.51.100." + (i % 250));
            }
            last = request.get("/api/v1/categories").statusCode();
        }
        return last;
    }

    @Test
    @Tag("PLS-10.3")
    @DisplayName("PLS-10.3 a shopper who uses up the rate limit gets 429 with Retry-After")
    void rateLimit() {
        Assumptions.assumeTrue(Env.RATE_LIMIT_PER_MIN > 0, "the rate limit is off in this environment");
        Api own = Api.newSession();
        assertEquals(200, hammer(own, Env.RATE_LIMIT_PER_MIN, false));
        own.guest().get("/api/v1/categories").then().statusCode(429).body("error.code", equalTo("RATE_LIMITED")).header("Retry-After", matchesPattern("\\d+"));
    }

    @Test
    @Tag("PLS-24.6")
    @DisplayName("PLS-24.6 changing X-Forwarded-For does not get a fresh rate limit")
    void forwardedForDoesNotHelp() {
        Assumptions.assumeTrue(Env.RATE_LIMIT_PER_MIN > 0, "the rate limit is off in this environment");
        Api own = Api.newSession();
        hammer(own, Env.RATE_LIMIT_PER_MIN, true);
        assertEquals(429, hammer(own, 5, true));
    }

    @Test
    @Tag("PLS-25.4")
    @DisplayName("PLS-25.4 /metrics has the request histogram and the gauges, is never rate limited, and its defects gauge follows the session")
    void metrics() {
        String text = given().baseUri(Env.BASE_URL).get("/metrics").then().statusCode(200).contentType(containsString("text/plain")).extract().asString();
        for (String expected : List.of("http_request_duration_seconds_bucket", "playlab_orders_created_total", "playlab_payments_declined_total", "playlab_db_pool_connections{state=\"total\"}")) {
            assertTrue(text.contains(expected), expected);
        }
        Api own = Api.newSession();
        for (int i = 0; i < Env.RATE_LIMIT_PER_MIN + 5; i++) {
            own.guest().get("/metrics").then().statusCode(200);
        }
        own.hook().body(Map.of("enable", List.of("wrong-status-code", "order-leak"))).post("/test/bugs").then().statusCode(200);
        assertTrue(own.guest().get("/metrics").asString().contains("playlab_defects_active 2"));
    }

    @Test
    @Tag("PLS-28.6")
    @DisplayName("PLS-28.6 POST /test/sessions returns the session id and sets the test_session cookie")
    void sessionCreation() {
        Response response = given().baseUri(Env.BASE_URL).post("/test/sessions");
        response.then().statusCode(201).body("id", matchesPattern(UUID_PATTERN)).body("idleTimeoutMs", instanceOf(Number.class));
        assertTrue(response.header("Set-Cookie").contains("test_session=" + response.path("id")));
    }

    @Test
    @Tag("PLS-28.1")
    @DisplayName("PLS-28.1 a defect and a clock move in one session do not touch another session, or a request with no session")
    void sessionsAreIsolated() {
        Api a = Api.newSession();
        Api b = Api.newSession();
        a.hook().body(Map.of("enable", List.of("wrong-status-code"))).post("/test/bugs").then().statusCode(200);
        // A validation failure is 422, and 500 with wrong-status-code on.
        assertEquals(500, a.guest().body(Map.of()).post("/api/v1/auth/login").statusCode());
        assertEquals(422, b.guest().body(Map.of()).post("/api/v1/auth/login").statusCode());
        assertEquals(422, given().baseUri(Env.BASE_URL).contentType("application/json").body(Map.of()).post("/api/v1/auth/login").statusCode());
        a.hook().body(Map.of("now", "2030-01-01T00:00:00.000Z")).post("/test/clock").then().statusCode(200);
        b.hook().get("/test/clock").then().body("offsetMs", equalTo(0));
    }

    @Test
    @Tag("PLS-28.7")
    @DisplayName("PLS-28.7 one session's latency rule does not slow another")
    void latencyIsPerSession() {
        Api a = Api.newSession();
        Api b = Api.newSession();
        a.hook().body(Map.of("path", "/api/v1/categories", "delayMs", 400)).post("/test/latency").then().statusCode(201);
        long slow = a.guest().get("/api/v1/categories").timeIn(java.util.concurrent.TimeUnit.MILLISECONDS);
        long fast = b.guest().get("/api/v1/categories").timeIn(java.util.concurrent.TimeUnit.MILLISECONDS);
        assertTrue(slow >= 400, "the slowed session took " + slow + " ms");
        assertTrue(fast < 400, "the other session took " + fast + " ms");
    }
}
