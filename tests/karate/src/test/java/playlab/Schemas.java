package playlab;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SchemaLocation;
import com.networknt.schema.SchemaValidatorsConfig;
import com.networknt.schema.SpecVersion;
import com.networknt.schema.ValidationMessage;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Checks a response against the shared JSON Schemas in tests/shared/schemas/ (the same files the Postman and
 * Playwright suites use). The schemas point at each other by file name, so each one is loaded from its own file.
 *
 * <p>From a feature: {@code * match Schemas.check('ProductList', response) == []}
 */
public final class Schemas {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final JsonSchemaFactory FACTORY = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7);
    private static final Map<String, JsonSchema> LOADED = new ConcurrentHashMap<>();

    private Schemas() {}

    /** The problems with {@code body} (a Karate JSON value) as {@code name}.json; an empty list means it matches. */
    public static List<String> check(String name, Object body) {
        JsonSchema schema = LOADED.computeIfAbsent(name, Schemas::load);
        JsonNode node = MAPPER.valueToTree(body);
        List<String> problems = new ArrayList<>();
        for (ValidationMessage message : schema.validate(node)) {
            problems.add(message.getMessage());
        }
        return problems;
    }

    private static JsonSchema load(String name) {
        Path file = Path.of("..", "shared", "schemas", name + ".json").toAbsolutePath().normalize();
        SchemaValidatorsConfig config = new SchemaValidatorsConfig();
        // `format` (email, date-time) is a hint here, as in the other suites; the shape and types are what is checked.
        config.setFormatAssertionsEnabled(false);
        return FACTORY.getSchema(SchemaLocation.of(file.toUri().toString()), config);
    }
}
