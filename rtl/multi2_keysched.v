// Multi2 — key schedule FSM
// Converts 40-byte key (sk[0..7] + dk[0..1]) into 8 working keys uk[0..7].
// Matches libtomcrypt s_setup(): 9 sequential pi-function applications.
//
// Timing: assert start → 9 clock cycles → done pulses high for 1 cycle, uk valid.
// Bit ordering: sk[255:224]=sk_word[0], uk[255:224]=uk_word[0] (big-endian).
`timescale 1ns/1ps

module multi2_keysched (
    input  wire        clk,
    input  wire        rst_n,
    input  wire        start,
    input  wire [255:0] sk,     // system key, word0 in [255:224]
    input  wire  [63:0] dk,     // data key, word0 in [63:32]
    output wire [255:0] uk,     // working keys, word0 in [255:224]
    output reg          done
);
    // ── State encoding ────────────────────────────────────────────────────────
    localparam [3:0]
        S_IDLE = 4'd0,
        S_PI1A = 4'd1,
        S_PI2A = 4'd2,
        S_PI3A = 4'd3,
        S_PI4A = 4'd4,
        S_PI1B = 4'd5,
        S_PI2B = 4'd6,
        S_PI3B = 4'd7,
        S_PI4B = 4'd8,
        S_PI1C = 4'd9;

    reg [3:0]  state;
    reg [31:0] p0, p1;

    // Individual working key registers
    reg [31:0] uk0, uk1, uk2, uk3, uk4, uk5, uk6, uk7;
    assign uk = {uk0, uk1, uk2, uk3, uk4, uk5, uk6, uk7};

    // ── System key word extraction ────────────────────────────────────────────
    wire [31:0] sk0 = sk[255:224], sk1 = sk[223:192], sk2 = sk[191:160],
                sk3 = sk[159:128], sk4 = sk[127: 96], sk5 = sk[ 95: 64],
                sk6 = sk[ 63: 32], sk7 = sk[ 31:  0];

    // ── Combinational pi outputs (driven by current p0, p1) ──────────────────
    wire [31:0] pi1_L,  pi1_R;
    wire [31:0] pi2a_L, pi2a_R;
    wire [31:0] pi3a_L, pi3a_R;
    wire [31:0] pi4a_L, pi4a_R;
    wire [31:0] pi2b_L, pi2b_R;
    wire [31:0] pi3b_L, pi3b_R;
    wire [31:0] pi4b_L, pi4b_R;

    multi2_pi1 u_pi1  (.L_in(p0), .R_in(p1), .L_out(pi1_L),  .R_out(pi1_R));
    multi2_pi2 u_pi2a (.L_in(p0), .R_in(p1), .wk0(sk0),
                       .L_out(pi2a_L), .R_out(pi2a_R));
    multi2_pi3 u_pi3a (.L_in(p0), .R_in(p1), .wk1(sk1), .wk2(sk2),
                       .L_out(pi3a_L), .R_out(pi3a_R));
    multi2_pi4 u_pi4a (.L_in(p0), .R_in(p1), .wk3(sk3),
                       .L_out(pi4a_L), .R_out(pi4a_R));
    multi2_pi2 u_pi2b (.L_in(p0), .R_in(p1), .wk0(sk4),
                       .L_out(pi2b_L), .R_out(pi2b_R));
    multi2_pi3 u_pi3b (.L_in(p0), .R_in(p1), .wk1(sk5), .wk2(sk6),
                       .L_out(pi3b_L), .R_out(pi3b_R));
    multi2_pi4 u_pi4b (.L_in(p0), .R_in(p1), .wk3(sk7),
                       .L_out(pi4b_L), .R_out(pi4b_R));

    // ── Sequential FSM ────────────────────────────────────────────────────────
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state <= S_IDLE;
            p0 <= 0; p1 <= 0;
            {uk0,uk1,uk2,uk3,uk4,uk5,uk6,uk7} <= 0;
            done <= 0;
        end else begin
            done <= 0;
            case (state)
                S_IDLE: if (start) begin
                    p0    <= dk[63:32];
                    p1    <= dk[31: 0];
                    state <= S_PI1A;
                end
                S_PI1A: begin        // apply π1, no extraction
                    p0 <= pi1_L; p1 <= pi1_R;
                    state <= S_PI2A;
                end
                S_PI2A: begin        // apply π2(sk[0]), uk[0]=new p[0]
                    p0 <= pi2a_L; p1 <= pi2a_R;
                    uk0 <= pi2a_L;
                    state <= S_PI3A;
                end
                S_PI3A: begin        // apply π3(sk[1],sk[2]), uk[1]=new p[1]
                    p0 <= pi3a_L; p1 <= pi3a_R;
                    uk1 <= pi3a_R;
                    state <= S_PI4A;
                end
                S_PI4A: begin        // apply π4(sk[3]), uk[2]=new p[0]
                    p0 <= pi4a_L; p1 <= pi4a_R;
                    uk2 <= pi4a_L;
                    state <= S_PI1B;
                end
                S_PI1B: begin        // apply π1, uk[3]=new p[1]
                    p0 <= pi1_L; p1 <= pi1_R;
                    uk3 <= pi1_R;
                    state <= S_PI2B;
                end
                S_PI2B: begin        // apply π2(sk[4]), uk[4]=new p[0]
                    p0 <= pi2b_L; p1 <= pi2b_R;
                    uk4 <= pi2b_L;
                    state <= S_PI3B;
                end
                S_PI3B: begin        // apply π3(sk[5],sk[6]), uk[5]=new p[1]
                    p0 <= pi3b_L; p1 <= pi3b_R;
                    uk5 <= pi3b_R;
                    state <= S_PI4B;
                end
                S_PI4B: begin        // apply π4(sk[7]), uk[6]=new p[0]
                    p0 <= pi4b_L; p1 <= pi4b_R;
                    uk6 <= pi4b_L;
                    state <= S_PI1C;
                end
                S_PI1C: begin        // apply π1, uk[7]=new p[1]; done
                    p0 <= pi1_L; p1 <= pi1_R;
                    uk7 <= pi1_R;
                    done  <= 1;
                    state <= S_IDLE;
                end
                default: state <= S_IDLE;
            endcase
        end
    end
endmodule
