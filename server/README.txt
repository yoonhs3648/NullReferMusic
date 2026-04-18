The download API was moved to Spring Boot.

Use: C:\NullReferMusic\backend
Run: mvnw.cmd spring-boot:run  (or Start-Server.bat from repo root)

Same HTTP API as before: GET /api/health , POST /api/download
Default port 8787. Env vars: NRM_SERVER_PORT, NRM_BIND_HOST, NRM_REPO_ROOT,
NRM_YT_DLP, NRM_FFMPEG_DIR, NRM_OUTPUT_DIR.
