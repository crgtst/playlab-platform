package playlab;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.intuit.karate.Results;
import com.intuit.karate.Runner;
import org.junit.jupiter.api.Test;

/**
 * Runs every feature in parallel. Each feature makes its own test session and its own users, so they do not collide.
 *
 * <pre>
 *   ./mvnw -pl karate test                       everything
 *   ./mvnw -pl karate test -Dkarate.options="--tags @PLS-5.1"   one scenario by its AC tag
 *   ./mvnw -pl karate test -Ddefects=lost-update  switch defects on for the run
 * </pre>
 */
class KarateRunner {

    @Test
    void runAllFeatures() {
        Results results = Runner.path("classpath:features")
                .tags("~@ignore")
                .outputJunitXml(true)
                .outputCucumberJson(false)
                .parallel(Integer.getInteger("threads", 4));
        assertEquals(0, results.getFailCount(), results.getErrorMessages());
    }
}
