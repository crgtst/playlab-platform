package ie.playlab.restassured.support;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Where the stack is and how strict to be. The address is BASE_URL, or http://localhost:API_PORT from app/.env (never a
 * hard-coded port). {@code -Drestassured.env=ci|perf} picks the response-time budget and whether the rate limit is on;
 * {@code -Ddefects=a,b} switches defects on in every test session.
 */
public final class Env {
    public static final String NAME = System.getProperty("restassured.env", "local");
    public static final String BASE_URL = baseUrl();
    public static final long RESPONSE_TIME_MS = switch (NAME) {
        case "perf" -> 300;
        case "ci" -> 3000;
        default -> 1500;
    };
    /** The rate limit per minute, or 0 when it is off (the perf profile). */
    public static final int RATE_LIMIT_PER_MIN = "perf".equals(NAME) ? 0 : 100;
    public static final String DEFECTS = System.getProperty("defects", "");

    private Env() {}

    private static String baseUrl() {
        String fromEnv = System.getenv("BASE_URL");
        if (fromEnv != null && !fromEnv.isBlank()) {
            return fromEnv.replaceAll("/$", "");
        }
        try {
            Path file = Path.of("..", "..", "app", ".env");
            Matcher match = Pattern.compile("^API_PORT=(\\d+)", Pattern.MULTILINE).matcher(Files.readString(file));
            if (match.find()) {
                return "http://localhost:" + match.group(1);
            }
        } catch (java.io.IOException ignored) {
            // falls through to the error below
        }
        throw new IllegalStateException("Set BASE_URL, or API_PORT in app/.env, so the suite knows where the API is.");
    }
}
