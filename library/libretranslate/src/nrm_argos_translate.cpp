#include <ctranslate2/batch_reader.h>
#include <ctranslate2/translator.h>
#include <ctranslate2/translation.h>
#include <sentencepiece_processor.h>

#include <cstdlib>
#include <fstream>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

static std::string read_file(const std::string& path) {
  std::ifstream in(path, std::ios::binary);
  if (!in) return "";
  std::ostringstream ss;
  ss << in.rdbuf();
  return ss.str();
}

static std::string b64_decode_text(const std::string& b64) {
  static const std::string chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::vector<int> T(256, -1);
  for (int i = 0; i < 64; i++) T[static_cast<unsigned char>(chars[i])] = i;
  std::string out;
  int val = 0, valb = -8;
  for (unsigned char c : b64) {
    if (T[c] == -1) continue;
    val = (val << 6) + T[c];
    valb += 6;
    if (valb >= 0) {
      out.push_back(static_cast<char>((val >> valb) & 0xFF));
      valb -= 8;
    }
  }
  return out;
}

struct SpmPair {
  sentencepiece::SentencePieceProcessor source;
  sentencepiece::SentencePieceProcessor target;
  bool ok = false;
};

static bool load_spm(const std::string& model_dir, SpmPair& pair) {
  const std::string legacy_source = model_dir + "/source.spm";
  const std::string legacy_target = model_dir + "/target.spm";
  const std::string unified = model_dir + "/sentencepiece.model";

  if (pair.source.Load(legacy_source).ok() && pair.target.Load(legacy_target).ok()) {
    pair.ok = true;
    return true;
  }
  if (pair.source.Load(unified).ok() && pair.target.Load(unified).ok()) {
    pair.ok = true;
    return true;
  }
  pair.ok = false;
  return false;
}

static std::string read_metadata_string(const std::string& model_dir, const std::string& key) {
  const std::string raw = read_file(model_dir + "/metadata.json");
  if (raw.empty()) return "";
  const std::string needle = "\"" + key + "\"";
  const auto pos = raw.find(needle);
  if (pos == std::string::npos) return "";
  const auto colon = raw.find(':', pos + needle.size());
  if (colon == std::string::npos) return "";
  const auto q1 = raw.find('"', colon + 1);
  if (q1 == std::string::npos) return "";
  const auto q2 = raw.find('"', q1 + 1);
  if (q2 == std::string::npos || q2 <= q1 + 1) return "";
  return raw.substr(q1 + 1, q2 - q1 - 1);
}

static std::string read_target_prefix(const std::string& model_dir) {
  return read_metadata_string(model_dir, "target_prefix");
}

static std::string read_tokens_prefix(const std::string& model_dir) {
  return read_metadata_string(model_dir, "tokens_prefix");
}

static std::string read_tokens_suffix(const std::string& model_dir) {
  return read_metadata_string(model_dir, "tokens_suffix");
}

static std::string strip_target_prefix(const std::string& line, const std::string& target_prefix) {
  if (target_prefix.empty() || line.size() < target_prefix.size()) return line;
  if (line.compare(0, target_prefix.size(), target_prefix) != 0) return line;
  std::string out = line.substr(target_prefix.size());
  if (!out.empty() && out[0] == ' ') out.erase(0, 1);
  return out;
}

static std::vector<std::string> split_null(const std::string& blob) {
  std::vector<std::string> out;
  size_t start = 0;
  for (size_t i = 0; i <= blob.size(); i++) {
    if (i == blob.size() || blob[i] == '\0') {
      if (i > start) out.push_back(blob.substr(start, i - start));
      start = i + 1;
    }
  }
  return out;
}

static std::string join_null(const std::vector<std::string>& parts) {
  std::string out;
  for (size_t i = 0; i < parts.size(); i++) {
    if (i > 0) out.push_back('\0');
    out += parts[i];
  }
  return out;
}

static std::string g_active_compute_type;

static const char* compute_type_name(ctranslate2::ComputeType type) {
  switch (type) {
    case ctranslate2::ComputeType::FLOAT32:
      return "float32";
    case ctranslate2::ComputeType::INT8_FLOAT32:
      return "int8_float32";
    case ctranslate2::ComputeType::INT8:
      return "int8";
    default:
      return "default";
  }
}

