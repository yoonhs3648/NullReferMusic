package com.nullrefer.music.config;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;
import java.util.Set;
import java.util.TreeSet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
public class NrmStartupBanner implements ApplicationRunner {

  private static final Logger log = LoggerFactory.getLogger(NrmStartupBanner.class);

  private final Environment env;
  private final NrmPaths paths;

  public NrmStartupBanner(Environment env, NrmPaths paths) {
    this.env = env;
    this.paths = paths;
  }

  @Override
  public void run(ApplicationArguments args) throws Exception {
    String port = env.getProperty("server.port", "8787");
    String bind = env.getProperty("server.address", "0.0.0.0");
    log.info("[nullreference music] listening {}:{} -> out: {}", bind, port, paths.getOutputDir());
    log.info("  -> this PC  http://127.0.0.1:{}", port);

    if ("0.0.0.0".equals(bind)) {
      for (String ip : listLanIpv4Addresses()) {
        log.info("  -> same LAN  http://{}:{}  (optional app server URL)", ip, port);
      }
      log.info(
          "  (Windows Firewall may require inbound TCP {}. Not for public cloud deployment.)",
          port);
    }
  }

  private static Set<String> listLanIpv4Addresses() throws Exception {
    TreeSet<String> sorted = new TreeSet<>();
    for (NetworkInterface nif : Collections.list(NetworkInterface.getNetworkInterfaces())) {
      if (!nif.isUp() || nif.isLoopback()) {
        continue;
      }
      for (InetAddress addr : Collections.list(nif.getInetAddresses())) {
        if (!(addr instanceof Inet4Address)) {
          continue;
        }
        if (addr.isLoopbackAddress() || addr.isLinkLocalAddress()) {
          continue;
        }
        sorted.add(addr.getHostAddress());
      }
    }
    return sorted;
  }
}
