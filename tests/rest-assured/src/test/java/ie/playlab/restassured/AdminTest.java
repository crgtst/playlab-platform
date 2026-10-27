package ie.playlab.restassured;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;

import ie.playlab.api.model.AdminUser;
import ie.playlab.restassured.support.Schema;
import ie.playlab.restassured.support.TestUser;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** Products, avatar files, the user's own account and user administration. Every product here is made and deleted by the test. */
class AdminTest extends ApiTest {
    private static final byte[] TINY_PNG = Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==");

    private Map<String, Object> newProduct() {
        String u = UUID.randomUUID().toString().substring(0, 8);
        return Map.of("sku", "RA-" + u, "name", "zz REST Assured test product " + u, "description", "Made by REST Assured", "category", "books", "priceCents", 1999, "stock", 4);
    }

    private int createProduct() {
        return api.as(admin).body(newProduct()).post("/api/v1/products").then().statusCode(201).extract().path("data.id");
    }

    private void deleteProduct(int id) {
        api.as(admin).delete("/api/v1/products/{id}", id).then().statusCode(204);
    }

    @ParameterizedTest(name = "PLS-8.5 a {0} cannot create a product: 403")
    @ValueSource(strings = {"customer", "support"})
    @Tag("PLS-8.5")
    @DisplayName("PLS-8.5 a customer or support user cannot create a product: 403")
    void onlyAdminsCreateProducts(String role) {
        api.as(newUser(role)).body(newProduct()).post("/api/v1/products").then().statusCode(403).body(Schema.matches("Error"));
    }

    @Test
    @Tag("PLS-8.4")
    @DisplayName("PLS-8.4 an admin creates, edits with the current ETag, and deletes a product")
    void productCrud() {
        int id = createProduct();
        String etag = api.guest().get("/api/v1/products/{id}", id).then().statusCode(200).body(Schema.matches("ProductEnvelope")).extract().header("ETag");
        Response edited = api.as(admin).header("If-Match", etag).body(Map.of("name", "Renamed by REST Assured")).patch("/api/v1/products/{id}", id);
        edited.then().statusCode(200).body("data.name", equalTo("Renamed by REST Assured"));
        assertNotEquals(etag, edited.header("ETag"));
        deleteProduct(id);
        api.guest().get("/api/v1/products/{id}", id).then().statusCode(404);
    }

    @Test
    @Tag("PLS-21.2")
    @DisplayName("PLS-21.2 a stale ETag is 412 and no If-Match is 428, and the product is left alone")
    void staleEdit() {
        int id = createProduct();
        api.as(admin).header("If-Match", "\"stale\"").body(Map.of("name", "Should not be saved")).patch("/api/v1/products/{id}", id)
                .then().statusCode(412).body("error.code", equalTo("PRECONDITION_FAILED"));
        api.as(admin).body(Map.of("name", "Should not be saved")).patch("/api/v1/products/{id}", id)
                .then().statusCode(428).body("error.code", equalTo("PRECONDITION_REQUIRED"));
        api.guest().get("/api/v1/products/{id}", id).then().body("data.name", startsWith("zz REST Assured test product"));
        deleteProduct(id);
    }

    @Test
    @Tag("PLS-9.1")
    @DisplayName("PLS-9.1 a PNG under 2 MB becomes the avatar, and is served back unchanged")
    void avatar() {
        TestUser user = newUser("customer");
        String url = api.as(user).contentType(ContentType.MULTIPART).multiPart("avatar", "avatar.png", TINY_PNG, "image/png")
                .post("/api/v1/users/me/avatar").then().statusCode(201).body("data.contentType", equalTo("image/png")).extract().path("data.avatarUrl");
        byte[] served = api.guest().get(url).then().statusCode(200).contentType("image/png").extract().asByteArray();
        assertArrayEquals(TINY_PNG, served);
    }

