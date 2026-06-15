package com.classflow;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;

@EnableCaching
@SpringBootApplication
public class ClassFlowApplication {
    public static void main(String[] args) {
        SpringApplication.run(ClassFlowApplication.class, args);
    }
}
