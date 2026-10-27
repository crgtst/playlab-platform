package ie.playlab.restassured.support;

import static io.restassured.RestAssured.given;

import io.restassured.builder.RequestSpecBuilder;
import io.restassured.filter.log.LogDetail;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import java.util.List;
import java.util.Map;

/**
 * One test session and the request specifications built for it (PLS-28). A test class makes one {@code Api} in
 * {@code @BeforeAll}; every request it sends carries the session, so its defects, clock and rate limit are its own.
 */
public final class Api {
    public final String session;

    private Api(String session) {
        this.session = session;
    }

    /** A new session, with the run's defects ({@code -Ddefects=...}) switched on in it. */
    public static Api newSession() {
        // No cookie handling here: REST Assured sends none unless asked, so the test_session cookie never wins over the header.
        String id = given().baseUri(Env.BASE_URL).post("/test/sessions").then().statusCode(201).extract().path("id");
        Api api = new Api(id);
        if (!Env.DEFECTS.isBlank()) {
            api.hook().body(Map.of("enable", List.of(Env.DEFECTS.split(",")))).post("/test/bugs").then().statusCode(200);
        }
        return api;
    }

    private RequestSpecBuilder builder() {
        return new RequestSpecBuilder()
                .setBaseUri(Env.BASE_URL)
                .setContentType(ContentType.JSON)
                .setAccept(ContentType.JSON)
                .addHeader("X-Test-Session", session)
                // The request and response are printed only when a test fails.
                .log(LogDetail.ALL);
    }

    /** A request as a guest. */
    public RequestSpecification guest() {
        return given().spec(builder().build()).log().ifValidationFails();
    }

    /** A request as this user. */
    public RequestSpecification as(TestUser user) {
        return given().spec(builder().addHeader("Authorization", "Bearer " + user.token()).build()).log().ifValidationFails();
    }

    /** A request to a test hook (/test/...), in this session. */
    public RequestSpecification hook() {
        return guest();
    }

    /** A throwaway customer, admin or support user. */
    public TestUser newUser(String role) {
        Response response = hook().body(Map.of("role", role)).post("/test/users");
        response.then().statusCode(201);
        return new TestUser(
                response.path("user.id"),
                response.path("user.email"),
                response.path("user.name"),
                response.path("user.role"),
                response.path("password"),
                response.path("accessToken"));
    }

    /** The shipping, delivery date and card an order needs (the success card unless another is given). */
    public static Map<String, Object> orderBody(String card) {
        return Map.of(
                "shipping", Map.of("fullName", "REST Assured Customer", "line1", "1 Main Street", "city", "Dublin", "postcode", "D01 F5P2", "country", "IE"),
                "deliveryDate", java.time.LocalDate.now().plusDays(5).toString(),
                "payment", Map.of("nameOnCard", "Casey Customer", "cardNumber", card, "expiry", "12/30", "cvc", "123"));
    }

    public static Map<String, Object> orderBody() {
        return orderBody(Shared.card("success"));
    }
}