    @Test
    @Tag("PLS-9.2")
    @DisplayName("PLS-9.2 a file over 2 MB is 413 \"File too large\"")
    void avatarTooBig() {
        byte[] big = new byte[2 * 1024 * 1024 + 1];
        java.util.Arrays.fill(big, (byte) 'a');
        api.as(newUser("customer")).contentType(ContentType.MULTIPART).multiPart("avatar", "huge.png", big, "image/png")
                .post("/api/v1/users/me/avatar").then().statusCode(413).body("error.message", equalTo("File too large"));
    }

    @Test
    @Tag("PLS-9.3")
    @DisplayName("PLS-9.3 a text file renamed to .png is 415, because the contents are checked, not the name")
    void avatarNotAnImage() {
        api.as(newUser("customer")).contentType(ContentType.MULTIPART).multiPart("avatar", "fake.png", "this is not an image".getBytes(), "image/png")
                .post("/api/v1/users/me/avatar").then().statusCode(415).body("error.code", equalTo("UNSUPPORTED_MEDIA_TYPE"), "error.message", equalTo("Only PNG or JPG images are allowed"));
    }

    @Test
    @Tag("PLS-9.4")
    @DisplayName("PLS-9.4 an admin exports orders to a CSV with a header row; a customer cannot")
    void csvExport() {
        Response csv = api.as(admin).get("/api/v1/orders/export.csv");
        csv.then().statusCode(200).contentType(containsString("text/csv"));
        assertEquals("number,created_at,customer_email,status,items,subtotal,discount_code,discount,vat,delivery,total,currency", csv.asString().split("\r\n")[0]);
        api.as(newUser("customer")).get("/api/v1/orders/export.csv").then().statusCode(403);
    }

    @Test
    @Tag("PLS-22.1")
    @DisplayName("PLS-22.1 a new name is returned by GET /users/me")
    void rename() {
        TestUser user = newUser("customer");
        api.as(user).body(Map.of("name", "Casey Renamed")).patch("/api/v1/users/me").then().statusCode(200);
        api.as(user).get("/api/v1/users/me").then().statusCode(200).body("data.name", equalTo("Casey Renamed"));
    }

    @Test
    @Tag("PLS-22.2")
    @DisplayName("PLS-22.2 an email changes only with the current password, and not to one that is taken (PLS-22.3, 22.6)")
    void changeEmail() {
        TestUser user = newUser("customer");
        TestUser other = newUser("customer");
        String newEmail = "restassured-new-" + UUID.randomUUID().toString().substring(0, 8) + "@playlab.test";
        api.as(user).body(Map.of("email", newEmail, "currentPassword", "not-the-password")).patch("/api/v1/users/me")
                .then().statusCode(422).body("error.details.field", contains("currentPassword"));
        api.as(user).body(Map.of("email", other.email(), "currentPassword", user.password())).patch("/api/v1/users/me")
                .then().statusCode(409).body("error.code", equalTo("EMAIL_IN_USE"));
        api.as(user).body(Map.of("email", newEmail, "currentPassword", user.password())).patch("/api/v1/users/me").then().statusCode(200);
        api.guest().body(Map.of("email", newEmail, "password", user.password())).post("/api/v1/auth/login").then().statusCode(200);
        api.guest().body(Map.of("email", user.email(), "password", user.password())).post("/api/v1/auth/login").then().statusCode(401);
    }

    @Test
    @Tag("PLS-22.4")
    @DisplayName("PLS-22.4 deleting the account ends the sessions on both devices")
    void deleteAccount() {
        TestUser user = newUser("customer");
        Map<String, String> login = Map.of("email", user.email(), "password", user.password());
        Response phone = api.guest().body(login).post("/api/v1/auth/login");
        Response laptop = api.guest().body(login).post("/api/v1/auth/login");
        given(phone).delete("/api/v1/users/me").then().statusCode(204);
        given(laptop).get("/api/v1/users/me").then().statusCode(401).body("error.code", equalTo("TOKEN_REVOKED"));
        api.guest().body(Map.of("refreshToken", laptop.path("refreshToken"))).post("/api/v1/auth/refresh").then().statusCode(401);
    }

