package com.classflow.mail;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;

/**
 * Turns on @Async, which Mailer uses to send off the request thread.
 *
 * The pool itself is Spring Boot's own applicationTaskExecutor, sized under
 * spring.task.execution in application.yml rather than declared here. Defining an Executor
 * bean would make Boot's auto-configuration back off entirely, replacing the application's
 * default executor as a side effect of adding mail - a surprising thing for this package to
 * do, and the configuration properties give the same control without it.
 */
@Configuration
@EnableAsync
public class MailConfig {
}