static std::unique_ptr<ctranslate2::Translator> make_translator(const std::string& model_path) {
#if defined(__ANDROID__)
  // Android: Ruy SGEMM은 INT8/INT8_FLOAT32만 지원. FLOAT32는 backend NONE → empty_output.
  // 절대 FLOAT32를 Android 후보에 넣지 말 것 (init은 되어도 translate_batch에서 실패).
  const ctranslate2::ComputeType candidates[] = {
      ctranslate2::ComputeType::INT8_FLOAT32,
      ctranslate2::ComputeType::INT8,
  };
#else
  const ctranslate2::ComputeType candidates[] = {
      ctranslate2::ComputeType::FLOAT32,
      ctranslate2::ComputeType::INT8_FLOAT32,
      ctranslate2::ComputeType::INT8,
  };
#endif
  for (auto compute_type : candidates) {
    try {
      auto translator = std::make_unique<ctranslate2::Translator>(
          model_path, ctranslate2::Device::CPU, compute_type);
      std::cerr << "translator init ok compute=" << compute_type_name(compute_type) << "\n";
      g_active_compute_type = compute_type_name(compute_type);
      return translator;
    } catch (const std::exception& e) {
      std::cerr << "translator init failed (" << compute_type_name(compute_type)
                << "): " << e.what() << "\n";
    }
  }
  return nullptr;
}

static ctranslate2::TranslationOptions default_translate_options() {
  ctranslate2::TranslationOptions options;
  options.beam_size = 4;
  options.length_penalty = 0.2f;
  options.replace_unknowns = true;
  options.use_vmap = true;
  return options;
}

static std::vector<std::string> encode_tokens(
    const sentencepiece::SentencePieceProcessor& spm,
    const std::string& text) {
  std::vector<std::string> tokens;
  spm.Encode(text, &tokens);
  return tokens;
}

static std::string decode_tokens(
    const sentencepiece::SentencePieceProcessor& spm,
    const std::vector<std::string>& tokens) {
  std::string line;
  spm.Decode(tokens, &line);
  return line;
}

static std::vector<ctranslate2::TranslationResult> run_translate_batch(
    ctranslate2::Translator& translator,
    const std::vector<std::string>& source_tokens,
    const std::vector<std::string>& target_prefix_tokens,
    bool use_vmap) {
  auto options = default_translate_options();
  options.use_vmap = use_vmap;
  const std::vector<std::vector<std::string>> batch = {source_tokens};
  if (!target_prefix_tokens.empty()) {
    return translator.translate_batch(
        batch,
        {target_prefix_tokens},
        options,
        0,
        ctranslate2::BatchType::Tokens);
  }
  return translator.translate_batch(
      batch,
      options,
      0,
      ctranslate2::BatchType::Tokens);
}

static std::string decode_hypothesis(
    const sentencepiece::SentencePieceProcessor& spm,
    const std::vector<std::string>& tokens,
    const std::string& target_prefix) {
  return strip_target_prefix(decode_tokens(spm, tokens), target_prefix);
}

static std::string translate_tokens_once(
    ctranslate2::Translator& translator,
    const SpmPair& spm,
    const std::vector<std::string>& source_tokens,
    const std::vector<std::string>& target_prefix_tokens,
    const std::string& target_prefix,
    bool use_vmap) {
  if (source_tokens.empty()) return "";
  const auto results =
      run_translate_batch(translator, source_tokens, target_prefix_tokens, use_vmap);
  if (results.empty() || results[0].hypotheses.empty() ||
      results[0].hypotheses[0].empty()) {
    return "";
  }
  return decode_hypothesis(spm.target, results[0].hypotheses[0], target_prefix);
}

static std::vector<std::string> translate_with_translator(
    ctranslate2::Translator& translator,
    const SpmPair& spm,
    const std::string& target_prefix,
    const std::string& tokens_prefix,
    const std::string& tokens_suffix,
    const std::vector<std::string>& texts) {
  std::vector<std::string> out;
  out.reserve(texts.size());
  std::vector<std::string> target_prefix_tokens;
  if (!target_prefix.empty()) {
    target_prefix_tokens.push_back(target_prefix);
  }
  for (const std::string& text : texts) {
    if (text.empty()) {
      out.push_back("");
      continue;
    }
    std::string source_text = text;
    if (!tokens_prefix.empty()) source_text = tokens_prefix + source_text;
    if (!tokens_suffix.empty()) source_text += tokens_suffix;
    const auto source_tokens = encode_tokens(spm.source, source_text);
    if (source_tokens.empty()) {
      std::cerr << "encode_empty text_len=" << text.size() << "\n";
      out.push_back("");
      continue;
    }
    std::string line =
        translate_tokens_once(translator, spm, source_tokens, target_prefix_tokens, target_prefix, true);
    if (line.empty()) {
      line = translate_tokens_once(
          translator, spm, source_tokens, target_prefix_tokens, target_prefix, false);
    }
    if (line.empty()) {
      std::cerr << "translate_empty tokens=" << source_tokens.size() << "\n";
    }
    out.push_back(line);
  }
  return out;
}

