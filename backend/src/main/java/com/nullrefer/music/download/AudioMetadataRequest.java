package com.nullrefer.music.download;

/** 클라이언트 → 서버 오디오 파일 메타데이터 태깅 요청 */
public class AudioMetadataRequest {
  public String jobId;
  /** @deprecated Whisper 전사는 job 오디오 파일만 사용 */
  public String sourceUrl;
  public String deeplApiKey;
  public String whisperModelPreference;
  public String artist;
  public String title;
  public String album;
  public String genre;
  public String releaseDate;
  public String coverUrl;
  public String albumArtist;
  public String trackNumber;
  public String discNumber;
  public String composer;
  public String lyrics;
  public String bpm;
  public String copyright;
  public String website;
  public String producer;
  public String remixer;
}
