package ie.playlab.restassured;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;

import ie.playlab.api.model.Product;
import ie.playlab.api.model.ProductList;
import ie.playlab.restassured.support.Schema;
import ie.playlab.restassured.support.Shared;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

class CatalogueTest extends ApiTest {

    /** Every product of a listing, page by page. */
    private List<Product> walk(Map<String, ?> query) {
        List<Product> all = new ArrayList<>();
        for (int page = 1; page <= 20; page++) {
            ProductList list = api.guest().queryParams(query).queryParam("page", page).get("/api/v1/products").then().statusCode(200).extract().as(ProductList.class);
            all.addAll(list.getData());
            if (page >= list.getMeta().getTotalPages()) {
                return all;
            }
        }
        throw new AssertionError("more than 20 pages");
    }

    @Test
    @Tag("PLS-3.1")
    @DisplayName("PLS-3.1 a search returns only matching products, and the count equals what is listed")
    void search() {
        ProductList list = api.guest().queryParam("q", "webcam").queryParam("limit", 48).get("/api/v1/products")
                .then().spec(FAST).statusCode(200).body(Schema.matches("ProductList")).extract().as(ProductList.class);
        assertTrue(list.getMeta().getTotal() > 0);
        assertEquals(list.getMeta().getTotal(), list.getData().size());
        for (Product product : list.getData()) {
            assertTrue((product.getName() + " " + product.getDescription()).toLowerCase().contains("webcam"), product.getName());
        }
    }

    @Test
    @Tag("PLS-3.2")
    @DisplayName("PLS-3.2 an apostrophe in a search is not a server error")
    void apostrophe() {
        api.guest().queryParam("q", "O'Neill").get("/api/v1/products")
                .then().statusCode(200).body("data.name", hasItems("O'Neill Surf Jacket", "O'Neill's Irish Folk Tales"));
    }

    @Test
    @Tag("PLS-3.3")
    @DisplayName("PLS-3.3 category and price filters apply together")
    void filters() {
        ProductList list = api.guest().queryParams(Map.of("category", "books", "minPrice", 20, "maxPrice", 40, "sort", "price_asc"))
                .get("/api/v1/products").then().statusCode(200).extract().as(ProductList.class);
        assertFalse(list.getData().isEmpty());
        for (Product product : list.getData()) {
            assertEquals("books", product.getCategory().getSlug());
            assertTrue(product.getPriceCents() >= 2000 && product.getPriceCents() <= 4000);
        }
        api.guest().queryParams(Map.of("minPrice", 50, "maxPrice", 10)).get("/api/v1/products").then().statusCode(422).body(Schema.matches("Error"));
    }

    @Test
    @Tag("PLS-3.4")
    @DisplayName("PLS-3.4 sorting by price ascending holds across every page")
    void sortAcrossPages() {
        List<Integer> prices = walk(Map.of("sort", "price_asc", "limit", 12)).stream().map(Product::getPriceCents).toList();
        assertEquals(prices.stream().sorted().toList(), prices);
    }

    @Test
    @Tag("PLS-3.5")
    @DisplayName("PLS-3.5 paging shows every product exactly once, with none missing")
    void paging() {
        List<Integer> ids = walk(Map.of("limit", 12)).stream().map(Product::getId).toList();
        assertEquals(ids.size(), new HashSet<>(ids).size(), "duplicates");
        // Another test class may have a throwaway product in the catalogue just now. Those sort last (their names start
        // with "zz"), so they never move a seeded product between pages: what must hold is that every seeded one is there.
        List<Integer> missing = Shared.productIds().stream().filter((id) -> !ids.contains(id)).toList();
        assertTrue(missing.isEmpty(), "missing from the listing: " + missing);
    }

    @Test
    @Tag("PLS-3.6")
    @DisplayName("PLS-3.6 no matches is still a 200 with an empty list")
    void noMatches() {
        api.guest().queryParam("q", "zzzzzz-nothing").get("/api/v1/products")
                .then().statusCode(200).body("data", empty()).body("meta.total", equalTo(0));
    }

    @Test
    @Tag("PLS-24.7")
    @DisplayName("PLS-24.7 a limit above the maximum is refused with 422 naming the limit")
    void limitTooHigh() {
        api.guest().queryParam("limit", 100000).get("/api/v1/products").then().statusCode(422).body("error.details.field", hasItem("limit"));
    }

    @Test
    @Tag("PLS-10.6")
    @DisplayName("PLS-10.6 a product has an ETag, and If-None-Match on it returns 304")
    void conditionalRead() {
        int id = Shared.productId("EL-001");
        String etag = api.guest().get("/api/v1/products/{id}", id).then().statusCode(200).body(Schema.matches("ProductEnvelope")).extract().header("ETag");
        assertNotNull(etag);
        api.guest().header("If-None-Match", etag).get("/api/v1/products/{id}", id).then().statusCode(304);
    }
}
