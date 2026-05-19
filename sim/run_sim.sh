#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "=== Compiling Multi2 RTL ==="
iverilog -g2001 -Wall \
    -o sim.vvp \
    -I ../rtl \
    ../rtl/multi2_pi.v \
    ../rtl/multi2_dec_sr.v \
    ../rtl/multi2_keysched.v \
    ../rtl/multi2_core.v \
    ../rtl/multi2_cbc_dec.v \
    multi2_tb.v

echo "=== Running simulation ==="
vvp sim.vvp

echo "=== Done ==="
