package ie.playlab.restassured;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;

import ie.playlab.api.model.Cart;
import ie.playlab.api.model.Totals;
import ie.playlab.restassured.support.Schema;
import ie.playlab.restassured.support.Shared;
import ie.playlab.restassured.support.TestUser;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class CartTest extends ApiTest {

    /** The totals every cart must satisfy, to the cent (PLS-4.4 and PLS-5.10). */
    private static void addsUp(Totals t) {
        assertEquals(t.getTotalCents(), t.getSubtotalCents() - t.getDiscountCents() + t.getVatCents() + t.getDeliveryCents());
    }

    private Cart cartOf(io.restassured.response.Response response) {
        return response.as(Cart.class);
    }

    @Test
    @Tag("PLS-4.1")
    @DisplayName("PLS-4.1 adding a product shows the count and line total, and the totals add up to the cent")
    void addItem() {
        TestUser user = newUser("customer");
        Cart cart = cartOf(addToCart(user, "EL-008", 2).then().statusCode(201).body(Schema.matches("Cart")).extract().response());
        assertEquals(2, cart.getItemCount());
        assertEquals(2 * Shared.product("EL-008").get("priceCents").asInt(), cart.getItems().get(0).getLineTotalCents());
        addsUp(cart.getTotals());
    }

    @ParameterizedTest(name = "PLS-4.2 a quantity of {0} is refused with 422 on the quantity field")
    @ValueSource(ints = {0, -1, 100})
    @Tag("PLS-4.2")
    @DisplayName("PLS-4.2 a quantity outside 1 to 99 is refused with 422 on the quantity field")
    void badQuantity(int quantity) {
        TestUser user = newUser("customer");
        addToCart(user, "EL-008", quantity).then().statusCode(422).body("error.details[0].field", equalTo("quantity"));
    }

    @Test
    @Tag("PLS-4.3")
    @DisplayName("PLS-4.3 asking for more than the stock is refused with 409 and says how many are left")
    void overStock() {
        addToCart(newUser("customer"), "EL-006", 4).then().statusCode(409)
                .body("error.code", equalTo("INSUFFICIENT_STOCK"), "error.details.available", equalTo(3));
    }

    @Test
    @Tag("PLS-4.4")
    @DisplayName("PLS-4.4 changing and removing a quantity keeps the totals exact")
    void changeAndRemove() {
        TestUser user = newUser("customer");
        addToCart(user, "EL-008", 1).then().statusCode(201);
        int id = Shared.productId("EL-008");
        Cart changed = api.as(user).body(Map.of("quantity", 3)).patch("/api/v1/cart/items/{id}", id).then().statusCode(200).extract().as(Cart.class);
        assertEquals(3 * Shared.product("EL-008").get("priceCents").asInt(), changed.getTotals().getSubtotalCents());
        addsUp(changed.getTotals());
        api.as(user).delete("/api/v1/cart/items/{id}", id).then().statusCode(200).body("items", empty()).body("totals.totalCents", equalTo(0));
    }

    @Test
    @Tag("PLS-5.1")
    @DisplayName("PLS-5.1 SAVE10 takes 10% off, VAT follows the discounted subtotal, and the total is exact")
    void percentCode() {
        TestUser user = newUser("customer");
        addToCart(user, "EL-008", 2);
        Totals t = api.as(user).body(Map.of("code", "SAVE10")).post("/api/v1/cart/discount")
                .then().statusCode(200).body(Schema.matches("Cart")).extract().as(Cart.class).getTotals();
        assertEquals((int) Math.round(t.getSubtotalCents() * 0.1), (int) t.getDiscountCents());
        assertEquals((int) Math.round((t.getSubtotalCents() - t.getDiscountCents()) * 0.23), (int) t.getVatCents());
        addsUp(t);
    }

    @Test
    @Tag("PLS-5.7")
    @DisplayName("PLS-5.7 the code in lower case is the same code, applied once")
    void caseInsensitive() {
        TestUser user = newUser("customer");
        addToCart(user, "EL-008", 1);
        api.as(user).body(Map.of("code", "SAVE10")).post("/api/v1/cart/discount").then().statusCode(200);
        api.as(user).body(Map.of("code", "save10")).post("/api/v1/cart/discount")
                .then().statusCode(200).body("discounts", hasSize(1), "discount.code", equalTo("SAVE10"));
    }

    @Test
    @Tag("PLS-5.4")
    @DisplayName("PLS-5.4 a second code is refused, naming the one already applied")
    void oneCode() {
        TestUser user = newUser("customer");
        addToCart(user, "EL-008", 1);
        api.as(user).body(Map.of("code", "SAVE10")).post("/api/v1/cart/discount").then().statusCode(200);
        api.as(user).body(Map.of("code", "FIXED20")).post("/api/v1/cart/discount")
                .then().statusCode(409).body("error.code", equalTo("DISCOUNT_ONE_PER_ORDER"), "error.details.applied", equalTo("SAVE10"));
    }

    @Test
    @Tag("PLS-5.3")
    @DisplayName("PLS-5.3 an unknown code is refused with 422")
    void unknownCode() {
        TestUser user = newUser("customer");
        addToCart(user, "EL-008", 1);
        api.as(user).body(Map.of("code", "NOT-A-CODE")).post("/api/v1/cart/discount").then().statusCode(422).body("error.code", equalTo("DISCOUNT_UNKNOWN"));
    }

    @Test
    @Tag("PLS-5.2")
    @DisplayName("PLS-5.2 an expired code is refused and the total is unchanged")
    void expiredCode() {
        api.hook().body(Map.of("fixtures", java.util.List.of("expired-discount"))).post("/test/seed").then().statusCode(201);
        TestUser user = newUser("customer");
        addToCart(user, "EL-008", 1);
        api.as(user).body(Map.of("code", "EXPIRED10")).post("/api/v1/cart/discount").then().statusCode(422).body("error.code", equalTo("DISCOUNT_EXPIRED"));
        api.as(user).get("/api/v1/cart").then().body("totals.discountCents", equalTo(0));
    }

    @Test
    @Tag("PLS-5.5")
    @DisplayName("PLS-5.5 a code with a minimum spend is refused on a small cart, and removed if the cart shrinks below it")
    void minimumSpend() {
        api.hook().body(Map.of("fixtures", java.util.List.of("min-spend-discount"))).post("/test/seed").then().statusCode(201);
        TestUser small = newUser("customer");
        addToCart(small, "SP-003", 1);
        api.as(small).body(Map.of("code", "MIN50")).post("/api/v1/cart/discount")
                .then().statusCode(422).body("error.code", equalTo("DISCOUNT_MIN_SPEND"), "error.details.minSpendCents", equalTo(5000));

        TestUser big = newUser("customer");
        addToCart(big, "SP-003", 6);
        api.as(big).body(Map.of("code", "MIN50")).post("/api/v1/cart/discount").then().statusCode(200);
        api.as(big).body(Map.of("quantity", 2)).patch("/api/v1/cart/items/{id}", Shared.productId("SP-003"))
                .then().statusCode(200).body("discount", nullValue(), "totals.discountCents", equalTo(0), "notices.code", hasItem("DISCOUNT_REMOVED"));
    }

    @Test
    @Tag("PLS-5.6")
    @DisplayName("PLS-5.6 a fixed code larger than the cart never makes the total negative")
    void fixedCodeLargerThanCart() {
        TestUser user = newUser("customer");
        addToCart(user, "SP-003", 1);
        api.as(user).body(Map.of("code", "FIXED20")).post("/api/v1/cart/discount")
                .then().statusCode(200).body("totals.totalCents", greaterThanOrEqualTo(0));
    }
}
