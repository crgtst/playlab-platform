package ie.playlab.restassured;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.assertEquals;

import ie.playlab.api.model.Session;
import ie.playlab.restassured.support.Api;
import ie.playlab.restassured.support.Schema;
import ie.playlab.restassured.support.TestUser;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

class AuthTest extends ApiTest {

    private Map<String, String> credentials(TestUser user, String password) {
        return Map.of("email", user.email(), "password", password);
    }

    @Test
    @Tag("PLS-1.1")
    @DisplayName("PLS-1.1 a customer logs in and gets a session for their own account")
    void login() {
        TestUser user = newUser("customer");
        // The response is read into the class generated from the OpenAPI file, as well as matched against its schema.
        Session session = api.guest().body(credentials(user, user.password())).post("/api/v1/auth/login")
                .then().spec(FAST).statusCode(200).body(Schema.matches("Session"))
                .extract().as(Session.class);
        assertEquals(user.email(), session.getUser().getEmail());
        assertEquals(Session.TokenTypeEnum.BEARER, session.getTokenType());
    }

    @Test
    @Tag("PLS-1.2")
    @DisplayName("PLS-1.2 a wrong password is refused with the standard message and no session cookie")
    void wrongPassword() {
        TestUser user = newUser("customer");
        api.guest().body(credentials(user, "wrong-password")).post("/api/v1/auth/login")
                .then().statusCode(401).body(Schema.matches("Error"))
                .body("error.message", equalTo("Email or password is incorrect"))
                .header("Set-Cookie", anyOf(nullValue(), not(containsString("session="))));
    }

    @Test
    @Tag("PLS-1.3")
    @DisplayName("PLS-1.3 the sixth attempt after five failures is locked out with 423")
    void lockout() {
        // The lock is on the account, so this uses a user of its own.
        TestUser user = newUser("customer");
        for (int i = 0; i < 5; i++) {
            api.guest().body(credentials(user, "wrong-password")).post("/api/v1/auth/login").then().statusCode(401);
        }
        api.guest().body(credentials(user, user.password())).post("/api/v1/auth/login")
                .then().statusCode(423).body("error.code", equalTo("ACCOUNT_LOCKED")).header("Retry-After", matchesPattern("\\d+"));
    }

    @Test
    @Tag("PLS-1.4")
    @DisplayName("PLS-1.4 after logging out, the refresh token no longer works")
    void logout() {
        TestUser user = newUser("customer");
        String refreshToken = api.guest().body(credentials(user, user.password())).post("/api/v1/auth/login").path("refreshToken");
        api.guest().body(Map.of("refreshToken", refreshToken)).post("/api/v1/auth/logout").then().statusCode(204);
        api.guest().body(Map.of("refreshToken", refreshToken)).post("/api/v1/auth/refresh").then().statusCode(401);
    }

    @Test
    @Tag("PLS-1.5")
    @DisplayName("PLS-1.5 an access token older than 15 minutes is refused with 401 TOKEN_EXPIRED")
    void expiredToken() {
        // The clock belongs to the session, so this one has a session of its own.
        Api own = Api.newSession();
        TestUser user = own.newUser("customer");
        own.hook().body(Map.of("advanceMs", 16 * 60 * 1000)).post("/test/clock").then().statusCode(200);
        own.as(user).get("/api/v1/auth/me").then().statusCode(401).body("error.code", equalTo("TOKEN_EXPIRED"));
    }

    @Test
    @Tag("PLS-1.6")
    @DisplayName("PLS-1.6 a valid refresh token returns a new access token")
    void refresh() {
        TestUser user = newUser("customer");
        String refreshToken = api.guest().body(credentials(user, user.password())).post("/api/v1/auth/login").path("refreshToken");
        api.guest().body(Map.of("refreshToken", refreshToken)).post("/api/v1/auth/refresh")
                .then().statusCode(200).body(Schema.matches("Session")).body("accessToken", not(emptyString()));
    }
}
