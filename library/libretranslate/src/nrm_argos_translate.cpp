#include <ctranslate2/translator.h>
#include <sentencepiece_processor.h>

#include <cstdlib>
#include <fstream>
#include <iostream>
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

static std::string translate_one(const std::string& model_dir, const std::string& text) {
  const std::string model_path = model_dir + "/model";
  const std::string source_spm = model_dir + "/source.spm";
  const std::string target_spm = model_dir + "/target.spm";

  sentencepiece::SentencePieceProcessor source_sp;
  sentencepiece::SentencePieceProcessor target_sp;
  if (!source_sp.Load(source_spm).ok() || !target_sp.Load(target_spm).ok()) {
    std::cerr << "spm load failed\n";
    return "";
  }

  ctranslate2::Translator translator(model_path, ctranslate2::Device::CPU,
                                     ctranslate2::ComputeType::INT8);
  std::vector<std::string> source_tokens;
  source_sp.Encode(text, &source_tokens);
  if (source_tokens.empty()) return "";

  const auto results = translator.translate_batch({source_tokens});
  if (results.empty() || results[0].hypotheses.empty()) return "";

  std::string out;
  target_sp.Decode(results[0].hypotheses[0], &out);
  return out;
}

int main(int argc, char** argv) {
  std::string model_dir;
  std::string text;
  std::string text_b64;

  for (int i = 1; i < argc; i++) {
    std::string arg = argv[i];
    if (arg == "--help" || arg == "-h") {
      std::cout << "nrm-argos-translate --model-dir DIR --text-b64 B64\n";
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
  }

  if (!text_b64.empty()) {
    text = b64_decode_text(text_b64);
  }
  if (model_dir.empty() || text.empty()) {
    std::cerr << "missing --model-dir or text\n";
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
