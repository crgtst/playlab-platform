package ie.playlab.restassured.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.File;
import java.io.IOException;
import java.nio.file.Path;

/** The shared data contract in tests/shared/: products, cards and discounts, so nothing here is hard-coded. */
public final class Shared {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final JsonNode PRODUCTS = read("products.json").get("products");
    private static final JsonNode CARDS = read("cards.json");

    private Shared() {}

    public static final Path SCHEMAS = Path.of("..", "shared", "schemas").toAbsolutePath().normalize();

    private static JsonNode read(String name) {
        try {
            return MAPPER.readTree(new File(Path.of("..", "shared", name).toAbsolutePath().normalize().toString()));
        } catch (IOException e) {
            throw new IllegalStateException("Cannot read tests/shared/" + name, e);
        }
    }

    /** A seeded product by SKU. */
    public static JsonNode product(String sku) {
        for (JsonNode product : PRODUCTS) {
            if (sku.equals(product.get("sku").asText())) {
                return product;
            }
        }
        throw new IllegalArgumentException("No product with SKU " + sku + " in tests/shared/products.json");
    }

    public static int productId(String sku) {
        return product(sku).get("id").asInt();
    }

    public static int productCount() {
        return PRODUCTS.size();
    }

    /** A test card number: success, decline, timeout or invalid. */
    public static String card(String kind) {
        return CARDS.get(kind).get("number").asText();
    }
}
