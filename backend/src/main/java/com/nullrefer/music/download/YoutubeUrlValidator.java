package com.nullrefer.music.download;

import java.net.URI;
import java.util.regex.Pattern;

final class YoutubeUrlValidator {

  private static final Pattern YT_HOST =
      Pattern.compile(
          "^(https?:\\/\\/)?(www\\.)?(youtube\\.com|youtu\\.be|m\\.youtube\\.com)\\/",
          Pattern.CASE_INSENSITIVE);

  private YoutubeUrlValidator() {}

  static boolean isValid(String value) {
    if (value == null || value.length() > 2048) {
      return false;
    }
    try {
      URI u = URI.create(value.trim());
      return YT_HOST.matcher(u.toString()).find();
    } catch (Exception e) {
      return false;
    }
  }
}
