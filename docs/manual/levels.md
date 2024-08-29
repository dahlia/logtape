Severity levels
===============

When you're logging events in your application, not all messages are created equal. Some might be routine information, while others could be critical errors that need immediate attention. That's where severity levels come in. LogTape provides five severity levels to help you categorize your log messages effectively.


Five severity levels
--------------------

LogTape uses the following severity levels, listed from lowest to highest
severity:

 1. *Debug*: Detailed information useful for diagnosing problems.
 2. *Information*: General information about the application's operation.
 3. *Warning*: An unexpected event that doesn't prevent the application
    from functioning.
 4. *Error*: A significant problem that prevented a specific operation from
    being completed.
 5. *Fatal error*: A critical error that causes the application to abort.

> [!NOTE]
> LogTape currently does not support custom severity levels.

Let's break down when you might use each of these:

### Debug

Use this level for detailed information that's mostly useful when diagnosing problems. Debug logs are typically not shown in production environments.

~~~~ typescript
logger.debug("Database query took {elapsedMs}ms to execute.", { elapsedMs });
~~~~

### Information

This level is for general information about the application's operation.

~~~~ typescript
logger.info("User {username} logged in successfully.", { username });
~~~~

### Warning

Use this when something unexpected happened, but the application can continue
functioning. This level is often used for events that are close to causing
errors.

~~~~ typescript
logger.warn("API rate limit is close to exceeding, 95% of limit reached.");
~~~~

### Error

This level indicates a significant problem that prevented a specific operation
from being completed. Use this for errors that need attention but don't
necessarily cause the application to stop.

~~~~ typescript
logger.error(
  "Failed to save user data to database.",
  { userId: "12345", error: err },
);
~~~~

### Fatal error

Use this for critical errors that cause the application to abort. Fatal errors
are typically unrecoverable and require immediate attention.

~~~~ typescript
logger.fatal("Unrecoverable error: Database connection lost.", { error });
~~~~


Choosing the right level
------------------------

When deciding which level to use, consider:

 -  *The impact on the application*: How severely does this event affect
    the application's operation?
 -  *The urgency of response*: How quickly does someone need to act on
    this information?
 -  *The audience*: Who needs to see this message? Developers?
    System administrators? End-users?


Configuring severity levels
---------------------------

You can control which severity levels are logged in different parts of your application. For example:

~~~~ typescript
await configure({
  // ... other configuration ...
  loggers: [
    {
      category: ["app"],
      level: "info",  // This will log info and above
    },
    {
      category: ["app", "database"],
      level: "debug",  // This will log everything for database operations
    }
  ]
});
~~~~

This configuration will log all levels from `"info"` up for most of the app,
but will include `"debug"` logs for database operations.


Best practices
--------------

 1. *Be consistent*: Use levels consistently across your application.
 2. *Don't over-use lower levels*: Too many debug or info logs can make it
    harder to find important information.
 3. *Include context*: Especially for higher severity levels, include relevant
    data to help diagnose the issue.
 4. *Consider performance*: Remember that logging, especially at lower levels,
    can impact performance in high-volume scenarios.

By using severity levels effectively, you can create logs that are informative, actionable, and easy to navigate. This will make debugging and monitoring your application much more manageable.
