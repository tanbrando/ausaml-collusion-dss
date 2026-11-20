"""Contract-compliant Mock Provider (tách biệt khỏi ModelRegistry cho chế độ USE_MOCK_ENGINE=true)."""

from typing import Any, Dict, List

from ..schemas import EvidencePath, HardNegativeShowcaseItem, PairwiseSummary


def get_default_hard_negative_showcase() -> List[HardNegativeShowcaseItem]:
    return [
        HardNegativeShowcaseItem(
            pair_id="CUST_40111__CUST_45822",
            source="CUST_40111",
            target="CUST_45822",
            scenario_type="TYPE_1_AML_AML_DIFF_CASE",
            ground_truth_label=0,
            ck_gcn_score=0.7140,
            ck_gat_score=0.6620,
            hybrid_v3_score=0.2610,
            explanation_vi=(
                "Bẫy Type 1: Cả 2 khách hàng đều có cờ AML cao nên GCN/GAT thuần bị cộng hưởng "
                "nhầm là đồng phạm (> 0.66). Hybrid v4 dùng 24d Pairwise Structural Features phát hiện "
                "2 nút hoàn toàn không có đường đi chung và hạ xác suất về 26.1% (Lọc đúng)."
            ),
        ),
        HardNegativeShowcaseItem(
            pair_id="CUST_05120__CUST_05188",
            source="CUST_05120",
            target="CUST_05188",
            scenario_type="TYPE_4_SHARED_IP_DEVICE",
            ground_truth_label=0,
            ck_gcn_score=0.6290,
            ck_gat_score=0.5810,
            hybrid_v3_score=0.1180,
            explanation_vi=(
                "Bẫy Type 4: Hai khách hàng sạch tình cờ dùng chung 1 địa chỉ IP công cộng bậc cao. "
                "Hybrid v4 giảm trọng số qua Adamic-Adar 1/log(1+deg) và GINEConv để hạ điểm xuống 11.8%."
            ),
        ),
        HardNegativeShowcaseItem(
            pair_id="CUST_41009__CUST_45822",
            source="CUST_41009",
            target="CUST_45822",
            scenario_type="TYPE_1_AML_AML_DIFF_CASE",
            ground_truth_label=0,
            ck_gcn_score=0.6845,
            ck_gat_score=0.6190,
            hybrid_v3_score=0.2980,
            explanation_vi=(
                "Bẫy Type 1: Thuộc 2 kịch bản Smurfing tách rời; GCN đẩy xác suất 68.5% (dương giả) "
                "trong khi Hybrid v4 giữ dưới ngưỡng 56.8%."
            ),
        ),
    ]


