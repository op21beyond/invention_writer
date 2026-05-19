// Multi2 — combinational pi function blocks
// Matches libtomcrypt multi2.c s_pi1..s_pi4 exactly.
// All arithmetic is 32-bit unsigned (wraps naturally in Verilog).
`timescale 1ns/1ps

// ── π1: R ^= L  (no key) ────────────────────────────────────────────────────
module multi2_pi1 (
    input  wire [31:0] L_in,
    input  wire [31:0] R_in,
    output wire [31:0] L_out,
    output wire [31:0] R_out
);
    assign L_out = L_in;
    assign R_out = R_in ^ L_in;
endmodule

// ── π2: modifies L using R and wk0 ──────────────────────────────────────────
//   t0 = R + wk0
//   t1 = ROL(t0,1) + t0 - 1
//   t2 = ROL(t1,4) ^ t1
//   L ^= t2
module multi2_pi2 (
    input  wire [31:0] L_in,
    input  wire [31:0] R_in,
    input  wire [31:0] wk0,
    output wire [31:0] L_out,
    output wire [31:0] R_out
);
    wire [31:0] t0 = R_in + wk0;
    wire [31:0] t1 = {t0[30:0], t0[31]} + t0 - 1;        // ROL(t0,1)+t0-1
    wire [31:0] t2 = {t1[27:0], t1[31:28]} ^ t1;          // ROL(t1,4)^t1
    assign L_out = L_in ^ t2;
    assign R_out = R_in;
endmodule

// ── π3: modifies R using L, wk1, wk2 ────────────────────────────────────────
//   t0 = L + wk1
//   t1 = ROL(t0,2) + t0 + 1
//   t2 = ROL(t1,8) ^ t1
//   t3 = t2 + wk2
//   t4 = ROL(t3,1) - t3          [= t3 + t3[31]]
//   t5 = ROL(t4,16) ^ (L | t4)   [note: uses original L_in, not modified]
//   R ^= t5
module multi2_pi3 (
    input  wire [31:0] L_in,
    input  wire [31:0] R_in,
    input  wire [31:0] wk1,
    input  wire [31:0] wk2,
    output wire [31:0] L_out,
    output wire [31:0] R_out
);
    wire [31:0] t0 = L_in + wk1;
    wire [31:0] t1 = {t0[29:0], t0[31:30]} + t0 + 1;     // ROL(t0,2)+t0+1
    wire [31:0] t2 = {t1[23:0], t1[31:24]} ^ t1;          // ROL(t1,8)^t1
    wire [31:0] t3 = t2 + wk2;
    wire [31:0] t4 = {t3[30:0], t3[31]} - t3;             // ROL(t3,1)-t3
    wire [31:0] t5 = {t4[15:0], t4[31:16]} ^ (L_in | t4); // ROL(t4,16)^(L|t4)
    assign L_out = L_in;
    assign R_out = R_in ^ t5;
endmodule

// ── π4: modifies L using R and wk3 ──────────────────────────────────────────
//   t0 = R + wk3
//   t1 = ROL(t0,2) + t0 + 1
//   L ^= t1
module multi2_pi4 (
    input  wire [31:0] L_in,
    input  wire [31:0] R_in,
    input  wire [31:0] wk3,
    output wire [31:0] L_out,
    output wire [31:0] R_out
);
    wire [31:0] t0 = R_in + wk3;
    wire [31:0] t1 = {t0[29:0], t0[31:30]} + t0 + 1;     // ROL(t0,2)+t0+1
    assign L_out = L_in ^ t1;
    assign R_out = R_in;
endmodule
