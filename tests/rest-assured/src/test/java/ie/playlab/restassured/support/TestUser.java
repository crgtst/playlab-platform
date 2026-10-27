package ie.playlab.restassured.support;

/** A throwaway account made with POST /test/users. */
public record TestUser(int id, String email, String name, String role, String password, String token) {}
