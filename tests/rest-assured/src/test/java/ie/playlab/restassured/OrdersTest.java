package ie.playlab.restassured;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;

import ie.playlab.api.model.Order;
import ie.playlab.api.model.OrderEnvelope;
import ie.playlab.api.model.OrderStatus;
import ie.playlab.restassured.support.Api;
import ie.playlab.restassured.support.Schema;
import ie.playlab.restassured.support.Shared;
import ie.playlab.restassured.support.TestUser;
import io.restassured.response.Response;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** Checkout and the order history. SP-007 is this class's own stock-checked product. */
class OrdersTest extends ApiTest {
    private static final String SKU = "SP-007";

    @Test
    @Tag("PLS-6.1")
    @DisplayName("PLS-6.1 paying with the success card creates a paid order and takes the stock")
    void pay() {
        TestUser buyer = newUser("customer");
        int before = stock(SKU);
        var cart = addToCart(buyer, SKU, 2).then().extract().path("totals");
        Response response = placeOrder(buyer);
        response.then().statusCode(201).body(Schema.matches("OrderEnvelope"));
        Order order = response.as(OrderEnvelope.class).getData();
        assertEquals(OrderStatus.PAID, order.getStatus());
        assertEquals("4242", order.getCardLast4());
        assertTrue(order.getNumber().matches("PL-\\d{6}"));
        assertEquals("/api/v1/orders/" + order.getId(), response.header("Location"));
        assertEquals(cart, response.path("data.totals"));
        assertEquals(before - 2, stock(SKU));
        api.as(buyer).get("/api/v1/cart").then().body("itemCount", equalTo(0));
    }

    @Test
    @Tag("PLS-10.5")
    @DisplayName("PLS-10.5 the same Idempotency-Key a second time is a replay of the first order, not a second order")
    void idempotent() {
        TestUser buyer = newUser("customer");
        addToCart(buyer, SKU, 1);
        String key = "restassured-" + UUID.randomUUID();
        int first = placeOrder(buyer, Shared.card("success"), key).then().statusCode(201).extract().path("data.id");
        api.as(buyer).header("Idempotency-Key", key).body(Api.orderBody()).post("/api/v1/orders")
                .then().statusCode(200).header("Idempotent-Replayed", "true").body("data.id", equalTo(first));
        api.as(buyer).get("/api/v1/orders").then().body("meta.total", equalTo(1));
    }

    @Test
    @Tag("PLS-6.2")
    @DisplayName("PLS-6.2 a declined card returns 402, creates no order and keeps the cart")
    void declined() {
        TestUser buyer = newUser("customer");
        addToCart(buyer, SKU, 1);
        placeOrder(buyer, Shared.card("decline"), null).then().statusCode(402).body(Schema.matches("Error")).body("error.code", equalTo("PAYMENT_DECLINED"));
        api.as(buyer).get("/api/v1/orders").then().body("meta.total", equalTo(0));
        api.as(buyer).get("/api/v1/cart").then().body("itemCount", equalTo(1));
    }

    @Test
    @Tag("PLS-6.2")
    @DisplayName("PLS-6.2 a card number that fails the check digit is a 422 on payment.cardNumber")
    void invalidCard() {
        TestUser buyer = newUser("customer");
        addToCart(buyer, SKU, 1);
        placeOrder(buyer, Shared.card("invalid"), null).then().statusCode(422).body("error.details.field", hasItem("payment.cardNumber"));
    }

    @Test
    @Tag("PLS-6.3")
    @DisplayName("PLS-6.3 a payment provider that does not answer returns 504")
    void timeout() {
        TestUser buyer = newUser("customer");
        addToCart(buyer, SKU, 1);
        placeOrder(buyer, Shared.card("timeout"), null).then().statusCode(504).body("error.code", equalTo("PAYMENT_TIMEOUT"));
    }

    @Test
    @Tag("PLS-6.7")
    @DisplayName("PLS-6.7 a price or total sent by the client is ignored")
    void priceTamper() {
        TestUser buyer = newUser("customer");
        var cartTotals = addToCart(buyer, SKU, 1).then().extract().path("totals");
        Map<String, Object> body = new java.util.HashMap<>(Api.orderBody());
        body.put("totals", Map.of("totalCents", 1));
        body.put("items", List.of(Map.of("productId", Shared.productId(SKU), "unitPriceCents", 1)));
        Response response = api.as(buyer).body(body).post("/api/v1/orders");
        response.then().statusCode(201);
        int id = response.path("data.id");
        api.as(admin).header("If-Match", "*").body(Map.of("status", "cancelled")).patch("/api/v1/orders/{id}/status", id);
        assertEquals(cartTotals, response.path("data.totals"));
        assertNotEquals(1, (int) response.path("data.totals.totalCents"));
    }

    @Test
    @Tag("PLS-7.1")
    @DisplayName("PLS-7.1 order history lists the customer's own orders, newest first, and nobody else's")
    void history() {
        TestUser buyer = newUser("customer");
        TestUser other = newUser("customer");
        addToCart(buyer, SKU, 1);
        int one = placeOrder(buyer).path("data.id");
        addToCart(buyer, SKU, 1);
        int two = placeOrder(buyer).path("data.id");
        api.as(buyer).get("/api/v1/orders").then().statusCode(200).body(Schema.matches("OrderList")).body("data.id", contains(two, one));
        api.as(other).get("/api/v1/orders").then().body("meta.total", equalTo(0));
    }

    @Test
    @Tag("PLS-7.2")
    @DisplayName("PLS-7.2 another customer's order is a 404 to read, track or cancel (PLS-24.1)")
    void otherCustomer() {
        TestUser buyer = newUser("customer");
        TestUser other = newUser("customer");
        addToCart(buyer, SKU, 1);
        int id = placeOrder(buyer).path("data.id");
        api.as(other).get("/api/v1/orders/{id}", id).then().statusCode(404).body(Schema.matches("Error"));
        api.as(other).get("/api/v1/orders/{id}/tracking", id).then().statusCode(404);
        api.as(other).post("/api/v1/orders/{id}/cancel", id).then().statusCode(404);
        api.as(buyer).get("/api/v1/orders/{id}/tracking", id).then().statusCode(200).body("data.events[0].status", equalTo("placed"));
    }
}
