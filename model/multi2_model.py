#!/usr/bin/env python3
"""
Multi2 cipher golden model — matches libtomcrypt multi2.c exactly.
Reference for RTL verification of ISDB-T/S descrambling.

Block: 64-bit = p[0] (high 32 bits) || p[1] (low 32 bits), big-endian.
Key:   40 bytes = sk[0..7] (32 B system key) + dk[0..1] (8 B data key).
N:     Individual pi-function count. ISDB uses N=128 (=32 super-rounds).
"""
import struct

M = 0xFFFFFFFF  # 32-bit mask


def rol32(x: int, n: int) -> int:
    n &= 31
    return ((x << n) | (x >> (32 - n))) & M


# ── Pi functions (each is its own inverse for Feistel decryption) ──────────

def pi1(p):
    p[1] = (p[1] ^ p[0]) & M


def pi2(p, k, ki=0):
    """Modifies p[0] using p[1] and k[ki]."""
    t = (p[1] + k[ki]) & M
    t = (rol32(t, 1) + t - 1) & M
    t = (rol32(t, 4) ^ t) & M
    p[0] = (p[0] ^ t) & M


def pi3(p, k, ki=0):
    """Modifies p[1] using p[0] and k[ki+1], k[ki+2]."""
    t = (p[0] + k[ki + 1]) & M
    t = (rol32(t, 2) + t + 1) & M
    t = (rol32(t, 8) ^ t) & M
    t = (t + k[ki + 2]) & M
    t = (rol32(t, 1) - t) & M
    t = (rol32(t, 16) ^ (p[0] | t)) & M
    p[1] = (p[1] ^ t) & M


def pi4(p, k, ki=0):
    """Modifies p[0] using p[1] and k[ki+3]."""
    t = (p[1] + k[ki + 3]) & M
    t = (rol32(t, 2) + t + 1) & M
    p[0] = (p[0] ^ t) & M


# ── Key schedule ────────────────────────────────────────────────────────────

def key_schedule(key_bytes: bytes) -> list:
    """
    Returns uk[0..7], the 8 working keys (uint32 list).
    key_bytes layout (big-endian uint32s):
      bytes  0-31 : sk[0..7]  system key
      bytes 32-39 : dk[0..1]  data key
    """
    words = struct.unpack('>10I', key_bytes)
    sk = list(words[:8])
    dk = list(words[8:])

    p = [dk[0], dk[1]]
    uk = [0] * 8
    n = 0

    # Phase 1: use sk[0..3] (ki=0)
    pi1(p)
    pi2(p, sk, 0);  uk[n] = p[0]; n += 1
    pi3(p, sk, 0);  uk[n] = p[1]; n += 1
    pi4(p, sk, 0);  uk[n] = p[0]; n += 1
    pi1(p);         uk[n] = p[1]; n += 1

    # Phase 2: use sk[4..7] (ki=4)
    pi2(p, sk, 4);  uk[n] = p[0]; n += 1
    pi3(p, sk, 4);  uk[n] = p[1]; n += 1
    pi4(p, sk, 4);  uk[n] = p[0]; n += 1
    pi1(p);         uk[n] = p[1]

    return uk


# ── ECB mode ────────────────────────────────────────────────────────────────

def ecb_encrypt(pt_bytes: bytes, key_bytes: bytes, N: int = 128) -> bytes:
    """N = individual pi-function count. ISDB default: 128."""
    p = list(struct.unpack('>2I', pt_bytes))
    uk = key_schedule(key_bytes)

    t = 0
    n = 0
    while True:
        pi1(p);         n += 1;  # noqa
        if n == N: break
        pi2(p, uk, t);  n += 1
        if n == N: break
        pi3(p, uk, t);  n += 1
        if n == N: break
        pi4(p, uk, t);  n += 1
        if n == N: break
        t ^= 4

    return struct.pack('>2I', *p)


def ecb_decrypt(ct_bytes: bytes, key_bytes: bytes, N: int = 128) -> bytes:
    p = list(struct.unpack('>2I', ct_bytes))
    uk = key_schedule(key_bytes)

    # Initial key group matches last group used during encryption
    t = 4 * (((N - 1) >> 2) & 1)
    n = N

    while True:
        r = n if n <= 4 else ((n - 1) % 4) + 1
        if r == 0:
            break
        if r >= 4: pi4(p, uk, t); n -= 1
        if r >= 3: pi3(p, uk, t); n -= 1
        if r >= 2: pi2(p, uk, t); n -= 1
        if r >= 1: pi1(p);        n -= 1
        if n == 0:
            break
        t ^= 4

    return struct.pack('>2I', *p)


# ── CBC mode (ISDB uses CBC with 8-byte IV) ─────────────────────────────────

def cbc_encrypt(pt_blocks: list, key_bytes: bytes, iv_bytes: bytes,
                N: int = 128) -> list:
    ct_blocks = []
    prev = iv_bytes
    for pt in pt_blocks:
        blk = bytes(a ^ b for a, b in zip(pt, prev))
        ct = ecb_encrypt(blk, key_bytes, N)
        ct_blocks.append(ct)
        prev = ct
    return ct_blocks


def cbc_decrypt(ct_blocks: list, key_bytes: bytes, iv_bytes: bytes,
                N: int = 128) -> list:
    pt_blocks = []
    prev = iv_bytes
    for ct in ct_blocks:
        ecb_pt = ecb_decrypt(ct, key_bytes, N)
        pt = bytes(a ^ b for a, b in zip(ecb_pt, prev))
        pt_blocks.append(pt)
        prev = ct
    return pt_blocks


# ── Self-test ────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    import os
    pass_cnt = fail_cnt = 0

    def chk(label, got, exp):
        global pass_cnt, fail_cnt
        ok = got == exp
        status = 'PASS' if ok else 'FAIL'
        print(f"  {status}  {label}")
        if not ok:
            print(f"        got: {got.hex()}")
            print(f"        exp: {exp.hex()}")
            fail_cnt += 1
        else:
            pass_cnt += 1

    print("=== libtomcrypt test vector 1 (N=128) ===")
    key1 = bytes(32) + bytes.fromhex('0123456789abcdef')
    pt1  = bytes.fromhex('0000000000000001')
    ct1e = bytes.fromhex('f89440845e11cf89')

    ct1 = ecb_encrypt(pt1, key1, N=128)
    chk('encrypt', ct1, ct1e)
    pt1d = ecb_decrypt(ct1e, key1, N=128)
    chk('decrypt', pt1d, pt1)

    print("\n=== round-trip tests (random) ===")
    for _ in range(8):
        k = os.urandom(40)
        p = os.urandom(8)
        c = ecb_encrypt(p, k, N=128)
        r = ecb_decrypt(c, k, N=128)
        chk('ecb round-trip', r, p)

    print("\n=== CBC round-trip (4 blocks) ===")
    key_cbc = os.urandom(40)
    iv_cbc  = os.urandom(8)
    pt_cbc  = [os.urandom(8) for _ in range(4)]
    ct_cbc  = cbc_encrypt(pt_cbc, key_cbc, iv_cbc, N=128)
    pt_cbc2 = cbc_decrypt(ct_cbc, key_cbc, iv_cbc, N=128)
    for i in range(4):
        chk(f'cbc block {i}', pt_cbc2[i], pt_cbc[i])

    print(f"\nResult: {pass_cnt} passed, {fail_cnt} failed")
