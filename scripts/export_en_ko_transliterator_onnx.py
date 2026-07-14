#!/usr/bin/env python3
"""Export eunsour/en-ko-transliterator → Android ONNX package.

Outputs under library/en-ko-transliterator/_bin/:
  encoder.onnx, decoder.onnx, spiece.model, unigram_pieces.tsv, tokenizer_meta.json
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import torch
from transformers import AutoModelForSeq2SeqLM, T5Tokenizer


def dump_unigram_pieces(tokenizer, out_path: Path) -> None:
    """Export SentencePiece pieces + scores for Kotlin Unigram encoder.

    Format (v2): id \\t score \\t json_string_piece
    Plain TSV of raw pieces breaks on U+0085/NUL/newline → off-by-one IDs (Android probe garbage).
    """
    sp = getattr(tokenizer, "sp_model", None)
    if sp is None:
        from sentencepiece import SentencePieceProcessor

        sp = SentencePieceProcessor()
        cand = Path(tokenizer.name_or_path) / "spiece.model"
        if not cand.is_file():
            raise SystemExit(f"spiece.model not found near {tokenizer.name_or_path}")
        sp.Load(str(cand))

    n = int(sp.GetPieceSize())
    lines = ["# en-ko-unigram-v2 id\\tscore\\tjson_piece"]
    for i in range(n):
        piece = sp.IdToPiece(i)
        try:
            score = float(sp.GetScore(i))
        except Exception:
            score = -999.0
        # JSON string is resilient to control chars / tabs / newlines
        lines.append(f"{i}\t{score}\t{json.dumps(piece, ensure_ascii=True)}")
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"unigram_pieces.tsv pieces={n} format=v2 -> {out_path}")


def export_onnx(model, out_dir: Path, seq_len: int = 32) -> None:
    model.eval()
    device = torch.device("cpu")
    model.to(device)

    # Encoder wrapper
    class EncoderWrapper(torch.nn.Module):
        def __init__(self, m):
            super().__init__()
            self.m = m

        def forward(self, input_ids, attention_mask):
            out = self.m.get_encoder()(
                input_ids=input_ids,
                attention_mask=attention_mask,
                return_dict=True,
            )
            return out.last_hidden_state

    # Decoder one-step: returns logits for whole decoder sequence
    class DecoderWrapper(torch.nn.Module):
        def __init__(self, m):
            super().__init__()
            self.m = m

        def forward(self, decoder_input_ids, encoder_hidden_states, encoder_attention_mask):
            out = self.m(
                decoder_input_ids=decoder_input_ids,
                encoder_outputs=(encoder_hidden_states,),
                attention_mask=encoder_attention_mask,
                use_cache=False,
                return_dict=True,
            )
            return out.logits

    enc = EncoderWrapper(model).eval()
    dec = DecoderWrapper(model).eval()

    input_ids = torch.ones(1, seq_len, dtype=torch.long)
    attention = torch.ones(1, seq_len, dtype=torch.long)
    enc_path = out_dir / "encoder.onnx"
    torch.onnx.export(
        enc,
        (input_ids, attention),
        str(enc_path),
        input_names=["input_ids", "attention_mask"],
        output_names=["last_hidden_state"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "src_len"},
            "attention_mask": {0: "batch", 1: "src_len"},
            "last_hidden_state": {0: "batch", 1: "src_len"},
        },
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,
    )
    print(f"encoder.onnx -> {enc_path} ({enc_path.stat().st_size})")

    # Encoder hidden for decoder example
    with torch.no_grad():
        hidden = enc(input_ids, attention)
    dec_ids = torch.ones(1, 8, dtype=torch.long)
    enc_mask = attention
    dec_path = out_dir / "decoder.onnx"
    torch.onnx.export(
        dec,
        (dec_ids, hidden, enc_mask),
        str(dec_path),
        input_names=["decoder_input_ids", "encoder_hidden_states", "encoder_attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "decoder_input_ids": {0: "batch", 1: "tgt_len"},
            "encoder_hidden_states": {0: "batch", 1: "src_len"},
            "encoder_attention_mask": {0: "batch", 1: "src_len"},
            "logits": {0: "batch", 1: "tgt_len"},
        },
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,
    )
    print(f"decoder.onnx -> {dec_path} ({dec_path.stat().st_size})")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--model",
        default=str(
            Path(__file__).resolve().parents[1]
            / "library"
            / "en-ko-transliterator"
            / "_hf"
        ),
    )
    ap.add_argument(
        "--out",
        default=str(
            Path(__file__).resolve().parents[1]
            / "library"
            / "en-ko-transliterator"
            / "_bin"
        ),
    )
    args = ap.parse_args()
    model_dir = Path(args.model)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"load tokenizer/model from {model_dir}")
    tokenizer = T5Tokenizer.from_pretrained(str(model_dir))
    model = AutoModelForSeq2SeqLM.from_pretrained(str(model_dir))

    # Sanity
    enc = tokenizer("hello", return_tensors="pt")
    with torch.no_grad():
        gen = model.generate(**enc, max_new_tokens=16)
    print("sanity:", tokenizer.batch_decode(gen, skip_special_tokens=True))

    spiece_src = model_dir / "spiece.model"
    if spiece_src.is_file():
        shutil.copy2(spiece_src, out_dir / "spiece.model")

    meta = {
        "pad_token_id": int(getattr(model.config, "pad_token_id", 0) or 0),
        "eos_token_id": int(getattr(model.config, "eos_token_id", 1) or 1),
        "unk_token_id": int(getattr(tokenizer, "unk_token_id", 2) or 2),
        "decoder_start_token_id": int(
            getattr(model.config, "decoder_start_token_id", 0) or 0
        ),
        "model_id": "eunsour/en-ko-transliterator",
        "d_model": int(getattr(model.config, "d_model", 768)),
        "pieces_format": "v2_id_score_json",
        "append_eos_on_encode": True,
    }
    (out_dir / "tokenizer_meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # Prefer loading SP from copied file
    class _Tok:  # noqa: N801
        name_or_path = str(out_dir)
        sp_model = getattr(tokenizer, "sp_model", None)

    dump_unigram_pieces(_Tok if _Tok.sp_model is not None else tokenizer, out_dir / "unigram_pieces.tsv")
    export_onnx(model, out_dir)

    # Dynamic INT8 — 기기·GitHub Release 용 (원본 FP32는 수 GB)
    try:
        from onnxruntime.quantization import QuantType, quantize_dynamic

        for name in ("encoder", "decoder"):
            src = out_dir / f"{name}.onnx"
            tmp = out_dir / f"{name}.int8.onnx"
            print(f"quantize {src.name} ...")
            quantize_dynamic(
                model_input=str(src),
                model_output=str(tmp),
                weight_type=QuantType.QInt8,
            )
            src.unlink(missing_ok=True)
            tmp.rename(src)
            print(f"  -> {src} ({src.stat().st_size})")
    except Exception as e:
        print(f"WARN quantize skipped: {e}")

    print("OK export complete:", out_dir)


if __name__ == "__main__":
    main()
