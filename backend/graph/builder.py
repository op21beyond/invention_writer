from __future__ import annotations

from langgraph.graph import END, StateGraph

from backend.graph.edges import route_after_human_review
from backend.graph.nodes import (
    node_agent0_structurer,
    node_agent1,
    node_agent2_expander,
    node_agent3_examiner,
    node_agent3_query_generator,
    node_finalize,
    node_human_review,
    node_patent_search,
)
from backend.graph.state import PatentWorkflowState


async def _agent1_draft(state: PatentWorkflowState):
    return await node_agent1({**state, "phase": "draft"})


async def _agent1_discussion(state: PatentWorkflowState):
    return await node_agent1({**state, "phase": "discussion"})


async def _agent1_rebut(state: PatentWorkflowState):
    return await node_agent1({**state, "phase": "rebut"})


def build_patent_graph(checkpointer):
    graph = StateGraph(PatentWorkflowState)

    graph.add_node("agent0", node_agent0_structurer)
    graph.add_node("human_review", node_human_review)
    graph.add_node("agent1_draft", _agent1_draft)
    graph.add_node("agent2", node_agent2_expander)
    graph.add_node("agent1_respond", _agent1_discussion)
    graph.add_node("agent3_query", node_agent3_query_generator)
    graph.add_node("patent_search", node_patent_search)
    graph.add_node("agent3_examiner", node_agent3_examiner)
    graph.add_node("agent1_rebut", _agent1_rebut)
    graph.add_node("finalize", node_finalize)

    graph.set_entry_point("agent0")
    graph.add_edge("agent0", "human_review")
    graph.add_conditional_edges("human_review", route_after_human_review)
    graph.add_edge("agent1_draft", "human_review")
    graph.add_edge("agent2", "human_review")
    graph.add_edge("agent1_respond", "human_review")
    graph.add_edge("agent3_query", "patent_search")
    graph.add_edge("patent_search", "human_review")
    graph.add_edge("agent3_examiner", "human_review")
    graph.add_edge("agent1_rebut", "human_review")
    graph.add_edge("finalize", END)

    return graph.compile(checkpointer=checkpointer)