static std::string translate_one(const std::string& model_dir, const std::string& text) {
  SpmPair spm;
  if (!load_spm(model_dir, spm)) {
    std::cerr << "spm load failed\n";
    return "";
  }
  const std::string model_path = model_dir + "/model";
  const std::string target_prefix = read_target_prefix(model_dir);
  const std::string tokens_prefix = read_tokens_prefix(model_dir);
  const std::string tokens_suffix = read_tokens_suffix(model_dir);
  try {
    auto translator = make_translator(model_path);
    if (!translator) return "";
    const auto out = translate_with_translator(
        *translator, spm, target_prefix, tokens_prefix, tokens_suffix, {text});
    return out.empty() ? "" : out[0];
  } catch (const std::exception& e) {
    std::cerr << e.what() << "\n";
    return "";
  }
}

static std::vector<std::string> translate_batch(
    const std::string& model_dir,
    const std::vector<std::string>& texts) {
  SpmPair spm;
  if (!load_spm(model_dir, spm)) {
    std::cerr << "spm load failed\n";
    return {};
  }
  const std::string model_path = model_dir + "/model";
  const std::string target_prefix = read_target_prefix(model_dir);
  const std::string tokens_prefix = read_tokens_prefix(model_dir);
  const std::string tokens_suffix = read_tokens_suffix(model_dir);
  try {
    auto translator = make_translator(model_path);
    if (!translator) return {};
    return translate_with_translator(
        *translator, spm, target_prefix, tokens_prefix, tokens_suffix, texts);
  } catch (const std::exception& e) {
    std::cerr << e.what() << "\n";
    return {};
  }
}

int main(int argc, char** argv) {
  std::ios::sync_with_stdio(false);
  std::cout.setf(std::ios::unitbuf);

  std::string model_dir;
  std::string text;
  std::string text_b64;
  std::string batch_b64;
  bool self_test = false;

  for (int i = 1; i < argc; i++) {
    std::string arg = argv[i];
    if (arg == "--help" || arg == "-h") {
      std::cout << "nrm-argos-translate --model-dir DIR [--text-b64 B64 | --batch-b64 B64 | --self-test]\n";
      return 0;
    }
    if (arg == "--model-dir" && i + 1 < argc) {
      model_dir = argv[++i];
      continue;
    }
    if (arg == "--text" && i + 1 < argc) {
      text = argv[++i];
      continue;
    }
    if (arg == "--text-b64" && i + 1 < argc) {
      text_b64 = argv[++i];
      continue;
    }
    if (arg == "--batch-b64" && i + 1 < argc) {
      batch_b64 = argv[++i];
      continue;
    }
    if (arg == "--self-test") {
      self_test = true;
      continue;
    }
  }

  if (model_dir.empty()) {
    std::cerr << "missing --model-dir\n";
    return 2;
  }

  if (self_test) {
    const std::string out = translate_one(model_dir, "Hello");
    if (out.empty()) {
      std::cerr << "self_test_failed empty_output compute=" << g_active_compute_type << "\n";
      return 3;
    }
    std::cout << "OK:" << out;
    if (!g_active_compute_type.empty()) {
      std::cout << " compute=" << g_active_compute_type;
    }
    std::cout << "\n";
    return 0;
  }

  if (!batch_b64.empty()) {
    const std::string blob = b64_decode_text(batch_b64);
    const std::vector<std::string> inputs = split_null(blob);
    if (inputs.empty()) {
      std::cerr << "empty batch\n";
      return 2;
    }
    const std::vector<std::string> outputs = translate_batch(model_dir, inputs);
    if (outputs.size() != inputs.size()) return 3;
    std::cout << join_null(outputs);
    return 0;
  }

  if (!text_b64.empty()) {
    text = b64_decode_text(text_b64);
  }
  if (text.empty()) {
    std::cerr << "missing text\n";
    return 2;
  }

  try {
    const std::string out = translate_one(model_dir, text);
    if (out.empty()) return 3;
    std::cout << out;
    return 0;
  } catch (const std::exception& e) {
    std::cerr << e.what() << "\n";
    return 4;
  }
}
