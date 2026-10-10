package com.classflow.chat;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {
    /**
     * Both directions, in milliseconds. Hosting proxies close a connection that has been quiet
     * for a minute or so, and a chat that nobody is typing in is quiet most of the time, so the
     * heartbeat is what keeps an idle socket open. It is also how the client notices that a
     * connection died without a clean close, and reconnects.
     */
    private static final long[] HEARTBEAT = {10_000, 10_000};

    private final String allowedOrigin;
    private final SocketAuthInterceptor socketAuth;
    private final TaskScheduler heartbeatScheduler;

    /**
     * The scheduler is the one @EnableWebSocketMessageBroker already defines. Using it, rather
     * than declaring another, keeps an extra executor bean from competing with the one @Async
     * mail sending relies on. @Lazy because that bean is defined by this same configuration.
     */
    public WebSocketConfig(@Value("${app.allowed-origin}") String allowedOrigin,
                           SocketAuthInterceptor socketAuth,
                           @Lazy @Qualifier("messageBrokerTaskScheduler") TaskScheduler heartbeatScheduler) {
        this.allowedOrigin = allowedOrigin;
        this.socketAuth = socketAuth;
        this.heartbeatScheduler = heartbeatScheduler;
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic", "/queue")
                .setHeartbeatValue(HEARTBEAT)
                .setTaskScheduler(heartbeatScheduler);
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(socketAuth);
    }

    /**
     * The browser's same-origin policy does not cover WebSockets, and CORS never runs on a
     * handshake, so this origin check is the only thing standing between the socket and a
     * page on someone else's site opening one with the visitor's cookie. It reuses the origin
     * the HTTP API is already restricted to, so the two cannot drift apart.
     */
    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws").setAllowedOrigins(allowedOrigin);
    }
}
