package playlab;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

/**
 * Sends several POSTs at the same moment, as different users or the same one, and returns their status codes in the
 * order given. Karate runs one request at a time, so concurrency tests (PLS-6.4, 21.4, 24.9) use this.
 */
public final class Race {
    private Race() {}

    public static List<Object> post(String url, String session, List<String> tokens, String jsonBody) {
        // HTTP/1.1 only: the default client offers an upgrade to HTTP/2, which the API's WebSocket handler answers with a 404.
        HttpClient client = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();
        List<CompletableFuture<HttpResponse<String>>> sent = new ArrayList<>();
        for (String token : tokens) {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .header("Content-Type", "application/json")
                    .header("X-Test-Session", session)
                    .header("Authorization", "Bearer " + token)
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                    .build();
            sent.add(client.sendAsync(request, HttpResponse.BodyHandlers.ofString()));
        }
        List<Object> results = new ArrayList<>();
        for (CompletableFuture<HttpResponse<String>> future : sent) {
            HttpResponse<String> response = future.join();
            results.add(java.util.Map.of("status", response.statusCode(), "body", response.body()));
        }
        return results;
    }

    /**
     * Sends {@code count} GETs one after another as fast as possible (for the rate limit) and returns their statuses.
     * With {@code rotateForwardedFor} each request names a different X-Forwarded-For address.
     */
    public static List<Object> get(String url, String session, int count, boolean rotateForwardedFor) throws Exception {
        HttpClient client = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();
        List<Object> statuses = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(url)).header("X-Test-Session", session).GET();
            if (rotateForwardedFor) {
                request.header("X-Forwarded-For", "198.51.100." + (i % 250));
            }
            statuses.add(client.send(request.build(), HttpResponse.BodyHandlers.discarding()).statusCode());
        }
        return statuses;
    }

    /**
     * Creates a test session without going through Karate's HTTP client, which would keep the test_session cookie the
     * API sets and send it on every later request (where it would win over the X-Test-Session header).
     */
    public static String createSession(String baseUrl) throws Exception {
        HttpClient client = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();
        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/test/sessions"))
                .POST(HttpRequest.BodyPublishers.noBody())
                .build();
        String body = client.send(request, HttpResponse.BodyHandlers.ofString()).body();
        java.util.regex.Matcher id = java.util.regex.Pattern.compile("\"id\"\\s*:\\s*\"([^\"]+)\"").matcher(body);
        if (!id.find()) {
            throw new IllegalStateException("POST /test/sessions did not return an id: " + body);
        }
        return id.group(1);
    }
}
