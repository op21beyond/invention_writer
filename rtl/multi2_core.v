// Multi2 — ECB decrypt iterative core
// Applies N_SUPER inverse super-rounds (π4→π3→π2→π1) to one 64-bit block.
// Key alternates: uk[0..3] and uk[4..7] per the libtomcrypt decrypt loop.
//
// For ISDB: N_SUPER=32 (= libtomcrypt N=128 individual pi operations).
// Key selection for decrypt round i (i counts from 0 upward):
//   key group = T_INIT_BIT XOR (i & 1)
//   T_INIT_BIT = (N_SUPER-1)[0]   (= 1 for even N_SUPER, e.g. 32)
//   => For N_SUPER=32: group = 1 XOR (i & 1), i.e. uk[4..7] first, uk[0..3] next.
//
// Timing: start → N_SUPER cycles → done pulses high for 1 cycle, pt_out valid.
`timescale 1ns/1ps

module multi2_core #(
    parameter N_SUPER = 32    // super-rounds; must match key schedule intent
) (
    input  wire        clk,
    input  wire        rst_n,
    input  wire        start,
    input  wire  [63:0] ct_in,
    input  wire [255:0] uk,       // working keys from keysched (word0 in [255:224])
    output reg   [63:0] pt_out,
    output reg          done
);
    // ── Counter width ─────────────────────────────────────────────────────────
    localparam CNT_W = $clog2(N_SUPER);
    localparam [CNT_W-1:0] INIT_CNT = N_SUPER - 1;

    // T_INIT_BIT: 1 for even N_SUPER (selects uk[4..7] as first decrypt group)
    localparam T_INIT_BIT = (N_SUPER - 1) & 1;

    reg [CNT_W-1:0] r_cnt;
    reg [31:0] cur_L, cur_R;
    reg running;

    // ── Working key extraction ────────────────────────────────────────────────
    wire [31:0] uk0 = uk[255:224], uk1 = uk[223:192],
                uk2 = uk[191:160], uk3 = uk[159:128],
                uk4 = uk[127: 96], uk5 = uk[ 95: 64],
                uk6 = uk[ 63: 32], uk7 = uk[ 31:  0];

    // Key group selection:
    // step i = (INIT_CNT - r_cnt), i[0] = step parity
    // key_sel = T_INIT_BIT ^ (i & 1) = T_INIT_BIT ^ (INIT_CNT ^ r_cnt)[0]
    // Simplified for N_SUPER even (T_INIT_BIT=1): key_sel = r_cnt[0]
    wire key_sel = T_INIT_BIT ^ (INIT_CNT[0] ^ r_cnt[0]);

    wire [31:0] dec_wk0 = key_sel ? uk4 : uk0;
    wire [31:0] dec_wk1 = key_sel ? uk5 : uk1;
    wire [31:0] dec_wk2 = key_sel ? uk6 : uk2;
    wire [31:0] dec_wk3 = key_sel ? uk7 : uk3;

    // ── Combinational decrypt super-round ─────────────────────────────────────
    wire [31:0] dec_L, dec_R;
    multi2_dec_sr u_dec (
        .L_in(cur_L), .R_in(cur_R),
        .wk0(dec_wk0), .wk1(dec_wk1), .wk2(dec_wk2), .wk3(dec_wk3),
        .L_out(dec_L), .R_out(dec_R)
    );

    // ── FSM ───────────────────────────────────────────────────────────────────
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            running <= 0; done <= 0;
            cur_L <= 0; cur_R <= 0; pt_out <= 0;
            r_cnt <= 0;
        end else begin
            done <= 0;
            if (!running) begin
                if (start) begin
                    cur_L   <= ct_in[63:32];
                    cur_R   <= ct_in[31: 0];
                    r_cnt   <= INIT_CNT;
                    running <= 1;
                end
            end else begin
                cur_L <= dec_L;
                cur_R <= dec_R;
                if (r_cnt == 0) begin
                    pt_out  <= {dec_L, dec_R};
                    done    <= 1;
                    running <= 0;
                end else begin
                    r_cnt <= r_cnt - 1;
                end
            end
        end
    end
endmodule
