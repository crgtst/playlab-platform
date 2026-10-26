package ie.playlab.restassured;

import static org.hamcrest.Matchers.lessThan;

import ie.playlab.restassured.support.Api;
import ie.playlab.restassured.support.Env;
import ie.playlab.restassured.support.Shared;
import ie.playlab.restassured.support.TestUser;
import io.restassured.builder.ResponseSpecBuilder;
import io.restassured.response.Response;
import io.restassured.specification.ResponseSpecification;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;

/**
 * The base of every test class: a test session of its own, an admin, and the helpers most tests need. Orders a test
 * places with {@link #placeOrder} are cancelled afterwards, which puts the stock back.
 */
abstract class ApiTest {
    /** Every response must arrive within the environment's time budget (-Drestassured.env=ci|perf changes it). */
    static final ResponseSpecification FAST = new ResponseSpecBuilder().expectResponseTime(lessThan(Env.RESPONSE_TIME_MS)).build();

    protected Api api;
    protected TestUser admin;
    private final List<Integer> placed = new ArrayList<>();

    @BeforeAll
    void startSession() {
        api = Api.newSession();
        admin = api.newUser("admin");
    }

    @AfterEach
    void cancelOrders() {
        for (int id : placed) {
            api.as(admin).header("If-Match", "*").body(Map.of("status", "cancelled")).patch("/api/v1/orders/{id}/status", id);
        }
        placed.clear();
    }

    protected TestUser newUser(String role) {
        return api.newUser(role);
    }

    protected Response addToCart(TestUser user, String sku, int quantity) {
        return api.as(user).body(Map.of("productId", Shared.productId(sku), "quantity", quantity)).post("/api/v1/cart/items");
    }

    protected Response placeOrder(TestUser user) {
        return placeOrder(user, Shared.card("success"), null);
    }

    protected Response placeOrder(TestUser user, String card, String idempotencyKey) {
        var request = api.as(user).body(Api.orderBody(card));
        if (idempotencyKey != null) {
            request.header("Idempotency-Key", idempotencyKey);
        }
        Response response = request.post("/api/v1/orders");
        if (response.statusCode() == 201) {
            track(response.path("data.id"));
        }
        return response;
    }

    /** Has an order a test placed another way (for example from a thread) cancelled afterwards. */
    protected void track(int orderId) {
        synchronized (placed) {
            placed.add(orderId);
        }
    }

    protected int stock(String sku) {
        return api.guest().get("/api/v1/products/{id}", Shared.productId(sku)).path("data.stock");
    }
}