    private io.restassured.specification.RequestSpecification given(Response login) {
        return api.as(new TestUser(0, "", "", "", "", login.path("accessToken")));
    }

    @Test
    @Tag("PLS-23.1")
    @DisplayName("PLS-23.1 the user list filters by role, pages, shows lock state and never shows a password")
    void userList() {
        for (int i = 0; i < 3; i++) {
            newUser("support");
        }
        Response page = api.as(admin).queryParams(Map.of("role", "support", "limit", 2, "page", 1)).get("/api/v1/admin/users");
        page.then().statusCode(200).body("data", hasSize(2)).body("data.role", everyItem(equalTo("support")))
                .body("meta.limit", equalTo(2)).header("X-Total-Count", equalTo(String.valueOf((int) page.path("meta.total"))));
        // Every user in the list is an AdminUser (the generated class) and matches its schema.
        for (AdminUser user : page.as(ie.playlab.api.model.AdminUsersGet200Response.class).getData()) {
            assertNotNull(user.getLocked());
        }
        try {
            for (var node : new com.fasterxml.jackson.databind.ObjectMapper().readTree(page.asString()).get("data")) {
                assertEquals(java.util.Set.of(), Schema.problems("AdminUser", node.toString()));
            }
        } catch (java.io.IOException e) {
            fail(e);
        }
        assertFalse(page.asString().toLowerCase().contains("password"));
    }

    @Test
    @Tag("PLS-23.2")
    @DisplayName("PLS-23.2 a role change applies from the user's next login, not to the token already issued")
    void roleChange() {
        TestUser user = newUser("customer");
        api.as(admin).body(Map.of("role", "support")).patch("/api/v1/admin/users/{id}", user.id()).then().statusCode(200);
        api.as(user).get("/api/v1/admin/users").then().statusCode(403);
        String fresh = api.guest().body(Map.of("email", user.email(), "password", user.password())).post("/api/v1/auth/login").path("accessToken");
        api.as(new TestUser(user.id(), user.email(), user.name(), "support", user.password(), fresh)).get("/api/v1/admin/users").then().statusCode(200);
    }

    @Test
    @Tag("PLS-23.3")
    @DisplayName("PLS-23.3 an admin unlocks a locked account and the user can log in at once")
    void unlock() {
        TestUser user = newUser("customer");
        for (int i = 0; i < 5; i++) {
            api.guest().body(Map.of("email", user.email(), "password", "wrong-password")).post("/api/v1/auth/login");
        }
        api.guest().body(Map.of("email", user.email(), "password", user.password())).post("/api/v1/auth/login").then().statusCode(423);
        api.as(admin).body(Map.of("unlock", true)).patch("/api/v1/admin/users/{id}", user.id())
                .then().statusCode(200).body("data.locked", equalTo(false), "data.failedLogins", equalTo(0));
        api.guest().body(Map.of("email", user.email(), "password", user.password())).post("/api/v1/auth/login").then().statusCode(200);
    }

    @Test
    @Tag("PLS-23.4")
    @DisplayName("PLS-23.4 support may list users but not change them, and a customer may do neither (PLS-23.5, 24.8)")
    void whoMayDoWhat() {
        TestUser support = newUser("support");
        TestUser customer = newUser("customer");
        TestUser target = newUser("customer");
        api.as(support).queryParam("limit", 1).get("/api/v1/admin/users").then().statusCode(200);
        api.as(support).body(Map.of("role", "admin")).patch("/api/v1/admin/users/{id}", target.id()).then().statusCode(403);
        api.as(customer).get("/api/v1/admin/users").then().statusCode(403).body(Schema.matches("Error"));
        api.as(customer).body(Map.of("role", "admin")).patch("/api/v1/admin/users/{id}", target.id()).then().statusCode(403);
        api.as(admin).queryParam("q", target.email()).get("/api/v1/admin/users").then().body("data[0].role", equalTo("customer"));
    }
}
