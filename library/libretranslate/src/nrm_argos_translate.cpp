#include <ctranslate2/translator.h>
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
  // Android NDK 빌드는 INT8 가속 백엔드가 없다. FLOAT32만 사용한다.
  const ctranslate2::ComputeType candidates[] = {
      ctranslate2::ComputeType::FLOAT32,
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
      return translator;
    } catch (const std::exception& e) {
      std::cerr << "translator init failed (" << compute_type_name(compute_type)
                << "): " << e.what() << "\n";
    }
  }
  return nullptr;
}

static std::vector<std::string> translate_with_translator(
    ctranslate2::Translator& translator,
    const SpmPair& spm,
    const std::vector<std::string>& texts) {
  std::vector<std::string> out;
  out.reserve(texts.size());
  for (const std::string& text : texts) {
    if (text.empty()) {
      out.push_back("");
      continue;
    }
    std::vector<std::string> source_tokens;
    spm.source.Encode(text, &source_tokens);
    if (source_tokens.empty()) {
      out.push_back("");
      continue;
    }
    const auto results = translator.translate_batch({source_tokens});
    if (results.empty() || results[0].hypotheses.empty()) {
      out.push_back("");
      continue;
    }
    std::string line;
    spm.target.Decode(results[0].hypotheses[0], &line);
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
  try {
    auto translator = make_translator(model_path);
    if (!translator) return "";
    const auto out = translate_with_translator(*translator, spm, {text});
    return out.empty() ? "" : out[0];
  } catch (const std::exception& e) {
    std::cerr << e.what() << "\n";
    return "";
  }
}

static std::vector<std::string> translate_batch(const std::string& model_dir,
                                                const std::vector<std::string>& texts) {
  SpmPair spm;
  if (!load_spm(model_dir, spm)) {
    std::cerr << "spm load failed\n";
    return {};
  }
  const std::string model_path = model_dir + "/model";
  try {
    auto translator = make_translator(model_path);
    if (!translator) return {};
    return translate_with_translator(*translator, spm, texts);
  } catch (const std::exception& e) {
    std::cerr << e.what() << "\n";
    return {};
  }
}

int main(int argc, char** argv) {
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
      std::cerr << "self_test_failed empty_output\n";
      return 3;
    }
    std::cout << "OK\n";
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
