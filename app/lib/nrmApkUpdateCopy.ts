/**
 * APK update-gate user-visible strings — ASCII `\uXXXX` escapes ONLY.
 *
 * CRITICAL: Do not put raw Hangul syllable literals in this file or in
 * `NrmApkUpdateGate.tsx`. On Windows, PowerShell `Set-Content` / `Out-File` / `>`
 * can rewrite UTF-8 Korean as `??`, and that broken text ships in the APK.
 *
 * See: docs/NRM-UTF8-HANGUL-RULE.md
 */
export const NRM_APK_UPDATE_COPY = {
  checking: '\uC571 \uC900\uBE44\uC911..',
  awaitingPermission:
    '\uC124\uCE58 \uAD8C\uD55C \uC124\uC815 \uD6C4 \uB3CC\uC544\uC624\uBA74 \uC774\uC5B4\uC9D1\uB2C8\uB2E4...',
  installPermissionError:
    '\uC54C \uC218 \uC5C6\uB294 \uC571 \uC124\uCE58 \uAD8C\uD55C\uC744 \uD5C8\uC6A9\uD55C \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.',
  promptTitle: '\uC5C5\uB370\uC774\uD2B8 \uD544\uC694',
  promptBody: (current: string, required: string) =>
    `\uD604\uC7AC v${current} \u2192 \uCD5C\uC2E0 v${required}\n\uC0C8 APK\uB97C \uB2E4\uC6B4\uB85C\uB4DC\uD574 \uC124\uCE58\uD569\uB2C8\uB2E4.`,
  update: '\uC5C5\uB370\uC774\uD2B8',
  exitApp: '\uC571 \uC885\uB8CC',
  downloading: (progress: number) => `APK \uB2E4\uC6B4\uB85C\uB4DC \uC911... ${progress}%`,
  downloadPreparing: '\uB2E4\uC6B4\uB85C\uB4DC \uC900\uBE44 \uC911...',
  installTitle: '\uC124\uCE58 \uC548\uB0B4',
  installBody:
    '\uC2DC\uC2A4\uD15C \uC124\uCE58 \uD654\uBA74\uC5D0\uC11C \uC5C5\uB370\uC774\uD2B8\uB97C \uC644\uB8CC\uD558\uC138\uC694.\n\uC124\uCE58 \uD6C4 \uC571\uC744 \uB2E4\uC2DC \uC2E4\uD589\uD569\uB2C8\uB2E4.',
  errorTitle: '\uC5C5\uB370\uC774\uD2B8 \uC624\uB958',
  retry: '\uB2E4\uC2DC \uC2DC\uB3C4',
  /** checkNrmApkUpdate error paths — also shown inside the gate dialog */
  remoteVersionMissing: '\uC6D0\uACA9 APK \uBC84\uC804 \uC815\uBCF4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.',
  remoteVersionEmpty: '\uC6D0\uACA9 APK version\uC774 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.',
  downloadFailed: 'APK \uB2E4\uC6B4\uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.',
  installFailed: 'APK \uC124\uCE58\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.',
  genericError: '\uC5C5\uB370\uC774\uD2B8 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.',
} as const;

/** Map native/JS exception messages to safe gate UI copy (never show mojibake). */
export function mapNrmApkUpdateErrorMessage(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw ?? '');
  const lower = msg.toLowerCase();
  if (lower.includes('e_apk_download') || lower.includes('download failed')) {
    return NRM_APK_UPDATE_COPY.downloadFailed;
  }
  if (
    lower.includes('e_apk_install') ||
    lower.includes('install_packages') ||
    lower.includes('apk file not found')
  ) {
    return NRM_APK_UPDATE_COPY.installFailed;
  }
  if (!msg.trim()) {
    return NRM_APK_UPDATE_COPY.genericError;
  }
  // Prefer ASCII-only technical messages; never surface strings that look corrupted.
  if (/\?{2,}/.test(msg) || /[\uFFFD]/.test(msg)) {
    return NRM_APK_UPDATE_COPY.genericError;
  }
  // Hangul in Error.message is OK if the throwing site used \u escapes; still gate unknown Hangul-ish garbage from PS.
  return msg;
}
