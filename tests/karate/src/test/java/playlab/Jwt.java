package playlab;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Builds access tokens the API must refuse (PLS-24.2): unsigned ("alg": "none"), or signed with a key it does not know. */
public final class Jwt {
    private static final Base64.Encoder URL = Base64.getUrlEncoder().withoutPadding();

    private Jwt() {}

    /** The claims (a JSON object string) of a real token, so a forged one differs only in how it is signed. */
    public static String claimsOf(String token) {
        return new String(Base64.getUrlDecoder().decode(token.split("\\.")[1]), StandardCharsets.UTF_8);
    }

    /** {@code alg} is "none" (no signature) or "HS256" (signed with {@code secret}). */
    public static String forge(String claimsJson, String alg, String secret) throws Exception {
        String header = URL.encodeToString(("{\"alg\":\"" + alg + "\",\"typ\":\"JWT\"}").getBytes(StandardCharsets.UTF_8));
        String unsigned = header + "." + URL.encodeToString(claimsJson.getBytes(StandardCharsets.UTF_8));
        if ("none".equals(alg)) {
            return unsigned + ".";
        }
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return unsigned + "." + URL.encodeToString(mac.doFinal(unsigned.getBytes(StandardCharsets.UTF_8)));
    }
}
