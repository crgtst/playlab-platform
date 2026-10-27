package ie.playlab.restassured;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;

import ie.playlab.restassured.support.Schema;
import ie.playlab.restassured.support.Shared;
import ie.playlab.restassured.support.TestUser;
import io.restassured.response.Response;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** Order status changes, ETags and cancelling. HK-007 and HK-006 are this class's own products. */
class LifecycleTest extends ApiTest {
    private static final String SKU = "HK-007";

    /** A shipped order cannot be cancelled, so the one unit of HK-006 it used is put back by hand. */
    @AfterAll
    void restoreShippedStock() {
        api.as(admin).header("If-Match", "*").body(Map.of("stock", Shared.product("HK-006").get("stock").asInt()))
                .patch("/api/v1/products/{id}", Shared.productId("HK-006")).then().statusCode(200);
    }

    private int newOrder(TestUser buyer) {
        addToCart(buyer, SKU, 1);
        return placeOrder(buyer).path("data.id");
    }

    private Response change(int orderId, String status, String ifMatch) {
        var request = api.as(admin).body(Map.of("status", status));
        if (ifMatch != null) {
            request.header("If-Match", ifMatch);
        }
        return request.patch("/api/v1/orders/{id}/status", orderId);
    }

    @Test
    @Tag("PLS-21.5")
    @DisplayName("PLS-21.5 a status change needs the current ETag: stale is 412, missing is 428")
    void needsETag() {
        int id = newOrder(newUser("customer"));
        change(id, "processing", "\"stale\"").then().statusCode(412).body("error.code", equalTo("PRECONDITION_FAILED"));
        change(id, "processing", null).then().statusCode(428).body("error.code", equalTo("PRECONDITION_REQUIRED"));
    }

    @Test
    @Tag("PLS-20.1")
    @DisplayName("PLS-20.1 an allowed move returns 200, and the ETag changes with the status (PLS-21.6)")
    void allowedMove() {
        int id = newOrder(newUser("customer"));
        String etag = api.as(admin).get("/api/v1/orders/{id}", id).then().statusCode(200).extract().header("ETag");
        assertNotNull(etag);
        change(id, "processing", etag).then().statusCode(200).body(Schema.matches("OrderEnvelope"))
                .body("data.status", equalTo("processing"), "data.etag", not(equalTo(etag)));
    }

    @Test
    @Tag("PLS-20.2")
    @DisplayName("PLS-20.2 going back a step is a 409 that says where it was, where it was going and what is allowed")
    void backwards() {
        int id = newOrder(newUser("customer"));
        change(id, "processing", "*").then().statusCode(200);
        change(id, "paid", "*").then().statusCode(409).body("error.code", equalTo("INVALID_TRANSITION"))
                .body("error.details.from", equalTo("processing"), "error.details.to", equalTo("paid"), "error.details.allowed", contains("shipped", "cancelled"));
    }

    @Test
    @Tag("PLS-20.3")
    @DisplayName("PLS-20.3 a shipped order cannot be cancelled")
    void shippedCannotBeCancelled() {
        // Ordering ends in a shipped order that cannot be put back, so this takes one unit of HK-006, which only this test orders.
        TestUser buyer = newUser("customer");
        addToCart(buyer, "HK-006", 1);
        int id = placeOrder(buyer).path("data.id");
        change(id, "processing", "*").then().statusCode(200);
        change(id, "shipped", "*").then().statusCode(200);
        change(id, "cancelled", "*").then().statusCode(409).body("error.code", equalTo("INVALID_TRANSITION"));
    }

    @Test
    @Tag("PLS-20.4")
    @DisplayName("PLS-20.4 a bulk change where one order cannot move changes none, and lists the one that cannot")
    void bulkIsAllOrNothing() {
        TestUser buyer = newUser("customer");
        int moving = newOrder(buyer);
        int stuck = newOrder(buyer);
        change(moving, "processing", "*").then().statusCode(200);
        api.as(admin).body(Map.of("ids", List.of(moving, stuck), "status", "shipped")).post("/api/v1/orders/bulk-status")
                .then().statusCode(409).body("error.details.orders", hasSize(1))
                .body("error.details.orders[0].id", equalTo(stuck), "error.details.orders[0].from", equalTo("paid"));
        api.as(admin).get("/api/v1/orders/{id}", moving).then().body("data.status", equalTo("processing"));
    }

    @Test
    @Tag("PLS-20.5")
    @DisplayName("PLS-20.5 cancelling an order puts its stock back")
    void cancelRestocks() {
        TestUser buyer = newUser("customer");
        int before = stock(SKU);
        addToCart(buyer, SKU, 3);
        int id = placeOrder(buyer).path("data.id");
        assertEquals(before - 3, stock(SKU));
        change(id, "processing", "*").then().statusCode(200);
        change(id, "cancelled", "*").then().statusCode(200);
        assertEquals(before, stock(SKU));
    }

    @Test
    @Tag("PLS-20.6")
    @DisplayName("PLS-20.6 a customer can cancel a paid order but not one that is processing")
    void customerCancel() {
        TestUser buyer = newUser("customer");
        int paid = newOrder(buyer);
        int processing = newOrder(buyer);
        change(processing, "processing", "*").then().statusCode(200);
        api.as(buyer).post("/api/v1/orders/{id}/cancel", processing).then().statusCode(409).body("error.code", equalTo("INVALID_TRANSITION"));
        api.as(buyer).post("/api/v1/orders/{id}/cancel", paid).then().statusCode(200).body("data.status", equalTo("cancelled"));
    }
}
