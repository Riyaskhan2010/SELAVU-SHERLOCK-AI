"""
LLM abstraction service.
Provider is configured via LLM_PROVIDER environment variable.
Supports: openai | anthropic | ollama | mock

The LLM is ONLY used for explanation and natural language generation —
never for calculation or detection. All numbers come from the analytics engine.
"""
import json
import logging
from typing import List, Optional, Dict
from app.core.config import settings

logger = logging.getLogger(__name__)


class LLMMessage:
    def __init__(self, role: str, content: str):
        self.role = role
        self.content = content


class LLMService:
    """
    Provider-agnostic LLM interface.
    Swap providers by changing LLM_PROVIDER in .env — no code changes needed.
    """

    def __init__(self):
        self.provider = settings.LLM_PROVIDER.lower()
        self._client = None

    def _get_openai_client(self):
        if self._client is None:
            import openai
            self._client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        return self._client

    def _get_anthropic_client(self):
        if self._client is None:
            import anthropic
            self._client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        return self._client

    def _get_groq_client(self):
        if self._client is None:
            from groq import AsyncGroq
            self._client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        return self._client

    async def complete(
        self,
        messages: List[Dict[str, str]],
        max_tokens: int = 512,
        temperature: float = 0.3,
    ) -> str:
        """Send messages and return assistant response text."""
        if self.provider == "openai":
            return await self._complete_openai(messages, max_tokens, temperature)
        elif self.provider == "anthropic":
            return await self._complete_anthropic(messages, max_tokens, temperature)
        elif self.provider == "ollama":
            return await self._complete_ollama(messages, max_tokens, temperature)
        elif self.provider == "groq":
            return await self._complete_groq(messages, max_tokens, temperature)
        else:
            return await self._complete_mock(messages)

    async def _complete_openai(self, messages, max_tokens, temperature) -> str:
        client = self._get_openai_client()
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return response.choices[0].message.content.strip()

    async def _complete_anthropic(self, messages, max_tokens, temperature) -> str:
        client = self._get_anthropic_client()
        # Anthropic separates system message
        system = ""
        chat_messages = []
        for m in messages:
            if m["role"] == "system":
                system = m["content"]
            else:
                chat_messages.append({"role": m["role"], "content": m["content"]})

        response = await client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=chat_messages,
        )
        return response.content[0].text.strip()

    async def _complete_ollama(self, messages, max_tokens, temperature) -> str:
        import httpx
        payload = {
            "model": settings.OLLAMA_MODEL,
            "messages": messages,
            "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{settings.OLLAMA_BASE_URL}/api/chat",
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            return data["message"]["content"].strip()

    async def _complete_groq(self, messages, max_tokens, temperature) -> str:
        client = self._get_groq_client()
        # groq/compound-mini does not support 'system' role messages.
        # Merge any system messages into the first user message.
        groq_messages = _flatten_system_to_user(messages)
        response = await client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=groq_messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return response.choices[0].message.content.strip()

    async def _complete_mock(self, messages: List[Dict]) -> str:
        """
        Mock provider for testing/demo — returns contextually relevant canned responses.
        Uses the last user message to generate a plausible response.
        """
        last_user = next(
            (m["content"] for m in reversed(messages) if m["role"] == "user"),
            ""
        )

        lower = last_user.lower()

        if "explain" in lower and ("finding" in lower or "underutil" in lower):
            return (
                "This resource shows consistently low CPU utilization over the observed period, "
                "which indicates it is likely over-provisioned for its actual workload. "
                "Rightsizing to a smaller instance type or implementing scheduling would "
                "reduce costs while maintaining performance for the observed usage pattern."
            )
        elif "spike" in lower or "anomaly" in lower:
            return (
                "The cost spike detected in this period significantly exceeds the established baseline. "
                "This pattern is consistent with an unplanned scaling event, a data transfer surge, "
                "or a misconfigured auto-scaling policy. An immediate audit of deployment logs "
                "and resource scaling history for this time window is recommended."
            )
        elif "summary" in lower or "dashboard" in lower:
            return (
                "Cost analysis is complete. Several optimization opportunities have been identified "
                "across compute and storage services. The highest-priority findings relate to "
                "underutilized compute resources and recent cost spikes. "
                "Addressing the top three findings could reduce estimated monthly spend significantly."
            )
        elif "recommend" in lower:
            return (
                "Based on the evidence, the primary recommendation is to review resource sizing "
                "for compute services and implement scheduled shutdowns for non-production environments. "
                "Consider Reserved Instance coverage for consistently running workloads."
            )
        else:
            return (
                "I've analyzed the cost data for this dataset. The findings are based on observed "
                "usage patterns and cost trends. Each recommendation is grounded in the underlying "
                "metrics — please review the evidence panel for full calculation details. "
                "Let me know if you'd like me to explain any specific finding in more detail."
            )


# ─── Prompt builders ──────────────────────────────────────────────────────────

def _flatten_system_to_user(messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """
    Some Groq models (e.g. compound-mini) do not support the 'system' role.
    This helper prepends all system message content into the first user message.
    """
    system_parts: List[str] = []
    other: List[Dict[str, str]] = []
    for m in messages:
        if m.get("role") == "system":
            system_parts.append(m["content"])
        else:
            other.append(m)

    if not system_parts:
        return other

    system_text = "\n\n".join(system_parts)
    result = []
    injected = False
    for m in other:
        if m["role"] == "user" and not injected:
            result.append({"role": "user", "content": f"{system_text}\n\n{m['content']}"})
            injected = True
        else:
            result.append(m)

    if not injected:
        # No user message found — create one with just the system content
        result.insert(0, {"role": "user", "content": system_text})

    return result

SYSTEM_PROMPT = """You are a FinOps analyst assistant embedded in a cloud cost optimization platform.
Your role is to explain cost optimization findings clearly and concisely to engineering and finance teams.

Rules:
- Base your explanations ONLY on the evidence data provided. Do not invent numbers.
- Never guarantee savings — always say "potential savings" or "estimated potential savings".
- Be concise: 2-4 sentences for explanations, 1-2 sentences for recommendations.
- Use plain professional language. Avoid jargon where possible.
- Never hallucinate resource names, costs, or utilization values not in the evidence.
"""


def build_finding_explanation_prompt(finding_data: dict) -> List[Dict[str, str]]:
    """Build the prompt to explain a single finding."""
    evidence_text = json.dumps(finding_data.get("evidence_metrics", []), indent=2)
    calc_text = json.dumps(finding_data.get("savings_calculation", {}), indent=2)

    user_content = f"""Explain this cost optimization finding in 2-3 sentences for an engineering team.
Base your explanation ONLY on the evidence below. Do not add assumptions beyond what is stated.

Finding: {finding_data.get('title')}
Service: {finding_data.get('service')}
Type: {finding_data.get('finding_type')}
Priority: {finding_data.get('priority')}

Evidence:
{evidence_text}

Savings Calculation:
{calc_text}

Assumption: {finding_data.get('assumption')}

Write a clear, factual explanation. Mention the key metric that triggered this finding and what it means for costs."""

    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]


def build_dashboard_summary_prompt(summary_data: dict) -> List[Dict[str, str]]:
    """Build the prompt for the AI executive summary on the dashboard."""
    user_content = f"""Write a 2-sentence executive summary of this cloud cost analysis.
Be factual, concise, and professional. Mention the spend trend and top opportunities.

Data:
- Total spend: ${summary_data.get('total_cost', 0):,.0f}
- Period: {summary_data.get('period_days', 30)} days
- Cost change vs prior period: {summary_data.get('cost_change_pct', 0):+.1f}%
- Anomalies detected: {summary_data.get('anomaly_count', 0)}
- Optimization opportunities: {summary_data.get('opportunity_count', 0)}
- Potential monthly savings: ${summary_data.get('potential_savings', 0):,.0f}
- Top service by spend: {summary_data.get('top_service', 'N/A')}

Keep it to 2-3 sentences maximum."""

    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]


