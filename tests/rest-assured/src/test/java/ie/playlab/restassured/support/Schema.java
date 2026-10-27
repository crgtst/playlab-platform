package ie.playlab.restassured.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SchemaLocation;
import com.networknt.schema.SchemaValidatorsConfig;
import com.networknt.schema.SpecVersion;
import com.networknt.schema.ValidationMessage;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import org.hamcrest.Description;
import org.hamcrest.TypeSafeDiagnosingMatcher;

/**
 * Matches a response body against a schema in tests/shared/schemas/ (the same files the other suites use). The schemas
 * point at each other by file name, so each one is read from its own file. REST Assured's own schema matcher reads only
 * draft-04, and these schemas are draft-07.
 *
 * <p>{@code response.then().body(Schema.matches("ProductList"))}
 */
public final class Schema {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final JsonSchemaFactory FACTORY = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7);
    private static final Map<String, JsonSchema> LOADED = new ConcurrentHashMap<>();

    private Schema() {}

    private static JsonSchema load(String name) {
        SchemaValidatorsConfig config = new SchemaValidatorsConfig();
        // `format` (email, date-time) is a hint here, as in the other suites; the shape and types are what is checked.
        config.setFormatAssertionsEnabled(false);
        return FACTORY.getSchema(SchemaLocation.of(Shared.SCHEMAS.resolve(name + ".json").toUri().toString()), config);
    }

    /** The problems with a JSON body as {@code name}.json; empty means it matches. */
    public static Set<String> problems(String name, String json) {
        try {
            JsonNode node = MAPPER.readTree(json);
            return LOADED.computeIfAbsent(name, Schema::load).validate(node).stream().map(ValidationMessage::getMessage).collect(Collectors.toSet());
        } catch (java.io.IOException e) {
            return Set.of("not JSON: " + e.getMessage());
        }
    }

    /** For {@code body(...)}: the response body (as a JSON string) matches the schema. */
    public static org.hamcrest.Matcher<String> matches(String name) {
        return new TypeSafeDiagnosingMatcher<>() {
            @Override
            protected boolean matchesSafely(String body, Description mismatch) {
                Set<String> problems = problems(name, body);
                if (!problems.isEmpty()) {
                    mismatch.appendText(String.join("; ", problems));
                }
                return problems.isEmpty();
            }

            @Override
            public void describeTo(Description description) {
                description.appendText("a body that matches the " + name + " schema");
            }
        };
    }
}
