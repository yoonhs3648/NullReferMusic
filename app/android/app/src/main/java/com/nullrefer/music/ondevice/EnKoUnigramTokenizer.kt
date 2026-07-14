package com.nullrefer.music.ondevice

import java.io.BufferedReader
import java.io.File
import java.io.FileInputStream
import java.io.InputStreamReader
import java.nio.charset.StandardCharsets
import org.json.JSONObject
import org.json.JSONTokener

/**
 * mT5 Unigram 토크나이저 — unigram_pieces.tsv (v2: id\\tscore\\tjson_piece) + tokenizer_meta.json.
 * 네이티브 sentencepiece JNI 없음. 구버전(raw piece\\tscore)은 제어문자로 ID가 밀려 사용 금지.
 */
class EnKoUnigramTokenizer
private constructor(
    private val pieces: List<String>,
    private val scores: DoubleArray,
    private val pieceToId: HashMap<String, Int>,
    private val unkId: Int,
    private val eosId: Int,
    private val appendEos: Boolean,
    private val spaceChar: Char,
) {
  fun encode(text: String, maxTokens: Int): IntArray {
    val normalized = normalize(text)
    if (normalized.isEmpty()) return intArrayOf()
    val ids = ArrayList<Int>(32)
    val seg = viterbi(normalized)
    for (p in seg) {
      ids.add(pieceToId[p] ?: unkId)
      if (ids.size >= maxTokens) break
    }
    // HuggingFace T5Tokenizer.encode 는 </s>(eos)를 붙인다 — 없으면 ONNX 가비지 출력
    if (appendEos && ids.size < maxTokens && (ids.isEmpty() || ids.last() != eosId)) {
      ids.add(eosId)
    }
    return ids.toIntArray()
  }

  fun decode(ids: List<Int>): String {
    val sb = StringBuilder()
    for (id in ids) {
      if (id < 0 || id >= pieces.size) continue
      val p = pieces[id]
      if (p == "<pad>" || p == "</s>" || p == "<unk>" || p == "<s>") continue
      sb.append(p)
    }
    return sb.toString().replace(spaceChar, ' ').trim()
  }

  private fun normalize(text: String): String {
    val spaced = text.trim().replace(' ', spaceChar)
    return if (spaced.isEmpty()) "" else "$spaceChar$spaced"
  }

  private fun viterbi(text: String): List<String> {
    val n = text.length
    val bestScore = DoubleArray(n + 1) { Double.NEGATIVE_INFINITY }
    val bestPrev = IntArray(n + 1) { -1 }
    val bestPiece = arrayOfNulls<String>(n + 1)
    bestScore[0] = 0.0
    for (i in 0 until n) {
      if (bestScore[i] == Double.NEGATIVE_INFINITY) continue
      val maxLen = minOf(32, n - i)
      var matched = false
      for (len in maxLen downTo 1) {
        val sub = text.substring(i, i + len)
        val id = pieceToId[sub] ?: continue
        matched = true
        val score = bestScore[i] + scores[id]
        if (score > bestScore[i + len]) {
          bestScore[i + len] = score
          bestPrev[i + len] = i
          bestPiece[i + len] = sub
        }
      }
      if (!matched) {
        val j = i + 1
        val score = bestScore[i] + (scores.getOrNull(unkId) ?: -10.0)
        if (score > bestScore[j]) {
          bestScore[j] = score
          bestPrev[j] = i
          bestPiece[j] = text.substring(i, j)
        }
      }
    }
    val out = ArrayList<String>()
    var cur = n
    while (cur > 0) {
      val prev = bestPrev[cur]
      if (prev < 0) break
      bestPiece[cur]?.let { out.add(it) }
      cur = prev
    }
    out.reverse()
    return out
  }

  companion object {
    fun load(spieceFile: File, meta: JSONObject): EnKoUnigramTokenizer {
      val piecesFile = File(spieceFile.parentFile, "unigram_pieces.tsv")
      if (!piecesFile.isFile) {
        throw IllegalStateException("unigram_pieces.tsv 없음")
      }
      val format = meta.optString("pieces_format", "")
      val loaded =
          if (format == "v2_id_score_json" || looksLikeV2(piecesFile)) {
            loadV2(piecesFile)
          } else {
            throw IllegalStateException(
                "unigram_pieces.tsv 가 구포맷(v1)입니다. EN→KO 패키지를 다시 다운로드하세요 (pieces_format=v2 필요).",
            )
          }
      val (pieces, scores, map) = loaded
      if (pieces.isEmpty()) throw IllegalStateException("empty unigram_pieces.tsv")
      val unkId = meta.optInt("unk_token_id", 2)
      val eosId = meta.optInt("eos_token_id", 1)
      val appendEos = meta.optBoolean("append_eos_on_encode", true)
      return EnKoUnigramTokenizer(pieces, scores, map, unkId, eosId, appendEos, '\u2581')
    }

    private fun looksLikeV2(file: File): Boolean {
      BufferedReader(InputStreamReader(FileInputStream(file), StandardCharsets.UTF_8), 4096).use { br ->
        var line: String?
        while (true) {
          line = br.readLine() ?: return false
          if (line.isEmpty()) continue
          if (line.startsWith("# en-ko-unigram-v2")) return true
          if (line.startsWith("#")) continue
          // v2: starts with digit id
          return line[0].isDigit() && line.indexOf('\t') > 0
        }
      }
    }

    private data class Loaded(val pieces: List<String>, val scores: DoubleArray, val map: HashMap<String, Int>)

    private fun loadV2(file: File): Loaded {
      val byId = HashMap<Int, Pair<String, Double>>(260_000)
      var maxId = -1
      BufferedReader(
              InputStreamReader(FileInputStream(file), StandardCharsets.UTF_8),
              1 shl 16,
          )
          .use { br ->
            var line: String?
            while (true) {
              line = br.readLine() ?: break
              if (line.isEmpty() || line.startsWith("#")) continue
              val t1 = line.indexOf('\t')
              if (t1 <= 0) continue
              val t2 = line.indexOf('\t', t1 + 1)
              if (t2 <= t1) continue
              val id = line.substring(0, t1).toIntOrNull() ?: continue
              val score = line.substring(t1 + 1, t2).toDoubleOrNull() ?: -999.0
              val pieceJson = line.substring(t2 + 1)
              val piece =
                  try {
                    JSONTokener(pieceJson).nextValue() as? String
                        ?: JSONObject("{\"p\":$pieceJson}").getString("p")
                  } catch (_: Exception) {
                    continue
                  }
              byId[id] = piece to score
              if (id > maxId) maxId = id
            }
          }
      if (maxId < 0) throw IllegalStateException("empty unigram_pieces.tsv v2")
      val pieces = ArrayList<String>(maxId + 1)
      val scoreList = DoubleArray(maxId + 1) { -999.0 }
      val map = HashMap<String, Int>(maxId + 1)
      for (id in 0..maxId) {
        val row = byId[id]
        val piece = row?.first ?: "<unk>"
        val score = row?.second ?: -999.0
        pieces.add(piece)
        scoreList[id] = score
        map[piece] = id
      }
      return Loaded(pieces, scoreList, map)
    }
  }
}