def build_chat_prompt(
    user_message: str,
    dataset_context: Optional[dict] = None,
    conversation_history: Optional[List[Dict]] = None,
) -> List[Dict[str, str]]:
    """Build the prompt for the AI assistant chat with full dataset context."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    if dataset_context:
        service_costs = dataset_context.get("service_costs", {})
        daily_costs   = dataset_context.get("daily_costs", {})
        service_date_costs = dataset_context.get("service_date_costs", [])
        top_findings  = dataset_context.get("top_findings", [])

        # ── Service cost table ────────────────────────────────────────────
        service_lines = "\n".join(
            f"  {svc}: ${cost:,.2f}"
            for svc, cost in service_costs.items()
        ) or "  (no service data)"

        # ── Daily cost table (compact) ────────────────────────────────────
        daily_lines = "\n".join(
            f"  {date}: ${cost:,.2f}"
            for date, cost in daily_costs.items()
        ) or "  (no daily data)"

        # ── Service × date detail (for specific date/service queries) ─────
        detail_lines = "\n".join(
            f"  {r['date']} | {r['service']}: ${r['cost']:,.2f}"
            for r in service_date_costs
        ) or "  (no detail data)"

        # ── Top findings ──────────────────────────────────────────────────
        finding_lines = "\n".join(
            f"  [{f['priority'].upper()}] {f['title']} — current: ${f['current_cost']:,.2f}, "
            f"potential saving: ${f['potential_saving']:,.2f}/mo"
            for f in top_findings
        ) or "  (no findings)"

        context_msg = f"""DATASET CONTEXT — use these exact numbers to answer the user's questions.
Do NOT say you cannot access the data. The data is provided below.

Dataset: {dataset_context.get('name', 'Unknown')}
Total Cost: ${dataset_context.get('total_cost', 0):,.2f}
Period: {dataset_context.get('date_range_start')} to {dataset_context.get('date_range_end')} ({dataset_context.get('period_days', 0)} days)
Optimization opportunities: {dataset_context.get('findings_count', 0)}
Total potential savings: ${dataset_context.get('potential_savings', 0):,.2f}/month

COST BY SERVICE (total for full period):
{service_lines}

COST BY DATE (total across all services):
{daily_lines}

COST BY DATE AND SERVICE (each row = one service on one date):
{detail_lines}

TOP OPTIMIZATION FINDINGS:
{finding_lines}

When the user asks about specific services, dates, or totals — answer directly using the numbers above.
"""
        messages.append({"role": "system", "content": context_msg})

    if conversation_history:
        messages.extend(conversation_history[-10:])  # last 10 messages

    messages.append({"role": "user", "content": user_message})
    return messages


# Singleton — re-created on each reload thanks to module re-import
_llm_service: Optional[LLMService] = None


def get_llm_service() -> LLMService:
    global _llm_service
    if _llm_service is None or _llm_service.provider != settings.LLM_PROVIDER.lower():
        _llm_service = LLMService()
    return _llm_service
