package com.nullrefer.music.ondevice



/** LibreTranslate(Argos) 오프라인 언어 팩 카탈로그 — 영어→한국어만 지원 */

object LibreTranslatePackageCatalog {

  data class Entry(

      val id: String,

      val label: String,

      val description: String,

      val fileName: String,

      val downloadUrls: List<String>,

      val minBytes: Long,

      val required: Boolean,

  )



  val EN_KO =

      Entry(

          id = "libretranslate:pack-en-ko",

          label = "영어 → 한국어",

          description = "",

          fileName = "translate-en_ko-1_1.argosmodel",

          downloadUrls =
              listOf(
                  "https://argos-net.com/v1/translate-en_ko-1_1.argosmodel",
                  "https://ipfs.io/ipfs/QmWecr5i4tJNnokusm97rTUyQtUqNNPufGF7ake1hJVu6G",
                  "https://dweb.link/ipfs/QmWecr5i4tJNnokusm97rTUyQtUqNNPufGF7ake1hJVu6G",
              ),

          minBytes = 30_000_000L,

          required = true,

      )



  val ENTRIES = listOf(EN_KO)



  fun entryFor(id: String): Entry? = ENTRIES.firstOrNull { it.id == id }



  fun requiredEntries(): List<Entry> = ENTRIES.filter { it.required }

}

