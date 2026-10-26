package ie.playlab.restassured;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.assertEquals;

import ie.playlab.restassured.support.Schema;
import ie.playlab.restassured.support.TestUser;
import io.restassured.response.Response;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvFileSource;

class RegistrationTest extends ApiTest {

    private static String unique() {
        return UUID.randomUUID().toString().substring(0, 8);
    }

    private Map<String, String> person(String name) {
        return Map.of("name", name, "email", "restassured-" + unique() + "@playlab.test", "password", "Password123!");
    }

    @Test
    @Tag("PLS-2.1")
    @DisplayName("PLS-2.1 registering creates an unconfirmed customer, and a confirmation email in the mailbox")
    void register() {
        Map<String, String> body = person("Casey Registrant");
        api.guest().body(body).post("/api/v1/auth/register")
                .then().statusCode(201).body(Schema.matches("UserEnvelope"))
                .body("user.role", equalTo("customer"), "user.emailVerified", equalTo(false));

        Response mailbox = api.hook().get("/test/mailbox/{email}", body.get("email"));
        mailbox.then().statusCode(200).body("data.find { it.type == 'confirm-email' }.subject", equalTo("Confirm your PlayLab Shop account"));
        String link = mailbox.path("data.find { it.type == 'confirm-email' }.link");
        Matcher token = Pattern.compile("token=([^&]+)").matcher(link);
        token.find();
        api.guest().body(Map.of("token", token.group(1))).post("/api/v1/auth/confirm-email")
                .then().statusCode(200).body("user.emailVerified", equalTo(true));
    }

    @Test
    @Tag("PLS-2.2")
    @DisplayName("PLS-2.2 an email already in use is refused with 409 and the standard message")
    void duplicate() {
        Map<String, String> body = person("Casey Registrant");
        api.guest().body(body).post("/api/v1/auth/register").then().statusCode(201);
        api.guest().body(body).post("/api/v1/auth/register")
                .then().statusCode(409).body("error.code", equalTo("EMAIL_IN_USE"))
                .body("error.message", equalTo("An account with this email already exists"));
    }

    @Test
    @Tag("PLS-2.3")
    @DisplayName("PLS-2.3 a name with accents is accepted and comes back unchanged")
    void accents() {
        api.guest().body(person("Aoife Ní Bhriain")).post("/api/v1/auth/register")
                .then().statusCode(201).body("user.name", equalTo("Aoife Ní Bhriain"));
    }

    @Test
    @Tag("PLS-2.4")
    @DisplayName("PLS-2.4 invalid details return 422 naming each field, not 500")
    void invalid() {
        api.guest().body(Map.of("name", "", "email", "not-an-email", "password", "short")).post("/api/v1/auth/register")
                .then().statusCode(422).body(Schema.matches("Error"))
                .body("error.details.field", containsInAnyOrder("name", "email", "password"));
    }

    @Test
    @Tag("PLS-24.4")
    @DisplayName("PLS-24.4 a role in the registration body is ignored")
    void roleIgnored() {
        api.guest().body(Map.of("name", "Eve Escalate", "email", "restassured-" + unique() + "@playlab.test", "password", "Password123!", "role", "admin"))
                .post("/api/v1/auth/register").then().statusCode(201).body("user.role", equalTo("customer"));
    }

    @Test
    @Tag("PLS-2.5")
    @DisplayName("PLS-2.5 a reset link chooses a new password once, and an unknown email gets the same answer")
    void passwordReset() {
        TestUser user = newUser("customer");
        Map<String, Object> known = api.guest().body(Map.of("email", user.email())).post("/api/v1/auth/forgot-password")
                .then().statusCode(202).extract().path("$");
        Map<String, Object> unknown = api.guest().body(Map.of("email", "nobody-at-all@playlab.test")).post("/api/v1/auth/forgot-password")
                .then().statusCode(202).extract().path("$");
        assertEquals(known, unknown);

        Response mailbox = api.hook().get("/test/mailbox/{email}", user.email());
        String link = mailbox.path("data.find { it.type == 'password-reset' }.link");
        Matcher token = Pattern.compile("token=([^&]+)").matcher(link);
        token.find();
        api.guest().body(Map.of("token", token.group(1), "password", "NewPassword456!")).post("/api/v1/auth/reset-password").then().statusCode(200);
        api.guest().body(Map.of("email", user.email(), "password", "NewPassword456!")).post("/api/v1/auth/login").then().statusCode(200);
        api.guest().body(Map.of("token", token.group(1), "password", "AnotherPassword789!")).post("/api/v1/auth/reset-password")
                .then().statusCode(400).body("error.code", equalTo("RESET_TOKEN_INVALID"));
    }

    /** A cell like {@code <a*500>} means 500 repeats of a; {@code UNIQUE8X} makes an email new. */
    private static String expand(String value) {
        if (value == null) {
            return "";
        }
        Matcher repeat = Pattern.compile("^<(.)\\*(\\d+)>$").matcher(value);
        return repeat.matches() ? repeat.group(1).repeat(Integer.parseInt(repeat.group(2))) : value;
    }

    @ParameterizedTest(name = "PLS-2.4 boundary input: {0}")
    @CsvFileSource(resources = "/registration-boundaries.csv", numLinesToSkip = 1, encoding = "UTF-8")
    @DisplayName("PLS-2.4 boundary input")
    @Tag("PLS-2.4")
    void boundaries(String note, String name, String email, String password, int status, String field) {
        Map<String, String> sent = Map.of("name", expand(name), "email", email.replace("UNIQUE8X", unique()), "password", expand(password));
        var response = api.guest().body(sent).post("/api/v1/auth/register").then().statusCode(status);
        if (status == 201) {
            response.body(Schema.matches("UserEnvelope")).body("user.email", equalTo(sent.get("email").toLowerCase()));
        } else {
            response.body(Schema.matches("Error")).body("error.details.field", hasItem(field));
        }
    }
}
