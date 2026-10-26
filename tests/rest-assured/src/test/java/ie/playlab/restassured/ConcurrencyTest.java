package ie.playlab.restassured;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;

import ie.playlab.restassured.support.Api;
import ie.playlab.restassured.support.Shared;
import ie.playlab.restassured.support.TestUser;
import io.restassured.response.Response;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * Things that must hold when requests arrive at the same moment. Each task waits on a latch, then all are released
 * together. SP-002 is this class's own product for the race; its stock is put back afterwards.
 */
class ConcurrencyTest extends ApiTest {
    private static final String RACE_SKU = "SP-002";
    private static final String PAY_SKU = "SP-003";

    /** Runs the tasks on that many threads, released at once, and returns their results in order. */
    private <T> List<T> atTheSameMoment(List<Callable<T>> tasks) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(tasks.size());
        CountDownLatch ready = new CountDownLatch(tasks.size());
        CountDownLatch go = new CountDownLatch(1);
        try {
            List<Future<T>> futures = new ArrayList<>();
            for (Callable<T> task : tasks) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    go.await();
                    return task.call();
                }));
            }
            ready.await();
            go.countDown();
            List<T> results = new ArrayList<>();
            for (Future<T> future : futures) {
                results.add(future.get());
            }
            return results;
        } finally {
            pool.shutdown();
        }
    }

    private List<Response> orderTogether(List<TestUser> buyers) throws Exception {
        List<Callable<Response>> tasks = new ArrayList<>();
        for (TestUser buyer : buyers) {
            tasks.add(() -> api.as(buyer).body(Api.orderBody()).post("/api/v1/orders"));
        }
        List<Response> responses = atTheSameMoment(tasks);
        for (Response response : responses) {
            if (response.statusCode() == 201) {
                track(response.path("data.id"));
            }
        }
        return responses;
    }

    @AfterEach
    void putRaceStockBack() {
        // A subclass's @AfterEach runs before the base class's, so cancel the orders here first (which adds their items
        // back), then set the stock to its seeded level.
        cancelOrders();
        api.as(admin).header("If-Match", "*").body(Map.of("stock", Shared.product(RACE_SKU).get("stock").asInt()))
                .patch("/api/v1/products/{id}", Shared.productId(RACE_SKU));
    }

    @Test
    @Tag("PLS-21.4")
    @DisplayName("PLS-21.4 of 20 customers ordering the last item at the same moment, exactly one succeeds and 19 get 409")
    void lastItem() throws Exception {
        api.as(admin).header("If-Match", "*").body(Map.of("stock", 1)).patch("/api/v1/products/{id}", Shared.productId(RACE_SKU)).then().statusCode(200);
        List<TestUser> racers = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            TestUser racer = newUser("customer");
            addToCart(racer, RACE_SKU, 1).then().statusCode(201);
            racers.add(racer);
        }

        List<Response> responses = orderTogether(racers);

        List<Integer> statuses = responses.stream().map(Response::statusCode).toList();
        assertEquals(1, statuses.stream().filter(s -> s == 201).count(), "orders that succeeded: " + statuses);
        assertEquals(19, statuses.stream().filter(s -> s == 409).count(), "orders refused with 409: " + statuses);
    }

    @Test
    @Tag("PLS-6.4")
    @DisplayName("PLS-6.4 two payments at the same moment create exactly one order")
    void payingTwice() throws Exception {
        TestUser buyer = newUser("customer");
        addToCart(buyer, PAY_SKU, 1).then().statusCode(201);

        List<Response> responses = orderTogether(List.of(buyer, buyer));

        assertEquals(1, responses.stream().filter(r -> r.statusCode() == 201).count(), "statuses: " + responses.stream().map(Response::statusCode).toList());
        api.as(buyer).get("/api/v1/orders").then().body("meta.total", equalTo(1));
    }

    @Test
    @Tag("PLS-24.9")
    @DisplayName("PLS-24.9 two orders using a single-use code at the same moment: only one gets the discount")
    void singleUseCode() throws Exception {
        api.hook().body(Map.of("fixtures", List.of("single-use-discount"))).post("/test/seed").then().statusCode(201);
        List<TestUser> buyers = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            TestUser buyer = newUser("customer");
            addToCart(buyer, PAY_SKU, 2).then().statusCode(201);
            api.as(buyer).body(Map.of("code", "ONCE15")).post("/api/v1/cart/discount").then().statusCode(200);
            buyers.add(buyer);
        }

        List<Response> responses = orderTogether(buyers);

        List<Response> placed = responses.stream().filter(r -> r.statusCode() == 201).toList();
        assertFalse(placed.isEmpty());
        long discounted = placed.stream().filter(r -> r.path("data.discount") != null).count();
        assertEquals(1, discounted, "orders that got the discount");
    }
}
