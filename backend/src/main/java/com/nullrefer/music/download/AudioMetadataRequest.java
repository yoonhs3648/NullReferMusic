package com.nullrefer.music.download;

/** 클라이언트 → 서버 오디오 파일 메타데이터 태깅 요청 */
public class AudioMetadataRequest {
  public String jobId;
  public String artist;
  public String title;
  public String album;
  public String genre;
  public String releaseDate;
  public String coverUrl;
}