def get_mock_case_candidates(case_id: str) -> List[Dict[str, Any]]:
    if case_id == "case_03_hard_neg_type1_trap":
        return [
            {
                "source": "CUST_40111",
                "target": "CUST_45822",
                "scores": {
                    "ck_gcn_seed42": 0.7140,
                    "ck_gat_seed42": 0.6620,
                    "hybrid_v4_full": 0.2610,
                    "hetero_gat_v4": 0.2780,
                    "hetero_sage_v4": 0.2950,
                },
                "summary": PairwiseSummary(
                    shared_devices=0, shared_ips=0, direct_tx_count=0,
                    weighted_aa=0.0, ppr_multi_hop_cos=0.01, node_risk_sim=0.92,
                ),
                "paths": [
                    EvidencePath(
                        path_id="PATH_1",
                        path_type="DISCONNECTED_DIFFERENT_CASES",
                        nodes=["CUST_40111", "CUST_45822"],
                        relations=["NO_BEHAVIORAL_BRIDGE"],
                        attention_score=0.04,
                        description="Không tìm thấy cầu nối Thiết bị, IP hay Giao dịch trực tiếp giữa 2 đối tượng (bẫy Type 1).",
                    )
                ],
                "explanation_vi": "Lọc đúng bẫy Type 1: Tuy rủi ro cá nhân cao tương đương (0.92) nhưng hoàn toàn rời rạc trên đồ thị hành vi.",
            },
            {
                "source": "CUST_40111",
                "target": "CUST_41009",
                "scores": {
                    "ck_gcn_seed42": 0.7520,
                    "ck_gat_seed42": 0.7910,
                    "hybrid_v4_full": 0.9120,
                    "hetero_gat_v4": 0.9050,
                    "hetero_sage_v4": 0.8890,
                },
                "summary": PairwiseSummary(
                    shared_devices=1, shared_ips=1, direct_tx_count=2,
                    weighted_aa=0.76, ppr_multi_hop_cos=0.41, node_risk_sim=0.89,
                ),
                "paths": [
                    EvidencePath(
                        path_id="PATH_1",
                        path_type="SHARED_DEVICE",
                        nodes=["CUST_40111", "ACC_7710", "DEV_8801", "ACC_7725", "CUST_41009"],
                        relations=["OWNS", "USES_DEVICE", "rev_USES_DEVICE", "rev_OWNS"],
                        attention_score=0.91,
                        description="Cùng sử dụng thiết bị DEV_8801 (tín hiệu chú ý GATv2 = 0.91).",
                    )
                ],
                "explanation_vi": "Cảnh báo CAO: Đồng phạm thực sự trong cùng kịch bản qua thiết bị DEV_8801 và 2 giao dịch chuyển khoản.",
            },
        ]

    if case_id == "case_04_hard_neg_type4_trap":
        return [
            {
                "source": "CUST_05120",
                "target": "CUST_05188",
                "scores": {
                    "ck_gcn_seed42": 0.6290,
                    "ck_gat_seed42": 0.5810,
                    "hybrid_v4_full": 0.1180,
                    "hetero_gat_v4": 0.1350,
                    "hetero_sage_v4": 0.1590,
                },
                "summary": PairwiseSummary(
                    shared_devices=0, shared_ips=1, direct_tx_count=0,
                    weighted_aa=0.11, ppr_multi_hop_cos=0.22, node_risk_sim=0.18,
                ),
                "paths": [
                    EvidencePath(
                        path_id="PATH_1",
                        path_type="PUBLIC_IP_HUB",
                        nodes=["CUST_05120", "ACC_1201", "IP_PUB_99", "ACC_1288", "CUST_05188"],
                        relations=["OWNS", "USES_IP", "rev_USES_IP", "rev_OWNS"],
                        attention_score=0.19,
                        description="Dùng chung IP_PUB_99 (nút bậc cao deg=42) -> trọng số Adamic-Adar suy giảm còn 0.11.",
                    )
                ],
                "explanation_vi": "An toàn (Lọc đúng bẫy Type 4): Chỉ trùng IP công cộng bậc cao, không có dòng tiền hay thiết bị chung.",
            }
        ]

    return [
        {
            "source": "CUST_10492",
            "target": "CUST_48210",
            "scores": {
                "ck_gcn_seed42": 0.7810,
                "ck_gat_seed42": 0.8125,
                "hybrid_v4_full": 0.9510,
                "hetero_gat_v4": 0.9480,
                "hetero_sage_v4": 0.9340,
            },
            "summary": PairwiseSummary(
                shared_devices=2, shared_ips=1, direct_tx_count=4,
                weighted_aa=0.84, ppr_multi_hop_cos=0.39, node_risk_sim=0.88,
            ),
            "paths": [
                EvidencePath(
                    path_id="PATH_1",
                    path_type="SHARED_DEVICE",
                    nodes=["CUST_10492", "ACC_0881", "DEV_0992", "ACC_0304", "CUST_48210"],
                    relations=["OWNS", "USES_DEVICE", "rev_USES_DEVICE", "rev_OWNS"],
                    attention_score=0.89,
                    description="Hai khách hàng đăng nhập cùng thiết bị DEV_0992 qua 2 tài khoản trung gian (attention = 0.89).",
                ),
                EvidencePath(
                    path_id="PATH_2",
                    path_type="TRANSACTS_CHAIN",
                    nodes=["CUST_10492", "ACC_0881", "ACC_0304", "CUST_48210"],
                    relations=["OWNS", "TRANSACTS", "rev_OWNS"],
                    attention_score=0.76,
                    description="Chuyển khoản trực tiếp 4 lượt giữa ACC_0881 và ACC_0304 (chia nhỏ dưới ngưỡng báo cáo).",
                ),
                EvidencePath(
                    path_id="PATH_3",
                    path_type="SHARED_IP",
                    nodes=["CUST_10492", "ACC_0881", "IP_4401", "ACC_0304", "CUST_48210"],
                    relations=["OWNS", "USES_IP", "rev_USES_IP", "rev_OWNS"],
                    attention_score=0.64,
                    description="Truy cập đồng thời từ địa chỉ IP_4401 trong cùng khung giờ.",
                ),
            ],
            "explanation_vi": "Cảnh báo CAO (95.1%): Chưa khai báo KYC nhưng liên kết chặt qua thiết bị DEV_0992, IP_4401 và 4 giao dịch chia nhỏ.",
        },
        {
            "source": "CUST_48210",
            "target": "CUST_00912",
            "scores": {
                "ck_gcn_seed42": 0.6120,
                "ck_gat_seed42": 0.6540,
                "hybrid_v4_full": 0.8490,
                "hetero_gat_v4": 0.8310,
                "hetero_sage_v4": 0.8190,
            },
            "summary": PairwiseSummary(
                shared_devices=0, shared_ips=1, direct_tx_count=2,
                weighted_aa=0.58, ppr_multi_hop_cos=0.28, node_risk_sim=0.79,
            ),
            "paths": [
                EvidencePath(
                    path_id="PATH_1",
                    path_type="SHARED_BENEFICIARY",
                    nodes=["CUST_48210", "ACC_0304", "BEN_5501", "ACC_0912", "CUST_00912"],
                    relations=["OWNS", "WIRES_TO", "rev_WIRES_TO", "rev_OWNS"],
                    attention_score=0.81,
                    description="Cùng chuyển tiền ra bên thụ hưởng rủi ro cao BEN_5501 (cờ FATF).",
                )
            ],
            "explanation_vi": "Cảnh báo CAO (84.9%): Hai đối tượng cùng chuyển dòng tiền về bên thụ hưởng BEN_5501 và trùng IP_4401.",
        },
        {
            "source": "CUST_10492",
            "target": "CUST_21804",
            "scores": {
                "ck_gcn_seed42": 0.4890,
                "ck_gat_seed42": 0.5020,
                "hybrid_v4_full": 0.6450,
                "hetero_gat_v4": 0.6310,
                "hetero_sage_v4": 0.6080,
            },
            "summary": PairwiseSummary(
                shared_devices=0, shared_ips=0, direct_tx_count=1,
                weighted_aa=0.34, ppr_multi_hop_cos=0.24, node_risk_sim=0.65,
            ),
            "paths": [
                EvidencePath(
                    path_id="PATH_1",
                    path_type="MULE_INTERMEDIARY",
                    nodes=["CUST_10492", "ACC_0881", "ACC_0304", "ACC_2180", "CUST_21804"],
                    relations=["OWNS", "TRANSACTS", "TRANSACTS", "rev_OWNS"],
                    attention_score=0.59,
                    description="Kết nối gián tiếp 2-hop qua tài khoản trung gian ACC_0304.",
                )
            ],
            "explanation_vi": "Cảnh báo TRUNG BÌNH (64.5%): Xuất hiện cầu nối dòng tiền 2-hop qua tài khoản trung gian ACC_0304.",
        },
    ]
