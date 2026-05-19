// Multi2 — combinational decrypt super-round
// Applies inverse pi sequence: π4 → π3 → π2 → π1
// Each pi function is its own inverse (XOR-based Feistel), so applying
// them in reverse order undoes one encrypt super-round (π1→π2→π3→π4).
`timescale 1ns/1ps

module multi2_dec_sr (
    input  wire [31:0] L_in,    // ciphertext high word
    input  wire [31:0] R_in,    // ciphertext low word
    input  wire [31:0] wk0,     // key for π2
    input  wire [31:0] wk1,     // key for π3 (a)
    input  wire [31:0] wk2,     // key for π3 (b)
    input  wire [31:0] wk3,     // key for π4
    output wire [31:0] L_out,   // plaintext high word
    output wire [31:0] R_out    // plaintext low word
);
    // Stage 1: inverse π4 — undoes: L ^= f(R, wk3)
    wire [31:0] d4_L, d4_R;
    multi2_pi4 u_pi4 (.L_in(L_in),  .R_in(R_in),  .wk3(wk3),
                      .L_out(d4_L), .R_out(d4_R));

    // Stage 2: inverse π3 — undoes: R ^= g(L, wk1, wk2)
    wire [31:0] d3_L, d3_R;
    multi2_pi3 u_pi3 (.L_in(d4_L), .R_in(d4_R), .wk1(wk1), .wk2(wk2),
                      .L_out(d3_L), .R_out(d3_R));

    // Stage 3: inverse π2 — undoes: L ^= h(R, wk0)
    wire [31:0] d2_L, d2_R;
    multi2_pi2 u_pi2 (.L_in(d3_L), .R_in(d3_R), .wk0(wk0),
                      .L_out(d2_L), .R_out(d2_R));

    // Stage 4: inverse π1 — undoes: R ^= L
    multi2_pi1 u_pi1 (.L_in(d2_L), .R_in(d2_R),
                      .L_out(L_out), .R_out(R_out));
endmodule
