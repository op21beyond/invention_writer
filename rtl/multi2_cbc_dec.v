// Multi2 CBC decryption — top-level module for ISDB TS descrambling.
//
// Usage flow:
//   1. Assert key_valid with sk, dk, iv → runs 9-cycle key schedule.
//   2. After busy falls, feed ciphertext blocks via blk_valid/ct_blk.
//   3. pt_blk/pt_valid output plaintext (32-cycle latency per block).
//   4. Assert key_valid again any time (odd/even key switch in ISDB).
//
// Back-to-back throughput: 1 block per N_SUPER cycles after key setup.
`timescale 1ns/1ps

module multi2_cbc_dec #(
    parameter N_SUPER = 32
) (
    input  wire        clk,
    input  wire        rst_n,

    // Key/IV loading
    input  wire        key_valid,
    input  wire [255:0] sk,
    input  wire  [63:0] dk,
    input  wire  [63:0] iv,

    // Block streaming
    input  wire        blk_valid,
    input  wire  [63:0] ct_blk,
    output reg         pt_valid,
    output reg   [63:0] pt_blk,

    output wire        busy
);
    // ── Sub-module instances ──────────────────────────────────────────────────
    reg         ks_start;
    reg  [255:0] sk_reg;
    reg   [63:0] dk_reg;
    wire [255:0] uk;
    wire         ks_done;

    multi2_keysched u_ks (
        .clk(clk), .rst_n(rst_n),
        .start(ks_start), .sk(sk_reg), .dk(dk_reg),
        .uk(uk), .done(ks_done)
    );

    reg        core_start;
    reg [63:0] ct_reg;
    wire [63:0] pt_raw;
    wire        core_done;

    multi2_core #(.N_SUPER(N_SUPER)) u_core (
        .clk(clk), .rst_n(rst_n),
        .start(core_start), .ct_in(ct_reg), .uk(uk),
        .pt_out(pt_raw), .done(core_done)
    );

    // ── CBC state ─────────────────────────────────────────────────────────────
    reg [63:0] ct_prev;   // previous ciphertext block (or IV)

    // ── Top FSM ───────────────────────────────────────────────────────────────
    localparam [2:0]
        S_IDLE    = 3'd0,
        S_KEYSCHED= 3'd1,
        S_READY   = 3'd2,
        S_DECRYPT = 3'd3,
        S_OUTPUT  = 3'd4;

    reg [2:0] state;

    assign busy = (state == S_KEYSCHED) || (state == S_DECRYPT);

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state      <= S_IDLE;
            ks_start   <= 0;
            core_start <= 0;
            pt_valid   <= 0;
            pt_blk     <= 0;
            ct_prev    <= 0;
            sk_reg     <= 0; dk_reg <= 0; ct_reg <= 0;
        end else begin
            ks_start   <= 0;
            core_start <= 0;
            pt_valid   <= 0;

            case (state)
                S_IDLE: begin
                    if (key_valid) begin
                        sk_reg   <= sk;
                        dk_reg   <= dk;
                        ct_prev  <= iv;
                        ks_start <= 1;
                        state    <= S_KEYSCHED;
                    end
                end

                S_KEYSCHED: begin
                    if (ks_done)
                        state <= S_READY;
                end

                S_READY: begin
                    if (key_valid) begin
                        // Odd/even key refresh
                        sk_reg   <= sk;
                        dk_reg   <= dk;
                        ct_prev  <= iv;
                        ks_start <= 1;
                        state    <= S_KEYSCHED;
                    end else if (blk_valid) begin
                        ct_reg     <= ct_blk;
                        core_start <= 1;
                        state      <= S_DECRYPT;
                    end
                end

                S_DECRYPT: begin
                    if (core_done) begin
                        pt_blk   <= pt_raw ^ ct_prev;
                        ct_prev  <= ct_reg;
                        pt_valid <= 1;
                        state    <= S_OUTPUT;
                    end
                end

                S_OUTPUT: begin
                    // pt_valid held high for one cycle; check for next block
                    if (blk_valid) begin
                        ct_reg     <= ct_blk;
                        core_start <= 1;
                        state      <= S_DECRYPT;
                    end else if (key_valid) begin
                        sk_reg   <= sk;
                        dk_reg   <= dk;
                        ct_prev  <= iv;
                        ks_start <= 1;
                        state    <= S_KEYSCHED;
                    end else begin
                        state <= S_READY;
                    end
                end

                default: state <= S_IDLE;
            endcase
        end
    end
endmodule
