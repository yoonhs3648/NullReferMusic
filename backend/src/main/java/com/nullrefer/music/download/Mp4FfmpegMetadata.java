package com.nullrefer.music.download;

/**
 * M4A/MP4 메타데이터 — FFmpeg QuickTime muxer 표준 iTunes atom(ilst ©nam, ©ART …).
 *
 * <p>{@code -movflags +use_metadata_tags} 는 mdtakeys 형식으로 쓰여 Windows Media Player·탐색기
 * 속성에서 태그가 비어 보이므로 사용하지 않습니다.
 *
 * @see <a href="https://wiki.multimedia.cx/index.php/FFmpeg_Metadata">FFmpeg Metadata</a>
 */
final class Mp4FfmpegMetadata {

  private Mp4FfmpegMetadata() {}

  /** 논리 필드명 → FFmpeg QuickTime 키 (artist → author 등) */
  static String ffmpegKey(String logicalKey) {
    return switch (logicalKey) {
      case "artist" -> "author";
      case "date" -> "year";
      case "disc" -> "disk";
      default -> logicalKey;
    };
  }

  /** M4A remux 시 Windows·Android 호환용 movflags (use_metadata_tags 제외) */
  static final String MOOV_FLAGS = "+faststart";
}
