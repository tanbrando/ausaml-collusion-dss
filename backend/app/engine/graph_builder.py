"""Cytoscape.js Graph Payload Builder (tách biệt khỏi ModelRegistry, giới hạn <= 300 đỉnh UI)."""

from typing import Any, Dict, List

from ..schemas import (
    CytoscapeEdge,
    CytoscapeEdgeData,
    CytoscapeGraphPayload,
    CytoscapeNode,
    CytoscapeNodeData,
    EdgeCategory,
    FeedbackStatus,
    NodeType,
    PredictedLinkItem,
)


def infer_node_type_from_id(nid: str) -> NodeType:
    if nid.startswith("CUST_"):
        return NodeType.CUSTOMER
    if nid.startswith("ACC_"):
        return NodeType.ACCOUNT
    if nid.startswith("DEV_"):
        return NodeType.DEVICE
    if nid.startswith("IP_"):
        return NodeType.IP
    if nid.startswith("BEN_"):
        return NodeType.BENEFICIARY
    return NodeType.BANK


def build_cytoscape_payload(
    candidates: List[Dict[str, Any]],
    pred_items: List[PredictedLinkItem],
    include_node_types: List[NodeType],
    target_ids: List[str],
    max_ui_nodes: int = 300,
) -> CytoscapeGraphPayload:
    allowed = set(include_node_types)
    target_set = set(target_ids)
    nodes_map: Dict[str, CytoscapeNode] = {}
    edges_map: Dict[str, CytoscapeEdge] = {}

    # 1) Ưu tiên các đỉnh khách hàng xuất hiện trong pred_items
    if NodeType.CUSTOMER in allowed:
        for item in pred_items:
            for cid in (item.source, item.target):
                if cid not in nodes_map and len(nodes_map) < max_ui_nodes:
                    nodes_map[cid] = CytoscapeNode(
                        data=CytoscapeNodeData(
                            id=cid,
                            label=cid,
                            node_type=NodeType.CUSTOMER,
                            risk_score=item.score,
                            is_target=cid in target_set,
                        )
                    )
            if item.source in nodes_map and item.target in nodes_map:
                ecat = (
                    EdgeCategory.CONFIRMED_LINK
                    if item.feedback_status == FeedbackStatus.CONFIRMED
                    else EdgeCategory.PREDICTED_LINK
                )
                edges_map[f"pred_{item.pair_id}"] = CytoscapeEdge(
                    data=CytoscapeEdgeData(
                        id=f"pred_{item.pair_id}",
                        source=item.source,
                        target=item.target,
                        relation="PREDICTED_ACCOMPLICE",
                        edge_category=ecat,
                        score=item.score,
                        risk_level=item.risk_level,
                        pair_id=item.pair_id,
                        feedback_status=item.feedback_status,
                    )
                )

    # 2) Bổ sung các đỉnh & cạnh bắc cầu quan sát được từ EvidencePaths (tối đa max_ui_nodes)
    for c in candidates:
        for p in c["paths"]:
            p_nodes = p.nodes
            p_rels = p.relations
            for nid in p_nodes:
                nt = infer_node_type_from_id(nid)
                if nt not in allowed or nid in nodes_map or len(nodes_map) >= max_ui_nodes:
                    continue
                nodes_map[nid] = CytoscapeNode(
                    data=CytoscapeNodeData(
                        id=nid,
                        label=nid,
                        node_type=nt,
                        risk_score=0.88 if nid in target_set else (0.72 if nt == NodeType.CUSTOMER else None),
                        is_target=nid in target_set,
                    )
                )
            for idx in range(len(p_nodes) - 1):
                u_n, v_n = p_nodes[idx], p_nodes[idx + 1]
                rel = p_rels[idx] if idx < len(p_rels) else "RELATED"
                if rel == "NO_BEHAVIORAL_BRIDGE":
                    continue
                if u_n in nodes_map and v_n in nodes_map:
                    eid = f"obs_{u_n}__{rel}__{v_n}"
                    if eid not in edges_map:
                        edges_map[eid] = CytoscapeEdge(
                            data=CytoscapeEdgeData(
                                id=eid,
                                source=u_n,
                                target=v_n,
                                relation=rel,
                                edge_category=EdgeCategory.OBSERVED_EDGE,
                            )
                        )

    return CytoscapeGraphPayload(nodes=list(nodes_map.values()), edges=list(edges_map.values()))
