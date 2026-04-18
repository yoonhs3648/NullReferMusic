package com.nullrefer.music;

import com.nullrefer.music.config.NrmSettings;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(NrmSettings.class)
public class NullReferMusicApplication {

  public static void main(String[] args) {
    SpringApplication.run(NullReferMusicApplication.class, args);
  }
}
