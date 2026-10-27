@ignore
Feature: A test session for the calling feature (PLS-28)

  Called once per feature with callonce, so a feature's defects, clock and rate limit are its own.

  Scenario:
    # Not an HTTP step: Karate's client would keep the test_session cookie and send it on every later request.
    * def id = Java.type('playlab.Race').createSession(baseUrl)
    * def enableDefects = function(session, defects) { return defects ? defects.split(',') : []; }
    * def toEnable = enableDefects(id, defects)
    * if (toEnable.length > 0) karate.call('classpath:common/defects.feature', { session: id, enable: toEnable })
