#!/usr/bin/env python3
"""
Generate Multi2 test vectors for RTL testbench ($readmemh format).
Outputs:
  sim/vectors/ecb_tv.hex   — ECB test cases
  sim/vectors/cbc_tv.hex   — CBC test cases
  sim/vectors/ks_tv.hex    — Key schedule working-key vectors
"""
import os, sys, struct
sys.path.insert(0, os.path.dirname(__file__))
from multi2_model import key_schedule, ecb_encrypt, ecb_decrypt, cbc_encrypt, cbc_decrypt

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'sim', 'vectors')
os.makedirs(OUT_DIR, exist_ok=True)


def to_hex40(b: bytes) -> str:
    assert len(b) == 40
    return b.hex()

def to_hex8(b: bytes) -> str:
    assert len(b) == 8
    return b.hex()

def to_hex32(words: list) -> str:
    """8 uint32s → 32 bytes hex."""
    return struct.pack('>8I', *words).hex()


# ── ECB test vectors ─────────────────────────────────────────────────────────
# Line format: <sk+dk 40B> <PT 8B> <CT 8B>  (80 hex chars, 40 bytes each)
ecb_cases = []

# TV0: libtomcrypt official vector, N=128
key0 = bytes(32) + bytes.fromhex('0123456789abcdef')
pt0  = bytes.fromhex('0000000000000001')
ct0  = ecb_encrypt(pt0, key0, N=128)
assert ct0 == bytes.fromhex('f89440845e11cf89'), f"TV0 mismatch: {ct0.hex()}"
ecb_cases.append((key0, pt0, ct0, 128))

# TV1: all-zero key and plaintext
key1 = bytes(40)
pt1  = bytes(8)
ct1  = ecb_encrypt(pt1, key1, N=128)
ecb_cases.append((key1, pt1, ct1, 128))

# TV2: all-ones
key2 = bytes([0xff]*40)
pt2  = bytes([0xff]*8)
ct2  = ecb_encrypt(pt2, key2, N=128)
ecb_cases.append((key2, pt2, ct2, 128))

# TV3-TV7: random
import random; rng = random.Random(0x4942534400)
for _ in range(5):
    k = bytes([rng.randint(0,255) for _ in range(40)])
    p = bytes([rng.randint(0,255) for _ in range(8)])
    c = ecb_encrypt(p, k, N=128)
    ecb_cases.append((k, p, c, 128))

ecb_path = os.path.join(OUT_DIR, 'ecb_tv.hex')
with open(ecb_path, 'w') as f:
    f.write('// Multi2 ECB test vectors — format: key[319:0] pt[63:0] ct[63:0]\n')
    for key, pt, ct, _ in ecb_cases:
        f.write(f'{key.hex()}{pt.hex()}{ct.hex()}\n')
print(f"Written {len(ecb_cases)} ECB vectors → {ecb_path}")

# Verify decrypt for each case
for i, (key, pt, ct, N) in enumerate(ecb_cases):
    pt_d = ecb_decrypt(ct, key, N=N)
    assert pt_d == pt, f"ECB TV{i} decrypt mismatch"
print("  All ECB round-trip checks passed.")


# ── Key schedule vectors ─────────────────────────────────────────────────────
# Line format: <sk+dk 40B> <uk[0..7] 32B>  (72 hex chars)
ks_path = os.path.join(OUT_DIR, 'ks_tv.hex')
with open(ks_path, 'w') as f:
    f.write('// Multi2 key schedule vectors — format: key[319:0] uk[255:0]\n')
    for key, pt, ct, _ in ecb_cases:
        uk = key_schedule(key)
        f.write(f'{key.hex()}{to_hex32(uk)}\n')
print(f"Written {len(ecb_cases)} key schedule vectors → {ks_path}")


# ── CBC test vectors ─────────────────────────────────────────────────────────
# Line format (per block): <sk+dk 40B> <iv 8B> <ct 8B> <pt 8B>
cbc_path = os.path.join(OUT_DIR, 'cbc_tv.hex')
cbc_sequences = []

for seq_i in range(3):
    key_c = bytes([rng.randint(0,255) for _ in range(40)])
    iv_c  = bytes([rng.randint(0,255) for _ in range(8)])
    pt_c  = [bytes([rng.randint(0,255) for _ in range(8)]) for _ in range(6)]
    ct_c  = cbc_encrypt(pt_c, key_c, iv_c, N=128)
    # Verify
    pt_d = cbc_decrypt(ct_c, key_c, iv_c, N=128)
    assert pt_d == pt_c, f"CBC seq {seq_i} mismatch"
    cbc_sequences.append((key_c, iv_c, pt_c, ct_c))

with open(cbc_path, 'w') as f:
    f.write('// Multi2 CBC vectors — format per block: key[319:0] iv[63:0] ct[63:0] pt[63:0]\n')
    for key_c, iv_c, pt_c, ct_c in cbc_sequences:
        for pt_blk, ct_blk in zip(pt_c, ct_c):
            # iv field: use the actual per-block IV (previous ciphertext or initial IV)
            # For simplicity, provide the sequence IV; testbench chains internally
            f.write(f'{key_c.hex()}{iv_c.hex()}{ct_blk.hex()}{pt_blk.hex()}\n')
print(f"Written {sum(len(s[2]) for s in cbc_sequences)} CBC block vectors → {cbc_path}")
print("  All CBC round-trip checks passed.")

print("\nDone. All vectors generated and verified.")
